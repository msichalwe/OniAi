import { resolveTaskStorePath, TaskStore } from "./store.js";
import type { Task } from "./types.js";

export type TaskHeartbeatResult =
  | { hasWork: false }
  | { hasWork: true; task: Task; prompt: string };

/**
 * Build a heartbeat prompt that instructs the agent to work on the next queued task.
 * Called during heartbeat preflight to inject task context into the heartbeat run.
 */
export function buildTaskWorkPrompt(task: Task): string {
  const lines: string[] = [];
  lines.push(`[System Message] Autonomous task work cycle.`);
  lines.push(`Task ID: ${task.id}`);
  lines.push(`Goal: ${task.goal}`);
  lines.push(`Status: ${task.status}`);
  lines.push(`Priority: ${task.priority}`);
  if (task.workCycles !== undefined) {
    lines.push(`Work cycles used: ${task.workCycles}`);
  }
  if (task.budget) {
    const parts: string[] = [];
    if (task.budget.maxCycles !== undefined) {
      parts.push(`maxCycles=${task.budget.maxCycles}`);
    }
    if (task.budget.maxTokens !== undefined) {
      parts.push(`maxTokens=${task.budget.maxTokens}`);
    }
    if (task.budget.maxCostUsd !== undefined) {
      parts.push(`maxCostUsd=$${task.budget.maxCostUsd}`);
    }
    if (parts.length > 0) {
      lines.push(`Budget: ${parts.join(", ")}`);
    }
  }
  if (task.steps && task.steps.length > 0) {
    lines.push("");
    lines.push("Plan:");
    for (const step of task.steps) {
      const marker =
        step.status === "done"
          ? "✅"
          : step.status === "in_progress"
            ? "🔄"
            : step.status === "failed"
              ? "❌"
              : step.status === "skipped"
                ? "⏭️"
                : "⬜";
      lines.push(`  ${marker} [${step.id}] ${step.description} (${step.status})`);
    }
    const currentIdx = task.currentStepIndex ?? 0;
    const currentStep = task.steps[currentIdx];
    if (currentStep && currentStep.status !== "done") {
      lines.push("");
      lines.push(`Current step: [${currentStep.id}] ${currentStep.description}`);
      if (currentStep.acceptanceCriteria) {
        lines.push(`Acceptance criteria: ${currentStep.acceptanceCriteria}`);
      }
    }
  }
  if (task.progress && task.progress.length > 0) {
    const recent = task.progress.slice(-3);
    lines.push("");
    lines.push("Recent progress:");
    for (const entry of recent) {
      const time = new Date(entry.timestampMs).toISOString();
      lines.push(`  [${time}] ${entry.message}`);
    }
  }
  if (task.blockedReason) {
    lines.push("");
    lines.push(`⚠️ Previously blocked: ${task.blockedReason}`);
  }
  lines.push("");
  lines.push("Instructions (autonomous work loop):");
  lines.push("1. **Keep working** — complete as many steps as possible in this turn. Do NOT stop after one step if more work is actionable.");
  lines.push("2. **Gather context first** — before executing, read relevant files, check git status, search memory, and understand the current state. Don't guess; verify.");
  lines.push("3. Use task(action=\"progress\", taskId=\"...\", message=\"...\") to log each meaningful action.");
  lines.push("4. If the task is complete, use task(action=\"complete\", taskId=\"...\", result=\"...\").");
  lines.push("5. If you hit a blocker requiring human input, set status to \"blocked\" with blockedReason and message the user.");
  lines.push("6. If the task fails, use task(action=\"fail\", taskId=\"...\", error=\"...\").");
  lines.push("7. After completing or advancing steps, check if the NEXT step is also actionable — if so, continue immediately.");
  lines.push("8. Only respond with HEARTBEAT_OK if there is genuinely nothing to do.");

  return lines.join("\n");
}

/**
 * Check if there's an actionable task for a heartbeat work cycle.
 * Returns the task and a prompt to inject, or indicates no work is needed.
 */
export function resolveTaskHeartbeatWork(opts?: {
  agentId?: string;
}): TaskHeartbeatResult {
  try {
    const storePath = resolveTaskStorePath(opts?.agentId);
    const store = new TaskStore({ storePath });
    const task = store.next({ agentId: opts?.agentId });
    if (!task) {
      return { hasWork: false };
    }
    // Check budget before assigning work.
    if (store.isOverBudget(task)) {
      store.update(task.id, {
        status: "blocked",
        blockedReason: "Budget limit reached. Increase budget or complete manually.",
      });
      // Try next task.
      const nextTask = store.next({ agentId: opts?.agentId });
      if (!nextTask) {
        return { hasWork: false };
      }
      if (store.isOverBudget(nextTask)) {
        return { hasWork: false };
      }
      store.recordWorkCycle(nextTask.id);
      // Auto-promote pending tasks to in_progress on first work cycle.
      if (nextTask.status === "pending") {
        store.update(nextTask.id, { status: "in_progress" });
        nextTask.status = "in_progress";
      }
      return {
        hasWork: true,
        task: nextTask,
        prompt: buildTaskWorkPrompt(nextTask),
      };
    }
    store.recordWorkCycle(task.id);
    // Auto-promote pending tasks to in_progress on first work cycle.
    if (task.status === "pending") {
      store.update(task.id, { status: "in_progress" });
      task.status = "in_progress";
    }
    return {
      hasWork: true,
      task,
      prompt: buildTaskWorkPrompt(task),
    };
  } catch {
    // Task store not available or corrupted — don't block heartbeat.
    return { hasWork: false };
  }
}
