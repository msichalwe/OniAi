/**
 * GatewayBridge — connects the Electron main process to the Oni gateway
 * via the native WebSocket protocol.
 *
 * The renderer communicates with this bridge through IPC handlers.
 * Chat events from the gateway are forwarded to the renderer via IPC events.
 */

import { randomUUID } from "crypto";
import { WebSocket } from "ws";
import type { BrowserWindow } from "electron";

// ── Protocol types (subset of gateway protocol) ─────────────────────

interface RequestFrame {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
}

interface ResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string };
}

interface EventFrame {
  type: "evt";
  event: string;
  payload?: unknown;
  seq?: number;
}

type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

// ── ChatEvent shape (matches ChatEventSchema) ───────────────────────

export interface ChatEvent {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: Record<string, unknown>;
  errorMessage?: string;
  usage?: unknown;
  stopReason?: string;
}

// ── Pending request tracking ────────────────────────────────────────

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  expectFinal: boolean;
}

// ── Bridge class ────────────────────────────────────────────────────

export interface GatewayBridgeOptions {
  url: string; // wss://your-server:19100
  token?: string;
  window: BrowserWindow;
}

export class GatewayBridge {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private opts: GatewayBridgeOptions;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private backoffMs = 1000;
  private lastSeq: number | null = null;
  private connected = false;
  private sessionKey = "main";

  // Expose connection state
  get isConnected(): boolean {
    return this.connected;
  }

  constructor(opts: GatewayBridgeOptions) {
    this.opts = opts;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  start(): void {
    if (this.closed) {return;}
    const url = this.opts.url;

    try {
      this.ws = new WebSocket(url, {
        maxPayload: 25 * 1024 * 1024,
        // Allow self-signed certs for local dev
        rejectUnauthorized: url.startsWith("wss://localhost") ? false : undefined,
      });
    } catch (err) {
      this.emitStatus("error", `Failed to create WebSocket: ${String(err)}`);
      return;
    }

    this.ws.on("open", () => {
      this.queueConnect();
    });

    this.ws.on("message", (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf-8");
      this.handleMessage(raw);
    });

    this.ws.on("close", (code, reason) => {
      const reasonText = reason?.toString("utf-8") ?? "";
      this.ws = null;
      this.connected = false;
      this.flushPendingErrors(new Error(`gateway closed (${code}): ${reasonText}`));
      this.emitStatus("disconnected", `Closed (${code}): ${reasonText}`);
      if (!this.closed) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err) => {
      if (!this.connectSent) {
        this.emitStatus("error", String(err));
      }
    });
  }

  stop(): void {
    this.closed = true;
    this.connected = false;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.flushPendingErrors(new Error("gateway bridge stopped"));
    this.emitStatus("disconnected", "Stopped");
  }

  // ── Send a request and wait for a response ────────────────────

  async request<T = Record<string, unknown>>(
    method: string,
    params?: unknown,
    opts?: { expectFinal?: boolean }
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== 1) { // 1 = OPEN
      throw new Error("gateway not connected");
    }
    const id = randomUUID();
    const frame: RequestFrame = { type: "req", id, method, params };
    const expectFinal = opts?.expectFinal === true;
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        expectFinal,
      });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }

  // ── Chat-specific helpers ─────────────────────────────────────

  async chatSend(
    message: string,
    opts?: {
      sessionKey?: string;
      thinking?: string;
      attachments?: Array<{
        type?: string;
        mimeType?: string;
        fileName?: string;
        content?: unknown;
      }>;
    }
  ): Promise<{ runId: string; status: string }> {
    const idempotencyKey = randomUUID();
    const params: Record<string, unknown> = {
      sessionKey: opts?.sessionKey ?? this.sessionKey,
      message,
      idempotencyKey,
    };
    if (opts?.thinking) {params.thinking = opts.thinking;}
    if (opts?.attachments && opts.attachments.length > 0) {
      params.attachments = opts.attachments;
    }
    return this.request<{ runId: string; status: string }>("chat.send", params);
  }

  async chatHistory(
    sessionKey?: string,
    limit?: number
  ): Promise<unknown> {
    return this.request("chat.history", {
      sessionKey: sessionKey ?? this.sessionKey,
      limit: limit ?? 50,
    });
  }

  async chatAbort(sessionKey?: string, runId?: string): Promise<unknown> {
    const params: Record<string, unknown> = {
      sessionKey: sessionKey ?? this.sessionKey,
    };
    if (runId) {params.runId = runId;}
    return this.request("chat.abort", params);
  }

  setSessionKey(key: string): void {
    this.sessionKey = key;
  }

  // ── Internal: protocol handling ───────────────────────────────

  private handleMessage(raw: string): void {
    let parsed: GatewayFrame;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    // Event frames
    if (parsed.type === "evt" || (!("type" in parsed) && "event" in parsed)) {
      const evt = parsed;

      // Connect challenge
      if (evt.event === "connect.challenge") {
        const payload = evt.payload as { nonce?: string } | undefined;
        const nonce = payload?.nonce?.trim();
        if (!nonce) {
          this.emitStatus("error", "gateway connect challenge missing nonce");
          this.ws?.close(1008, "connect challenge missing nonce");
          return;
        }
        this.connectNonce = nonce;
        this.sendConnect();
        return;
      }

      // Sequence tracking
      const seq = typeof evt.seq === "number" ? evt.seq : null;
      if (seq !== null) {
        this.lastSeq = seq;
      }

      // Chat events → forward to renderer
      if (evt.event === "chat") {
        const chatPayload = evt.payload as ChatEvent;
        this.emitChatEvent(chatPayload);
      }

      // Agent events → forward to renderer
      if (evt.event === "agent") {
        this.emitAgentEvent(evt.payload);
      }

      return;
    }

    // Response frames
    if (parsed.type === "res" || ("ok" in parsed && "id" in parsed)) {
      const res = parsed as ResponseFrame;
      const pending = this.pending.get(res.id);
      if (!pending) {return;}

      // If ack with status "accepted" or "started", keep waiting for final
      const payload = res.payload as { status?: string } | undefined;
      const status = payload?.status;
      if (pending.expectFinal && (status === "accepted" || status === "started")) {
        return;
      }

      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message ?? "unknown gateway error"));
      }
    }
  }

  private sendConnect(): void {
    if (this.connectSent) {return;}
    const nonce = this.connectNonce?.trim() ?? "";
    if (!nonce) {return;}

    this.connectSent = true;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const params = {
      minProtocol: 1,
      maxProtocol: 3,
      client: {
        id: "oni-macos",
        displayName: "Oni Desktop",
        version: "1.0.0",
        platform: process.platform,
        mode: "ui",
      },
      caps: ["chat", "tool-events"],
      auth: this.opts.token
        ? { token: this.opts.token }
        : undefined,
      role: "operator",
      scopes: ["operator.admin"],
    };

    const id = randomUUID();
    const frame: RequestFrame = { type: "req", id, method: "connect", params };

    const p = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, expectFinal: false });
    });

    this.ws?.send(JSON.stringify(frame));

    p.then((helloOk) => {
      this.connected = true;
      this.backoffMs = 1000;
      this.emitStatus("connected", "Connected to gateway");
      this.emitHelloOk(helloOk);
    }).catch((err) => {
      this.emitStatus("error", `Connect failed: ${String(err)}`);
      this.ws?.close(1008, "connect failed");
    });
  }

  private queueConnect(): void {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
    }
    this.connectTimer = setTimeout(() => {
      if (this.connectSent || this.ws?.readyState !== 1) {return;} // 1 = OPEN
      this.emitStatus("error", "gateway connect challenge timeout");
      this.ws?.close(1008, "connect challenge timeout");
    }, 5_000);
  }

  private scheduleReconnect(): void {
    if (this.closed) {return;}
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    setTimeout(() => this.start(), delay);
  }

  private flushPendingErrors(err: Error): void {
    this.pending.forEach((p) => p.reject(err));
    this.pending.clear();
  }

  // ── IPC emission to renderer ──────────────────────────────────

  private emitStatus(status: string, message: string): void {
    try {
      this.opts.window.webContents.send("gateway-status", { status, message });
    } catch {
      // window may be destroyed
    }
  }

  private emitChatEvent(event: ChatEvent): void {
    try {
      this.opts.window.webContents.send("gateway-chat", event);
    } catch {
      // window may be destroyed
    }
  }

  private emitAgentEvent(payload: unknown): void {
    try {
      this.opts.window.webContents.send("gateway-agent-event", payload);
    } catch {
      // window may be destroyed
    }
  }

  private emitHelloOk(payload: unknown): void {
    try {
      this.opts.window.webContents.send("gateway-hello", payload);
    } catch {
      // window may be destroyed
    }
  }
}
