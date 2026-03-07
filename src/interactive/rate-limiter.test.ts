import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { InteractiveRateLimiter, resolveRateLimits } from "./rate-limiter.js";

describe("resolveRateLimits", () => {
  it("returns defaults when no config provided", () => {
    const limits = resolveRateLimits(undefined);
    expect(limits.transcription).toBe(8);
    expect(limits.vision).toBe(6);
    expect(limits.classifier).toBe(10);
  });

  it("respects custom values", () => {
    const limits = resolveRateLimits({
      transcriptionPerMin: 3,
      visionPerMin: 2,
      classifierPerMin: 5,
    });
    expect(limits.transcription).toBe(3);
    expect(limits.vision).toBe(2);
    expect(limits.classifier).toBe(5);
  });
});

describe("InteractiveRateLimiter", () => {
  let limiter: InteractiveRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new InteractiveRateLimiter({ transcription: 3, vision: 2, classifier: 5 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows calls within limit", () => {
    expect(limiter.allow("transcription")).toBe(true);
    expect(limiter.allow("transcription")).toBe(true);
    expect(limiter.allow("transcription")).toBe(true);
    expect(limiter.remaining("transcription")).toBe(0);
  });

  it("rejects calls over limit", () => {
    limiter.allow("transcription");
    limiter.allow("transcription");
    limiter.allow("transcription");
    expect(limiter.allow("transcription")).toBe(false);
  });

  it("allows calls after window expires", () => {
    limiter.allow("transcription");
    limiter.allow("transcription");
    limiter.allow("transcription");
    expect(limiter.allow("transcription")).toBe(false);

    // Advance past the 1-minute window
    vi.advanceTimersByTime(61_000);
    expect(limiter.allow("transcription")).toBe(true);
    expect(limiter.remaining("transcription")).toBe(2);
  });

  it("tracks buckets independently", () => {
    limiter.allow("transcription");
    limiter.allow("transcription");
    limiter.allow("transcription");
    expect(limiter.allow("transcription")).toBe(false);
    // Vision should still be available
    expect(limiter.allow("vision")).toBe(true);
    expect(limiter.remaining("vision")).toBe(1);
  });

  it("remaining returns correct count", () => {
    expect(limiter.remaining("classifier")).toBe(5);
    limiter.allow("classifier");
    limiter.allow("classifier");
    expect(limiter.remaining("classifier")).toBe(3);
  });

  it("reset clears all buckets", () => {
    limiter.allow("transcription");
    limiter.allow("transcription");
    limiter.allow("transcription");
    limiter.reset();
    expect(limiter.remaining("transcription")).toBe(3);
    expect(limiter.allow("transcription")).toBe(true);
  });

  it("updateLimits changes limits", () => {
    limiter.allow("transcription");
    limiter.allow("transcription");
    limiter.allow("transcription");
    expect(limiter.allow("transcription")).toBe(false);

    limiter.updateLimits({ transcription: 5, vision: 2, classifier: 5 });
    expect(limiter.allow("transcription")).toBe(true);
  });
});
