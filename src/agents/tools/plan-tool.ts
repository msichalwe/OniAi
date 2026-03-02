import fs from "node:fs";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { stringEnum, optionalStringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam, readNumberParam } from "./common.js";

const PLAN_ACTIONS = ["create", "get", "update_step", "add_step", "remove_step", "summary", "clear"] as const;
type PlanAction = (typeof PLAN_ACTIONS)[number];

const STEP_STATUSES = ["pending", "in_progress", "done", "failed", "skipped"] as const;
type StepStatus = (typeof STEP_STATUSES)[number];

export type PlanStep = {
  id: string;
  description: string;
  status: StepStatus;
  result?: string;
  error?: string;
  notes?: string;
};

export type Plan = {
  goal: string;
  steps: PlanStep[];
  createdAtMs: number;
  updatedAtMs: number;
};

const PlanToolSchema = Type.Object({
  action: stringEnum(PLAN_ACTIONS),
  goal: Type.Optional(Type.String()),
  steps: Type.Optional(Type.Array(Type.Object({}, { additionalProperties: true }))),
  stepId: Type.Optional(Type.String()),
  stepIndex: Type.Optional(Type.Number()),
  status: optionalStringEnum(STEP_STATUSES),
  result: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
  notes: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  afterStepId: Type.Optional(Type.String()),
});

type PlanToolOptions = {
  workspaceDir?: string;
  sessionId?: string;
};

function resolvePlanPath(opts?: PlanToolOptions): string {
  const dir = opts?.workspaceDir ?? process.cwd();
  const sessionSuffix = opts?.sessionId ? `.${opts.sessionId.slice(0, 8)}` : "";
  return path.join(dir, `.oni-plan${sessionSuffix}.json`);
}

function loadPlan(planPath: string): Plan | null {
  try {
    const raw = fs.readFileSync(planPath, "utf-8");
    return JSON.parse(raw) as Plan;
  } catch {
    return null;
  }
}

function savePlan(planPath: string, plan: Plan) {
  plan.updatedAtMs = Date.now();
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf-8");
}

function normalizeSteps(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .map((entry, idx) => ({
      id: typeof entry.id === "string" ? entry.id : `step_${idx + 1}`,
      description: typeof entry.description === "string" ? entry.description : String(entry.description ?? ""),
      status: (typeof entry.status === "string" ? entry.status : "pending") as StepStatus,
      result: typeof entry.result === "string" ? entry.result : undefined,
      error: typeof entry.error === "string" ? entry.error : undefined,
      notes: typeof entry.notes === "string" ? entry.notes : undefined,
    }));
}

function formatPlanSummary(plan: Plan): string {
  const lines: string[] = [];
  lines.push(`Goal: ${plan.goal}`);
  lines.push("");
  const total = plan.steps.length;
  const done = plan.steps.filter((s) => s.status === "done").length;
  const failed = plan.steps.filter((s) => s.status === "failed").length;
  const inProgress = plan.steps.filter((s) => s.status === "in_progress").length;
  const pending = plan.steps.filter((s) => s.status === "pending").length;
  lines.push(`Progress: ${done}/${total} done, ${inProgress} in progress, ${pending} pending, ${failed} failed`);
  lines.push("");
  for (const step of plan.steps) {
    const marker =
      step.status === "done" ? "✅" :
      step.status === "in_progress" ? "🔄" :
      step.status === "failed" ? "❌" :
      step.status === "skipped" ? "⏭️" : "⬜";
    let line = `${marker} [${step.id}] ${step.description}`;
    if (step.result) line += ` → ${step.result}`;
    if (step.error) line += ` ⚠️ ${step.error}`;
    lines.push(line);
  }
  // Find next actionable step
  const nextStep = plan.steps.find((s) => s.status === "pending" || s.status === "in_progress");
  if (nextStep) {
    lines.push("");
    lines.push(`Next: [${nextStep.id}] ${nextStep.description}`);
  } else if (done === total) {
    lines.push("");
    lines.push("All steps complete.");
  }
  return lines.join("\n");
}

export function createPlanTool(opts?: PlanToolOptions): AnyAgentTool {
  return {
    label: "Plan",
    name: "plan",
    ownerOnly: false,
    description: `Create and manage structured plans for multi-step tasks. Plans persist across tool calls and survive context compaction.

ACTIONS:
- create: Create a new plan (requires goal + steps array)
- get: Get the current plan (returns full plan with status)
- update_step: Update a step's status/result/error (requires stepId or stepIndex + status)
- add_step: Add a step to the plan (requires description, optional afterStepId to insert after)
- remove_step: Remove a step (requires stepId or stepIndex)
- summary: Get a formatted summary of plan progress
- clear: Delete the current plan

WORKFLOW:
1. create a plan with goal and steps
2. Work through steps one by one
3. update_step with status="in_progress" when starting
4. update_step with status="done" and result="..." when complete
5. update_step with status="failed" and error="..." if step fails
6. Use summary to check progress after compaction

Plans are stored in the workspace and persist across sessions. After context compaction, use get or summary to reload your plan state.`,
    parameters: PlanToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true }) as PlanAction;
      const planPath = resolvePlanPath(opts);

      switch (action) {
        case "create": {
          const goal = readStringParam(params, "goal", { required: true });
          const steps = normalizeSteps(params.steps);
          if (steps.length === 0) {
            throw new Error("At least one step is required");
          }
          const plan: Plan = {
            goal,
            steps,
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
          };
          savePlan(planPath, plan);
          return jsonResult({ created: true, plan, summary: formatPlanSummary(plan) });
        }

        case "get": {
          const plan = loadPlan(planPath);
          if (!plan) {
            return jsonResult({ exists: false, message: "No active plan. Use create to start one." });
          }
          return jsonResult({ exists: true, plan, summary: formatPlanSummary(plan) });
        }

        case "update_step": {
          const plan = loadPlan(planPath);
          if (!plan) throw new Error("No active plan");
          const stepId = readStringParam(params, "stepId");
          const stepIndex = readNumberParam(params, "stepIndex", { integer: true });
          const status = readStringParam(params, "status") as StepStatus | undefined;
          let step: PlanStep | undefined;
          if (stepId) {
            step = plan.steps.find((s) => s.id === stepId);
          } else if (stepIndex !== undefined) {
            step = plan.steps[stepIndex];
          }
          if (!step) throw new Error("Step not found");
          if (status) step.status = status;
          const result = readStringParam(params, "result");
          if (result) step.result = result;
          const error = readStringParam(params, "error");
          if (error) step.error = error;
          const notes = readStringParam(params, "notes");
          if (notes) step.notes = notes;
          savePlan(planPath, plan);
          return jsonResult({ updated: true, step, summary: formatPlanSummary(plan) });
        }

        case "add_step": {
          const plan = loadPlan(planPath);
          if (!plan) throw new Error("No active plan");
          const description = readStringParam(params, "description", { required: true });
          const afterStepId = readStringParam(params, "afterStepId");
          const newStep: PlanStep = {
            id: `step_${plan.steps.length + 1}`,
            description,
            status: "pending",
          };
          if (afterStepId) {
            const idx = plan.steps.findIndex((s) => s.id === afterStepId);
            if (idx === -1) throw new Error(`Step ${afterStepId} not found`);
            plan.steps.splice(idx + 1, 0, newStep);
          } else {
            plan.steps.push(newStep);
          }
          savePlan(planPath, plan);
          return jsonResult({ added: true, step: newStep, summary: formatPlanSummary(plan) });
        }

        case "remove_step": {
          const plan = loadPlan(planPath);
          if (!plan) throw new Error("No active plan");
          const removeId = readStringParam(params, "stepId");
          const removeIdx = readNumberParam(params, "stepIndex", { integer: true });
          let idx = -1;
          if (removeId) {
            idx = plan.steps.findIndex((s) => s.id === removeId);
          } else if (removeIdx !== undefined) {
            idx = removeIdx;
          }
          if (idx < 0 || idx >= plan.steps.length) throw new Error("Step not found");
          const removed = plan.steps.splice(idx, 1)[0]!;
          savePlan(planPath, plan);
          return jsonResult({ removed: true, step: removed, summary: formatPlanSummary(plan) });
        }

        case "summary": {
          const plan = loadPlan(planPath);
          if (!plan) {
            return jsonResult({ exists: false, message: "No active plan." });
          }
          return jsonResult({ exists: true, summary: formatPlanSummary(plan) });
        }

        case "clear": {
          try {
            fs.unlinkSync(planPath);
          } catch {
            // ignore
          }
          return jsonResult({ cleared: true });
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
