import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskTool } from "./task-tool.js";
import type { AnyAgentTool } from "./common.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oni-task-tool-"));
}

describe("createTaskTool", () => {
  let cleanupDir: string;
  let tool: AnyAgentTool;

  beforeEach(() => {
    cleanupDir = tmpDir();
    vi.stubEnv("ONI_DATA_DIR", cleanupDir);
    tool = createTaskTool();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    try {
      fs.rmSync(cleanupDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function exec(args: Record<string, unknown>) {
    const result = await tool.execute!("call_1", args);
    const text =
      result.content && Array.isArray(result.content)
        ? (result.content[0] as { text: string }).text
        : "";
    return JSON.parse(text);
  }

  describe("basic properties", () => {
    it("has correct name and label", () => {
      expect(tool.name).toBe("task");
      expect(tool.label).toBe("Task Queue");
      expect(tool.ownerOnly).toBe(true);
    });
  });

  describe("create action", () => {
    it("creates a task with goal", async () => {
      const result = await exec({ action: "create", goal: "Build API" });
      expect(result.created).toBe(true);
      expect(result.task.goal).toBe("Build API");
      expect(result.task.status).toBe("pending");
      expect(result.task.priority).toBe("medium");
      expect(result.task.id).toMatch(/^task_/);
    });

    it("creates a task with priority and tags", async () => {
      const result = await exec({
        action: "create",
        goal: "Deploy",
        priority: "critical",
        tags: ["deploy", "prod"],
      });
      expect(result.task.priority).toBe("critical");
      expect(result.task.tags).toEqual(["deploy", "prod"]);
    });

    it("creates a task with steps", async () => {
      const result = await exec({
        action: "create",
        goal: "Multi-step",
        steps: [
          { description: "Research", tools: ["web_search"] },
          { description: "Implement", dependsOn: ["step_1"] },
        ],
      });
      expect(result.task.steps).toHaveLength(2);
      expect(result.task.steps[0].id).toBe("step_1");
      expect(result.task.steps[0].tools).toEqual(["web_search"]);
      expect(result.task.steps[1].dependsOn).toEqual(["step_1"]);
    });

    it("creates a task with budget", async () => {
      const result = await exec({
        action: "create",
        goal: "Budgeted work",
        budget: { maxCycles: 5, maxTokens: 100000 },
      });
      expect(result.task.budget.maxCycles).toBe(5);
      expect(result.task.budget.maxTokens).toBe(100000);
    });

    it("throws when goal is missing", async () => {
      await expect(exec({ action: "create" })).rejects.toThrow("goal required");
    });
  });

  describe("list action", () => {
    it("lists all tasks", async () => {
      await exec({ action: "create", goal: "Task 1" });
      await exec({ action: "create", goal: "Task 2" });
      const result = await exec({ action: "list" });
      expect(result.tasks).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("filters by status", async () => {
      await exec({ action: "create", goal: "Pending" });
      const createResult = await exec({ action: "create", goal: "WillBeDone" });
      await exec({ action: "complete", taskId: createResult.task.id, result: "Done" });
      const result = await exec({ action: "list", status: "pending" });
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].goal).toBe("Pending");
    });

    it("respects limit", async () => {
      for (let i = 0; i < 5; i++) {
        await exec({ action: "create", goal: `Task ${i}` });
      }
      const result = await exec({ action: "list", limit: 2 });
      expect(result.tasks).toHaveLength(2);
    });

    it("returns stats", async () => {
      await exec({ action: "create", goal: "P1" });
      await exec({ action: "create", goal: "P2" });
      const result = await exec({ action: "list" });
      expect(result.stats.pending).toBe(2);
    });
  });

  describe("get action", () => {
    it("gets a task by id", async () => {
      const created = await exec({ action: "create", goal: "Find me" });
      const result = await exec({ action: "get", taskId: created.task.id });
      expect(result.goal).toBe("Find me");
    });

    it("accepts id param for backward compat", async () => {
      const created = await exec({ action: "create", goal: "Find me" });
      const result = await exec({ action: "get", id: created.task.id });
      expect(result.goal).toBe("Find me");
    });

    it("throws for unknown id", async () => {
      await expect(exec({ action: "get", taskId: "nonexistent" })).rejects.toThrow("not found");
    });

    it("throws when taskId is missing", async () => {
      await expect(exec({ action: "get" })).rejects.toThrow("taskId required");
    });
  });

  describe("update action", () => {
    it("updates task status", async () => {
      const created = await exec({ action: "create", goal: "Update me" });
      const result = await exec({
        action: "update",
        taskId: created.task.id,
        patch: { status: "in_progress" },
      });
      expect(result.updated).toBe(true);
      expect(result.task.status).toBe("in_progress");
    });

    it("updates task priority and blocked reason", async () => {
      const created = await exec({ action: "create", goal: "Block me" });
      const result = await exec({
        action: "update",
        taskId: created.task.id,
        patch: { status: "blocked", priority: "high", blockedReason: "Need API key" },
      });
      expect(result.task.status).toBe("blocked");
      expect(result.task.priority).toBe("high");
      expect(result.task.blockedReason).toBe("Need API key");
    });

    it("throws when patch is missing", async () => {
      const created = await exec({ action: "create", goal: "No patch" });
      await expect(
        exec({ action: "update", taskId: created.task.id }),
      ).rejects.toThrow("patch required");
    });
  });

  describe("cancel action", () => {
    it("cancels a task", async () => {
      const created = await exec({ action: "create", goal: "Cancel me" });
      const result = await exec({ action: "cancel", taskId: created.task.id });
      expect(result.cancelled).toBe(true);
      expect(result.task.status).toBe("cancelled");
    });
  });

  describe("next action", () => {
    it("returns the next actionable task", async () => {
      await exec({ action: "create", goal: "Low", priority: "low" });
      await exec({ action: "create", goal: "High", priority: "high" });
      const result = await exec({ action: "next" });
      expect(result.hasNext).toBe(true);
      expect(result.task.goal).toBe("High");
    });

    it("returns hasNext=false when no tasks", async () => {
      const result = await exec({ action: "next" });
      expect(result.hasNext).toBe(false);
    });
  });

  describe("progress action", () => {
    it("adds progress entry", async () => {
      const created = await exec({ action: "create", goal: "Track me" });
      const result = await exec({
        action: "progress",
        taskId: created.task.id,
        message: "Did some work",
      });
      expect(result.logged).toBe(true);
      expect(result.task.progress).toHaveLength(1);
      expect(result.task.progress[0].message).toBe("Did some work");
    });

    it("throws when message is missing", async () => {
      const created = await exec({ action: "create", goal: "No msg" });
      await expect(
        exec({ action: "progress", taskId: created.task.id }),
      ).rejects.toThrow("message required");
    });
  });

  describe("complete action", () => {
    it("marks task as done with result", async () => {
      const created = await exec({ action: "create", goal: "Complete me" });
      const result = await exec({
        action: "complete",
        taskId: created.task.id,
        result: "All finished",
      });
      expect(result.completed).toBe(true);
      expect(result.task.status).toBe("done");
      expect(result.task.result).toBe("All finished");
    });
  });

  describe("fail action", () => {
    it("marks task as failed with error", async () => {
      const created = await exec({ action: "create", goal: "Fail me" });
      const result = await exec({
        action: "fail",
        taskId: created.task.id,
        error: "Something broke",
      });
      expect(result.failed).toBe(true);
      expect(result.task.status).toBe("failed");
      expect(result.task.error).toBe("Something broke");
    });

    it("throws when error is missing", async () => {
      const created = await exec({ action: "create", goal: "No error" });
      await expect(
        exec({ action: "fail", taskId: created.task.id }),
      ).rejects.toThrow("error required");
    });
  });

  describe("unknown action", () => {
    it("throws for unknown action", async () => {
      await expect(exec({ action: "bogus" })).rejects.toThrow("Unknown action");
    });
  });
});
