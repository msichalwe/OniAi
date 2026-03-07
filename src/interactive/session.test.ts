import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { InteractiveSessionManager, resolveInteractiveConfig, type ResolvedInteractiveConfig } from "./session.js";
import type { InteractiveStateSnapshot } from "./types.js";

function makeConfig(overrides: Partial<ResolvedInteractiveConfig> = {}): ResolvedInteractiveConfig {
  return {
    enabled: true,
    wakeWords: ["oni", "hey oni"],
    directedWindowMs: 15_000,
    silenceResetMs: 5_000,
    defaultInputs: ["mic"],
    ...overrides,
  };
}

describe("resolveInteractiveConfig", () => {
  it("returns defaults when no config provided", () => {
    const resolved = resolveInteractiveConfig(undefined);
    expect(resolved.enabled).toBe(true);
    expect(resolved.wakeWords).toEqual(["oni", "hey oni"]);
    expect(resolved.directedWindowMs).toBe(15_000);
    expect(resolved.silenceResetMs).toBe(5_000);
    expect(resolved.defaultInputs).toEqual(["mic"]);
  });

  it("respects custom config values", () => {
    const resolved = resolveInteractiveConfig({
      interactive: {
        enabled: false,
        wakeWords: ["pi"],
        directedWindowSec: 30,
        silenceResetSec: 10,
        defaults: { inputs: ["mic", "camera"] },
      },
    } as any);
    expect(resolved.enabled).toBe(false);
    expect(resolved.wakeWords).toEqual(["pi"]);
    expect(resolved.directedWindowMs).toBe(30_000);
    expect(resolved.silenceResetMs).toBe(10_000);
    expect(resolved.defaultInputs).toEqual(["mic", "camera"]);
  });
});

describe("InteractiveSessionManager", () => {
  let mgr: InteractiveSessionManager;
  const config = makeConfig();

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new InteractiveSessionManager();
  });

  afterEach(() => {
    mgr.dispose();
    vi.useRealTimers();
  });

  it("starts a session in listening mode with default inputs", () => {
    const snap = mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    expect(snap.mode).toBe("listening");
    expect(snap.enabledInputs).toEqual(["mic"]);
    expect(snap.connId).toBe("c1");
    expect(snap.sessionKey).toBe("sk1");
    expect(snap.agentId).toBe("a1");
    expect(mgr.isActive("c1")).toBe(true);
  });

  it("starts with custom inputs", () => {
    const snap = mgr.start({
      connId: "c1",
      sessionKey: "sk1",
      agentId: "a1",
      config,
      inputs: ["mic", "camera", "screen"],
    });
    expect(snap.enabledInputs).toEqual(expect.arrayContaining(["mic", "camera", "screen"]));
  });

  it("stops a session and broadcasts idle", () => {
    const changes: InteractiveStateSnapshot[] = [];
    mgr.onStateChange((_connId, state) => changes.push(state));
    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    mgr.stop("c1");
    expect(mgr.isActive("c1")).toBe(false);
    expect(mgr.get("c1")).toBeUndefined();
    const last = changes[changes.length - 1];
    expect(last.mode).toBe("idle");
  });

  it("enables and disables inputs", () => {
    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    const after = mgr.enableInputs("c1", ["camera", "screen"]);
    expect(after?.enabledInputs).toEqual(expect.arrayContaining(["mic", "camera", "screen"]));

    const after2 = mgr.disableInputs("c1", ["camera"]);
    expect(after2?.enabledInputs).toEqual(expect.arrayContaining(["mic", "screen"]));
    expect(after2?.enabledInputs).not.toContain("camera");
  });

  it("transitions to directed mode with a timer", () => {
    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    const snap = mgr.enterDirected("c1", "wake_word", config);
    expect(snap?.mode).toBe("directed");
    expect(snap?.directedReason).toBe("wake_word");
    expect(snap?.directedUntil).toBeGreaterThan(Date.now());
  });

  it("auto-expires directed mode after window", () => {
    const changes: InteractiveStateSnapshot[] = [];
    mgr.onStateChange((_connId, state) => changes.push(state));
    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    mgr.enterDirected("c1", "wake_word", config);

    vi.advanceTimersByTime(15_001);
    const last = changes[changes.length - 1];
    expect(last.mode).toBe("listening");
  });

  it("recordActivity extends directed window", () => {
    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    mgr.enterDirected("c1", "wake_word", config);

    // Advance 10s, record activity (extends directed timer to 25s, silence timer to 15s)
    vi.advanceTimersByTime(10_000);
    mgr.recordActivity("c1", config);

    // At 14s (4s after activity) — still within silence window, still directed
    vi.advanceTimersByTime(4_000);
    expect(mgr.get("c1")?.mode).toBe("directed");

    // Record activity again at 14s — resets silence to 19s
    mgr.recordActivity("c1", config);

    // At 18s — still directed (silence resets to 23s, directed timer to 29s)
    vi.advanceTimersByTime(4_000);
    expect(mgr.get("c1")?.mode).toBe("directed");

    // Now let silence expire: advance 6s past last activity (18s + 6s = 24s, silence was 5s from 18s = 23s)
    vi.advanceTimersByTime(6_000);
    expect(mgr.get("c1")?.mode).toBe("listening");
  });

  it("silence timer resets to listening", () => {
    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    mgr.enterDirected("c1", "wake_word", config);
    mgr.recordActivity("c1", config);

    // Silence for 5s should transition back
    vi.advanceTimersByTime(5_001);
    const state = mgr.get("c1");
    expect(state?.mode).toBe("listening");
  });

  it("transitions through responding and processing", () => {
    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    mgr.enterDirected("c1", "wake_word", config);

    const resp = mgr.enterResponding("c1");
    expect(resp?.mode).toBe("responding");

    const proc = mgr.enterProcessing("c1");
    expect(proc?.mode).toBe("processing");

    const listen = mgr.enterListening("c1");
    expect(listen?.mode).toBe("listening");
    expect(listen?.directedUntil).toBeNull();
  });

  it("getActiveSessions returns only active sessions", () => {
    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    mgr.start({ connId: "c2", sessionKey: "sk2", agentId: "a2", config });
    const active = mgr.getActiveSessions();
    expect(active).toHaveLength(2);
    expect(active.map((s) => s.connId).sort()).toEqual(["c1", "c2"]);
  });

  it("stop on non-existent session is a no-op", () => {
    mgr.stop("nonexistent"); // should not throw
    expect(mgr.get("nonexistent")).toBeUndefined();
  });

  it("enable/disable on non-existent session returns undefined", () => {
    expect(mgr.enableInputs("nope", ["mic"])).toBeUndefined();
    expect(mgr.disableInputs("nope", ["mic"])).toBeUndefined();
  });

  it("enterDirected on idle/non-existent returns undefined", () => {
    expect(mgr.enterDirected("nope", "wake_word", config)).toBeUndefined();
  });

  it("broadcasts state changes", () => {
    const changes: Array<{ connId: string; snapshot: InteractiveStateSnapshot }> = [];
    mgr.onStateChange((connId, snapshot) => changes.push({ connId, snapshot }));

    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    mgr.enterDirected("c1", "push_to_talk", config);
    mgr.enterResponding("c1");
    mgr.enterListening("c1");
    mgr.stop("c1");

    expect(changes).toHaveLength(5);
    expect(changes.map((c) => c.snapshot.mode)).toEqual([
      "listening",
      "directed",
      "responding",
      "listening",
      "idle",
    ]);
  });

  it("starting a new session on same connId cleans up old one", () => {
    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    mgr.enterDirected("c1", "wake_word", config);

    // Start a new session on same connId
    const snap = mgr.start({ connId: "c1", sessionKey: "sk2", agentId: "a2", config });
    expect(snap.mode).toBe("listening");
    expect(snap.sessionKey).toBe("sk2");
  });

  it("dispose clears everything", () => {
    mgr.start({ connId: "c1", sessionKey: "sk1", agentId: "a1", config });
    mgr.start({ connId: "c2", sessionKey: "sk2", agentId: "a2", config });
    mgr.dispose();
    expect(mgr.getActiveSessions()).toHaveLength(0);
  });
});
