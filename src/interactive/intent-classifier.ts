import type { InteractiveClassifierConfig } from "../config/types.interactive.js";
import type { IntentClassification, DirectedReason } from "./types.js";
import type { InteractiveRateLimiter } from "./rate-limiter.js";

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_FOLLOW_UP_WINDOW_MS = 30_000; // 30s after last interaction

// ── Config resolution ───────────────────────────────────────────────

export type ClassifierMode = "wake_only" | "llm" | "hybrid";

export type ResolvedClassifierConfig = {
  mode: ClassifierMode;
  confidenceThreshold: number;
  wakeWords: string[];
};

export function resolveClassifierConfig(
  classifierCfg?: InteractiveClassifierConfig,
  wakeWords?: string[],
): ResolvedClassifierConfig {
  return {
    mode: (classifierCfg?.mode as ClassifierMode) ?? "hybrid",
    confidenceThreshold: classifierCfg?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD,
    wakeWords: (wakeWords ?? ["oni", "hey oni"]).map((w) => w.toLowerCase()),
  };
}

// ── Wake word detection (fast path, zero cost) ──────────────────────

/**
 * Check if the transcript contains a wake word.
 * Returns the matched wake word or null.
 */
export function detectWakeWord(transcript: string, wakeWords: string[]): string | null {
  const lower = transcript.toLowerCase();
  // Check longest wake words first to match "hey oni" before "oni"
  const sorted = [...wakeWords].sort((a, b) => b.length - a.length);
  for (const wake of sorted) {
    // Match wake word at word boundaries
    const escaped = wake.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|\\s|,|\\.)${escaped}(?:\\s|,|\\.|!|\\?|$)`, "i");
    if (pattern.test(lower)) {
      return wake;
    }
  }
  return null;
}

// ── LLM classifier function type ────────────────────────────────────

/**
 * Function that calls the gateway's configured LLM to classify intent.
 * Injected at runtime — no direct dependency on model selection.
 */
export type LlmClassifyFunction = (params: {
  transcript: string;
  recentInteraction: boolean;
  systemPrompt: string;
  userPrompt: string;
}) => Promise<{ directed: boolean; confidence: number } | null>;

const CLASSIFIER_SYSTEM_PROMPT = `You classify whether speech is directed at an AI assistant named Oni.
Reply ONLY with JSON: {"directed": true/false, "confidence": 0.0-1.0}
Do not include any other text.`;

function buildClassifierUserPrompt(params: {
  transcript: string;
  recentInteraction: boolean;
  wakeWords: string[];
}): string {
  const parts = [`Transcript: "${params.transcript}"`];
  parts.push(`Wake words: ${params.wakeWords.join(", ")}`);
  parts.push(`Recent interaction with assistant: ${params.recentInteraction ? "yes" : "no"}`);
  return parts.join("\n");
}

// ── Intent Classifier ───────────────────────────────────────────────

export class IntentClassifier {
  private config: ResolvedClassifierConfig;
  private rateLimiter: InteractiveRateLimiter;
  private llmClassify: LlmClassifyFunction | null;
  private lastInteractionAt = 0;

  constructor(params: {
    config: ResolvedClassifierConfig;
    rateLimiter: InteractiveRateLimiter;
    llmClassify?: LlmClassifyFunction;
  }) {
    this.config = params.config;
    this.rateLimiter = params.rateLimiter;
    this.llmClassify = params.llmClassify ?? null;
  }

  /** Record that the user just interacted with Oni (used for follow-up detection). */
  recordInteraction(): void {
    this.lastInteractionAt = Date.now();
  }

  /** Classify whether a transcript is directed at Oni. */
  async classify(transcript: string): Promise<IntentClassification> {
    // Fast path: wake word detection (always runs, zero cost)
    const wakeWord = detectWakeWord(transcript, this.config.wakeWords);
    if (wakeWord) {
      return { directed: true, confidence: 1.0, reason: "wake_word" };
    }

    // Follow-up detection: if user was recently talking to Oni, lower threshold
    const recentInteraction = Date.now() - this.lastInteractionAt < DEFAULT_FOLLOW_UP_WINDOW_MS;
    if (recentInteraction && this.config.mode !== "wake_only") {
      return { directed: true, confidence: 0.8, reason: "follow_up" };
    }

    // Wake-only mode: no further classification
    if (this.config.mode === "wake_only") {
      return { directed: false, confidence: 0.0, reason: "none" };
    }

    // LLM classifier (slow path)
    if (this.llmClassify && this.rateLimiter.allow("classifier")) {
      try {
        const userPrompt = buildClassifierUserPrompt({
          transcript,
          recentInteraction,
          wakeWords: this.config.wakeWords,
        });
        const result = await this.llmClassify({
          transcript,
          recentInteraction,
          systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
          userPrompt,
        });
        if (result) {
          const directed = result.directed && result.confidence >= this.config.confidenceThreshold;
          return {
            directed,
            confidence: result.confidence,
            reason: directed ? "classifier" : "none",
          };
        }
      } catch {
        // LLM classifier failure is not fatal — fall through to not-directed
      }
    }

    return { directed: false, confidence: 0.0, reason: "none" };
  }

  /** Update config (e.g. from hot-reload). */
  updateConfig(config: ResolvedClassifierConfig): void {
    this.config = config;
  }
}
