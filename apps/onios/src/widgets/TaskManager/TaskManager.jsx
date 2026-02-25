/**
 * TaskManager — Full task management with list view, filters, and scheduled jobs.
 *
 * Features:
 * - Create/edit/complete/delete tasks
 * - Filter by status, priority, date
 * - Quick-add with keyboard shortcut
 * - Scheduled jobs panel (cron-like)
 * - Stats overview
 * - Connected to TaskStore + SchedulerService
 */

import React, { useState, useMemo } from "react";
import {
  Plus,
  Circle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
  Timer,
  ListTodo,
  CalendarDays,
  Filter,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  X,
  Zap,
} from "lucide-react";
import useTaskStore from "../../stores/taskStore";
import { schedulerService } from "../../core/SchedulerService";
import { useWidgetContext } from "../../core/useWidgetContext";
import "./TaskManager.css";

const PRIORITY_COLORS = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#6b7280",
};

const STATUS_LABELS = {
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};

export default function TaskManager({ windowId, widgetType }) {
  const tasks = useTaskStore((s) => s.tasks);
  const scheduledJobs = useTaskStore((s) => s.scheduledJobs);
  const addTask = useTaskStore((s) => s.addTask);
  const completeTask = useTaskStore((s) => s.completeTask);
  const reopenTask = useTaskStore((s) => s.reopenTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const addScheduledJob = useTaskStore((s) => s.addScheduledJob);
  const deleteJob = useTaskStore((s) => s.deleteJob);
  const updateJob = useTaskStore((s) => s.updateJob);
  const getStats = useTaskStore((s) => s.getStats);

  const [activeTab, setActiveTab] = useState("tasks"); // 'tasks' | 'jobs'
  const [filter, setFilter] = useState("all"); // 'all' | 'todo' | 'in-progress' | 'done' | 'overdue'
  const [sortBy, setSortBy] = useState("date"); // 'date' | 'priority' | 'created'
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddJob, setShowAddJob] = useState(false);

  // Task form
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    dueTime: "",
    priority: "medium",
    category: "general",
  });

  // Job form
  const [jobForm, setJobForm] = useState({
    name: "",
    command: "",
    interval: 1,
    unit: "hours",
    at: "",
  });

  const stats = useMemo(() => getStats(), [tasks]);

  // Report live context for AI agents
  useWidgetContext(windowId, "task-manager", {
    activeTab,
    filter,
    stats,
    taskCount: tasks.length,
    tasks: tasks
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate || null,
      })),
    scheduledJobCount: scheduledJobs.length,
    scheduledJobs: scheduledJobs.map((j) => ({
      id: j.id,
      name: j.name,
      command: j.command,
      enabled: j.enabled,
      interval: j.interval,
      unit: j.unit,
    })),
  });

  const todayStr = new Date().toISOString().split("T")[0];

  // Filtered + sorted tasks
  const filteredTasks = useMemo(() => {
    let list = [...tasks];

    if (filter === "overdue") {
      list = list.filter(
        (t) =>
          t.dueDate &&
          t.dueDate < todayStr &&
          t.status !== "done" &&
          t.status !== "cancelled",
      );
    } else if (filter !== "all") {
      list = list.filter((t) => t.status === filter);
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "date") {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (sortBy === "priority") {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] || 2) - (order[b.priority] || 2);
      }
      return b.createdAt - a.createdAt; // newest first
    });

    return list;
  }, [tasks, filter, sortBy, todayStr]);

  const handleAddTask = () => {
    if (!taskForm.title.trim()) return;
    addTask({
      title: taskForm.title,
      description: taskForm.description,
      dueDate: taskForm.dueDate || null,
      dueTime: taskForm.dueTime || null,
      priority: taskForm.priority,
      category: taskForm.category,
    });
    setTaskForm({
      title: "",
      description: "",
      dueDate: "",
      dueTime: "",
      priority: "medium",
      category: "general",
    });
    setShowAddTask(false);
  };

  const handleAddJob = () => {
    if (!jobForm.name.trim() || !jobForm.command.trim()) return;
    addScheduledJob({
      name: jobForm.name,
      command: jobForm.command,
      schedule: {
        interval: Number(jobForm.interval) || 1,
        unit: jobForm.unit,
        at: jobForm.at || undefined,
      },
    });
    setJobForm({ name: "", command: "", interval: 1, unit: "hours", at: "" });
    setShowAddJob(false);
  };

  const cycleStatus = (task) => {
    const order = ["todo", "in-progress", "done"];
    const idx = order.indexOf(task.status);
    const next = order[(idx + 1) % order.length];
    if (next === "done") {
      completeTask(task.id);
    } else {
      updateTask(task.id, { status: next, completedAt: null });
    }
  };

  const isOverdue = (task) => {
    return (
      task.dueDate &&
      task.dueDate < todayStr &&
      task.status !== "done" &&
      task.status !== "cancelled"
    );
  };

  return (
    <div className="task-manager">
      {/* Header with stats */}
      <div className="tm-header">
        <div className="tm-stats">
          <div className="tm-stat" onClick={() => setFilter("all")}>
            <span className="tm-stat-num">{stats.total}</span>
            <span className="tm-stat-label">Total</span>
          </div>
          <div className="tm-stat" onClick={() => setFilter("todo")}>
            <span className="tm-stat-num tm-stat-todo">{stats.todo}</span>
            <span className="tm-stat-label">To Do</span>
          </div>
          <div className="tm-stat" onClick={() => setFilter("in-progress")}>
            <span className="tm-stat-num tm-stat-progress">
              {stats.inProgress}
            </span>
            <span className="tm-stat-label">Active</span>
          </div>
          <div className="tm-stat" onClick={() => setFilter("done")}>
            <span className="tm-stat-num tm-stat-done">{stats.done}</span>
            <span className="tm-stat-label">Done</span>
          </div>
          {stats.overdue > 0 && (
            <div className="tm-stat" onClick={() => setFilter("overdue")}>
              <span className="tm-stat-num tm-stat-overdue">
                {stats.overdue}
              </span>
              <span className="tm-stat-label">Overdue</span>
            </div>
          )}
        </div>

        <div className="tm-tabs">
          <button
            className={`tm-tab ${activeTab === "tasks" ? "active" : ""}`}
            onClick={() => setActiveTab("tasks")}
          >
            <ListTodo size={14} /> Tasks
          </button>
          <button
            className={`tm-tab ${activeTab === "jobs" ? "active" : ""}`}
            onClick={() => setActiveTab("jobs")}
          >
            <Timer size={14} /> Scheduled Jobs
          </button>
        </div>
      </div>

      {/* Tasks Tab */}
      {activeTab === "tasks" && (
        <div className="tm-body">
          {/* Toolbar */}
          <div className="tm-toolbar">
            <div className="tm-filters">
              {["all", "todo", "in-progress", "done", "overdue"].map((f) => (
                <button
                  key={f}
                  className={`tm-filter-btn ${filter === f ? "active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {f === "all"
                    ? "All"
                    : f === "in-progress"
                      ? "Active"
                      : f === "overdue"
                        ? "Overdue"
                        : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button className="tm-add-btn" onClick={() => setShowAddTask(true)}>
              <Plus size={14} /> New Task
            </button>
          </div>

          {/* Add task form */}
          {showAddTask && (
            <div className="tm-add-form">
              <input
                className="tm-form-input tm-form-title"
                placeholder="Task title..."
                value={taskForm.title}
                onChange={(e) =>
                  setTaskForm({ ...taskForm, title: e.target.value })
                }
                onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                autoFocus
              />
              <div className="tm-form-row">
                <input
                  className="tm-form-input"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, dueDate: e.target.value })
                  }
                />
                <input
                  className="tm-form-input"
                  type="time"
                  value={taskForm.dueTime}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, dueTime: e.target.value })
                  }
                />
                <select
                  className="tm-form-input"
                  value={taskForm.priority}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, priority: e.target.value })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="tm-form-actions">
                <button className="tm-form-submit" onClick={handleAddTask}>
                  Add Task
                </button>
                <button
                  className="tm-form-cancel"
                  onClick={() => setShowAddTask(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Task list */}
          <div className="tm-list">
            {filteredTasks.length === 0 ? (
              <div className="tm-empty">
                <ListTodo size={32} />
                <span>
                  {filter === "all" ? "No tasks yet" : `No ${filter} tasks`}
                </span>
              </div>
            ) : (
              filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={[
                    "tm-task",
                    task.status === "done" && "tm-task-done",
                    isOverdue(task) && "tm-task-overdue",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    className="tm-task-check"
                    onClick={() => cycleStatus(task)}
                  >
                    {task.status === "done" ? (
                      <CheckCircle2 size={18} />
                    ) : task.status === "in-progress" ? (
                      <Clock size={18} />
                    ) : (
                      <Circle size={18} />
                    )}
                  </button>
                  <div className="tm-task-body">
                    <div className="tm-task-title">{task.title}</div>
                    <div className="tm-task-meta">
                      {task.dueDate && (
                        <span
                          className={`tm-task-date ${isOverdue(task) ? "overdue" : ""}`}
                        >
                          <CalendarDays size={10} /> {task.dueDate}
                          {task.dueTime ? ` ${task.dueTime}` : ""}
                        </span>
                      )}
                      <span
                        className="tm-task-priority"
                        style={{ color: PRIORITY_COLORS[task.priority] }}
                      >
                        {task.priority}
                      </span>
                      <span className="tm-task-status">
                        {STATUS_LABELS[task.status]}
                      </span>
                    </div>
                  </div>
                  <button
                    className="tm-task-delete"
                    onClick={() => deleteTask(task.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Jobs Tab */}
      {activeTab === "jobs" && (
        <div className="tm-body">
          <div className="tm-toolbar">
            <span className="tm-toolbar-title">
              <Zap size={14} /> Scheduled Jobs ({scheduledJobs.length})
            </span>
            <button className="tm-add-btn" onClick={() => setShowAddJob(true)}>
              <Plus size={14} /> New Job
            </button>
          </div>

          {/* Add job form */}
          {showAddJob && (
            <div className="tm-add-form">
              <input
                className="tm-form-input tm-form-title"
                placeholder="Job name..."
                value={jobForm.name}
                onChange={(e) =>
                  setJobForm({ ...jobForm, name: e.target.value })
                }
                autoFocus
              />
              <input
                className="tm-form-input"
                placeholder='Command to run, e.g. system.notify("Hello")'
                value={jobForm.command}
                onChange={(e) =>
                  setJobForm({ ...jobForm, command: e.target.value })
                }
              />
              <div className="tm-form-row">
                <span className="tm-form-label">Every</span>
                <input
                  className="tm-form-input tm-form-num"
                  type="number"
                  min="1"
                  value={jobForm.interval}
                  onChange={(e) =>
                    setJobForm({ ...jobForm, interval: e.target.value })
                  }
                />
                <select
                  className="tm-form-input"
                  value={jobForm.unit}
                  onChange={(e) =>
                    setJobForm({ ...jobForm, unit: e.target.value })
                  }
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
                {(jobForm.unit === "days" || jobForm.unit === "weeks") && (
                  <>
                    <span className="tm-form-label">at</span>
                    <input
                      className="tm-form-input"
                      type="time"
                      value={jobForm.at}
                      onChange={(e) =>
                        setJobForm({ ...jobForm, at: e.target.value })
                      }
                    />
                  </>
                )}
              </div>
              <div className="tm-form-actions">
                <button className="tm-form-submit" onClick={handleAddJob}>
                  Add Job
                </button>
                <button
                  className="tm-form-cancel"
                  onClick={() => setShowAddJob(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Job list */}
          <div className="tm-list">
            {scheduledJobs.length === 0 ? (
              <div className="tm-empty">
                <Timer size={32} />
                <span>No scheduled jobs</span>
                <span className="tm-empty-hint">
                  Create cron-like jobs that auto-fire commands
                </span>
              </div>
            ) : (
              scheduledJobs.map((job) => (
                <div
                  key={job.id}
                  className={`tm-job ${!job.enabled ? "tm-job-disabled" : ""}`}
                >
                  <button
                    className="tm-job-toggle"
                    onClick={() => updateJob(job.id, { enabled: !job.enabled })}
                  >
                    {job.enabled ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                  <div className="tm-job-body">
                    <div className="tm-job-name">{job.name}</div>
                    <div className="tm-job-meta">
                      <span className="tm-job-cmd">{job.command}</span>
                      <span className="tm-job-schedule">
                        Every {job.schedule?.interval} {job.schedule?.unit}
                        {job.schedule?.at ? ` at ${job.schedule.at}` : ""}
                      </span>
                      {job.runCount > 0 && (
                        <span className="tm-job-runs">Ran {job.runCount}×</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="tm-task-delete"
                    onClick={() => deleteJob(job.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
