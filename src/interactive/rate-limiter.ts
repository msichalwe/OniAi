import type { InteractiveRateLimitsConfig } from "../config/types.interactive.js";
import type { RateLimitBucket } from "./types.js";

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_LIMITS: Record<RateLimitBucket, number> = {
  transcription: 8,
  vision: 6,
  classifier: 10,
};

const WINDOW_MS = 60_000; // 1 minute sliding window

// ── Resolved config ─────────────────────────────────────────────────

export type ResolvedRateLimits = Record<RateLimitBucket, number>;

export function resolveRateLimits(cfg?: InteractiveRateLimitsConfig): ResolvedRateLimits {
  return {
    transcription: cfg?.transcriptionPerMin ?? DEFAULT_LIMITS.transcription,
    vision: cfg?.visionPerMin ?? DEFAULT_LIMITS.vision,
    classifier: cfg?.classifierPerMin ?? DEFAULT_LIMITS.classifier,
  };
}

// ── Rate Limiter ────────────────────────────────────────────────────

export class InteractiveRateLimiter {
  private buckets = new Map<RateLimitBucket, number[]>();
  private limits: ResolvedRateLimits;

  constructor(limits: ResolvedRateLimits) {
    this.limits = limits;
  }

  /** Returns true if the call is allowed, false if rate-limited (should be skipped). */
  allow(bucket: RateLimitBucket): boolean {
    const now = Date.now();
    const limit = this.limits[bucket];
    if (limit <= 0) return false;

    let timestamps = this.buckets.get(bucket);
    if (!timestamps) {
      timestamps = [];
      this.buckets.set(bucket, timestamps);
    }

    // Prune expired entries
    const cutoff = now - WINDOW_MS;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= limit) {
      return false;
    }

    timestamps.push(now);
    return true;
  }

  /** Get remaining calls in the current window. */
  remaining(bucket: RateLimitBucket): number {
    const now = Date.now();
    const limit = this.limits[bucket];
    const timestamps = this.buckets.get(bucket);
    if (!timestamps) return limit;

    const cutoff = now - WINDOW_MS;
    const active = timestamps.filter((t) => t >= cutoff).length;
    return Math.max(0, limit - active);
  }

  /** Reset all buckets. */
  reset(): void {
    this.buckets.clear();
  }

  /** Update limits (e.g. from config change). */
  updateLimits(limits: ResolvedRateLimits): void {
    this.limits = limits;
  }
}
