import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { InteractiveActionLoop } from "./action-loop.js";
import type { VisionFrame } from "./vision-pipeline.js";

// ── Types ───────────────────────────────────────────────────────────

export type ServerCaptureConfig = {
  /** Screen capture interval in ms (default 5000). */
  screenIntervalMs?: number;
  /** Camera capture interval in ms (default 10000). */
  cameraIntervalMs?: number;
  /** Enable screen capture (default true if "screen" input is enabled). */
  captureScreen?: boolean;
  /** Enable camera capture (default true if "camera" input is enabled). */
  captureCamera?: boolean;
};

// ── Server-Side Capture Loop ────────────────────────────────────────

/**
 * Server-side capture loop that uses macOS system commands to periodically
 * capture screen and camera frames, feeding them into the ActionLoop's
 * vision pipeline. This enables interactive mode from text-only clients
 * like the TUI where the client can't stream media data.
 */
export class ServerCaptureLoop {
  private screenTimer: ReturnType<typeof setInterval> | null = null;
  private cameraTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private loop: InteractiveActionLoop;
  private config: Required<ServerCaptureConfig>;
  private tmpDir: string;

  constructor(params: {
    loop: InteractiveActionLoop;
    config?: ServerCaptureConfig;
    enabledInputs: Set<string>;
  }) {
    this.loop = params.loop;
    this.tmpDir = path.join(os.tmpdir(), "oni-interactive");
    this.config = {
      screenIntervalMs: params.config?.screenIntervalMs ?? 5000,
      cameraIntervalMs: params.config?.cameraIntervalMs ?? 10000,
      captureScreen: params.config?.captureScreen ?? params.enabledInputs.has("screen"),
      captureCamera: params.config?.captureCamera ?? params.enabledInputs.has("camera"),
    };
  }

  /** Start periodic capture loops. */
  async start(): Promise<void> {
    if (this.disposed) return;

    // Ensure temp directory exists
    await fs.mkdir(this.tmpDir, { recursive: true });

    if (this.config.captureScreen) {
      // Capture screen immediately, then on interval
      void this.captureScreen();
      this.screenTimer = setInterval(() => {
        if (!this.disposed) void this.captureScreen();
      }, this.config.screenIntervalMs);
    }

    if (this.config.captureCamera) {
      // Capture camera immediately, then on interval
      void this.captureCamera();
      this.cameraTimer = setInterval(() => {
        if (!this.disposed) void this.captureCamera();
      }, this.config.cameraIntervalMs);
    }
  }

  /** Stop all capture loops and clean up. */
  dispose(): void {
    this.disposed = true;
    if (this.screenTimer) {
      clearInterval(this.screenTimer);
      this.screenTimer = null;
    }
    if (this.cameraTimer) {
      clearInterval(this.cameraTimer);
      this.cameraTimer = null;
    }
  }

  // ── Screen Capture (macOS) ──────────────────────────────────────

  private async captureScreen(): Promise<void> {
    if (this.disposed || process.platform !== "darwin") return;

    const filePath = path.join(this.tmpDir, `screen-${Date.now()}.jpg`);

    try {
      await execFileAsync("screencapture", ["-x", "-t", "jpg", filePath]);

      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString("base64");

      const frame: VisionFrame = {
        source: "screen",
        data: base64,
        timestamp: Date.now(),
      };
      this.loop.handleFrame(frame);

      // Clean up temp file
      await fs.unlink(filePath).catch(() => {});
    } catch {
      // screencapture may fail (permission denied, etc.) — non-fatal
    }
  }

  // ── Camera Capture (macOS) ──────────────────────────────────────

  private async captureCamera(): Promise<void> {
    if (this.disposed || process.platform !== "darwin") return;

    const filePath = path.join(this.tmpDir, `camera-${Date.now()}.jpg`);

    try {
      // Try imagesnap first (common on macOS via homebrew)
      await execFileAsync("imagesnap", ["-w", "0.5", filePath]);

      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString("base64");

      const frame: VisionFrame = {
        source: "camera",
        data: base64,
        timestamp: Date.now(),
      };
      this.loop.handleFrame(frame);

      // Clean up temp file
      await fs.unlink(filePath).catch(() => {});
    } catch {
      // imagesnap not installed or camera unavailable — non-fatal
    }
  }
}

// ── Registry ────────────────────────────────────────────────────────

const activeCaptureLoops = new Map<string, ServerCaptureLoop>();

export function registerCaptureLoop(connId: string, loop: ServerCaptureLoop): void {
  const existing = activeCaptureLoops.get(connId);
  if (existing) {
    existing.dispose();
  }
  activeCaptureLoops.set(connId, loop);
}

export function removeCaptureLoop(connId: string): void {
  const loop = activeCaptureLoops.get(connId);
  if (loop) {
    loop.dispose();
    activeCaptureLoops.delete(connId);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function execFileAsync(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15_000 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}
