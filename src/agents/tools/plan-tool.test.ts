import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlanTool } from "./plan-tool.js";
import type { AnyAgentTool } from "./common.js";

describe("createPlanTool", () => {
  let workspaceDir: string;
  let tool: AnyAgentTool;

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "oni-plan-tool-"));
    tool = createPlanTool({ workspaceDir });
  });

  afterEach(() => {
    try {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
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

  describe("create", () => {
    it("creates a plan with goal and steps", async () => {
      const result = await exec({
        action: "create",
        goal: "Build API",
        steps: [
          { description: "Design schema" },
          { description: "Implement endpoints" },
          { description: "Write tests" },
        ],
      });
      expect(result.created).toBe(true);
      expect(result.plan.goal).toBe("Build API");
      expect(result.plan.steps).toHaveLength(3);
      expect(result.plan.steps[0].id).toBe("step_1");
      expect(result.plan.steps[0].status).toBe("pending");
      expect(result.summary).toContain("Build API");
    });

    it("throws when steps are missing", async () => {
      await expect(exec({ action: "create", goal: "No steps" })).rejects.toThrow("At least one step");
    });

    it("throws when goal is missing", async () => {
      await expect(exec({ action: "create", steps: [{ description: "s" }] })).rejects.toThrow("goal required");
    });
  });

  describe("get", () => {
    it("returns the plan", async () => {
      await exec({ action: "create", goal: "Test", steps: [{ description: "s1" }] });
      const result = await exec({ action: "get" });
      expect(result.exists).toBe(true);
      expect(result.plan.goal).toBe("Test");
    });

    it("returns exists=false when no plan", async () => {
      const result = await exec({ action: "get" });
      expect(result.exists).toBe(false);
    });
  });

  describe("update_step", () => {
    it("updates step status by stepId", async () => {
      await exec({ action: "create", goal: "Test", steps: [{ description: "s1" }] });
      const result = await exec({ action: "update_step", stepId: "step_1", status: "done", result: "Completed" });
      expect(result.updated).toBe(true);
      expect(result.step.status).toBe("done");
      expect(result.step.result).toBe("Completed");
    });

    it("updates step status by stepIndex", async () => {
      await exec({ action: "create", goal: "Test", steps: [{ description: "s1" }, { description: "s2" }] });
      const result = await exec({ action: "update_step", stepIndex: 1, status: "in_progress" });
      expect(result.step.status).toBe("in_progress");
      expect(result.step.description).toBe("s2");
    });

    it("throws when step not found", async () => {
      await exec({ action: "create", goal: "Test", steps: [{ description: "s1" }] });
      await expect(exec({ action: "update_step", stepId: "nonexistent", status: "done" })).rejects.toThrow("not found");
    });
  });

  describe("add_step", () => {
    it("adds a step at the end", async () => {
      await exec({ action: "create", goal: "Test", steps: [{ description: "s1" }] });
      const result = await exec({ action: "add_step", description: "s2" });
      expect(result.added).toBe(true);
      expect(result.step.description).toBe("s2");
      const plan = await exec({ action: "get" });
      expect(plan.plan.steps).toHaveLength(2);
    });

    it("inserts a step after a specific step", async () => {
      await exec({ action: "create", goal: "Test", steps: [{ description: "s1" }, { description: "s3" }] });
      await exec({ action: "add_step", description: "s2", afterStepId: "step_1" });
      const plan = await exec({ action: "get" });
      expect(plan.plan.steps[1].description).toBe("s2");
      expect(plan.plan.steps[2].description).toBe("s3");
    });
  });

  describe("remove_step", () => {
    it("removes a step by stepId", async () => {
      await exec({ action: "create", goal: "Test", steps: [{ description: "s1" }, { description: "s2" }] });
      const result = await exec({ action: "remove_step", stepId: "step_1" });
      expect(result.removed).toBe(true);
      const plan = await exec({ action: "get" });
      expect(plan.plan.steps).toHaveLength(1);
      expect(plan.plan.steps[0].description).toBe("s2");
    });
  });

  describe("summary", () => {
    it("returns formatted summary", async () => {
      await exec({ action: "create", goal: "Build it", steps: [{ description: "s1" }, { description: "s2" }] });
      await exec({ action: "update_step", stepId: "step_1", status: "done", result: "Done!" });
      const result = await exec({ action: "summary" });
      expect(result.exists).toBe(true);
      expect(result.summary).toContain("Build it");
      expect(result.summary).toContain("1/2 done");
      expect(result.summary).toContain("✅");
      expect(result.summary).toContain("⬜");
    });

    it("returns exists=false when no plan", async () => {
      const result = await exec({ action: "summary" });
      expect(result.exists).toBe(false);
    });
  });

  describe("clear", () => {
    it("clears the plan", async () => {
      await exec({ action: "create", goal: "Test", steps: [{ description: "s1" }] });
      const result = await exec({ action: "clear" });
      expect(result.cleared).toBe(true);
      const plan = await exec({ action: "get" });
      expect(plan.exists).toBe(false);
    });
  });

  describe("persistence", () => {
    it("plan survives re-instantiation (simulates compaction)", async () => {
      await exec({ action: "create", goal: "Survive", steps: [{ description: "s1" }] });
      await exec({ action: "update_step", stepId: "step_1", status: "in_progress" });
      // Create new tool instance (simulates context compaction)
      const tool2 = createPlanTool({ workspaceDir });
      const result = await tool2.execute!("call_2", { action: "summary" });
      const text = (result.content as { text: string }[])[0]!.text;
      const parsed = JSON.parse(text);
      expect(parsed.exists).toBe(true);
      expect(parsed.summary).toContain("Survive");
      expect(parsed.summary).toContain("🔄");
    });
  });
});
