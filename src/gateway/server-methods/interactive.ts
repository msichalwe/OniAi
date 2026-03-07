import { loadConfig } from "../../config/io.js";
import type { OniAIConfig } from "../../config/config.js";
import {
  InteractiveActionLoop,
  getActionLoop,
  registerActionLoop,
  removeActionLoop,
} from "../../interactive/action-loop.js";
import {
  ServerCaptureLoop,
  registerCaptureLoop,
  removeCaptureLoop,
  getCaptureLoop,
} from "../../interactive/server-capture.js";
import { runPreflightChecks } from "../../interactive/preflight-check.js";
import {
  InteractiveSessionManager,
  resolveInteractiveConfig,
} from "../../interactive/session.js";
import type { TranscribeFunction } from "../../interactive/audio-pipeline.js";
import type { LlmClassifyFunction } from "../../interactive/intent-classifier.js";
import type { InteractiveEvent, InteractiveInput } from "../../interactive/types.js";
import type { VisionFrame } from "../../interactive/vision-pipeline.js";
import { transcribeOpenAiCompatibleAudio } from "../../media-understanding/providers/openai/audio.js";
import { resolveApiKeyForProvider } from "../../agents/model-auth.js";
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

// ── WAV header for raw PCM16 ─────────────────────────────────────────

function wrapPcm16AsWav(pcmBuffer: Buffer, sampleRate: number, channels = 1): Buffer {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

// ── Transcription (real) ─────────────────────────────────────────────

async function createTranscribeFunction(
  cfg: OniAIConfig,
): Promise<TranscribeFunction> {
  // Try to resolve an OpenAI-compatible API key for STT.
  // Supports openai, openai-codex, groq, or any OpenAI-compatible provider.
  const sttProviders = ["openai", "openai-codex", "groq"];
  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  for (const provider of sttProviders) {
    try {
      const auth = await resolveApiKeyForProvider({ provider, cfg });
      if (auth.apiKey) {
        apiKey = auth.apiKey;
        // Use custom base URL if configured
        const providerConfig = cfg?.models?.providers?.[provider];
        if (providerConfig && typeof providerConfig === "object" && "baseUrl" in providerConfig) {
          baseUrl = (providerConfig as { baseUrl?: string }).baseUrl;
        }
        break;
      }
    } catch {
      // Try next provider
    }
  }

  if (!apiKey) {
    console.warn("[interactive] No STT API key found — transcription disabled. Configure openai, groq, or similar.");
    return async () => null;
  }

  return async (params) => {
    try {
      // Wrap raw PCM16 buffer in WAV header for the Whisper API
      const wavBuffer = wrapPcm16AsWav(params.buffer, 24_000);
      const result = await transcribeOpenAiCompatibleAudio({
        buffer: wavBuffer,
        fileName: params.fileName || "interactive-audio.wav",
        mime: "audio/wav",
        apiKey: apiKey!,
        baseUrl,
        language: params.language || "en",
        timeoutMs: 30_000,
      });
      return { text: result.text };
    } catch (err) {
      console.error("[interactive] transcription error:", err);
      return null;
    }
  };
}

// ── LLM classify (real) ──────────────────────────────────────────────

async function createLlmClassifyFunction(
  cfg: OniAIConfig,
): Promise<LlmClassifyFunction | undefined> {
  // Try to resolve an API key for chat-based classification.
  const providers = ["openai", "openai-codex", "anthropic", "groq"];
  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  for (const provider of providers) {
    try {
      const auth = await resolveApiKeyForProvider({ provider, cfg });
      if (auth.apiKey) {
        apiKey = auth.apiKey;
        const providerConfig = cfg?.models?.providers?.[provider];
        if (providerConfig && typeof providerConfig === "object" && "baseUrl" in providerConfig) {
          baseUrl = (providerConfig as { baseUrl?: string }).baseUrl;
        }
        break;
      }
    } catch {
      // Try next provider
    }
  }

  if (!apiKey) {
    // Fall back to wake-word-only mode
    return undefined;
  }

  return async (params) => {
    try {
      const url = `${baseUrl || "https://api.openai.com/v1"}/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 20,
          temperature: 0,
          messages: [
            { role: "system", content: params.systemPrompt },
            { role: "user", content: params.userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
      const directed = text.includes("yes") || text.includes("directed") || text.includes("true");
      const confidence = directed ? 0.85 : 0.15;
      return { directed, confidence };
    } catch {
      return null;
    }
  };
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

      // ── Pre-flight permission & tool checks ──────────────────────
      // Run before starting captures to detect missing tools and
      // permission issues. Only enable inputs that pass.
      const requestedInputs = new Set(snapshot.enabledInputs);
      const preflight = await runPreflightChecks(requestedInputs);

      // Broadcast full preflight results to TUI
      context.broadcast("interactive.preflight", {
        connId,
        results: preflight.results,
        summary: preflight.summary,
      }, { dropIfSlow: true });

      // Build the set of inputs that actually passed preflight
      const passedInputs = new Set<string>();
      for (const r of preflight.results) {
        if (r.available && r.permission) {
          passedInputs.add(r.input);
        }
      }

      context.logGateway.info(
        `interactive preflight: requested=[${[...requestedInputs].join(",")}] passed=[${[...passedInputs].join(",")}]`,
      );

      // Start server-side capture only for inputs that passed preflight.
      const captureLoop = new ServerCaptureLoop({
        loop,
        enabledInputs: passedInputs,
        onStatus: (status) => {
          context.broadcast("interactive.capture.status", { connId, ...status }, { dropIfSlow: true });
        },
      });
      registerCaptureLoop(connId, captureLoop);
      void captureLoop.start();

      context.logGateway.info(
        `interactive session started connId=${connId} agent=${agentId} inputs=${snapshot.enabledInputs.join(",")}`,
      );
      respond(true, { ...snapshot, preflight: preflight.results });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "interactive.stop": async ({ client, respond, context }) => {
    try {
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const mgr = getInteractiveSessionManager();
      removeCaptureLoop(connId);
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

  /** Push-to-talk toggle from the client. Starts/stops server-side mic capture. */
  "interactive.ptt": async ({ client, respond, context }) => {
    try {
      const connId = requireConnId(client, respond);
      if (!connId) return;

      const loop = getActionLoop(connId);
      if (!loop) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No active interactive session"));
        return;
      }

      const capture = getCaptureLoop(connId);
      if (!capture) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No capture loop for this session"));
        return;
      }

      if (!capture.micAvailable) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Mic not available — install sox or ffmpeg"));
        return;
      }

      const nowRecording = capture.toggleMic();
      loop.pushToTalk();

      // Broadcast recording state change to TUI
      context.broadcast("interactive.ptt.state", {
        connId,
        recording: nowRecording,
      }, { dropIfSlow: true });

      respond(true, { recording: nowRecording });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
