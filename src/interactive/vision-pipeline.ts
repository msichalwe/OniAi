import type { InteractiveVisionConfig } from "../config/types.interactive.js";
import type { InteractiveRateLimiter } from "./rate-limiter.js";

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_SCREEN_INTERVAL_MS = 5_000;
const DEFAULT_CAMERA_INTERVAL_MS = 2_000;
const MAX_FRAME_AGE_MS = 30_000; // Discard frames older than 30s

// ── Config resolution ───────────────────────────────────────────────

export type ResolvedVisionConfig = {
  screenIntervalMs: number;
  cameraIntervalMs: number;
};

export function resolveVisionConfig(cfg?: InteractiveVisionConfig): ResolvedVisionConfig {
  return {
    screenIntervalMs: cfg?.screenIntervalMs ?? DEFAULT_SCREEN_INTERVAL_MS,
    cameraIntervalMs: cfg?.cameraIntervalMs ?? DEFAULT_CAMERA_INTERVAL_MS,
  };
}

// ── Frame types ─────────────────────────────────────────────────────

export type FrameSource = "camera" | "screen";

export type VisionFrame = {
  source: FrameSource;
  /** Base64-encoded JPEG data. */
  data: string;
  /** Timestamp when the frame was captured. */
  timestamp: number;
};

// ── Vision Context (latest frames for agent prompt) ─────────────────

export type VisionContext = {
  camera: VisionFrame | null;
  screen: VisionFrame | null;
};

// ── Vision Pipeline ─────────────────────────────────────────────────

/**
 * Manages incoming visual frames (camera + screen) from connected clients.
 * Keeps only the latest frame per source in memory — no storage.
 * Frames are attached to agent prompts only when the user is directing speech at Oni.
 */
export class VisionPipeline {
  private latestCamera: VisionFrame | null = null;
  private latestScreen: VisionFrame | null = null;
  private config: ResolvedVisionConfig;
  private rateLimiter: InteractiveRateLimiter;

  // Throttle: track last accepted frame timestamp per source
  private lastAcceptedCamera = 0;
  private lastAcceptedScreen = 0;

  constructor(params: {
    config: ResolvedVisionConfig;
    rateLimiter: InteractiveRateLimiter;
  }) {
    this.config = params.config;
    this.rateLimiter = params.rateLimiter;
  }

  /**
   * Ingest a frame from the client.
   * Throttled by configured intervals — excess frames are silently dropped.
   */
  ingestFrame(frame: VisionFrame): boolean {
    const now = Date.now();

    if (frame.source === "camera") {
      if (now - this.lastAcceptedCamera < this.config.cameraIntervalMs) {
        return false; // Throttled
      }
      this.latestCamera = frame;
      this.lastAcceptedCamera = now;
      return true;
    }

    if (frame.source === "screen") {
      if (now - this.lastAcceptedScreen < this.config.screenIntervalMs) {
        return false; // Throttled
      }
      this.latestScreen = frame;
      this.lastAcceptedScreen = now;
      return true;
    }

    return false;
  }

  /**
   * Get current visual context for the agent prompt.
   * Only returns frames that aren't too old.
   * Rate-limited — returns null context if vision budget is exhausted.
   */
  getContext(): VisionContext | null {
    if (!this.rateLimiter.allow("vision")) {
      return null; // Rate limited
    }

    const now = Date.now();
    const camera =
      this.latestCamera && now - this.latestCamera.timestamp < MAX_FRAME_AGE_MS
        ? this.latestCamera
        : null;
    const screen =
      this.latestScreen && now - this.latestScreen.timestamp < MAX_FRAME_AGE_MS
        ? this.latestScreen
        : null;

    if (!camera && !screen) return null;

    return { camera, screen };
  }

  /** Get latest frames without rate limiting (for status queries). */
  peek(): VisionContext {
    return {
      camera: this.latestCamera,
      screen: this.latestScreen,
    };
  }

  /** Check if any vision frames are available. */
  hasFrames(): boolean {
    return this.latestCamera !== null || this.latestScreen !== null;
  }

  /** Reset all stored frames. */
  reset(): void {
    this.latestCamera = null;
    this.latestScreen = null;
    this.lastAcceptedCamera = 0;
    this.lastAcceptedScreen = 0;
  }

  /** Update config (e.g. from hot-reload). */
  updateConfig(config: ResolvedVisionConfig): void {
    this.config = config;
  }
}
