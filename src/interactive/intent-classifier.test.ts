import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  IntentClassifier,
  detectWakeWord,
  resolveClassifierConfig,
} from "./intent-classifier.js";
import { InteractiveRateLimiter } from "./rate-limiter.js";

describe("resolveClassifierConfig", () => {
  it("returns defaults", () => {
    const cfg = resolveClassifierConfig(undefined, undefined);
    expect(cfg.mode).toBe("hybrid");
    expect(cfg.confidenceThreshold).toBe(0.7);
    expect(cfg.wakeWords).toEqual(["oni", "hey oni"]);
  });

  it("respects custom values", () => {
    const cfg = resolveClassifierConfig(
      { mode: "wake_only", confidenceThreshold: 0.5 },
      ["pi", "hey pi"],
    );
    expect(cfg.mode).toBe("wake_only");
    expect(cfg.confidenceThreshold).toBe(0.5);
    expect(cfg.wakeWords).toEqual(["pi", "hey pi"]);
  });
});

describe("detectWakeWord", () => {
  const wakeWords = ["oni", "hey oni"];

  it("detects wake word at start", () => {
    expect(detectWakeWord("Oni, open the browser", wakeWords)).toBe("oni");
  });

  it("detects wake word at end", () => {
    expect(detectWakeWord("open the browser, oni", wakeWords)).toBe("oni");
  });

  it("detects multi-word wake phrase", () => {
    expect(detectWakeWord("hey oni what's the time?", wakeWords)).toBe("hey oni");
  });

  it("is case-insensitive", () => {
    expect(detectWakeWord("HEY ONI check my email", wakeWords)).toBe("hey oni");
  });

  it("does not match partial words", () => {
    expect(detectWakeWord("macaroni is delicious", wakeWords)).toBeNull();
  });

  it("returns null when no wake word", () => {
    expect(detectWakeWord("what's the weather today?", wakeWords)).toBeNull();
  });
});

describe("IntentClassifier", () => {
  let rateLimiter: InteractiveRateLimiter;
  const config = resolveClassifierConfig(undefined, ["oni", "hey oni"]);

  beforeEach(() => {
    rateLimiter = new InteractiveRateLimiter({ transcription: 8, vision: 6, classifier: 10 });
  });

  it("detects wake word instantly (fast path)", async () => {
    const classifier = new IntentClassifier({ config, rateLimiter });
    const result = await classifier.classify("Hey Oni, what's the weather?");
    expect(result.directed).toBe(true);
    expect(result.confidence).toBe(1.0);
    expect(result.reason).toBe("wake_word");
  });

  it("detects follow-up after recent interaction", async () => {
    const classifier = new IntentClassifier({ config, rateLimiter });
    classifier.recordInteraction();
    const result = await classifier.classify("And what about tomorrow?");
    expect(result.directed).toBe(true);
    expect(result.reason).toBe("follow_up");
  });

  it("returns not-directed in wake_only mode without wake word", async () => {
    const wakeOnlyConfig = resolveClassifierConfig({ mode: "wake_only" }, ["oni"]);
    const classifier = new IntentClassifier({ config: wakeOnlyConfig, rateLimiter });
    const result = await classifier.classify("what's the weather?");
    expect(result.directed).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("calls LLM classifier in hybrid mode when no wake word", async () => {
    const llmClassify = vi.fn().mockResolvedValue({ directed: true, confidence: 0.9 });
    const classifier = new IntentClassifier({ config, rateLimiter, llmClassify });
    const result = await classifier.classify("what's the weather?");
    expect(llmClassify).toHaveBeenCalledOnce();
    expect(result.directed).toBe(true);
    expect(result.reason).toBe("classifier");
  });

  it("rejects LLM result below confidence threshold", async () => {
    const llmClassify = vi.fn().mockResolvedValue({ directed: true, confidence: 0.5 });
    const classifier = new IntentClassifier({ config, rateLimiter, llmClassify });
    const result = await classifier.classify("what's the weather?");
    expect(result.directed).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("handles LLM classifier failure gracefully", async () => {
    const llmClassify = vi.fn().mockRejectedValue(new Error("API error"));
    const classifier = new IntentClassifier({ config, rateLimiter, llmClassify });
    const result = await classifier.classify("what's the weather?");
    expect(result.directed).toBe(false);
    expect(result.reason).toBe("none");
  });

  it("skips LLM classifier when rate-limited", async () => {
    const limitedLimiter = new InteractiveRateLimiter({ transcription: 8, vision: 6, classifier: 0 });
    const llmClassify = vi.fn().mockResolvedValue({ directed: true, confidence: 0.9 });
    const classifier = new IntentClassifier({ config, rateLimiter: limitedLimiter, llmClassify });
    const result = await classifier.classify("what's the weather?");
    expect(llmClassify).not.toHaveBeenCalled();
    expect(result.directed).toBe(false);
  });

  it("works without LLM function (no llmClassify provided)", async () => {
    const classifier = new IntentClassifier({ config, rateLimiter });
    const result = await classifier.classify("random chatter about food");
    expect(result.directed).toBe(false);
  });
});
