export type TaskStatus =
  | "pending"
  | "planning"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "failed"
  | "cancelled";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type TaskStepStatus = "pending" | "in_progress" | "done" | "failed" | "skipped";

export type TaskStep = {
  id: string;
  description: string;
  status: TaskStepStatus;
  /** Tool requirements for this step (informational). */
  tools?: string[];
  /** Step IDs that must complete before this step can start. */
  dependsOn?: string[];
  /** Acceptance criteria — agent evaluates after execution. */
  acceptanceCriteria?: string;
  /** Freeform result/output from step execution. */
  result?: string;
  /** Error message if step failed. */
  error?: string;
  startedAtMs?: number;
  completedAtMs?: number;
};

export type TaskBudget = {
  /** Max total tokens the task may consume (across all heartbeat runs). */
  maxTokens?: number;
  /** Max estimated cost in USD. */
  maxCostUsd?: number;
  /** Max number of heartbeat work cycles for this task. */
  maxCycles?: number;
  /** Tokens consumed so far. */
  tokensUsed?: number;
  /** Estimated cost so far. */
  costUsed?: number;
  /** Work cycles consumed so far. */
  cyclesUsed?: number;
};

export type TaskProgressEntry = {
  timestampMs: number;
  message: string;
};

export type Task = {
  id: string;
  /** The agent that owns this task. */
  agentId?: string;
  /** Session key that created/owns this task. */
  sessionKey?: string;
  /** High-level goal description. */
  goal: string;
  /** Current status. */
  status: TaskStatus;
  /** Priority for queue ordering. */
  priority: TaskPriority;
  /** Structured plan steps (optional — agent may work without explicit plan). */
  steps?: TaskStep[];
  /** Index of the current step being executed (0-based). */
  currentStepIndex?: number;
  /** Why the task is blocked (human-readable). */
  blockedReason?: string;
  /** Budget constraints for autonomous execution. */
  budget?: TaskBudget;
  /** Progress log entries (append-only, capped). */
  progress?: TaskProgressEntry[];
  /** Freeform tags for filtering. */
  tags?: string[];
  /** Final result/output when task completes. */
  result?: string;
  /** Error details if task failed. */
  error?: string;
  createdAtMs: number;
  updatedAtMs: number;
  /** When the task last had work done on it. */
  lastWorkedAtMs?: number;
  /** Number of heartbeat work cycles spent on this task. */
  workCycles?: number;
};

export type TaskCreate = Omit<Task, "id" | "createdAtMs" | "updatedAtMs" | "workCycles"> & {
  id?: string;
};

export type TaskPatch = Partial<
  Omit<Task, "id" | "createdAtMs">
>;

export type TaskStoreFile = {
  version: 1;
  tasks: Task[];
};

export type TaskListFilter = {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  agentId?: string;
  sessionKey?: string;
  tags?: string[];
  limit?: number;
};

export type TaskQueueAction =
  | "list"
  | "get"
  | "create"
  | "update"
  | "cancel"
  | "next"
  | "progress"
  | "complete"
  | "fail";
