/** Classifier mode for intent detection. */
export type InteractiveClassifierMode = "wake_only" | "llm" | "hybrid";

/** Interactive mode classifier configuration. */
export type InteractiveClassifierConfig = {
  /** Classification strategy. Default: "hybrid". */
  mode?: InteractiveClassifierMode;
  /** Use the fastest available model for classification. Default: "fast". */
  model?: string;
  /** Minimum confidence to treat transcript as directed (0.0-1.0). Default: 0.7. */
  confidenceThreshold?: number;
};

/** Interactive mode transcription configuration. */
export type InteractiveTranscriptionConfig = {
  /** Language for transcription. Default: "en". */
  language?: string;
  /** Duration of each audio chunk in seconds. Default: 8. */
  chunkDurationSec?: number;
};

/** Interactive mode vision configuration. */
export type InteractiveVisionConfig = {
  /** Interval between screen captures in ms. Default: 5000. */
  screenIntervalMs?: number;
  /** Interval between camera captures in ms. Default: 2000. */
  cameraIntervalMs?: number;
};

/** Per-session rate limiting configuration. */
export type InteractiveRateLimitsConfig = {
  /** Max transcription API calls per minute. Default: 8. */
  transcriptionPerMin?: number;
  /** Max vision analysis API calls per minute. Default: 6. */
  visionPerMin?: number;
  /** Max LLM classifier calls per minute. Default: 10. */
  classifierPerMin?: number;
};

/** Interactive mode TTS configuration. */
export type InteractiveTtsConfig = {
  /** Automatically speak agent responses. Default: true. */
  autoReply?: boolean;
};

/** Default input sources enabled when starting interactive mode. */
export type InteractiveDefaultsConfig = {
  /** Input sources enabled by default. Default: ["mic"]. */
  inputs?: Array<"mic" | "camera" | "screen" | "ambient">;
};

/** Top-level interactive mode configuration in oni.json. */
export type InteractiveConfig = {
  /** Enable interactive mode feature. Default: true. */
  enabled?: boolean;
  /** Wake words that trigger directed mode (case-insensitive). Default: ["oni", "hey oni"]. */
  wakeWords?: string[];
  /** Seconds to stay in directed mode after wake word. Default: 15. */
  directedWindowSec?: number;
  /** Seconds of silence before resetting from directed to listening. Default: 5. */
  silenceResetSec?: number;
  /** Intent classifier settings. */
  classifier?: InteractiveClassifierConfig;
  /** Transcription settings. */
  transcription?: InteractiveTranscriptionConfig;
  /** Vision capture settings. */
  vision?: InteractiveVisionConfig;
  /** Per-session rate limits. */
  rateLimits?: InteractiveRateLimitsConfig;
  /** TTS response settings. */
  tts?: InteractiveTtsConfig;
  /** Default input sources. */
  defaults?: InteractiveDefaultsConfig;
};
