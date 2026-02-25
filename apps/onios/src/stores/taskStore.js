/**
 * taskStore — Zustand store for tasks, events, and scheduled jobs.
 *
 * Persists to localStorage. Powers both Calendar and TaskManager widgets.
 * Connected to SchedulerService for auto-firing reminders.
 *
 * Task shape:
 * {
 *   id, title, description, status, priority,
 *   dueDate, dueTime, createdAt, completedAt,
 *   tags, recurring, reminders, category
 * }
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import { eventBus } from '../core/EventBus.js';

const useTaskStore = create(
    persist(
        (set, get) => ({
            tasks: [],
            events: [],
            // scheduled jobs (cron-like)
            scheduledJobs: [],

            // ─── Tasks CRUD ───────────────────────────────

            addTask: (taskData) => {
                const task = {
                    id: nanoid(10),
                    title: taskData.title || 'Untitled Task',
                    description: taskData.description || '',
                    status: taskData.status || 'todo',       // todo, in-progress, done, cancelled
                    priority: taskData.priority || 'medium',  // low, medium, high, urgent
                    dueDate: taskData.dueDate || null,        // 'YYYY-MM-DD'
                    dueTime: taskData.dueTime || null,        // 'HH:MM'
                    createdAt: Date.now(),
                    completedAt: null,
                    tags: taskData.tags || [],
                    category: taskData.category || 'general',
                    recurring: taskData.recurring || null,     // null, 'daily', 'weekly', 'monthly'
                    reminders: taskData.reminders || [],       // [{ minutesBefore, fired }]
                    notified: false,
                };

                set((state) => ({ tasks: [...state.tasks, task] }));
                eventBus.emit('task:created', task);
                return task;
            },

            updateTask: (id, updates) => {
                set((state) => ({
                    tasks: state.tasks.map((t) =>
                        t.id === id ? { ...t, ...updates } : t
                    ),
                }));
                const task = get().tasks.find((t) => t.id === id);
                if (task) eventBus.emit('task:updated', task);
                return task;
            },

            deleteTask: (id) => {
                const task = get().tasks.find((t) => t.id === id);
                set((state) => ({
                    tasks: state.tasks.filter((t) => t.id !== id),
                }));
                if (task) eventBus.emit('task:deleted', task);
            },

            completeTask: (id) => {
                set((state) => ({
                    tasks: state.tasks.map((t) =>
                        t.id === id
                            ? { ...t, status: 'done', completedAt: Date.now() }
                            : t
                    ),
                }));
                const task = get().tasks.find((t) => t.id === id);
                if (task) eventBus.emit('task:completed', task);
            },

            reopenTask: (id) => {
                set((state) => ({
                    tasks: state.tasks.map((t) =>
                        t.id === id
                            ? { ...t, status: 'todo', completedAt: null }
                            : t
                    ),
                }));
            },

            // ─── Events CRUD ──────────────────────────────

            addEvent: (eventData) => {
                const event = {
                    id: nanoid(10),
                    title: eventData.title || 'Untitled Event',
                    description: eventData.description || '',
                    date: eventData.date,          // 'YYYY-MM-DD'
                    startTime: eventData.startTime || null, // 'HH:MM'
                    endTime: eventData.endTime || null,
                    allDay: eventData.allDay || false,
                    color: eventData.color || '#3b82f6',
                    recurring: eventData.recurring || null,
                    createdAt: Date.now(),
                };

                set((state) => ({ events: [...state.events, event] }));
                eventBus.emit('event:created', event);
                return event;
            },

            updateEvent: (id, updates) => {
                set((state) => ({
                    events: state.events.map((e) =>
                        e.id === id ? { ...e, ...updates } : e
                    ),
                }));
            },

            deleteEvent: (id) => {
                set((state) => ({
                    events: state.events.filter((e) => e.id !== id),
                }));
            },

            // ─── Scheduled Jobs ───────────────────────────

            addScheduledJob: (jobData) => {
                const job = {
                    id: nanoid(10),
                    name: jobData.name || 'Unnamed Job',
                    command: jobData.command,         // command string to execute
                    schedule: jobData.schedule,       // cron-like: { interval, unit, at?, daysOfWeek? }
                    enabled: jobData.enabled !== false,
                    lastRun: null,
                    nextRun: null,
                    runCount: 0,
                    createdAt: Date.now(),
                };

                set((state) => ({ scheduledJobs: [...state.scheduledJobs, job] }));
                eventBus.emit('job:created', job);
                return job;
            },

            updateJob: (id, updates) => {
                set((state) => ({
                    scheduledJobs: state.scheduledJobs.map((j) =>
                        j.id === id ? { ...j, ...updates } : j
                    ),
                }));
            },

            deleteJob: (id) => {
                set((state) => ({
                    scheduledJobs: state.scheduledJobs.filter((j) => j.id !== id),
                }));
            },

            markJobRun: (id) => {
                set((state) => ({
                    scheduledJobs: state.scheduledJobs.map((j) =>
                        j.id === id
                            ? { ...j, lastRun: Date.now(), runCount: j.runCount + 1 }
                            : j
                    ),
                }));
            },

            // ─── Queries ──────────────────────────────────

            getTasksByDate: (dateStr) => {
                return get().tasks.filter((t) => t.dueDate === dateStr);
            },

            getEventsByDate: (dateStr) => {
                return get().events.filter((e) => e.date === dateStr);
            },

            getTasksByStatus: (status) => {
                return get().tasks.filter((t) => t.status === status);
            },

            getOverdueTasks: () => {
                const today = new Date().toISOString().split('T')[0];
                return get().tasks.filter(
                    (t) => t.dueDate && t.dueDate < today && t.status !== 'done' && t.status !== 'cancelled'
                );
            },

            getUpcomingTasks: (days = 7) => {
                const now = new Date();
                const future = new Date(now.getTime() + days * 86400000);
                const todayStr = now.toISOString().split('T')[0];
                const futureStr = future.toISOString().split('T')[0];
                return get().tasks.filter(
                    (t) => t.dueDate && t.dueDate >= todayStr && t.dueDate <= futureStr && t.status !== 'done'
                );
            },

            getItemsForDate: (dateStr) => {
                const tasks = get().tasks.filter((t) => t.dueDate === dateStr);
                const events = get().events.filter((e) => e.date === dateStr);
                return { tasks, events };
            },

            // ─── Stats ────────────────────────────────────

            getStats: () => {
                const tasks = get().tasks;
                return {
                    total: tasks.length,
                    todo: tasks.filter((t) => t.status === 'todo').length,
                    inProgress: tasks.filter((t) => t.status === 'in-progress').length,
                    done: tasks.filter((t) => t.status === 'done').length,
                    overdue: get().getOverdueTasks().length,
                };
            },
        }),
        {
            name: 'onios-tasks',
            partialize: (state) => ({
                tasks: state.tasks,
                events: state.events,
                scheduledJobs: state.scheduledJobs,
            }),
        },
    ),
);

export default useTaskStore;
