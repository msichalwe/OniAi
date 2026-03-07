import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { InteractiveActionLoop, getActionLoop, registerActionLoop, removeActionLoop, disposeAllActionLoops } from "./action-loop.js";
import { InteractiveSessionManager, resolveInteractiveConfig } from "./session.js";
import type { OniAIConfig } from "../config/config.js";
import type { InteractiveEvent } from "./types.js";

function makeCfg(overrides: Record<string, unknown> = {}): OniAIConfig {
  return {
    interactive: {
      enabled: true,
      wakeWords: ["oni", "hey oni"],
      directedWindowSec: 15,
      silenceResetSec: 5,
      classifier: { mode: "hybrid", confidenceThreshold: 0.7 },
      transcription: { language: "en", chunkDurationSec: 1 },
      vision: { screenIntervalMs: 5000, cameraIntervalMs: 2000 },
      rateLimits: { transcriptionPerMin: 8, visionPerMin: 6, classifierPerMin: 10 },
      tts: { autoReply: true },
      defaults: { inputs: ["mic"] },
      ...overrides,
    },
  } as OniAIConfig;
}

describe("InteractiveActionLoop", () => {
  let sessionManager: InteractiveSessionManager;
  const cfg = makeCfg();
  const config = resolveInteractiveConfig(cfg);

  beforeEach(() => {
    vi.useFakeTimers();
    sessionManager = new InteractiveSessionManager();
    sessionManager.start({
      connId: "c1",
      sessionKey: "sk1",
      agentId: "a1",
      config,
      inputs: ["mic", "camera"],
    });
  });

  afterEach(() => {
    sessionManager.dispose();
    disposeAllActionLoops();
    vi.useRealTimers();
  });

  it("processes audio chunk and transcribes", async () => {
    const events: InteractiveEvent[] = [];
    const transcribe = vi.fn().mockResolvedValue({ text: "Hey Oni, hello" });
    const sendToAgent = vi.fn().mockResolvedValue("Hi there!");

    const loop = new InteractiveActionLoop({
      connId: "c1",
      sessionKey: "sk1",
      agentId: "a1",
      cfg,
      sessionManager,
      callbacks: {
        broadcastEvent: (_connId, event) => events.push(event),
        sendToAgent,
        transcribe,
      },
    });

    // Send enough audio to trigger transcription (1s at 24kHz 16-bit = 48000 bytes)
    const fullChunk = Buffer.alloc(48_000).toString("base64");
    await loop.handleAudioChunk(fullChunk);

    expect(transcribe).toHaveBeenCalledOnce();
    // Should have transcript events and response events (wake word "oni" detected)
    const transcriptEvents = events.filter((e) => e.type === "interactive.transcript");
    expect(transcriptEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("ignores audio when mic is not enabled", async () => {
    // Start session without mic
    sessionManager.stop("c1");
    sessionManager.start({
      connId: "c1",
      sessionKey: "sk1",
      agentId: "a1",
      config,
      inputs: ["camera"],
    });

    const transcribe = vi.fn().mockResolvedValue({ text: "test" });
    const loop = new InteractiveActionLoop({
      connId: "c1",
      sessionKey: "sk1",
      agentId: "a1",
      cfg,
      sessionManager,
      callbacks: {
        broadcastEvent: () => {},
        sendToAgent: vi.fn().mockResolvedValue(null),
        transcribe,
      },
    });

    const fullChunk = Buffer.alloc(48_000).toString("base64");
    await loop.handleAudioChunk(fullChunk);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("handles push-to-talk", () => {
    const loop = new InteractiveActionLoop({
      connId: "c1",
      sessionKey: "sk1",
      agentId: "a1",
      cfg,
      sessionManager,
      callbacks: {
        broadcastEvent: () => {},
        sendToAgent: vi.fn().mockResolvedValue(null),
        transcribe: vi.fn().mockResolvedValue(null),
      },
    });

    loop.pushToTalk();
    const state = sessionManager.get("c1");
    expect(state?.mode).toBe("directed");
    expect(state?.directedReason).toBe("push_to_talk");
  });

  it("ignores frames when camera not enabled", () => {
    sessionManager.stop("c1");
    sessionManager.start({
      connId: "c1",
      sessionKey: "sk1",
      agentId: "a1",
      config,
      inputs: ["mic"],
    });

    const loop = new InteractiveActionLoop({
      connId: "c1",
      sessionKey: "sk1",
      agentId: "a1",
      cfg,
      sessionManager,
      callbacks: {
        broadcastEvent: () => {},
        sendToAgent: vi.fn().mockResolvedValue(null),
        transcribe: vi.fn().mockResolvedValue(null),
      },
    });

    loop.handleFrame({
      source: "camera",
      data: "base64data",
      timestamp: Date.now(),
    });
    // No crash, frame ignored silently
  });

  it("dispose prevents further processing", async () => {
    const transcribe = vi.fn().mockResolvedValue({ text: "test" });
    const loop = new InteractiveActionLoop({
      connId: "c1",
      sessionKey: "sk1",
      agentId: "a1",
      cfg,
      sessionManager,
      callbacks: {
        broadcastEvent: () => {},
        sendToAgent: vi.fn().mockResolvedValue(null),
        transcribe,
      },
    });

    loop.dispose();
    const fullChunk = Buffer.alloc(48_000).toString("base64");
    await loop.handleAudioChunk(fullChunk);
    expect(transcribe).not.toHaveBeenCalled();
  });
});

describe("Action Loop Registry", () => {
  afterEach(() => {
    disposeAllActionLoops();
  });

  it("register and retrieve a loop", () => {
    const loop = { dispose: vi.fn() } as unknown as InteractiveActionLoop;
    registerActionLoop("c1", loop);
    expect(getActionLoop("c1")).toBe(loop);
  });

  it("remove disposes and deletes", () => {
    const dispose = vi.fn();
    const loop = { dispose } as unknown as InteractiveActionLoop;
    registerActionLoop("c1", loop);
    removeActionLoop("c1");
    expect(dispose).toHaveBeenCalledOnce();
    expect(getActionLoop("c1")).toBeUndefined();
  });

  it("disposeAll clears everything", () => {
    const d1 = vi.fn();
    const d2 = vi.fn();
    registerActionLoop("c1", { dispose: d1 } as unknown as InteractiveActionLoop);
    registerActionLoop("c2", { dispose: d2 } as unknown as InteractiveActionLoop);
    disposeAllActionLoops();
    expect(d1).toHaveBeenCalledOnce();
    expect(d2).toHaveBeenCalledOnce();
    expect(getActionLoop("c1")).toBeUndefined();
  });

  it("register replaces and disposes old loop", () => {
    const d1 = vi.fn();
    const loop1 = { dispose: d1 } as unknown as InteractiveActionLoop;
    const loop2 = { dispose: vi.fn() } as unknown as InteractiveActionLoop;
    registerActionLoop("c1", loop1);
    registerActionLoop("c1", loop2);
    expect(d1).toHaveBeenCalledOnce();
    expect(getActionLoop("c1")).toBe(loop2);
  });
});
