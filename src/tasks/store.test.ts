import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskStore } from "./store.js";
import type { Task, TaskCreate } from "./types.js";

function tmpStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oni-task-store-"));
  return path.join(dir, "tasks.json");
}

describe("TaskStore", () => {
  let storePath: string;
  let store: TaskStore;

  beforeEach(() => {
    storePath = tmpStorePath();
    store = new TaskStore({ storePath });
  });

  afterEach(() => {
    try {
      fs.rmSync(path.dirname(storePath), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("create", () => {
    it("creates a task with generated id", () => {
      const task = store.create({ goal: "Test goal", status: "pending", priority: "medium" });
      expect(task.id).toMatch(/^task_/);
      expect(task.goal).toBe("Test goal");
      expect(task.status).toBe("pending");
      expect(task.priority).toBe("medium");
      expect(task.createdAtMs).toBeGreaterThan(0);
      expect(task.updatedAtMs).toBeGreaterThan(0);
      expect(task.workCycles).toBe(0);
    });

    it("creates a task with explicit id", () => {
      const task = store.create({ id: "custom_id", goal: "Custom", status: "pending", priority: "high" });
      expect(task.id).toBe("custom_id");
    });

    it("persists tasks to disk", () => {
      store.create({ goal: "Persist me", status: "pending", priority: "low" });
      const store2 = new TaskStore({ storePath });
      const tasks = store2.list();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.goal).toBe("Persist me");
    });
  });

  describe("list", () => {
    it("returns empty list when no tasks", () => {
      expect(store.list()).toEqual([]);
    });

    it("returns all tasks sorted by priority then age", () => {
      store.create({ goal: "Low", status: "pending", priority: "low" });
      store.create({ goal: "High", status: "pending", priority: "high" });
      store.create({ goal: "Critical", status: "pending", priority: "critical" });
      const tasks = store.list();
      expect(tasks.map((t) => t.priority)).toEqual(["critical", "high", "low"]);
    });

    it("filters by status", () => {
      store.create({ goal: "Pending", status: "pending", priority: "medium" });
      store.create({ goal: "Done", status: "done", priority: "medium" });
      const pending = store.list({ status: "pending" });
      expect(pending).toHaveLength(1);
      expect(pending[0]!.goal).toBe("Pending");
    });

    it("filters by multiple statuses", () => {
      store.create({ goal: "Pending", status: "pending", priority: "medium" });
      store.create({ goal: "InProgress", status: "in_progress", priority: "medium" });
      store.create({ goal: "Done", status: "done", priority: "medium" });
      const active = store.list({ status: ["pending", "in_progress"] });
      expect(active).toHaveLength(2);
    });

    it("respects limit", () => {
      for (let i = 0; i < 10; i++) {
        store.create({ goal: `Task ${i}`, status: "pending", priority: "medium" });
      }
      const tasks = store.list({ limit: 3 });
      expect(tasks).toHaveLength(3);
    });

    it("filters by tags", () => {
      store.create({ goal: "Tagged", status: "pending", priority: "medium", tags: ["deploy"] });
      store.create({ goal: "Untagged", status: "pending", priority: "medium" });
      const tagged = store.list({ tags: ["deploy"] });
      expect(tagged).toHaveLength(1);
      expect(tagged[0]!.goal).toBe("Tagged");
    });
  });

  describe("get", () => {
    it("returns task by id", () => {
      const created = store.create({ goal: "Find me", status: "pending", priority: "medium" });
      const found = store.get(created.id);
      expect(found).toBeDefined();
      expect(found!.goal).toBe("Find me");
    });

    it("returns undefined for unknown id", () => {
      expect(store.get("nonexistent")).toBeUndefined();
    });
  });

  describe("update", () => {
    it("updates task fields", () => {
      const task = store.create({ goal: "Update me", status: "pending", priority: "medium" });
      const updated = store.update(task.id, { status: "in_progress", priority: "high" });
      expect(updated).toBeDefined();
      expect(updated!.status).toBe("in_progress");
      expect(updated!.priority).toBe("high");
      expect(updated!.updatedAtMs).toBeGreaterThanOrEqual(task.updatedAtMs);
    });

    it("does not allow mutating terminal tasks without status change", () => {
      const task = store.create({ goal: "Done task", status: "done", priority: "medium" });
      const updated = store.update(task.id, { priority: "high" });
      expect(updated).toBeUndefined();
    });

    it("allows re-opening terminal tasks with explicit status", () => {
      const task = store.create({ goal: "Reopen me", status: "done", priority: "medium" });
      const updated = store.update(task.id, { status: "pending" });
      expect(updated).toBeDefined();
      expect(updated!.status).toBe("pending");
    });

    it("returns undefined for unknown id", () => {
      expect(store.update("nonexistent", { status: "done" })).toBeUndefined();
    });
  });

  describe("addProgress", () => {
    it("appends progress entries", () => {
      const task = store.create({ goal: "Track me", status: "in_progress", priority: "medium" });
      store.addProgress(task.id, "Started work");
      store.addProgress(task.id, "Midway done");
      const updated = store.get(task.id);
      expect(updated!.progress).toHaveLength(2);
      expect(updated!.progress![0]!.message).toBe("Started work");
      expect(updated!.progress![1]!.message).toBe("Midway done");
    });

    it("caps progress entries at 50", () => {
      const task = store.create({ goal: "Spam progress", status: "in_progress", priority: "medium" });
      for (let i = 0; i < 60; i++) {
        store.addProgress(task.id, `Entry ${i}`);
      }
      const updated = store.get(task.id);
      expect(updated!.progress).toHaveLength(50);
      expect(updated!.progress![0]!.message).toBe("Entry 10");
    });
  });

  describe("complete", () => {
    it("marks task as done", () => {
      const task = store.create({ goal: "Finish me", status: "in_progress", priority: "medium" });
      const completed = store.complete(task.id, "All done!");
      expect(completed!.status).toBe("done");
      expect(completed!.result).toBe("All done!");
    });
  });

  describe("fail", () => {
    it("marks task as failed", () => {
      const task = store.create({ goal: "Fail me", status: "in_progress", priority: "medium" });
      const failed = store.fail(task.id, "Something went wrong");
      expect(failed!.status).toBe("failed");
      expect(failed!.error).toBe("Something went wrong");
    });
  });

  describe("cancel", () => {
    it("marks task as cancelled", () => {
      const task = store.create({ goal: "Cancel me", status: "pending", priority: "medium" });
      const cancelled = store.cancel(task.id);
      expect(cancelled!.status).toBe("cancelled");
    });
  });

  describe("next", () => {
    it("returns highest priority actionable task", () => {
      store.create({ goal: "Low priority", status: "pending", priority: "low" });
      store.create({ goal: "High priority", status: "pending", priority: "high" });
      store.create({ goal: "Done", status: "done", priority: "critical" });
      const next = store.next();
      expect(next).toBeDefined();
      expect(next!.goal).toBe("High priority");
    });

    it("returns undefined when no actionable tasks", () => {
      store.create({ goal: "Done", status: "done", priority: "high" });
      store.create({ goal: "Failed", status: "failed", priority: "high" });
      expect(store.next()).toBeUndefined();
    });

    it("includes in_progress tasks", () => {
      store.create({ goal: "Working", status: "in_progress", priority: "medium" });
      const next = store.next();
      expect(next).toBeDefined();
      expect(next!.goal).toBe("Working");
    });
  });

  describe("recordWorkCycle", () => {
    it("increments work cycle count", () => {
      const task = store.create({ goal: "Work on me", status: "in_progress", priority: "medium" });
      store.recordWorkCycle(task.id);
      store.recordWorkCycle(task.id);
      const updated = store.get(task.id);
      expect(updated!.workCycles).toBe(2);
      expect(updated!.lastWorkedAtMs).toBeGreaterThan(0);
    });

    it("increments budget cyclesUsed", () => {
      const task = store.create({
        goal: "Budgeted",
        status: "in_progress",
        priority: "medium",
        budget: { maxCycles: 5 },
      });
      store.recordWorkCycle(task.id);
      const updated = store.get(task.id);
      expect(updated!.budget!.cyclesUsed).toBe(1);
    });
  });

  describe("isOverBudget", () => {
    it("returns false when no budget", () => {
      const task = store.create({ goal: "No budget", status: "pending", priority: "medium" });
      expect(store.isOverBudget(task)).toBe(false);
    });

    it("returns true when cycles exceeded", () => {
      const task: Task = {
        id: "test",
        goal: "test",
        status: "in_progress",
        priority: "medium",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        budget: { maxCycles: 3, cyclesUsed: 3 },
      };
      expect(store.isOverBudget(task)).toBe(true);
    });

    it("returns false when under budget", () => {
      const task: Task = {
        id: "test",
        goal: "test",
        status: "in_progress",
        priority: "medium",
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        budget: { maxCycles: 5, cyclesUsed: 2 },
      };
      expect(store.isOverBudget(task)).toBe(false);
    });
  });

  describe("prune", () => {
    it("removes old terminal tasks", () => {
      const task = store.create({ goal: "Old done", status: "done", priority: "medium" });
      // Backdate the task.
      store.update(task.id, { status: "done" });
      const store2 = new TaskStore({ storePath });
      const raw = JSON.parse(fs.readFileSync(storePath, "utf-8"));
      raw.tasks[0].updatedAtMs = Date.now() - 100_000;
      fs.writeFileSync(storePath, JSON.stringify(raw));
      const removed = store2.prune(50_000);
      expect(removed).toBe(1);
      expect(store2.list()).toHaveLength(0);
    });

    it("does not remove active tasks", () => {
      store.create({ goal: "Active", status: "in_progress", priority: "medium" });
      const removed = store.prune(0);
      expect(removed).toBe(0);
      expect(store.list()).toHaveLength(1);
    });
  });

  describe("stats", () => {
    it("counts tasks by status", () => {
      store.create({ goal: "A", status: "pending", priority: "medium" });
      store.create({ goal: "B", status: "pending", priority: "medium" });
      store.create({ goal: "C", status: "in_progress", priority: "medium" });
      store.create({ goal: "D", status: "done", priority: "medium" });
      const stats = store.stats();
      expect(stats.pending).toBe(2);
      expect(stats.in_progress).toBe(1);
      expect(stats.done).toBe(1);
    });
  });

  describe("steps", () => {
    it("creates tasks with structured steps", () => {
      const task = store.create({
        goal: "Multi-step task",
        status: "pending",
        priority: "high",
        steps: [
          { id: "step_1", description: "Research", status: "pending" },
          { id: "step_2", description: "Implement", status: "pending", dependsOn: ["step_1"] },
          { id: "step_3", description: "Test", status: "pending", dependsOn: ["step_2"] },
        ],
      });
      expect(task.steps).toHaveLength(3);
      expect(task.steps![0]!.id).toBe("step_1");
      expect(task.steps![1]!.dependsOn).toEqual(["step_1"]);
    });

    it("updates step status via task update", () => {
      const task = store.create({
        goal: "Step updates",
        status: "in_progress",
        priority: "medium",
        steps: [
          { id: "step_1", description: "Do thing", status: "pending" },
        ],
      });
      const updated = store.update(task.id, {
        steps: [{ id: "step_1", description: "Do thing", status: "done" }],
        currentStepIndex: 1,
      });
      expect(updated!.steps![0]!.status).toBe("done");
      expect(updated!.currentStepIndex).toBe(1);
    });
  });
});
