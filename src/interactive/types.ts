/** Input sources available in interactive mode. */
export type InteractiveInput = "mic" | "camera" | "screen" | "ambient";

/** State machine modes for an interactive session. */
export type InteractiveMode = "idle" | "listening" | "directed" | "responding" | "processing";

/** Reason the session transitioned to directed mode. */
export type DirectedReason = "wake_word" | "push_to_talk" | "classifier" | "follow_up";

/** Per-connection interactive session state. */
export type InteractiveState = {
  mode: InteractiveMode;
  enabledInputs: Set<InteractiveInput>;
  /** Timestamp (ms) when directed mode expires back to listening. */
  directedUntil: number | null;
  /** Reason why directed mode was entered. */
  directedReason: DirectedReason | null;
  /** Connection ID that owns this session. */
  connId: string;
  /** Session key for agent routing. */
  sessionKey: string;
  /** Agent ID for this session. */
  agentId: string;
  /** Timestamp (ms) when the session was started. */
  startedAt: number;
  /** Timestamp (ms) of the last speech activity. */
  lastActivityAt: number;
};

/** Snapshot of interactive state safe for serialization (Sets → arrays). */
export type InteractiveStateSnapshot = Omit<InteractiveState, "enabledInputs"> & {
  enabledInputs: InteractiveInput[];
};

/** Events broadcast to connected clients. */
export type InteractiveEvent =
  | { type: "interactive.state"; mode: InteractiveMode; enabledInputs: InteractiveInput[]; connId: string }
  | { type: "interactive.transcript"; text: string; final: boolean; directed: boolean; source: "mic" | "ambient" }
  | { type: "interactive.response.start"; runId: string }
  | { type: "interactive.response.delta"; text: string; runId: string }
  | { type: "interactive.response.audio"; data: string; format: string }
  | { type: "interactive.response.done"; fullText: string; runId: string }
  | { type: "interactive.action"; tool: string; args: string; result: string };

/** Classification result from the intent classifier. */
export type IntentClassification = {
  directed: boolean;
  confidence: number;
  reason: DirectedReason | "none";
};

/** Rate limiter bucket names. */
export type RateLimitBucket = "transcription" | "vision" | "classifier";
