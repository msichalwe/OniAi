import { describe, expect, it, vi, beforeEach } from "vitest";
import { AudioChunkBuffer, AudioPipeline, isNoiseOnly, resolveTranscriptionConfig } from "./audio-pipeline.js";
import { InteractiveRateLimiter } from "./rate-limiter.js";

describe("resolveTranscriptionConfig", () => {
  it("returns defaults when no config", () => {
    const cfg = resolveTranscriptionConfig(undefined);
    expect(cfg.language).toBe("en");
    expect(cfg.chunkDurationMs).toBe(8_000);
    expect(cfg.sampleRate).toBe(24_000);
  });

  it("respects custom values", () => {
    const cfg = resolveTranscriptionConfig({ language: "fr", chunkDurationSec: 5 });
    expect(cfg.language).toBe("fr");
    expect(cfg.chunkDurationMs).toBe(5_000);
  });
});

describe("isNoiseOnly", () => {
  it("filters empty and whitespace", () => {
    expect(isNoiseOnly("")).toBe(true);
    expect(isNoiseOnly("   ")).toBe(true);
  });

  it("filters whisper hallucinations", () => {
    expect(isNoiseOnly("Thank you.")).toBe(true);
    expect(isNoiseOnly("thanks for watching")).toBe(true);
    expect(isNoiseOnly("Please subscribe")).toBe(true);
    expect(isNoiseOnly("like and subscribe")).toBe(true);
    expect(isNoiseOnly("[Music]")).toBe(true);
    expect(isNoiseOnly("you")).toBe(true);
    expect(isNoiseOnly("...")).toBe(true);
  });

  it("passes real speech", () => {
    expect(isNoiseOnly("Hey Oni, what's the weather?")).toBe(false);
    expect(isNoiseOnly("Can you open the browser?")).toBe(false);
    expect(isNoiseOnly("run npm test")).toBe(false);
  });
});

describe("AudioChunkBuffer", () => {
  const config = resolveTranscriptionConfig({ chunkDurationSec: 1 });

  it("returns null when buffer not full", () => {
    const buf = new AudioChunkBuffer(config);
    // 1s at 24kHz 16-bit = 48000 bytes. Send less.
    const smallChunk = Buffer.alloc(1000).toString("base64");
    expect(buf.append(smallChunk)).toBeNull();
    expect(buf.bufferedMs).toBeGreaterThan(0);
  });

  it("returns buffer when chunk duration reached", () => {
    const buf = new AudioChunkBuffer(config);
    // Target: 24000 * 2 * 1 = 48000 bytes
    const fullChunk = Buffer.alloc(48_000).toString("base64");
    const result = buf.append(fullChunk);
    expect(result).toBeInstanceOf(Buffer);
    expect(result!.length).toBe(48_000);
  });

  it("flush returns remaining data", () => {
    const buf = new AudioChunkBuffer(config);
    const smallChunk = Buffer.alloc(1000).toString("base64");
    buf.append(smallChunk);
    const flushed = buf.flush();
    expect(flushed).toBeInstanceOf(Buffer);
    expect(flushed!.length).toBe(1000);
    // After flush, buffer should be empty
    expect(buf.flush()).toBeNull();
  });

  it("clear resets without returning", () => {
    const buf = new AudioChunkBuffer(config);
    const smallChunk = Buffer.alloc(1000).toString("base64");
    buf.append(smallChunk);
    buf.clear();
    expect(buf.flush()).toBeNull();
    expect(buf.bufferedMs).toBe(0);
  });
});

describe("AudioPipeline", () => {
  const config = resolveTranscriptionConfig({ chunkDurationSec: 1 });
  let rateLimiter: InteractiveRateLimiter;

  beforeEach(() => {
    rateLimiter = new InteractiveRateLimiter({ transcription: 8, vision: 6, classifier: 10 });
  });

  it("calls onTranscript when audio segment is ready and transcription succeeds", async () => {
    const transcripts: string[] = [];
    const transcribe = vi.fn().mockResolvedValue({ text: "Hello Oni" });

    const pipeline = new AudioPipeline({
      config,
      rateLimiter,
      transcribe,
      callbacks: {
        onTranscript: (text) => transcripts.push(text),
      },
    });

    // Send enough data to fill one chunk
    const fullChunk = Buffer.alloc(48_000).toString("base64");
    await pipeline.ingestChunk(fullChunk);

    expect(transcribe).toHaveBeenCalledOnce();
    expect(transcripts).toEqual(["Hello Oni"]);
  });

  it("filters noise transcriptions", async () => {
    const transcripts: string[] = [];
    const transcribe = vi.fn().mockResolvedValue({ text: "Thank you." });

    const pipeline = new AudioPipeline({
      config,
      rateLimiter,
      transcribe,
      callbacks: {
        onTranscript: (text) => transcripts.push(text),
      },
    });

    const fullChunk = Buffer.alloc(48_000).toString("base64");
    await pipeline.ingestChunk(fullChunk);

    expect(transcribe).toHaveBeenCalledOnce();
    expect(transcripts).toEqual([]); // filtered out
  });

  it("flushes remaining audio on end()", async () => {
    const transcripts: string[] = [];
    const transcribe = vi.fn().mockResolvedValue({ text: "flush test" });

    const pipeline = new AudioPipeline({
      config,
      rateLimiter,
      transcribe,
      callbacks: {
        onTranscript: (text) => transcripts.push(text),
      },
    });

    // Send less than a full chunk
    const smallChunk = Buffer.alloc(1000).toString("base64");
    await pipeline.ingestChunk(smallChunk);
    expect(transcribe).not.toHaveBeenCalled();

    await pipeline.end();
    expect(transcribe).toHaveBeenCalledOnce();
    expect(transcripts).toEqual(["flush test"]);
  });

  it("skips transcription when rate-limited", async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: "test" });
    const limitedLimiter = new InteractiveRateLimiter({ transcription: 0, vision: 6, classifier: 10 });

    const pipeline = new AudioPipeline({
      config,
      rateLimiter: limitedLimiter,
      transcribe,
      callbacks: {
        onTranscript: () => {},
      },
    });

    const fullChunk = Buffer.alloc(48_000).toString("base64");
    await pipeline.ingestChunk(fullChunk);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("handles transcription errors gracefully", async () => {
    const errors: unknown[] = [];
    const transcribe = vi.fn().mockRejectedValue(new Error("API down"));

    const pipeline = new AudioPipeline({
      config,
      rateLimiter,
      transcribe,
      callbacks: {
        onTranscript: () => {},
        onError: (err) => errors.push(err),
      },
    });

    const fullChunk = Buffer.alloc(48_000).toString("base64");
    await pipeline.ingestChunk(fullChunk);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("API down");
  });

  it("reset clears state", async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: "test" });

    const pipeline = new AudioPipeline({
      config,
      rateLimiter,
      transcribe,
      callbacks: {
        onTranscript: () => {},
      },
    });

    const smallChunk = Buffer.alloc(1000).toString("base64");
    await pipeline.ingestChunk(smallChunk);
    pipeline.reset();

    await pipeline.end(); // Should not transcribe since reset cleared the buffer
    expect(transcribe).not.toHaveBeenCalled();
  });
});
