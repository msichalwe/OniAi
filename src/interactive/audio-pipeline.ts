import type { InteractiveTranscriptionConfig } from "../config/types.interactive.js";
import type { InteractiveRateLimiter } from "./rate-limiter.js";

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_CHUNK_DURATION_SEC = 8;
const DEFAULT_LANGUAGE = "en";
const DEFAULT_SAMPLE_RATE = 24_000;

// Common Whisper hallucination artifacts to filter out
const NOISE_PATTERNS = [
  /^\s*$/,
  /^thanks?( you)?[.!]?\s*$/i,
  /^thank you( for (watching|listening))?[.!]?\s*$/i,
  /^thanks for (watching|listening)[.!]?\s*$/i,
  /^(please )?subscribe[.!]?\s*$/i,
  /^like and subscribe[.!]?\s*$/i,
  /^(music|applause|laughter|silence|background noise)\s*$/i,
  /^\[.*\]\s*$/,
  /^you$/i,
  /^\.+$/,
  /^,+$/,
];

// ── Config resolution ───────────────────────────────────────────────

export type ResolvedTranscriptionConfig = {
  language: string;
  chunkDurationMs: number;
  sampleRate: number;
};

export function resolveTranscriptionConfig(
  cfg?: InteractiveTranscriptionConfig,
): ResolvedTranscriptionConfig {
  return {
    language: cfg?.language ?? DEFAULT_LANGUAGE,
    chunkDurationMs: (cfg?.chunkDurationSec ?? DEFAULT_CHUNK_DURATION_SEC) * 1000,
    sampleRate: DEFAULT_SAMPLE_RATE,
  };
}

// ── Noise filter ────────────────────────────────────────────────────

export function isNoiseOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// ── Audio Buffer ────────────────────────────────────────────────────

/**
 * Accumulates incoming audio chunks and emits complete segments
 * for transcription when the configured chunk duration is reached.
 */
export class AudioChunkBuffer {
  private chunks: Buffer[] = [];
  private totalBytes = 0;
  private config: ResolvedTranscriptionConfig;
  /** Bytes needed for one chunk: sampleRate * 2 (16-bit PCM) * chunkDuration */
  private targetBytes: number;

  constructor(config: ResolvedTranscriptionConfig) {
    this.config = config;
    this.targetBytes = config.sampleRate * 2 * (config.chunkDurationMs / 1000);
  }

  /**
   * Append a base64-encoded PCM16 audio chunk.
   * Returns a complete audio Buffer if the target duration is reached, null otherwise.
   */
  append(base64Data: string): Buffer | null {
    const chunk = Buffer.from(base64Data, "base64");
    this.chunks.push(chunk);
    this.totalBytes += chunk.length;

    if (this.totalBytes >= this.targetBytes) {
      return this.flush();
    }
    return null;
  }

  /** Force flush whatever audio we have (e.g. on stream end). */
  flush(): Buffer | null {
    if (this.chunks.length === 0) return null;
    const combined = Buffer.concat(this.chunks);
    this.chunks = [];
    this.totalBytes = 0;
    return combined;
  }

  /** Reset buffer without returning data. */
  clear(): void {
    this.chunks = [];
    this.totalBytes = 0;
  }

  /** Current buffered duration in ms. */
  get bufferedMs(): number {
    const bytesPerMs = (this.config.sampleRate * 2) / 1000;
    return bytesPerMs > 0 ? this.totalBytes / bytesPerMs : 0;
  }
}

// ── Transcription callback type ─────────────────────────────────────

export type TranscribeFunction = (params: {
  buffer: Buffer;
  fileName: string;
  mime: string;
  language: string;
}) => Promise<{ text: string } | null>;

// ── Audio Pipeline ──────────────────────────────────────────────────

export type AudioPipelineCallbacks = {
  /** Called when a transcript is produced. */
  onTranscript: (text: string, final: boolean) => void;
  /** Called when transcription fails (best-effort, no throw). */
  onError?: (err: unknown) => void;
};

/**
 * Server-side audio pipeline: buffers incoming audio chunks,
 * segments them, runs transcription, and filters noise.
 */
export class AudioPipeline {
  private buffer: AudioChunkBuffer;
  private config: ResolvedTranscriptionConfig;
  private rateLimiter: InteractiveRateLimiter;
  private transcribe: TranscribeFunction;
  private callbacks: AudioPipelineCallbacks;
  private transcribing = false;
  private pendingBuffer: Buffer | null = null;

  constructor(params: {
    config: ResolvedTranscriptionConfig;
    rateLimiter: InteractiveRateLimiter;
    transcribe: TranscribeFunction;
    callbacks: AudioPipelineCallbacks;
  }) {
    this.config = params.config;
    this.rateLimiter = params.rateLimiter;
    this.transcribe = params.transcribe;
    this.callbacks = params.callbacks;
    this.buffer = new AudioChunkBuffer(this.config);
  }

  /** Process an incoming base64 PCM16 audio chunk. */
  async ingestChunk(base64Data: string): Promise<void> {
    const ready = this.buffer.append(base64Data);
    if (ready) {
      await this.processSegment(ready);
    }
  }

  /** Signal end of audio stream — flush remaining buffer. */
  async end(): Promise<void> {
    const remaining = this.buffer.flush();
    if (remaining && remaining.length > 0) {
      await this.processSegment(remaining);
    }
  }

  /** Reset the pipeline. */
  reset(): void {
    this.buffer.clear();
    this.pendingBuffer = null;
    this.transcribing = false;
  }

  private async processSegment(audioBuffer: Buffer): Promise<void> {
    if (!this.rateLimiter.allow("transcription")) {
      // Rate limited — silently skip this segment
      return;
    }

    // If already transcribing, queue the latest segment (only keep one pending)
    if (this.transcribing) {
      this.pendingBuffer = audioBuffer;
      return;
    }

    this.transcribing = true;
    try {
      await this.runTranscription(audioBuffer);
    } finally {
      this.transcribing = false;

      // Process pending buffer if any
      if (this.pendingBuffer) {
        const pending = this.pendingBuffer;
        this.pendingBuffer = null;
        await this.processSegment(pending);
      }
    }
  }

  private async runTranscription(audioBuffer: Buffer): Promise<void> {
    try {
      const result = await this.transcribe({
        buffer: audioBuffer,
        fileName: "interactive-audio.wav",
        mime: "audio/wav",
        language: this.config.language,
      });

      if (!result || !result.text) return;

      const text = result.text.trim();
      if (isNoiseOnly(text)) return;

      this.callbacks.onTranscript(text, true);
    } catch (err) {
      this.callbacks.onError?.(err);
    }
  }
}
