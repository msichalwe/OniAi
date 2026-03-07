import type { OniAIConfig } from "../config/config.js";
import type { InteractiveConfig } from "../config/types.interactive.js";
import type {
  DirectedReason,
  InteractiveInput,
  InteractiveMode,
  InteractiveState,
  InteractiveStateSnapshot,
} from "./types.js";

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_WAKE_WORDS = ["oni", "hey oni"];
const DEFAULT_DIRECTED_WINDOW_SEC = 15;
const DEFAULT_SILENCE_RESET_SEC = 5;
const DEFAULT_INPUTS: InteractiveInput[] = ["mic"];

// ── Config resolution ───────────────────────────────────────────────

export type ResolvedInteractiveConfig = {
  enabled: boolean;
  wakeWords: string[];
  directedWindowMs: number;
  silenceResetMs: number;
  defaultInputs: InteractiveInput[];
};

export function resolveInteractiveConfig(cfg?: OniAIConfig): ResolvedInteractiveConfig {
  const ic: InteractiveConfig = cfg?.interactive ?? {};
  return {
    enabled: ic.enabled !== false,
    wakeWords: ic.wakeWords ?? DEFAULT_WAKE_WORDS,
    directedWindowMs: (ic.directedWindowSec ?? DEFAULT_DIRECTED_WINDOW_SEC) * 1000,
    silenceResetMs: (ic.silenceResetSec ?? DEFAULT_SILENCE_RESET_SEC) * 1000,
    defaultInputs: (ic.defaults?.inputs as InteractiveInput[] | undefined) ?? DEFAULT_INPUTS,
  };
}

// ── Session Manager ─────────────────────────────────────────────────

export class InteractiveSessionManager {
  private sessions = new Map<string, InteractiveState>();
  private directedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private silenceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private onChange: ((connId: string, state: InteractiveStateSnapshot) => void) | null = null;

  /** Register a callback for state changes (used by gateway to broadcast). */
  onStateChange(cb: (connId: string, state: InteractiveStateSnapshot) => void): void {
    this.onChange = cb;
  }

  /** Start an interactive session for a connection. */
  start(params: {
    connId: string;
    sessionKey: string;
    agentId: string;
    config: ResolvedInteractiveConfig;
    inputs?: InteractiveInput[];
  }): InteractiveStateSnapshot {
    this.stop(params.connId);

    const now = Date.now();
    const enabledInputs = new Set<InteractiveInput>(params.inputs ?? params.config.defaultInputs);

    const state: InteractiveState = {
      mode: "listening",
      enabledInputs,
      directedUntil: null,
      directedReason: null,
      connId: params.connId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      startedAt: now,
      lastActivityAt: now,
    };

    this.sessions.set(params.connId, state);
    const snapshot = toSnapshot(state);
    this.onChange?.(params.connId, snapshot);
    return snapshot;
  }

  /** Stop an interactive session and clean up timers. */
  stop(connId: string): void {
    this.clearTimers(connId);
    const had = this.sessions.delete(connId);
    if (had) {
      const idleSnapshot: InteractiveStateSnapshot = {
        mode: "idle",
        enabledInputs: [],
        directedUntil: null,
        directedReason: null,
        connId,
        sessionKey: "",
        agentId: "",
        startedAt: 0,
        lastActivityAt: 0,
      };
      this.onChange?.(connId, idleSnapshot);
    }
  }

  /** Get the current state for a connection. */
  get(connId: string): InteractiveState | undefined {
    return this.sessions.get(connId);
  }

  /** Get a serializable snapshot of the current state. */
  getSnapshot(connId: string): InteractiveStateSnapshot | undefined {
    const state = this.sessions.get(connId);
    return state ? toSnapshot(state) : undefined;
  }

  /** Check if a connection has an active interactive session. */
  isActive(connId: string): boolean {
    const state = this.sessions.get(connId);
    return state !== undefined && state.mode !== "idle";
  }

  /** Enable specific input sources. */
  enableInputs(connId: string, inputs: InteractiveInput[]): InteractiveStateSnapshot | undefined {
    const state = this.sessions.get(connId);
    if (!state) return undefined;
    for (const input of inputs) {
      state.enabledInputs.add(input);
    }
    const snapshot = toSnapshot(state);
    this.onChange?.(connId, snapshot);
    return snapshot;
  }

  /** Disable specific input sources. */
  disableInputs(connId: string, inputs: InteractiveInput[]): InteractiveStateSnapshot | undefined {
    const state = this.sessions.get(connId);
    if (!state) return undefined;
    for (const input of inputs) {
      state.enabledInputs.delete(input);
    }
    const snapshot = toSnapshot(state);
    this.onChange?.(connId, snapshot);
    return snapshot;
  }

  /** Transition to directed mode (wake word, push-to-talk, classifier). */
  enterDirected(
    connId: string,
    reason: DirectedReason,
    config: ResolvedInteractiveConfig,
  ): InteractiveStateSnapshot | undefined {
    const state = this.sessions.get(connId);
    if (!state || state.mode === "idle") return undefined;

    this.clearTimers(connId);

    const now = Date.now();
    state.mode = "directed";
    state.directedReason = reason;
    state.directedUntil = now + config.directedWindowMs;
    state.lastActivityAt = now;

    // Auto-expire directed mode after the window
    const timer = setTimeout(() => {
      this.directedTimers.delete(connId);
      const current = this.sessions.get(connId);
      if (current && current.mode === "directed") {
        this.transitionTo(connId, "listening");
      }
    }, config.directedWindowMs);
    this.directedTimers.set(connId, timer);

    const snapshot = toSnapshot(state);
    this.onChange?.(connId, snapshot);
    return snapshot;
  }

  /** Record speech activity (extends directed window, resets silence timer). */
  recordActivity(connId: string, config: ResolvedInteractiveConfig): void {
    const state = this.sessions.get(connId);
    if (!state) return;

    const now = Date.now();
    state.lastActivityAt = now;

    // If in directed mode, extend the window
    if (state.mode === "directed") {
      state.directedUntil = now + config.directedWindowMs;

      // Reset the directed timer
      const existingTimer = this.directedTimers.get(connId);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        this.directedTimers.delete(connId);
        const current = this.sessions.get(connId);
        if (current && current.mode === "directed") {
          this.transitionTo(connId, "listening");
        }
      }, config.directedWindowMs);
      this.directedTimers.set(connId, timer);
    }

    // Reset silence timer
    this.resetSilenceTimer(connId, config);
  }

  /** Transition to responding mode (agent is generating). */
  enterResponding(connId: string): InteractiveStateSnapshot | undefined {
    return this.transitionTo(connId, "responding");
  }

  /** Transition to processing mode (agent is running tools). */
  enterProcessing(connId: string): InteractiveStateSnapshot | undefined {
    return this.transitionTo(connId, "processing");
  }

  /** Transition back to listening mode (agent done responding). */
  enterListening(connId: string): InteractiveStateSnapshot | undefined {
    return this.transitionTo(connId, "listening");
  }

  /** Get all active sessions. */
  getActiveSessions(): InteractiveStateSnapshot[] {
    const results: InteractiveStateSnapshot[] = [];
    for (const state of this.sessions.values()) {
      if (state.mode !== "idle") {
        results.push(toSnapshot(state));
      }
    }
    return results;
  }

  /** Clean up all sessions (gateway shutdown). */
  dispose(): void {
    for (const connId of this.sessions.keys()) {
      this.clearTimers(connId);
    }
    this.sessions.clear();
    this.onChange = null;
  }

  // ── Private ─────────────────────────────────────────────────────

  private transitionTo(connId: string, mode: InteractiveMode): InteractiveStateSnapshot | undefined {
    const state = this.sessions.get(connId);
    if (!state) return undefined;

    if (mode === "listening") {
      state.directedUntil = null;
      state.directedReason = null;
      this.clearTimers(connId);
    }

    state.mode = mode;
    const snapshot = toSnapshot(state);
    this.onChange?.(connId, snapshot);
    return snapshot;
  }

  private resetSilenceTimer(connId: string, config: ResolvedInteractiveConfig): void {
    const existing = this.silenceTimers.get(connId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.silenceTimers.delete(connId);
      const current = this.sessions.get(connId);
      if (current && current.mode === "directed") {
        this.transitionTo(connId, "listening");
      }
    }, config.silenceResetMs);
    this.silenceTimers.set(connId, timer);
  }

  private clearTimers(connId: string): void {
    const directed = this.directedTimers.get(connId);
    if (directed) {
      clearTimeout(directed);
      this.directedTimers.delete(connId);
    }
    const silence = this.silenceTimers.get(connId);
    if (silence) {
      clearTimeout(silence);
      this.silenceTimers.delete(connId);
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function toSnapshot(state: InteractiveState): InteractiveStateSnapshot {
  return {
    ...state,
    enabledInputs: [...state.enabledInputs],
  };
}
