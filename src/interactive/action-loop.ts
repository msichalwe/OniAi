import type { OniAIConfig } from "../config/config.js";
import type { InteractiveConfig } from "../config/types.interactive.js";
import { AudioPipeline, resolveTranscriptionConfig, type TranscribeFunction } from "./audio-pipeline.js";
import {
  IntentClassifier,
  resolveClassifierConfig,
  type LlmClassifyFunction,
} from "./intent-classifier.js";
import { InteractiveRateLimiter, resolveRateLimits } from "./rate-limiter.js";
import { InteractiveSessionManager, resolveInteractiveConfig, type ResolvedInteractiveConfig } from "./session.js";
import type { InteractiveEvent, InteractiveInput } from "./types.js";
import { VisionPipeline, resolveVisionConfig, type VisionContext, type VisionFrame } from "./vision-pipeline.js";

// ── Types ───────────────────────────────────────────────────────────

export type ActionLoopCallbacks = {
  /** Broadcast an interactive event to the client. */
  broadcastEvent: (connId: string, event: InteractiveEvent) => void;
  /** Send a directed transcript + vision context to the agent. Returns the agent response text. */
  sendToAgent: (params: {
    connId: string;
    sessionKey: string;
    agentId: string;
    transcript: string;
    visionContext: VisionContext | null;
  }) => Promise<string | null>;
  /** Convert text to speech and stream back to client. */
  speakResponse?: (params: {
    connId: string;
    text: string;
  }) => Promise<void>;
  /** Transcribe audio buffer using gateway's configured STT provider. */
  transcribe: TranscribeFunction;
  /** Classify intent using gateway's configured LLM (optional, for hybrid/llm mode). */
  llmClassify?: LlmClassifyFunction;
};

// ── Action Loop ─────────────────────────────────────────────────────

/**
 * The core interactive mode orchestrator for a single connection.
 * Wires together: audio pipeline → intent classifier → vision → agent → TTS.
 */
export class InteractiveActionLoop {
  private connId: string;
  private sessionKey: string;
  private agentId: string;
  private config: ResolvedInteractiveConfig;
  private interactiveConfig: InteractiveConfig;
  private callbacks: ActionLoopCallbacks;

  private sessionManager: InteractiveSessionManager;
  private rateLimiter: InteractiveRateLimiter;
  private audioPipeline: AudioPipeline;
  private intentClassifier: IntentClassifier;
  private visionPipeline: VisionPipeline;

  private processing = false;
  private disposed = false;

  constructor(params: {
    connId: string;
    sessionKey: string;
    agentId: string;
    cfg: OniAIConfig;
    sessionManager: InteractiveSessionManager;
    callbacks: ActionLoopCallbacks;
  }) {
    this.connId = params.connId;
    this.sessionKey = params.sessionKey;
    this.agentId = params.agentId;
    this.callbacks = params.callbacks;
    this.sessionManager = params.sessionManager;

    const ic = params.cfg.interactive ?? {};
    this.interactiveConfig = ic;
    this.config = resolveInteractiveConfig(params.cfg);

    // Rate limiter
    this.rateLimiter = new InteractiveRateLimiter(resolveRateLimits(ic.rateLimits));

    // Audio pipeline
    const transcriptionConfig = resolveTranscriptionConfig(ic.transcription);
    this.audioPipeline = new AudioPipeline({
      config: transcriptionConfig,
      rateLimiter: this.rateLimiter,
      transcribe: params.callbacks.transcribe,
      callbacks: {
        onTranscript: (text, final) => this.handleTranscript(text, final),
        onError: (err) => {
          // Best-effort error handling — don't crash the loop
          console.error("[interactive] transcription error:", err);
        },
      },
    });

    // Intent classifier
    const classifierConfig = resolveClassifierConfig(ic.classifier, this.config.wakeWords);
    this.intentClassifier = new IntentClassifier({
      config: classifierConfig,
      rateLimiter: this.rateLimiter,
      llmClassify: params.callbacks.llmClassify,
    });

    // Vision pipeline
    const visionConfig = resolveVisionConfig(ic.vision);
    this.visionPipeline = new VisionPipeline({
      config: visionConfig,
      rateLimiter: this.rateLimiter,
    });
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Process incoming audio chunk from the client. */
  async handleAudioChunk(base64Data: string): Promise<void> {
    if (this.disposed) return;
    const session = this.sessionManager.get(this.connId);
    if (!session || !session.enabledInputs.has("mic")) return;
    await this.audioPipeline.ingestChunk(base64Data);
  }

  /** Signal end of audio stream from the client. */
  async handleAudioEnd(): Promise<void> {
    if (this.disposed) return;
    await this.audioPipeline.end();
  }

  /** Process incoming vision frame from the client. */
  handleFrame(frame: VisionFrame): void {
    if (this.disposed) return;
    const session = this.sessionManager.get(this.connId);
    if (!session) return;
    const source = frame.source;
    if (source === "camera" && !session.enabledInputs.has("camera")) return;
    if (source === "screen" && !session.enabledInputs.has("screen")) return;
    this.visionPipeline.ingestFrame(frame);
  }

  /** Handle push-to-talk activation from the client. */
  pushToTalk(): void {
    if (this.disposed) return;
    this.sessionManager.enterDirected(this.connId, "push_to_talk", this.config);
  }

  /** Clean up resources. */
  dispose(): void {
    this.disposed = true;
    this.audioPipeline.reset();
    this.visionPipeline.reset();
  }

  // ── Internal ────────────────────────────────────────────────────

  private handleTranscript(text: string, final: boolean): void {
    if (this.disposed) return;

    // Broadcast the raw transcript to the client
    this.callbacks.broadcastEvent(this.connId, {
      type: "interactive.transcript",
      text,
      final,
      directed: false, // Will be updated after classification
      source: "mic",
    });

    // Record activity on the session
    this.sessionManager.recordActivity(this.connId, this.config);

    // Only classify final transcripts
    if (final) {
      void this.classifyAndAct(text);
    }
  }

  private async classifyAndAct(transcript: string): Promise<void> {
    if (this.disposed || this.processing) return;

    const session = this.sessionManager.get(this.connId);
    if (!session) return;

    // If already in directed mode, treat everything as directed
    if (session.mode === "directed") {
      await this.executeDirected(transcript);
      return;
    }

    // Classify intent
    const classification = await this.intentClassifier.classify(transcript);

    // Broadcast classification result
    this.callbacks.broadcastEvent(this.connId, {
      type: "interactive.transcript",
      text: transcript,
      final: true,
      directed: classification.directed,
      source: "mic",
    });

    if (classification.directed) {
      // Enter directed mode
      this.sessionManager.enterDirected(
        this.connId,
        classification.reason === "none" ? "classifier" : classification.reason,
        this.config,
      );
      await this.executeDirected(transcript);
    }
  }

  private async executeDirected(transcript: string): Promise<void> {
    if (this.disposed) return;

    this.processing = true;
    this.sessionManager.enterResponding(this.connId);
    this.intentClassifier.recordInteraction();

    // Generate a run ID for this interaction
    const runId = `interactive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.callbacks.broadcastEvent(this.connId, {
      type: "interactive.response.start",
      runId,
    });

    try {
      // Gather vision context (only when directed — saves cost)
      const visionContext = this.visionPipeline.getContext();

      // Send to agent
      const response = await this.callbacks.sendToAgent({
        connId: this.connId,
        sessionKey: this.sessionKey,
        agentId: this.agentId,
        transcript,
        visionContext,
      });

      if (response && !this.disposed) {
        // Broadcast final response
        this.callbacks.broadcastEvent(this.connId, {
          type: "interactive.response.done",
          fullText: response,
          runId,
        });

        // TTS if configured
        const ttsAutoReply = this.interactiveConfig.tts?.autoReply !== false;
        if (ttsAutoReply && this.callbacks.speakResponse) {
          try {
            await this.callbacks.speakResponse({
              connId: this.connId,
              text: response,
            });
          } catch {
            // TTS failure is non-fatal
          }
        }
      }
    } catch (err) {
      console.error("[interactive] action loop error:", err);
    } finally {
      this.processing = false;
      if (!this.disposed) {
        // Transition back to listening
        this.sessionManager.enterListening(this.connId);
      }
    }
  }
}

// ── Action Loop Registry ────────────────────────────────────────────

const activeLoops = new Map<string, InteractiveActionLoop>();

export function getActionLoop(connId: string): InteractiveActionLoop | undefined {
  return activeLoops.get(connId);
}

export function registerActionLoop(connId: string, loop: InteractiveActionLoop): void {
  // Dispose existing loop for this connection if any
  const existing = activeLoops.get(connId);
  if (existing) {
    existing.dispose();
  }
  activeLoops.set(connId, loop);
}

export function removeActionLoop(connId: string): void {
  const loop = activeLoops.get(connId);
  if (loop) {
    loop.dispose();
    activeLoops.delete(connId);
  }
}

export function disposeAllActionLoops(): void {
  for (const loop of activeLoops.values()) {
    loop.dispose();
  }
  activeLoops.clear();
}
