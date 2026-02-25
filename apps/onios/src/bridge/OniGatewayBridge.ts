/**
 * OniGatewayBridge — WebSocket client that connects OniOS to the Oni gateway.
 *
 * This is the central integration point: OniOS sends user messages to the gateway,
 * receives agent responses, and the gateway can execute commands on OniOS.
 */

import { eventBus } from "../core/EventBus";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface AgentMessage {
  role: "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface CommandRequest {
  id: string;
  command: string;
  args: unknown[];
  source: "ai";
}

export interface CommandResult {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface WidgetContextPayload {
  widget: string;
  windowId: string;
  [key: string]: unknown;
}

class OniGatewayBridge {
  private ws: WebSocket | null = null;
  private url = "";
  private token = "";
  private _status: ConnectionStatus = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Array<(msg: AgentMessage) => void> = [];
  private commandHandlers: Array<(cmd: CommandRequest) => Promise<CommandResult>> = [];

  get status(): ConnectionStatus {
    return this._status;
  }

  async connect(url: string, token: string): Promise<void> {
    this.url = url;
    this.token = token;
    this._status = "connecting";
    eventBus.emit("gateway:status", this._status);

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${url}?token=${encodeURIComponent(token)}&channel=onios`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this._status = "connected";
          eventBus.emit("gateway:status", this._status);
          console.log("[OniGatewayBridge] Connected to Oni gateway");
          this.registerAsChannel();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
          this._status = "disconnected";
          eventBus.emit("gateway:status", this._status);
          console.log("[OniGatewayBridge] Disconnected from gateway");
          this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
          this._status = "error";
          eventBus.emit("gateway:status", this._status);
          console.error("[OniGatewayBridge] Connection error:", err);
          reject(err);
        };
      } catch (err) {
        this._status = "error";
        reject(err);
      }
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._status = "disconnected";
    eventBus.emit("gateway:status", this._status);
  }

  isConnected(): boolean {
    return this._status === "connected" && this.ws?.readyState === WebSocket.OPEN;
  }

  sendMessage(content: string, metadata?: Record<string, unknown>) {
    if (!this.isConnected()) {
      console.warn("[OniGatewayBridge] Not connected, cannot send message");
      return;
    }
    this.ws!.send(JSON.stringify({
      type: "message",
      content,
      channel: "onios",
      ...metadata,
    }));
  }

  onAgentMessage(handler: (msg: AgentMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  onCommandRequest(handler: (cmd: CommandRequest) => Promise<CommandResult>): () => void {
    this.commandHandlers.push(handler);
    return () => {
      this.commandHandlers = this.commandHandlers.filter((h) => h !== handler);
    };
  }

  pushWidgetContext(contexts: WidgetContextPayload[]) {
    if (!this.isConnected()) return;
    this.ws!.send(JSON.stringify({
      type: "widget_context",
      contexts,
    }));
  }

  private registerAsChannel() {
    if (!this.isConnected()) return;
    this.ws!.send(JSON.stringify({
      type: "register",
      channel: "onios",
      capabilities: {
        widgets: true,
        commands: true,
        context: true,
        subAgents: true,
      },
    }));
  }

  private handleMessage(raw: string | ArrayBuffer) {
    try {
      const data = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));

      if (data.type === "agent_message") {
        const msg: AgentMessage = {
          role: data.role ?? "assistant",
          content: data.content ?? "",
          timestamp: data.timestamp ?? Date.now(),
        };
        for (const handler of this.messageHandlers) {
          handler(msg);
        }
        eventBus.emit("gateway:message", msg);
      }

      if (data.type === "command_request") {
        const cmd: CommandRequest = {
          id: data.id,
          command: data.command,
          args: data.args ?? [],
          source: "ai",
        };
        this.handleCommandRequest(cmd);
      }
    } catch (err) {
      console.error("[OniGatewayBridge] Failed to parse message:", err);
    }
  }

  private async handleCommandRequest(cmd: CommandRequest) {
    for (const handler of this.commandHandlers) {
      try {
        const result = await handler(cmd);
        if (this.isConnected()) {
          this.ws!.send(JSON.stringify({
            type: "command_result",
            ...result,
          }));
        }
        return;
      } catch (err) {
        if (this.isConnected()) {
          this.ws!.send(JSON.stringify({
            type: "command_result",
            id: cmd.id,
            ok: false,
            error: String(err),
          }));
        }
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this._status === "disconnected" && this.url) {
        console.log("[OniGatewayBridge] Attempting reconnect...");
        this.connect(this.url, this.token).catch(() => {
          this.scheduleReconnect();
        });
      }
    }, 5000);
  }
}

export const gatewayBridge = new OniGatewayBridge();
