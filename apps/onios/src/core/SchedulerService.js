/**
 * SchedulerService — Cron-like auto-firing engine for OniOS.
 *
 * Runs a tick loop every 15 seconds to:
 * 1. Fire scheduled jobs whose next run time has passed
 * 2. Check task due dates and fire reminder notifications
 * 3. Check overdue tasks and notify
 *
 * Schedule format for jobs:
 * { interval: 5, unit: 'minutes' }           — every 5 minutes
 * { interval: 1, unit: 'hours' }             — every hour
 * { interval: 1, unit: 'days', at: '09:00' } — daily at 9am
 * { interval: 1, unit: 'weeks', at: '09:00', dayOfWeek: 1 } — weekly Monday 9am
 *
 * Uses EventBus for decoupled notification delivery.
 */

import { eventBus } from './EventBus.js';

class SchedulerService {
    constructor() {
        this._intervalId = null;
        this._tickMs = 15000; // 15 second tick
        this._getTaskStore = null;
        this._getCommandStore = null;
        this._getWindowStore = null;
        this._getWorkflowStore = null;
        this._notifiedTaskIds = new Set();
        this._started = false;
        this._startedAt = null;
        this._lastHeartbeat = null;
    }

    /**
     * Initialize with store accessors (called once from App).
     */
    init(getTaskStore, getNotificationStore, executeCommand, extras = {}) {
        this._getTaskStore = getTaskStore;
        this._getNotificationStore = getNotificationStore;
        this._executeCommand = executeCommand;
        this._getWindowStore = extras.getWindowStore || null;
        this._getWorkflowStore = extras.getWorkflowStore || null;
        this.start();
    }

    start() {
        if (this._started) return;
        this._started = true;
        this._startedAt = Date.now();
        this._intervalId = setInterval(() => this._tick(), this._tickMs);
        // Run first tick immediately after a short delay (let stores hydrate)
        setTimeout(() => this._tick(), 2000);
        console.log('[Scheduler] Started — tick every', this._tickMs / 1000, 'seconds');
    }

    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._started = false;
        console.log('[Scheduler] Stopped');
    }

    // ─── Main Tick ─────────────────────────────────────────

    _tick() {
        try {
            this._checkScheduledJobs();
            this._checkTaskReminders();
            this._checkOverdueTasks();
            this._checkHeartbeat();
        } catch (err) {
            console.error('[Scheduler] Tick error:', err);
        }
    }

    // ─── 30-Minute Heartbeat ────────────────────────────────

    _checkHeartbeat() {
        const now = Date.now();
        const HEARTBEAT_INTERVAL = 30 * 60 * 1000; // 30 minutes

        if (!this._lastHeartbeat) {
            this._lastHeartbeat = now;
            // Emit initial heartbeat on first tick
            this._emitHeartbeat();
            return;
        }

        if (now - this._lastHeartbeat >= HEARTBEAT_INTERVAL) {
            this._lastHeartbeat = now;
            this._emitHeartbeat();
        }
    }

    _emitHeartbeat() {
        const store = this._getTaskStore?.();
        const tasks = store?.tasks || [];
        const jobs = store?.scheduledJobs || [];

        // Pending items
        const pendingTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
        const overdueTasks = store?.getOverdueTasks?.() || [];
        const dueTodayTasks = pendingTasks.filter(t => {
            if (!t.dueDate) return false;
            return t.dueDate === new Date().toISOString().split('T')[0];
        });
        const enabledJobs = jobs.filter(j => j.enabled);

        // Window/workflow health from store accessors
        let windowCount = 0;
        let activeWorkflows = 0;
        let totalWorkflows = 0;
        try {
            if (this._getWindowStore) windowCount = this._getWindowStore().windows.length;
            if (this._getWorkflowStore) {
                const workflows = this._getWorkflowStore().workflows;
                activeWorkflows = workflows.filter(w => w.enabled).length;
                totalWorkflows = workflows.length;
            }
        } catch { /* stores not ready */ }

        const heartbeat = {
            timestamp: Date.now(),
            uptime: Date.now() - (this._startedAt || Date.now()),
            health: overdueTasks.length > 3 ? 'warning' : 'healthy',
            pending: {
                tasks: pendingTasks.length,
                overdue: overdueTasks.length,
                dueToday: dueTodayTasks.length,
            },
            system: {
                windows: windowCount,
                scheduledJobs: enabledJobs.length,
                activeWorkflows: activeWorkflows || 0,
                totalWorkflows: totalWorkflows || 0,
            },
            summary: this._buildHeartbeatSummary(pendingTasks, overdueTasks, dueTodayTasks, enabledJobs),
        };

        eventBus.emit('system:heartbeat', heartbeat);

        // Notify if there are overdue items
        if (overdueTasks.length > 0) {
            const hourKey = `heartbeat-overdue-${new Date().getHours()}-${new Date().toISOString().split('T')[0]}`;
            if (!this._notifiedTaskIds.has(hourKey)) {
                this._notifiedTaskIds.add(hourKey);
                this._notify(
                    `💓 Heartbeat: ${overdueTasks.length} overdue task(s), ${pendingTasks.length} pending total`,
                    overdueTasks.length > 3 ? 'warning' : 'info'
                );
            }
        }

        console.log(`[Scheduler] 💓 Heartbeat — ${pendingTasks.length} pending, ${overdueTasks.length} overdue, health: ${heartbeat.health}`);
    }

    _buildHeartbeatSummary(pending, overdue, dueToday, jobs) {
        const parts = [];
        if (overdue.length > 0) parts.push(`⚠️ ${overdue.length} overdue`);
        if (dueToday.length > 0) parts.push(`📅 ${dueToday.length} due today`);
        if (pending.length > 0) parts.push(`📋 ${pending.length} pending tasks`);
        if (jobs.length > 0) parts.push(`⏰ ${jobs.length} scheduled jobs`);
        if (parts.length === 0) parts.push('✅ All clear — no pending items');
        return parts.join(' · ');
    }

    // ─── Scheduled Jobs ────────────────────────────────────

    _checkScheduledJobs() {
        if (!this._getTaskStore) return;
        const store = this._getTaskStore();
        const jobs = store.scheduledJobs.filter((j) => j.enabled);
        const now = Date.now();

        for (const job of jobs) {
            const nextRun = this._calcNextRun(job);
            if (nextRun && now >= nextRun) {
                this._fireJob(job);
                store.markJobRun(job.id);
                store.updateJob(job.id, { nextRun: this._calcNextRunAfterNow(job) });
            }
        }
    }

    _fireJob(job) {
        console.log(`[Scheduler] Firing job: ${job.name} → ${job.command}`);
        eventBus.emit('scheduler:job:fired', { job });

        // Execute the command
        if (this._executeCommand && job.command) {
            try {
                this._executeCommand(job.command, 'scheduler');
            } catch (err) {
                console.error(`[Scheduler] Job command failed: ${job.command}`, err);
            }
        }

        // Send notification
        this._notify(`⏰ Scheduled: ${job.name}`, 'info');
    }

    _calcNextRun(job) {
        if (job.nextRun) return job.nextRun;
        if (!job.lastRun) return Date.now(); // First run: now
        return this._calcNextRunFrom(job, job.lastRun);
    }

    _calcNextRunAfterNow(job) {
        return this._calcNextRunFrom(job, Date.now());
    }

    _calcNextRunFrom(job, fromTs) {
        const s = job.schedule;
        if (!s || !s.interval || !s.unit) return null;

        const multipliers = {
            seconds: 1000,
            minutes: 60 * 1000,
            hours: 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000,
            weeks: 7 * 24 * 60 * 60 * 1000,
        };

        const ms = (s.interval || 1) * (multipliers[s.unit] || 60000);
        let next = fromTs + ms;

        // If "at" time specified for daily/weekly, snap to that time
        if (s.at && (s.unit === 'days' || s.unit === 'weeks')) {
            const [h, m] = s.at.split(':').map(Number);
            const d = new Date(next);
            d.setHours(h, m, 0, 0);
            if (d.getTime() <= fromTs) {
                d.setDate(d.getDate() + (s.unit === 'weeks' ? 7 : 1));
            }
            next = d.getTime();
        }

        return next;
    }

    // ─── Task Reminders ────────────────────────────────────

    _checkTaskReminders() {
        if (!this._getTaskStore) return;
        const store = this._getTaskStore();
        const now = new Date();
        const nowStr = now.toISOString().split('T')[0];
        const nowTime = now.getHours().toString().padStart(2, '0') + ':' +
            now.getMinutes().toString().padStart(2, '0');

        for (const task of store.tasks) {
            if (task.status === 'done' || task.status === 'cancelled') continue;
            if (!task.dueDate) continue;

            // Due today with time — check if we should notify
            if (task.dueDate === nowStr && task.dueTime && !task.notified) {
                // Notify if within 5 minutes of due time
                const dueMinutes = this._timeToMinutes(task.dueTime);
                const nowMinutes = this._timeToMinutes(nowTime);
                const diff = dueMinutes - nowMinutes;

                if (diff <= 5 && diff >= -1) {
                    this._notify(`📋 Task due now: ${task.title}`, 'warning');
                    store.updateTask(task.id, { notified: true });
                    eventBus.emit('task:due', task);
                } else if (diff <= 15 && diff > 5) {
                    // 15 min warning
                    const key = `remind-15-${task.id}`;
                    if (!this._notifiedTaskIds.has(key)) {
                        this._notifiedTaskIds.add(key);
                        this._notify(`⏳ Task in ${diff} min: ${task.title}`, 'info');
                    }
                }
            }

            // Due today, no specific time, not yet notified — notify once in the morning
            if (task.dueDate === nowStr && !task.dueTime && !task.notified) {
                const hour = now.getHours();
                if (hour >= 8 && hour <= 9) {
                    this._notify(`📋 Task due today: ${task.title}`, 'info');
                    store.updateTask(task.id, { notified: true });
                }
            }
        }
    }

    // ─── Overdue Check ─────────────────────────────────────

    _checkOverdueTasks() {
        if (!this._getTaskStore) return;
        const store = this._getTaskStore();
        const overdue = store.getOverdueTasks();
        const now = new Date();

        // Notify about overdue tasks once per hour
        const hourKey = `overdue-${now.getHours()}-${now.toISOString().split('T')[0]}`;
        if (overdue.length > 0 && !this._notifiedTaskIds.has(hourKey)) {
            this._notifiedTaskIds.add(hourKey);
            if (overdue.length === 1) {
                this._notify(`⚠️ Overdue: ${overdue[0].title}`, 'warning');
            } else {
                this._notify(`⚠️ ${overdue.length} overdue tasks`, 'warning');
            }
            eventBus.emit('tasks:overdue', overdue);
        }
    }

    // ─── Helpers ───────────────────────────────────────────

    _timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    _notify(message, type = 'info') {
        if (this._getNotificationStore) {
            this._getNotificationStore().addNotification(message, type);
        }
        eventBus.emit('scheduler:notification', { message, type });
    }

    // ─── Public API ────────────────────────────────────────

    getStatus() {
        const store = this._getTaskStore?.();
        return {
            running: this._started,
            tickMs: this._tickMs,
            jobs: store?.scheduledJobs?.length || 0,
            enabledJobs: store?.scheduledJobs?.filter((j) => j.enabled).length || 0,
        };
    }

    /**
     * Force a manual tick (useful for testing).
     */
    forceTick() {
        this._tick();
    }
}

export const schedulerService = new SchedulerService();
export default schedulerService;
