import { loadConfig } from "../../config/io.js";
import {
  InteractiveActionLoop,
  getActionLoop,
  registerActionLoop,
  removeActionLoop,
} from "../../interactive/action-loop.js";
import {
  InteractiveSessionManager,
  resolveInteractiveConfig,
} from "../../interactive/session.js";
import type { TranscribeFunction } from "../../interactive/audio-pipeline.js";
import type { LlmClassifyFunction } from "../../interactive/intent-classifier.js";
import type { InteractiveEvent, InteractiveInput } from "../../interactive/types.js";
import type { VisionFrame } from "../../interactive/vision-pipeline.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestContext, GatewayRequestHandlers, RespondFn } from "./types.js";

const VALID_INPUTS = new Set<InteractiveInput>(["mic", "camera", "screen", "ambient"]);

function parseInputs(raw: unknown): InteractiveInput[] | null {
  if (!Array.isArray(raw)) return null;
  const inputs: InteractiveInput[] = [];
  for (const item of raw) {
    const s = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (!VALID_INPUTS.has(s as InteractiveInput)) return null;
    inputs.push(s as InteractiveInput);
  }
  return inputs.length > 0 ? inputs : null;
}

// ── Singleton session manager ────────────────────────────────────────
let sessionManager: InteractiveSessionManager | null = null;
let stateChangeWired = false;

export function getInteractiveSessionManager(): InteractiveSessionManager {
  if (!sessionManager) {
    sessionManager = new InteractiveSessionManager();
  }
  return sessionManager;
}

/**
 * Wire the session manager's onStateChange callback to the gateway broadcast
 * system exactly once. Subsequent calls are no-ops.
 */
function ensureStateChangeBroadcast(
  mgr: InteractiveSessionManager,
  broadcast: GatewayRequestContext["broadcast"],
): void {
  if (stateChangeWired) return;
  stateChangeWired = true;
  mgr.onStateChange((connId, state) => {
    broadcast(
      "interactive.state",
      { mode: state.mode, enabledInputs: state.enabledInputs, connId },
      { dropIfSlow: true },
    );
  });
}

// ── Helpers: require active session / connId ─────────────────────────

function requireConnId(
  client: { connId?: string } | null,
  respond: RespondFn,
): string | null {
  const connId = client?.connId;
  if (!connId) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "No connection ID"));
    return null;
  }
  return connId;
}

// ── Broadcast helper ─────────────────────────────────────────────────

function broadcastInteractiveEvent(
  context: GatewayRequestContext,
  _connId: string,
  event: InteractiveEvent,
): void {
  context.broadcast(event.type, event, { dropIfSlow: true });
}

// ── Transcribe stub ──────────────────────────────────────────────────
// The real transcription is done by the media-understanding system.
// For now we provide a best-effort stub that returns the base64 audio
// length as a placeholder transcript. When STT providers are configured,
// this will be replaced by the actual whisper/gemini/etc call.

async function createTranscribeFunction(
  _cfg: ReturnType<typeof loadConfig>,
): Promise<TranscribeFunction> {
  return async (_params) => {
    // Placeholder — in a real deployment the gateway's media-understanding
    // pipeline would decode the audio buffer, call the configured STT
    // provider (Whisper, Gemini, Deepgram, etc.), and return the text.
    // Until that bridge is built, return null to avoid false positives.
    return null;
  };
}

// ── LLM classify stub ────────────────────────────────────────────────

async function createLlmClassifyFunction(
  _cfg: ReturnType<typeof loadConfig>,
): Promise<LlmClassifyFunction | undefined> {
  // In a real deployment this would call the configured chat model with a
  // micro-classifier prompt. For now return undefined so the classifier
  // falls back to wake-word-only mode.
  return undefined;
}

// ── Handlers ─────────────────────────────────────────────────────────

export const interactiveHandlers: GatewayRequestHandlers = {
  /**
   * Start an interactive session. Creates the state-machine entry AND the
   * action-loop that wires audio → transcribe → classify → agent → TTS.
   */
  "interactive.start": async ({ params, client, respond, context }) => {
    try {
      const cfg = loadConfig();
      const config = resolveInteractiveConfig(cfg);
      if (!config.enabled) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Interactive mode is disabled in config"));
        return;
      }
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const agentId = typeof params.agentId === "string" ? params.agentId : "default";
      const sessionKey = typeof params.sessionKey === "string"
        ? params.sessionKey
        : `agent:${agentId}:interactive:${connId}`;
      const inputs = parseInputs(params.inputs) ?? undefined;

      const mgr = getInteractiveSessionManager();
      ensureStateChangeBroadcast(mgr, context.broadcast);

      // Build callbacks that bridge the action-loop to the gateway.
      const transcribe = await createTranscribeFunction(cfg);
      const llmClassify = await createLlmClassifyFunction(cfg);

      const loop = new InteractiveActionLoop({
        connId,
        sessionKey,
        agentId,
        cfg,
        sessionManager: mgr,
        callbacks: {
          broadcastEvent: (cid, evt) => broadcastInteractiveEvent(context, cid, evt),
          transcribe,
          llmClassify,
          sendToAgent: async (p) => {
            // Dispatch as a chat.send through the standard inbound pipeline
            // so the agent gets the transcript with full context.
            const frameCount = (p.visionContext?.camera ? 1 : 0) + (p.visionContext?.screen ? 1 : 0);
            const message = p.visionContext
              ? `[Interactive mode — spoken input with ${frameCount} vision frame(s)]\n\n${p.transcript}`
              : `[Interactive mode — spoken input]\n\n${p.transcript}`;
            try {
              // Use the broadcast system to inject a user message and trigger
              // the agent run, then collect the response via the chat event.
              // For now we emit a "chat.send" request internally.
              const runId = `interactive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              context.broadcast("interactive.action", {
                connId: p.connId,
                runId,
                transcript: p.transcript,
                hasVision: Boolean(p.visionContext),
              }, { dropIfSlow: true });
              // The actual agent invocation happens through the gateway's
              // standard chat pipeline — the interactive response events are
              // broadcast by the action loop.
              return message;
            } catch {
              return null;
            }
          },
          speakResponse: async (p) => {
            // Broadcast audio response event — the TUI / client decides
            // whether to play it.
            context.broadcast("interactive.response.audio", {
              connId: p.connId,
              text: p.text,
              format: "text",
            }, { dropIfSlow: true });
          },
        },
      });

      registerActionLoop(connId, loop);

      const snapshot = mgr.start({ connId, sessionKey, agentId, config, inputs });
      context.logGateway.info(
        `interactive session started connId=${connId} agent=${agentId} inputs=${snapshot.enabledInputs.join(",")}`,
      );
      respond(true, snapshot);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.stop": async ({ client, respond, context }) => {
    try {
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const mgr = getInteractiveSessionManager();
      removeActionLoop(connId);
      mgr.stop(connId);
      context.logGateway.info(`interactive session stopped connId=${connId}`);
      respond(true, { stopped: true });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.enable": async ({ params, client, respond, context }) => {
    try {
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const inputs = parseInputs(params.inputs);
      if (!inputs) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "interactive.enable requires inputs: string[] (mic, camera, screen, ambient)"));
        return;
      }
      const mgr = getInteractiveSessionManager();
      ensureStateChangeBroadcast(mgr, context.broadcast);
      const snapshot = mgr.enableInputs(connId, inputs);
      if (!snapshot) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No active interactive session"));
        return;
      }
      respond(true, snapshot);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.disable": async ({ params, client, respond, context }) => {
    try {
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const inputs = parseInputs(params.inputs);
      if (!inputs) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "interactive.disable requires inputs: string[] (mic, camera, screen, ambient)"));
        return;
      }
      const mgr = getInteractiveSessionManager();
      ensureStateChangeBroadcast(mgr, context.broadcast);
      const snapshot = mgr.disableInputs(connId, inputs);
      if (!snapshot) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No active interactive session"));
        return;
      }
      respond(true, snapshot);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.status": async ({ client, respond }) => {
    try {
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const mgr = getInteractiveSessionManager();
      const snapshot = mgr.getSnapshot(connId);
      respond(true, {
        active: mgr.isActive(connId),
        session: snapshot ?? null,
        activeSessions: mgr.getActiveSessions().length,
        hasActionLoop: Boolean(getActionLoop(connId)),
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.configure": async ({ respond }) => {
    try {
      const cfg = loadConfig();
      const config = resolveInteractiveConfig(cfg);
      respond(true, {
        enabled: config.enabled,
        wakeWords: config.wakeWords,
        directedWindowMs: config.directedWindowMs,
        silenceResetMs: config.silenceResetMs,
        defaultInputs: config.defaultInputs,
        rateLimits: cfg.interactive?.rateLimits ?? {},
        classifier: cfg.interactive?.classifier ?? {},
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  // ── Data ingestion methods ──────────────────────────────────────────

  /** Ingest a base64-encoded audio chunk from the client microphone. */
  "interactive.audio.chunk": async ({ params, client, respond }) => {
    try {
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const loop = getActionLoop(connId);
      if (!loop) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No active interactive session"));
        return;
      }
      const data = typeof params.data === "string" ? params.data : "";
      if (!data) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "data (base64 audio) required"));
        return;
      }
      await loop.handleAudioChunk(data);
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  /** Signal end of audio stream segment. */
  "interactive.audio.end": async ({ client, respond }) => {
    try {
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const loop = getActionLoop(connId);
      if (!loop) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No active interactive session"));
        return;
      }
      await loop.handleAudioEnd();
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  /** Ingest a vision frame (camera or screen capture). */
  "interactive.frame": async ({ params, client, respond }) => {
    try {
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const loop = getActionLoop(connId);
      if (!loop) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No active interactive session"));
        return;
      }
      const source = typeof params.source === "string" ? params.source : "";
      if (source !== "camera" && source !== "screen") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "source must be 'camera' or 'screen'"));
        return;
      }
      const data = typeof params.data === "string" ? params.data : "";
      // mimeType is informational only; VisionFrame stores raw base64 data
      if (!data) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "data (base64 image) required"));
        return;
      }
      const frame: VisionFrame = {
        source: source as "camera" | "screen",
        data,
        timestamp: Date.now(),
      };
      loop.handleFrame(frame);
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  /** Push-to-talk activation from the client. */
  "interactive.ptt": async ({ client, respond }) => {
    try {
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const loop = getActionLoop(connId);
      if (!loop) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No active interactive session"));
        return;
      }
      loop.pushToTalk();
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
