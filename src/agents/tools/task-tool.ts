import { Type } from "@sinclair/typebox";
import { resolveTaskStorePath, TaskStore } from "../../tasks/store.js";
import type {
  TaskBudget,
  TaskCreate,
  TaskListFilter,
  TaskPatch,
  TaskPriority,
  TaskQueueAction,
  TaskStatus,
  TaskStep,
} from "../../tasks/types.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { stringEnum, optionalStringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam, readNumberParam } from "./common.js";

const TASK_ACTIONS: readonly TaskQueueAction[] = [
  "list",
  "get",
  "create",
  "update",
  "cancel",
  "next",
  "progress",
  "complete",
  "fail",
];

const TASK_STATUSES: readonly TaskStatus[] = [
  "pending",
  "planning",
  "in_progress",
  "blocked",
  "review",
  "done",
  "failed",
  "cancelled",
];

const TASK_PRIORITIES: readonly TaskPriority[] = ["critical", "high", "medium", "low"];

const TaskToolSchema = Type.Object({
  action: stringEnum(TASK_ACTIONS),
  // For get/update/cancel/progress/complete/fail
  taskId: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
  // For create
  goal: Type.Optional(Type.String()),
  priority: optionalStringEnum(TASK_PRIORITIES),
  tags: Type.Optional(Type.Array(Type.String())),
  steps: Type.Optional(Type.Array(Type.Object({}, { additionalProperties: true }))),
  budget: Type.Optional(Type.Object({}, { additionalProperties: true })),
  // For update
  patch: Type.Optional(Type.Object({}, { additionalProperties: true })),
  // For list
  status: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
  limit: Type.Optional(Type.Number()),
  // For progress
  message: Type.Optional(Type.String()),
  // For complete
  result: Type.Optional(Type.String()),
  // For fail
  error: Type.Optional(Type.String()),
});

type TaskToolOptions = {
  agentSessionKey?: string;
};

function resolveTaskId(params: Record<string, unknown>): string {
  const id = readStringParam(params, "taskId") ?? readStringParam(params, "id");
  if (!id) {
    throw new Error("taskId required (id accepted for backward compatibility)");
  }
  return id;
}

function resolveAgentId(agentSessionKey?: string): string | undefined {
  if (!agentSessionKey) {
    return undefined;
  }
  const cfg = loadConfig();
  return resolveSessionAgentId({ sessionKey: agentSessionKey, config: cfg });
}

function resolveStore(agentSessionKey?: string): TaskStore {
  const agentId = resolveAgentId(agentSessionKey);
  const storePath = resolveTaskStorePath(agentId);
  return new TaskStore({ storePath });
}

function normalizeSteps(raw: unknown): TaskStep[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry, idx) => ({
      id: typeof entry.id === "string" ? entry.id : `step_${idx + 1}`,
      description: typeof entry.description === "string" ? entry.description : String(entry.description ?? ""),
      status: typeof entry.status === "string" ? (entry.status as TaskStep["status"]) : "pending",
      tools: Array.isArray(entry.tools) ? entry.tools.filter((t): t is string => typeof t === "string") : undefined,
      dependsOn: Array.isArray(entry.dependsOn) ? entry.dependsOn.filter((d): d is string => typeof d === "string") : undefined,
      acceptanceCriteria: typeof entry.acceptanceCriteria === "string" ? entry.acceptanceCriteria : undefined,
    }));
}

function normalizeBudget(raw: unknown): TaskBudget | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const budget: TaskBudget = {};
  if (typeof obj.maxTokens === "number") budget.maxTokens = obj.maxTokens;
  if (typeof obj.maxCostUsd === "number") budget.maxCostUsd = obj.maxCostUsd;
  if (typeof obj.maxCycles === "number") budget.maxCycles = obj.maxCycles;
  return Object.keys(budget).length > 0 ? budget : undefined;
}

export function createTaskTool(opts?: TaskToolOptions): AnyAgentTool {
  return {
    label: "Task Queue",
    name: "task",
    ownerOnly: true,
    description: `Manage the persistent task queue for autonomous agent work.

ACTIONS:
- list: List tasks (optional status/priority/limit filters)
- get: Get a task by ID
- create: Create a new task (requires goal)
- update: Update a task (requires taskId + patch)
- cancel: Cancel a task (requires taskId)
- next: Get the next actionable task (highest priority, oldest first)
- progress: Add a progress entry to a task (requires taskId + message)
- complete: Mark a task as done (requires taskId, optional result)
- fail: Mark a task as failed (requires taskId + error)

TASK STATUSES: pending → planning → in_progress → blocked → review → done / failed / cancelled

TASK PRIORITIES: critical > high > medium > low

CREATE PARAMS:
{
  "goal": "string (required) — high-level task description",
  "priority": "critical|high|medium|low (default: medium)",
  "tags": ["optional", "string", "tags"],
  "steps": [{ "description": "step text", "tools": ["exec","read"], "dependsOn": ["step_1"] }],
  "budget": { "maxCycles": 10, "maxTokens": 100000, "maxCostUsd": 1.0 }
}

UPDATE PARAMS:
{
  "taskId": "task_abc123",
  "patch": { "status": "in_progress", "priority": "high", "blockedReason": "..." }
}

AUTONOMOUS WORK:
Tasks in "pending", "planning", or "in_progress" status are picked up by heartbeat cycles.
The heartbeat runner calls "next" to get the highest-priority actionable task and works on it.
Use "progress" to log what you did. Use "complete" or "fail" when finished.
Set budget.maxCycles to limit how many heartbeat work cycles a task may consume.

Use taskId as the canonical identifier; id is accepted for compatibility.`,
    parameters: TaskToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true }) as TaskQueueAction;
      const store = resolveStore(opts?.agentSessionKey);

      switch (action) {
        case "list": {
          const filter: TaskListFilter = {};
          const statusRaw = params.status;
          if (typeof statusRaw === "string") {
            filter.status = statusRaw.trim() as TaskStatus;
          } else if (Array.isArray(statusRaw)) {
            filter.status = statusRaw.filter((s): s is string => typeof s === "string").map((s) => s.trim()) as TaskStatus[];
          }
          const limit = readNumberParam(params, "limit", { integer: true });
          if (limit) {
            filter.limit = limit;
          }
          if (opts?.agentSessionKey) {
            filter.agentId = resolveAgentId(opts.agentSessionKey);
          }
          const tasks = store.list(filter);
          return jsonResult({
            tasks,
            total: tasks.length,
            stats: store.stats(),
          });
        }

        case "get": {
          const id = resolveTaskId(params);
          const task = store.get(id);
          if (!task) {
            throw new Error(`Task not found: ${id}`);
          }
          return jsonResult(task);
        }

        case "create": {
          const goal = readStringParam(params, "goal", { required: true });
          const priority = (readStringParam(params, "priority") ?? "medium") as TaskPriority;
          const tags = Array.isArray(params.tags)
            ? params.tags.filter((t): t is string => typeof t === "string")
            : undefined;
          const steps = normalizeSteps(params.steps);
          const budget = normalizeBudget(params.budget);
          const input: TaskCreate = {
            goal,
            status: "pending",
            priority,
            tags,
            steps,
            budget,
            agentId: resolveAgentId(opts?.agentSessionKey),
            sessionKey: opts?.agentSessionKey,
          };
          const task = store.create(input);
          return jsonResult({ created: true, task });
        }

        case "update": {
          const id = resolveTaskId(params);
          if (!params.patch || typeof params.patch !== "object") {
            throw new Error("patch required");
          }
          const rawPatch = params.patch as Record<string, unknown>;
          const patch: TaskPatch = {};
          if (typeof rawPatch.status === "string") patch.status = rawPatch.status as TaskStatus;
          if (typeof rawPatch.priority === "string") patch.priority = rawPatch.priority as TaskPriority;
          if (typeof rawPatch.blockedReason === "string") patch.blockedReason = rawPatch.blockedReason;
          if (typeof rawPatch.result === "string") patch.result = rawPatch.result;
          if (typeof rawPatch.error === "string") patch.error = rawPatch.error;
          if (typeof rawPatch.goal === "string") patch.goal = rawPatch.goal;
          if (rawPatch.steps !== undefined) patch.steps = normalizeSteps(rawPatch.steps);
          if (rawPatch.budget !== undefined) patch.budget = normalizeBudget(rawPatch.budget);
          if (rawPatch.currentStepIndex !== undefined) {
            patch.currentStepIndex = typeof rawPatch.currentStepIndex === "number"
              ? rawPatch.currentStepIndex
              : undefined;
          }
          if (Array.isArray(rawPatch.tags)) {
            patch.tags = rawPatch.tags.filter((t): t is string => typeof t === "string");
          }
          const updated = store.update(id, patch);
          if (!updated) {
            throw new Error(`Task not found or in terminal state: ${id}`);
          }
          return jsonResult({ updated: true, task: updated });
        }

        case "cancel": {
          const id = resolveTaskId(params);
          const cancelled = store.cancel(id);
          if (!cancelled) {
            throw new Error(`Task not found: ${id}`);
          }
          return jsonResult({ cancelled: true, task: cancelled });
        }

        case "next": {
          const agentId = resolveAgentId(opts?.agentSessionKey);
          const task = store.next({ agentId });
          if (!task) {
            return jsonResult({ hasNext: false, message: "No actionable tasks in queue." });
          }
          return jsonResult({ hasNext: true, task });
        }

        case "progress": {
          const id = resolveTaskId(params);
          const message = readStringParam(params, "message", { required: true });
          const updated = store.addProgress(id, message);
          if (!updated) {
            throw new Error(`Task not found: ${id}`);
          }
          return jsonResult({ logged: true, task: updated });
        }

        case "complete": {
          const id = resolveTaskId(params);
          const result = readStringParam(params, "result");
          const completed = store.complete(id, result);
          if (!completed) {
            throw new Error(`Task not found: ${id}`);
          }
          return jsonResult({ completed: true, task: completed });
        }

        case "fail": {
          const id = resolveTaskId(params);
          const error = readStringParam(params, "error", { required: true });
          const failed = store.fail(id, error);
          if (!failed) {
            throw new Error(`Task not found: ${id}`);
          }
          return jsonResult({ failed: true, task: failed });
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
