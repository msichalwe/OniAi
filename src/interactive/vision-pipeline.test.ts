import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { VisionPipeline, resolveVisionConfig, type VisionFrame } from "./vision-pipeline.js";
import { InteractiveRateLimiter } from "./rate-limiter.js";

describe("resolveVisionConfig", () => {
  it("returns defaults", () => {
    const cfg = resolveVisionConfig(undefined);
    expect(cfg.screenIntervalMs).toBe(5_000);
    expect(cfg.cameraIntervalMs).toBe(2_000);
  });

  it("respects custom values", () => {
    const cfg = resolveVisionConfig({ screenIntervalMs: 10_000, cameraIntervalMs: 3_000 });
    expect(cfg.screenIntervalMs).toBe(10_000);
    expect(cfg.cameraIntervalMs).toBe(3_000);
  });
});

describe("VisionPipeline", () => {
  let rateLimiter: InteractiveRateLimiter;
  let pipeline: VisionPipeline;
  const config = resolveVisionConfig({ screenIntervalMs: 5_000, cameraIntervalMs: 2_000 });

  beforeEach(() => {
    vi.useFakeTimers();
    rateLimiter = new InteractiveRateLimiter({ transcription: 8, vision: 6, classifier: 10 });
    pipeline = new VisionPipeline({ config, rateLimiter });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeFrame(source: "camera" | "screen"): VisionFrame {
    return { source, data: "base64data", timestamp: Date.now() };
  }

  it("accepts a camera frame", () => {
    expect(pipeline.ingestFrame(makeFrame("camera"))).toBe(true);
    expect(pipeline.hasFrames()).toBe(true);
  });

  it("accepts a screen frame", () => {
    expect(pipeline.ingestFrame(makeFrame("screen"))).toBe(true);
    expect(pipeline.hasFrames()).toBe(true);
  });

  it("throttles camera frames within interval", () => {
    expect(pipeline.ingestFrame(makeFrame("camera"))).toBe(true);
    // Immediately send another — should be throttled
    expect(pipeline.ingestFrame(makeFrame("camera"))).toBe(false);

    // Advance past camera interval
    vi.advanceTimersByTime(2_001);
    expect(pipeline.ingestFrame(makeFrame("camera"))).toBe(true);
  });

  it("throttles screen frames within interval", () => {
    expect(pipeline.ingestFrame(makeFrame("screen"))).toBe(true);
    expect(pipeline.ingestFrame(makeFrame("screen"))).toBe(false);

    vi.advanceTimersByTime(5_001);
    expect(pipeline.ingestFrame(makeFrame("screen"))).toBe(true);
  });

  it("getContext returns frames when available", () => {
    pipeline.ingestFrame(makeFrame("camera"));
    pipeline.ingestFrame(makeFrame("screen"));

    const ctx = pipeline.getContext();
    expect(ctx).not.toBeNull();
    expect(ctx!.camera).not.toBeNull();
    expect(ctx!.screen).not.toBeNull();
  });

  it("getContext returns null when no frames", () => {
    const ctx = pipeline.getContext();
    expect(ctx).toBeNull();
  });

  it("getContext discards stale frames (>30s)", () => {
    pipeline.ingestFrame(makeFrame("camera"));
    vi.advanceTimersByTime(31_000);

    const ctx = pipeline.getContext();
    expect(ctx).toBeNull();
  });

  it("getContext returns null when rate-limited", () => {
    const limitedLimiter = new InteractiveRateLimiter({ transcription: 8, vision: 0, classifier: 10 });
    const limitedPipeline = new VisionPipeline({ config, rateLimiter: limitedLimiter });
    limitedPipeline.ingestFrame(makeFrame("camera"));

    const ctx = limitedPipeline.getContext();
    expect(ctx).toBeNull();
  });

  it("peek returns frames without rate limiting", () => {
    pipeline.ingestFrame(makeFrame("camera"));
    const peeked = pipeline.peek();
    expect(peeked.camera).not.toBeNull();
  });

  it("reset clears all frames", () => {
    pipeline.ingestFrame(makeFrame("camera"));
    pipeline.ingestFrame(makeFrame("screen"));
    pipeline.reset();

    expect(pipeline.hasFrames()).toBe(false);
    expect(pipeline.peek().camera).toBeNull();
    expect(pipeline.peek().screen).toBeNull();
  });

  it("camera and screen are throttled independently", () => {
    expect(pipeline.ingestFrame(makeFrame("camera"))).toBe(true);
    expect(pipeline.ingestFrame(makeFrame("screen"))).toBe(true);
    // Camera throttled, screen throttled
    expect(pipeline.ingestFrame(makeFrame("camera"))).toBe(false);
    expect(pipeline.ingestFrame(makeFrame("screen"))).toBe(false);

    // Advance past camera interval but not screen
    vi.advanceTimersByTime(2_001);
    expect(pipeline.ingestFrame(makeFrame("camera"))).toBe(true);
    expect(pipeline.ingestFrame(makeFrame("screen"))).toBe(false);

    // Advance past screen interval
    vi.advanceTimersByTime(3_000);
    expect(pipeline.ingestFrame(makeFrame("screen"))).toBe(true);
  });
});
