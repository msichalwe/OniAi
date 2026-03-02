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
  lines.push("Instructions:");
  lines.push("1. Work on this task. Execute the next logical step.");
  lines.push('2. Use task(action="progress", taskId="...", message="...") to log what you did.');
  lines.push("3. If the task is complete, use task(action=\"complete\", taskId=\"...\", result=\"...\").");
  lines.push("4. If you hit a blocker, use task(action=\"update\", taskId=\"...\", patch={status:\"blocked\", blockedReason:\"...\"}).");
  lines.push("5. If the task fails, use task(action=\"fail\", taskId=\"...\", error=\"...\").");
  lines.push("6. If you need user input, set status to \"blocked\" and send a message to the user.");
  lines.push("7. If you have nothing to report, respond with HEARTBEAT_OK.");

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
