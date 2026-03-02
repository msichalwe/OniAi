import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  Task,
  TaskCreate,
  TaskListFilter,
  TaskPatch,
  TaskPriority,
  TaskStatus,
  TaskStoreFile,
} from "./types.js";

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const ACTIONABLE_STATUSES: Set<TaskStatus> = new Set([
  "pending",
  "planning",
  "in_progress",
]);

const TERMINAL_STATUSES: Set<TaskStatus> = new Set([
  "done",
  "failed",
  "cancelled",
]);

const MAX_PROGRESS_ENTRIES = 50;

function generateTaskId(): string {
  return `task_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadStoreFile(storePath: string): TaskStoreFile {
  try {
    const raw = fs.readFileSync(storePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.tasks)) {
      return parsed as TaskStoreFile;
    }
  } catch {
    // File doesn't exist or is invalid — start fresh.
  }
  return { version: 1, tasks: [] };
}

function saveStoreFile(storePath: string, store: TaskStoreFile) {
  ensureDir(storePath);
  const tmp = `${storePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmp, storePath);
}

function matchesFilter(task: Task, filter: TaskListFilter): boolean {
  if (filter.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    if (!statuses.includes(task.status)) {
      return false;
    }
  }
  if (filter.priority) {
    const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
    if (!priorities.includes(task.priority)) {
      return false;
    }
  }
  if (filter.agentId && task.agentId !== filter.agentId) {
    return false;
  }
  if (filter.sessionKey && task.sessionKey !== filter.sessionKey) {
    return false;
  }
  if (filter.tags && filter.tags.length > 0) {
    const taskTags = new Set(task.tags ?? []);
    if (!filter.tags.some((tag) => taskTags.has(tag))) {
      return false;
    }
  }
  return true;
}

function sortByPriorityThenAge(a: Task, b: Task): number {
  const pa = PRIORITY_ORDER[a.priority] ?? 2;
  const pb = PRIORITY_ORDER[b.priority] ?? 2;
  if (pa !== pb) {
    return pa - pb;
  }
  return a.createdAtMs - b.createdAtMs;
}

export type TaskStoreOptions = {
  storePath: string;
};

export class TaskStore {
  private readonly storePath: string;

  constructor(opts: TaskStoreOptions) {
    this.storePath = opts.storePath;
  }

  private load(): TaskStoreFile {
    return loadStoreFile(this.storePath);
  }

  private save(store: TaskStoreFile) {
    saveStoreFile(this.storePath, store);
  }

  private mutate(fn: (store: TaskStoreFile) => void): TaskStoreFile {
    const store = this.load();
    fn(store);
    this.save(store);
    return store;
  }

  list(filter?: TaskListFilter): Task[] {
    const store = this.load();
    let tasks = filter ? store.tasks.filter((t) => matchesFilter(t, filter)) : [...store.tasks];
    tasks.sort(sortByPriorityThenAge);
    if (filter?.limit && filter.limit > 0) {
      tasks = tasks.slice(0, filter.limit);
    }
    return tasks;
  }

  get(id: string): Task | undefined {
    const store = this.load();
    return store.tasks.find((t) => t.id === id);
  }

  create(input: TaskCreate): Task {
    const now = Date.now();
    const task: Task = {
      ...input,
      id: input.id ?? generateTaskId(),
      status: input.status ?? "pending",
      priority: input.priority ?? "medium",
      createdAtMs: now,
      updatedAtMs: now,
      workCycles: 0,
    };
    // Cap progress entries on creation.
    if (task.progress && task.progress.length > MAX_PROGRESS_ENTRIES) {
      task.progress = task.progress.slice(-MAX_PROGRESS_ENTRIES);
    }
    this.mutate((store) => {
      store.tasks.push(task);
    });
    return task;
  }

  update(id: string, patch: TaskPatch): Task | undefined {
    let updated: Task | undefined;
    this.mutate((store) => {
      const idx = store.tasks.findIndex((t) => t.id === id);
      if (idx === -1) {
        return;
      }
      const existing = store.tasks[idx]!;
      // Do not allow mutating terminal tasks unless explicitly moving out of terminal.
      if (TERMINAL_STATUSES.has(existing.status) && !patch.status) {
        return;
      }
      const merged: Task = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAtMs: existing.createdAtMs,
        updatedAtMs: Date.now(),
      };
      // Cap progress entries.
      if (merged.progress && merged.progress.length > MAX_PROGRESS_ENTRIES) {
        merged.progress = merged.progress.slice(-MAX_PROGRESS_ENTRIES);
      }
      store.tasks[idx] = merged;
      updated = merged;
    });
    return updated;
  }

  /**
   * Append a progress entry to a task.
   */
  addProgress(id: string, message: string): Task | undefined {
    let updated: Task | undefined;
    this.mutate((store) => {
      const task = store.tasks.find((t) => t.id === id);
      if (!task) {
        return;
      }
      if (!task.progress) {
        task.progress = [];
      }
      task.progress.push({ timestampMs: Date.now(), message });
      if (task.progress.length > MAX_PROGRESS_ENTRIES) {
        task.progress = task.progress.slice(-MAX_PROGRESS_ENTRIES);
      }
      task.updatedAtMs = Date.now();
      updated = task;
    });
    return updated;
  }

  /**
   * Mark a task as complete with optional result text.
   */
  complete(id: string, result?: string): Task | undefined {
    return this.update(id, {
      status: "done",
      result,
    });
  }

  /**
   * Mark a task as failed with error details.
   */
  fail(id: string, error: string): Task | undefined {
    return this.update(id, {
      status: "failed",
      error,
    });
  }

  /**
   * Cancel a task.
   */
  cancel(id: string): Task | undefined {
    return this.update(id, {
      status: "cancelled",
    });
  }

  /**
   * Get the next actionable task — highest priority, oldest first.
   * Only returns tasks in actionable statuses (pending, planning, in_progress).
   */
  next(opts?: { agentId?: string; sessionKey?: string }): Task | undefined {
    const tasks = this.list({
      status: [...ACTIONABLE_STATUSES],
      agentId: opts?.agentId,
      sessionKey: opts?.sessionKey,
    });
    return tasks[0];
  }

  /**
   * Record a work cycle on a task (called by heartbeat task runner).
   */
  recordWorkCycle(id: string): Task | undefined {
    let updated: Task | undefined;
    this.mutate((store) => {
      const task = store.tasks.find((t) => t.id === id);
      if (!task) {
        return;
      }
      task.workCycles = (task.workCycles ?? 0) + 1;
      task.lastWorkedAtMs = Date.now();
      task.updatedAtMs = Date.now();
      if (task.budget) {
        task.budget.cyclesUsed = (task.budget.cyclesUsed ?? 0) + 1;
      }
      updated = task;
    });
    return updated;
  }

  /**
   * Check if a task has exceeded its budget constraints.
   */
  isOverBudget(task: Task): boolean {
    if (!task.budget) {
      return false;
    }
    const { maxTokens, maxCostUsd, maxCycles, tokensUsed, costUsed, cyclesUsed } = task.budget;
    if (typeof maxTokens === "number" && typeof tokensUsed === "number" && tokensUsed >= maxTokens) {
      return true;
    }
    if (typeof maxCostUsd === "number" && typeof costUsed === "number" && costUsed >= maxCostUsd) {
      return true;
    }
    if (typeof maxCycles === "number" && typeof cyclesUsed === "number" && cyclesUsed >= maxCycles) {
      return true;
    }
    return false;
  }

  /**
   * Remove completed/failed/cancelled tasks older than the given age.
   */
  prune(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    this.mutate((store) => {
      const before = store.tasks.length;
      store.tasks = store.tasks.filter((t) => {
        if (TERMINAL_STATUSES.has(t.status) && t.updatedAtMs < cutoff) {
          return false;
        }
        return true;
      });
      removed = before - store.tasks.length;
    });
    return removed;
  }

  /**
   * Count tasks by status.
   */
  stats(): Record<TaskStatus, number> {
    const store = this.load();
    const counts: Record<string, number> = {};
    for (const task of store.tasks) {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
    }
    return counts as Record<TaskStatus, number>;
  }
}

/**
 * Resolve the default task store path for an agent.
 */
export function resolveTaskStorePath(agentId?: string): string {
  const base = process.env.ONI_DATA_DIR ?? path.join(process.env.HOME ?? "~", ".oni");
  const agentSegment = agentId ? `agents/${agentId}` : "agents/default";
  return path.join(base, agentSegment, "tasks.json");
}
