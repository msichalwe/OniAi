import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskStore } from "./store.js";
import { buildTaskWorkPrompt, resolveTaskHeartbeatWork } from "./heartbeat.js";
import type { Task } from "./types.js";

function tmpStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oni-task-hb-"));
  return path.join(dir, "tasks.json");
}

describe("buildTaskWorkPrompt", () => {
  it("includes task goal and status", () => {
    const task: Task = {
      id: "task_abc",
      goal: "Deploy the app",
      status: "in_progress",
      priority: "high",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      workCycles: 2,
    };
    const prompt = buildTaskWorkPrompt(task);
    expect(prompt).toContain("task_abc");
    expect(prompt).toContain("Deploy the app");
    expect(prompt).toContain("in_progress");
    expect(prompt).toContain("high");
    expect(prompt).toContain("Work cycles used: 2");
  });

  it("includes plan steps with status markers", () => {
    const task: Task = {
      id: "task_plan",
      goal: "Build feature",
      status: "in_progress",
      priority: "medium",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      steps: [
        { id: "step_1", description: "Research", status: "done" },
        { id: "step_2", description: "Implement", status: "in_progress" },
        { id: "step_3", description: "Test", status: "pending" },
      ],
      currentStepIndex: 1,
    };
    const prompt = buildTaskWorkPrompt(task);
    expect(prompt).toContain("✅");
    expect(prompt).toContain("🔄");
    expect(prompt).toContain("⬜");
    expect(prompt).toContain("Current step: [step_2] Implement");
  });

  it("includes budget info", () => {
    const task: Task = {
      id: "task_budget",
      goal: "Budgeted work",
      status: "in_progress",
      priority: "medium",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      budget: { maxCycles: 10, maxTokens: 50000 },
    };
    const prompt = buildTaskWorkPrompt(task);
    expect(prompt).toContain("maxCycles=10");
    expect(prompt).toContain("maxTokens=50000");
  });

  it("includes recent progress entries", () => {
    const task: Task = {
      id: "task_prog",
      goal: "Track progress",
      status: "in_progress",
      priority: "medium",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      progress: [
        { timestampMs: Date.now() - 60000, message: "Started research" },
        { timestampMs: Date.now() - 30000, message: "Found docs" },
        { timestampMs: Date.now(), message: "Reading API spec" },
      ],
    };
    const prompt = buildTaskWorkPrompt(task);
    expect(prompt).toContain("Started research");
    expect(prompt).toContain("Found docs");
    expect(prompt).toContain("Reading API spec");
  });

  it("includes blocked reason", () => {
    const task: Task = {
      id: "task_blocked",
      goal: "Blocked task",
      status: "in_progress",
      priority: "medium",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      blockedReason: "Waiting for API key",
    };
    const prompt = buildTaskWorkPrompt(task);
    expect(prompt).toContain("Waiting for API key");
  });

  it("includes autonomous work instructions", () => {
    const task: Task = {
      id: "task_instr",
      goal: "Test instructions",
      status: "pending",
      priority: "medium",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
    const prompt = buildTaskWorkPrompt(task);
    expect(prompt).toContain("task(action=\"progress\"");
    expect(prompt).toContain("task(action=\"complete\"");
    expect(prompt).toContain("HEARTBEAT_OK");
  });
});

describe("resolveTaskHeartbeatWork", () => {
  let storePath: string;
  let cleanupDir: string;

  beforeEach(() => {
    cleanupDir = fs.mkdtempSync(path.join(os.tmpdir(), "oni-task-hb-resolve-"));
    storePath = path.join(cleanupDir, "agents", "default", "tasks.json");
    // Point resolveTaskStorePath to our temp dir by setting env var.
    vi.stubEnv("ONI_DATA_DIR", cleanupDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    try {
      fs.rmSync(cleanupDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("returns hasWork=false when no tasks exist", () => {
    const result = resolveTaskHeartbeatWork();
    expect(result.hasWork).toBe(false);
  });

  it("returns hasWork=true when pending tasks exist", () => {
    const store = new TaskStore({ storePath });
    store.create({ goal: "Do something", status: "pending", priority: "medium" });
    const result = resolveTaskHeartbeatWork();
    expect(result.hasWork).toBe(true);
    if (result.hasWork) {
      expect(result.task.goal).toBe("Do something");
      expect(result.prompt).toContain("Do something");
    }
  });

  it("auto-promotes pending tasks to in_progress", () => {
    const store = new TaskStore({ storePath });
    store.create({ goal: "Promote me", status: "pending", priority: "medium" });
    const result = resolveTaskHeartbeatWork();
    expect(result.hasWork).toBe(true);
    if (result.hasWork) {
      expect(result.task.status).toBe("in_progress");
    }
    // Verify persistence.
    const reloaded = store.list();
    expect(reloaded[0]!.status).toBe("in_progress");
  });

  it("records work cycle on the task", () => {
    const store = new TaskStore({ storePath });
    store.create({ goal: "Track cycles", status: "in_progress", priority: "medium" });
    resolveTaskHeartbeatWork();
    const task = store.list()[0]!;
    expect(task.workCycles).toBe(1);
    expect(task.lastWorkedAtMs).toBeGreaterThan(0);
  });

  it("blocks over-budget tasks and tries next", () => {
    const store = new TaskStore({ storePath });
    store.create({
      goal: "Over budget",
      status: "in_progress",
      priority: "critical",
      budget: { maxCycles: 2, cyclesUsed: 2 },
    });
    store.create({ goal: "Under budget", status: "pending", priority: "high" });
    const result = resolveTaskHeartbeatWork();
    expect(result.hasWork).toBe(true);
    if (result.hasWork) {
      expect(result.task.goal).toBe("Under budget");
    }
    // Verify the over-budget task was blocked.
    const overBudget = store.list({ status: "blocked" });
    expect(overBudget).toHaveLength(1);
    expect(overBudget[0]!.blockedReason).toContain("Budget limit");
  });

  it("returns hasWork=false when all tasks are over budget", () => {
    const store = new TaskStore({ storePath });
    store.create({
      goal: "Over budget 1",
      status: "in_progress",
      priority: "high",
      budget: { maxCycles: 1, cyclesUsed: 1 },
    });
    const result = resolveTaskHeartbeatWork();
    // The task gets blocked, and there's nothing else to work on.
    expect(result.hasWork).toBe(false);
  });

  it("skips done/failed/cancelled tasks", () => {
    const store = new TaskStore({ storePath });
    store.create({ goal: "Done", status: "done", priority: "critical" });
    store.create({ goal: "Failed", status: "failed", priority: "critical" });
    store.create({ goal: "Cancelled", status: "cancelled", priority: "critical" });
    const result = resolveTaskHeartbeatWork();
    expect(result.hasWork).toBe(false);
  });
});
