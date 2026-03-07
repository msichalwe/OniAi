import { execFile, spawn, type ChildProcess } from "node:child_process";
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
  /** Mic chunk duration in seconds (default 8). */
  micChunkDurationSec?: number;
  /** Enable screen capture (default true if "screen" input is enabled). */
  captureScreen?: boolean;
  /** Enable camera capture (default true if "camera" input is enabled). */
  captureCamera?: boolean;
  /** Enable mic capture (default true if "mic" input is enabled). */
  captureMic?: boolean;
};

type ResolvedCaptureConfig = {
  screenIntervalMs: number;
  cameraIntervalMs: number;
  micChunkDurationSec: number;
  captureScreen: boolean;
  captureCamera: boolean;
  captureMic: boolean;
};

// ── Broadcast callback for capture status ────────────────────────────

export type CaptureStatusCallback = (status: {
  mic: "on" | "off" | "error";
  screen: "on" | "off" | "error";
  camera: "on" | "off" | "error";
  lastScreenCapture?: number;
  lastCameraCapture?: number;
}) => void;

// ── Server-Side Capture Loop ────────────────────────────────────────

/**
 * Server-side capture loop that uses macOS system commands to periodically
 * capture screen and camera frames, and continuously capture mic audio,
 * feeding them into the ActionLoop's pipelines. This enables interactive
 * mode from text-only clients like the TUI where the client can't stream
 * media data.
 */
export class ServerCaptureLoop {
  private screenTimer: ReturnType<typeof setInterval> | null = null;
  private cameraTimer: ReturnType<typeof setInterval> | null = null;
  private micProcess: ChildProcess | null = null;
  private disposed = false;
  private loop: InteractiveActionLoop;
  private config: ResolvedCaptureConfig;
  private tmpDir: string;
  private onStatus: CaptureStatusCallback | null = null;
  private audioTool: "sox" | "ffmpeg" | null = null;
  private cameraTool: "imagesnap" | "ffmpeg" | null = null;
  private micBuffer = Buffer.alloc(0);

  // Capture status tracking
  private micStatus: "on" | "off" | "error" = "off";
  private screenStatus: "on" | "off" | "error" = "off";
  private cameraStatus: "on" | "off" | "error" = "off";
  private lastScreenCapture = 0;
  private lastCameraCapture = 0;

  constructor(params: {
    loop: InteractiveActionLoop;
    config?: ServerCaptureConfig;
    enabledInputs: Set<string>;
    onStatus?: CaptureStatusCallback;
  }) {
    this.loop = params.loop;
    this.onStatus = params.onStatus ?? null;
    this.tmpDir = path.join(os.tmpdir(), "oni-interactive");
    this.config = {
      screenIntervalMs: params.config?.screenIntervalMs ?? 5000,
      cameraIntervalMs: params.config?.cameraIntervalMs ?? 10000,
      micChunkDurationSec: params.config?.micChunkDurationSec ?? 8,
      captureScreen: params.config?.captureScreen ?? params.enabledInputs.has("screen"),
      captureCamera: params.config?.captureCamera ?? params.enabledInputs.has("camera"),
      captureMic: params.config?.captureMic ?? params.enabledInputs.has("mic"),
    };
  }

  /** Start periodic capture loops (screen/camera only — mic is PTT). */
  async start(): Promise<void> {
    if (this.disposed) return;

    // Ensure temp directory exists
    await fs.mkdir(this.tmpDir, { recursive: true });

    // Detect tools once at start
    this.audioTool = await detectAudioTool();
    this.cameraTool = await detectCameraTool();

    if (this.config.captureMic && !this.audioTool) {
      console.warn("[interactive] No audio capture tool found (install sox or ffmpeg for mic input)");
      this.micStatus = "error";
      this.emitStatus();
    }

    if (this.config.captureScreen) {
      void this.captureScreen();
      this.screenTimer = setInterval(() => {
        if (!this.disposed) void this.captureScreen();
      }, this.config.screenIntervalMs);
    }

    if (this.config.captureCamera) {
      if (!this.cameraTool) {
        this.cameraStatus = "error";
        this.emitStatus();
      } else {
        void this.captureCamera();
        this.cameraTimer = setInterval(() => {
          if (!this.disposed) void this.captureCamera();
        }, this.config.cameraIntervalMs);
      }
    }
  }

  /** Stop all capture loops and clean up. */
  dispose(): void {
    this.disposed = true;
    this.killMicProcess();
    if (this.screenTimer) {
      clearInterval(this.screenTimer);
      this.screenTimer = null;
    }
    if (this.cameraTimer) {
      clearInterval(this.cameraTimer);
      this.cameraTimer = null;
    }
    this.micStatus = "off";
    this.screenStatus = "off";
    this.cameraStatus = "off";
    this.emitStatus();
  }

  /** Get current capture status. */
  getStatus() {
    return {
      mic: this.micStatus,
      screen: this.screenStatus,
      camera: this.cameraStatus,
      lastScreenCapture: this.lastScreenCapture,
      lastCameraCapture: this.lastCameraCapture,
    };
  }

  /** Whether mic is available for PTT. */
  get micAvailable(): boolean {
    return this.config.captureMic && this.audioTool !== null;
  }

  /** Whether mic is currently recording. */
  get micRecording(): boolean {
    return this.micStatus === "on";
  }

  // ── PTT Mic Control (public) ────────────────────────────────────

  /**
   * Toggle push-to-talk: start recording if off, stop + flush if on.
   * Returns the new recording state.
   */
  toggleMic(): boolean {
    if (this.micStatus === "on") {
      this.stopMic();
      return false;
    } else {
      this.startMic();
      return true;
    }
  }

  /** Start mic recording (PTT pressed). */
  startMic(): void {
    if (this.disposed || !this.audioTool || this.micProcess) return;

    const tool = this.audioTool;
    const SAMPLE_RATE = 24_000;
    const CHANNELS = 1;
    const BITS = 16;

    let args: string[];

    if (tool === "sox") {
      args = [
        "-q",
        "-t", "coreaudio",
        "default",
        "-t", "raw",
        "-r", String(SAMPLE_RATE),
        "-c", String(CHANNELS),
        "-b", String(BITS),
        "-e", "signed-integer",
        "-",
      ];
    } else {
      args = [
        "-f", "avfoundation",
        "-i", ":0",
        "-ar", String(SAMPLE_RATE),
        "-ac", String(CHANNELS),
        "-f", "s16le",
        "-",
      ];
    }

    try {
      const proc = spawn(tool, args, {
        stdio: ["ignore", "pipe", "ignore"],
      });

      this.micProcess = proc;
      this.micBuffer = Buffer.alloc(0);
      this.micStatus = "on";
      this.emitStatus();

      proc.stdout?.on("data", (data: Buffer) => {
        if (this.disposed) return;
        this.micBuffer = Buffer.concat([this.micBuffer, data]);
      });

      proc.on("error", () => {
        this.micProcess = null;
        this.micStatus = "error";
        this.emitStatus();
      });

      proc.on("close", () => {
        this.micProcess = null;
        // If recording was stopped intentionally, status is already "off"
        // If it closed unexpectedly while recording, mark error
        if (this.micStatus === "on") {
          this.micStatus = "error";
          this.emitStatus();
        }
      });
    } catch {
      this.micStatus = "error";
      this.emitStatus();
    }
  }

  /** Stop mic recording (PTT released) and flush audio to pipeline. */
  stopMic(): void {
    this.killMicProcess();
    this.micStatus = "off";
    this.emitStatus();

    // Flush accumulated audio to the ActionLoop for transcription
    if (this.micBuffer.length > 0) {
      const base64 = this.micBuffer.toString("base64");
      this.micBuffer = Buffer.alloc(0);
      void this.loop.handleAudioChunk(base64);
      void this.loop.handleAudioEnd();
    }
  }

  private killMicProcess(): void {
    if (this.micProcess) {
      this.micProcess.kill("SIGTERM");
      this.micProcess = null;
    }
  }

  // ── Screen Capture (macOS) ──────────────────────────────────────

  private async captureScreen(): Promise<void> {
    if (this.disposed || process.platform !== "darwin") return;

    const filePath = path.join(this.tmpDir, `screen-${Date.now()}.jpg`);

    try {
      await execFileAsync("/usr/sbin/screencapture", ["-x", "-t", "jpg", filePath]);

      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString("base64");

      const frame: VisionFrame = {
        source: "screen",
        data: base64,
        timestamp: Date.now(),
      };
      this.loop.handleFrame(frame);
      this.lastScreenCapture = Date.now();
      this.screenStatus = "on";
      this.emitStatus();

      // Clean up temp file
      await fs.unlink(filePath).catch(() => {});
    } catch {
      this.screenStatus = "error";
      this.emitStatus();
    }
  }

  // ── Camera Capture (macOS) ──────────────────────────────────────

  private async captureCamera(): Promise<void> {
    if (this.disposed || process.platform !== "darwin") return;

    const filePath = path.join(this.tmpDir, `camera-${Date.now()}.jpg`);

    try {
      if (this.cameraTool === "imagesnap") {
        await execFileAsync("imagesnap", ["-w", "0.5", filePath]);
      } else if (this.cameraTool === "ffmpeg") {
        await execFileAsync("ffmpeg", [
          "-f", "avfoundation",
          "-framerate", "30",
          "-video_size", "640x480",
          "-i", "0:none",
          "-frames:v", "1",
          "-update", "1",
          "-y", filePath,
        ]);
      }

      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString("base64");

      const frame: VisionFrame = {
        source: "camera",
        data: base64,
        timestamp: Date.now(),
      };
      this.loop.handleFrame(frame);
      this.lastCameraCapture = Date.now();
      this.cameraStatus = "on";
      this.emitStatus();

      // Clean up temp file
      await fs.unlink(filePath).catch(() => {});
    } catch {
      this.cameraStatus = "error";
      this.emitStatus();
    }
  }

  // ── Status ──────────────────────────────────────────────────────

  private emitStatus(): void {
    this.onStatus?.({
      mic: this.micStatus,
      screen: this.screenStatus,
      camera: this.cameraStatus,
      lastScreenCapture: this.lastScreenCapture || undefined,
      lastCameraCapture: this.lastCameraCapture || undefined,
    });
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

async function detectAudioTool(): Promise<"sox" | "ffmpeg" | null> {
  for (const tool of ["sox", "ffmpeg"] as const) {
    try {
      await execFileAsync("which", [tool]);
      return tool;
    } catch {
      // not found
    }
  }
  return null;
}

async function detectCameraTool(): Promise<"imagesnap" | "ffmpeg" | null> {
  try {
    await execFileAsync("which", ["imagesnap"]);
    return "imagesnap";
  } catch {
    // not found
  }
  try {
    await execFileAsync("which", ["ffmpeg"]);
    return "ffmpeg";
  } catch {
    // not found
  }
  return null;
}

export function getCaptureLoop(connId: string): ServerCaptureLoop | undefined {
  return activeCaptureLoops.get(connId);
}
