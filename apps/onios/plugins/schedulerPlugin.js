/**
 * schedulerPlugin — Server-side scheduler, task store, and notification queue.
 *
 * Runs INDEPENDENTLY of the browser. When the dev server starts, the scheduler
 * ticks every 15 seconds checking for:
 * - Scheduled jobs whose next run time has passed
 * - Tasks with due date/time approaching → queues notifications
 * - Overdue tasks → queues notifications
 *
 * Persists all data to ~/.onios/scheduler.json on disk.
 * The client syncs from the server on connect and pushes changes via REST API.
 *
 * API endpoints:
 *   GET  /api/scheduler/state          — full state (tasks, events, jobs, notifications)
 *   POST /api/scheduler/tasks          — add task
 *   PUT  /api/scheduler/tasks/:id      — update task
 *   DELETE /api/scheduler/tasks/:id    — delete task
 *   POST /api/scheduler/events         — add event
 *   PUT  /api/scheduler/events/:id     — update event
 *   DELETE /api/scheduler/events/:id   — delete event
 *   POST /api/scheduler/jobs           — add scheduled job
 *   PUT  /api/scheduler/jobs/:id       — update job
 *   DELETE /api/scheduler/jobs/:id     — delete job
 *   GET  /api/scheduler/notifications  — get queued notifications (and clear)
 *   POST /api/scheduler/sync           — client pushes full state to server
 *   GET  /api/scheduler/status         — scheduler engine status
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const DATA_DIR = path.join(os.homedir(), '.onios');
const DATA_FILE = path.join(DATA_DIR, 'scheduler.json');

function nanoid(len = 10) {
    return crypto.randomBytes(len).toString('base64url').substring(0, len);
}

// ─── State ─────────────────────────────────────────────

let state = {
    tasks: [],
    events: [],
    scheduledJobs: [],
    notifications: [],  // queued for client pickup
};

let schedulerInterval = null;
let tickCount = 0;
let notifiedKeys = new Set();

// ─── Persistence ───────────────────────────────────────

function loadState() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const loaded = JSON.parse(raw);
            state.tasks = loaded.tasks || [];
            state.events = loaded.events || [];
            state.scheduledJobs = loaded.scheduledJobs || [];
            // Don't load notifications — they're ephemeral
            console.log(`[Scheduler] Loaded ${state.tasks.length} tasks, ${state.events.length} events, ${state.scheduledJobs.length} jobs from disk`);
        }
    } catch (err) {
        console.error('[Scheduler] Failed to load state:', err.message);
    }
}

function saveState() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            tasks: state.tasks,
            events: state.events,
            scheduledJobs: state.scheduledJobs,
        }, null, 2), 'utf8');
    } catch (err) {
        console.error('[Scheduler] Failed to save state:', err.message);
    }
}

// ─── Notification Queue ────────────────────────────────

function queueNotification(message, type = 'info') {
    state.notifications.push({
        id: nanoid(8),
        message,
        type,
        timestamp: Date.now(),
    });
    // Cap at 100 queued
    if (state.notifications.length > 100) {
        state.notifications = state.notifications.slice(-100);
    }
}

// ─── Scheduler Tick ────────────────────────────────────

function tick() {
    tickCount++;
    try {
        // Reload from disk each tick — oniPlugin writes jobs to disk,
        // so we must pick up newly created timers/jobs
        reloadFromDisk();
        checkScheduledJobs();
        checkTaskReminders();
        checkOverdueTasks();
    } catch (err) {
        console.error('[Scheduler] Tick error:', err.message);
    }
}

function reloadFromDisk() {
    try {
        if (!fs.existsSync(DATA_FILE)) return;
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const loaded = JSON.parse(raw);
        // Merge: keep notifications (ephemeral) but reload persistent data
        state.tasks = loaded.tasks || [];
        state.events = loaded.events || [];
        state.scheduledJobs = loaded.scheduledJobs || [];
    } catch {}
}

function checkScheduledJobs() {
    const now = Date.now();
    const toRemove = [];
    for (const job of state.scheduledJobs) {
        if (!job.enabled) continue;
        const nextRun = calcNextRun(job);
        if (nextRun && now >= nextRun) {
            const label = job.message || job.name;
            console.log(`[Scheduler] 🔔 Firing job: ${job.name} (${job.oneShot ? 'one-shot' : 'recurring'})`);
            queueNotification(`⏰ ${label}`, 'timer');
            // Fire native macOS notification
            fireNativeNotification(job.name, label);
            job.lastRun = now;
            job.runCount = (job.runCount || 0) + 1;

            if (job.oneShot) {
                // One-shot timer: disable after firing, mark for removal
                job.enabled = false;
                toRemove.push(job.id);
            } else {
                job.nextRun = calcNextRunAfterNow(job);
            }

            // Queue the command for client execution
            if (job.command) {
                queueNotification(`__CMD__:${job.command}`, 'command');
            }
            saveState();
        }
    }
    // Remove fired one-shot timers
    if (toRemove.length > 0) {
        state.scheduledJobs = state.scheduledJobs.filter(j => !toRemove.includes(j.id));
        saveState();
    }
}

function fireNativeNotification(title, message) {
    try {
        const cp = require('child_process');
        const escapedTitle = (title || 'Oni Timer').replace(/"/g, '\\"');
        const escapedMsg = (message || '').replace(/"/g, '\\"');
        const cmd = `osascript -e 'display notification "${escapedMsg}" with title "OniOS" subtitle "${escapedTitle}" sound name "Glass"'`;
        cp.execSync(cmd, { timeout: 5000 });
        console.log(`[Scheduler] 🔔 Native notification sent: ${title}`);
    } catch (err) {
        console.warn('[Scheduler] Native notification failed:', err.message);
    }
}

function calcNextRun(job) {
    if (job.nextRun) return job.nextRun;
    if (!job.lastRun) return Date.now();
    return calcNextRunFrom(job, job.lastRun);
}

function calcNextRunAfterNow(job) {
    return calcNextRunFrom(job, Date.now());
}

function calcNextRunFrom(job, fromTs) {
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

function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function checkTaskReminders() {
    const now = new Date();
    const nowStr = now.toISOString().split('T')[0];
    const nowTime = now.getHours().toString().padStart(2, '0') + ':' +
                    now.getMinutes().toString().padStart(2, '0');

    for (const task of state.tasks) {
        if (task.status === 'done' || task.status === 'cancelled') continue;
        if (!task.dueDate) continue;

        if (task.dueDate === nowStr && task.dueTime && !task.notifiedServer) {
            const dueMin = timeToMinutes(task.dueTime);
            const nowMin = timeToMinutes(nowTime);
            const diff = dueMin - nowMin;

            if (diff <= 5 && diff >= -1) {
                queueNotification(`📋 Task due now: ${task.title}`, 'warning');
                task.notifiedServer = true;
                saveState();
            } else if (diff <= 15 && diff > 5) {
                const key = `remind-15-${task.id}`;
                if (!notifiedKeys.has(key)) {
                    notifiedKeys.add(key);
                    queueNotification(`⏳ Task in ${diff} min: ${task.title}`, 'info');
                }
            }
        }

        if (task.dueDate === nowStr && !task.dueTime && !task.notifiedServer) {
            const hour = now.getHours();
            if (hour >= 8 && hour <= 9) {
                queueNotification(`📋 Task due today: ${task.title}`, 'info');
                task.notifiedServer = true;
                saveState();
            }
        }
    }
}

function checkOverdueTasks() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const overdue = state.tasks.filter(
        (t) => t.dueDate && t.dueDate < todayStr && t.status !== 'done' && t.status !== 'cancelled'
    );
    const hourKey = `overdue-${now.getHours()}-${todayStr}`;
    if (overdue.length > 0 && !notifiedKeys.has(hourKey)) {
        notifiedKeys.add(hourKey);
        if (overdue.length === 1) {
            queueNotification(`⚠️ Overdue: ${overdue[0].title}`, 'warning');
        } else {
            queueNotification(`⚠️ ${overdue.length} overdue tasks`, 'warning');
        }
    }
}

// ─── JSON Body Parser ──────────────────────────────────

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// ─── Plugin ────────────────────────────────────────────

export default function schedulerPlugin() {
    return {
        name: 'scheduler-api',
        configureServer(server) {
            // Load state from disk and start the scheduler
            loadState();

            if (!schedulerInterval) {
                schedulerInterval = setInterval(tick, 15000);
                // First tick after 3 seconds (let server fully start)
                setTimeout(tick, 3000);
                console.log('[Scheduler] Server-side scheduler started (15s tick)');
            }

            // ─── GET /api/scheduler/state ──────────────

            server.middlewares.use('/api/scheduler/state', (req, res, next) => {
                if (req.method !== 'GET') return next();
                json(res, {
                    tasks: state.tasks,
                    events: state.events,
                    scheduledJobs: state.scheduledJobs,
                    schedulerRunning: !!schedulerInterval,
                    tickCount,
                });
            });

            // ─── GET /api/scheduler/status ─────────────

            server.middlewares.use('/api/scheduler/status', (req, res, next) => {
                if (req.method !== 'GET') return next();
                json(res, {
                    running: !!schedulerInterval,
                    tickCount,
                    tasks: state.tasks.length,
                    events: state.events.length,
                    jobs: state.scheduledJobs.length,
                    enabledJobs: state.scheduledJobs.filter((j) => j.enabled).length,
                    queuedNotifications: state.notifications.length,
                    dataFile: DATA_FILE,
                });
            });

            // ─── GET /api/scheduler/notifications ──────
            // Returns queued notifications and clears them

            server.middlewares.use('/api/scheduler/notifications', (req, res, next) => {
                if (req.method !== 'GET') return next();
                const notifications = [...state.notifications];
                state.notifications = [];
                json(res, { notifications });
            });

            // ─── POST /api/scheduler/sync ──────────────
            // Client pushes its full state to the server

            server.middlewares.use('/api/scheduler/sync', async (req, res, next) => {
                if (req.method !== 'POST') return next();
                try {
                    const body = await parseBody(req);
                    if (body.tasks) state.tasks = body.tasks;
                    if (body.events) state.events = body.events;
                    if (body.scheduledJobs) state.scheduledJobs = body.scheduledJobs;
                    saveState();
                    json(res, { ok: true, saved: true });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── TASKS CRUD ───────────────────────────

            server.middlewares.use('/api/scheduler/tasks', async (req, res, next) => {
                const url = new URL(req.url, 'http://localhost');
                const idParam = url.pathname.replace(/^\//, '').split('/')[0] || null;

                if (req.method === 'GET') {
                    json(res, { tasks: state.tasks });
                    return;
                }

                if (req.method === 'POST' && !idParam) {
                    try {
                        const body = await parseBody(req);
                        const task = {
                            id: nanoid(10),
                            title: body.title || 'Untitled',
                            description: body.description || '',
                            status: body.status || 'todo',
                            priority: body.priority || 'medium',
                            dueDate: body.dueDate || null,
                            dueTime: body.dueTime || null,
                            createdAt: Date.now(),
                            completedAt: null,
                            tags: body.tags || [],
                            category: body.category || 'general',
                            recurring: body.recurring || null,
                            notifiedServer: false,
                        };
                        state.tasks.push(task);
                        saveState();
                        json(res, { task }, 201);
                    } catch (err) {
                        json(res, { error: err.message }, 400);
                    }
                    return;
                }

                if (req.method === 'PUT' && idParam) {
                    try {
                        const body = await parseBody(req);
                        const idx = state.tasks.findIndex((t) => t.id === idParam);
                        if (idx === -1) return json(res, { error: 'Not found' }, 404);
                        state.tasks[idx] = { ...state.tasks[idx], ...body };
                        saveState();
                        json(res, { task: state.tasks[idx] });
                    } catch (err) {
                        json(res, { error: err.message }, 400);
                    }
                    return;
                }

                if (req.method === 'DELETE' && idParam) {
                    const idx = state.tasks.findIndex((t) => t.id === idParam);
                    if (idx === -1) return json(res, { error: 'Not found' }, 404);
                    state.tasks.splice(idx, 1);
                    saveState();
                    json(res, { ok: true });
                    return;
                }

                next();
            });

            // ─── EVENTS CRUD ──────────────────────────

            server.middlewares.use('/api/scheduler/events', async (req, res, next) => {
                const url = new URL(req.url, 'http://localhost');
                const idParam = url.pathname.replace(/^\//, '').split('/')[0] || null;

                if (req.method === 'GET') {
                    json(res, { events: state.events });
                    return;
                }

                if (req.method === 'POST' && !idParam) {
                    try {
                        const body = await parseBody(req);
                        const event = {
                            id: nanoid(10),
                            title: body.title || 'Untitled',
                            description: body.description || '',
                            date: body.date,
                            startTime: body.startTime || null,
                            endTime: body.endTime || null,
                            allDay: body.allDay || false,
                            color: body.color || '#3b82f6',
                            recurring: body.recurring || null,
                            createdAt: Date.now(),
                        };
                        state.events.push(event);
                        saveState();
                        json(res, { event }, 201);
                    } catch (err) {
                        json(res, { error: err.message }, 400);
                    }
                    return;
                }

                if (req.method === 'PUT' && idParam) {
                    try {
                        const body = await parseBody(req);
                        const idx = state.events.findIndex((e) => e.id === idParam);
                        if (idx === -1) return json(res, { error: 'Not found' }, 404);
                        state.events[idx] = { ...state.events[idx], ...body };
                        saveState();
                        json(res, { event: state.events[idx] });
                    } catch (err) {
                        json(res, { error: err.message }, 400);
                    }
                    return;
                }

                if (req.method === 'DELETE' && idParam) {
                    const idx = state.events.findIndex((e) => e.id === idParam);
                    if (idx === -1) return json(res, { error: 'Not found' }, 404);
                    state.events.splice(idx, 1);
                    saveState();
                    json(res, { ok: true });
                    return;
                }

                next();
            });

            // ─── JOBS CRUD ────────────────────────────

            server.middlewares.use('/api/scheduler/jobs', async (req, res, next) => {
                const url = new URL(req.url, 'http://localhost');
                const idParam = url.pathname.replace(/^\//, '').split('/')[0] || null;

                if (req.method === 'GET') {
                    json(res, { jobs: state.scheduledJobs });
                    return;
                }

                if (req.method === 'POST' && !idParam) {
                    try {
                        const body = await parseBody(req);
                        const job = {
                            id: nanoid(10),
                            name: body.name || 'Unnamed Job',
                            command: body.command,
                            schedule: body.schedule || { interval: 1, unit: 'hours' },
                            enabled: body.enabled !== false,
                            lastRun: null,
                            nextRun: null,
                            runCount: 0,
                            createdAt: Date.now(),
                        };
                        state.scheduledJobs.push(job);
                        saveState();
                        json(res, { job }, 201);
                    } catch (err) {
                        json(res, { error: err.message }, 400);
                    }
                    return;
                }

                if (req.method === 'PUT' && idParam) {
                    try {
                        const body = await parseBody(req);
                        const idx = state.scheduledJobs.findIndex((j) => j.id === idParam);
                        if (idx === -1) return json(res, { error: 'Not found' }, 404);
                        state.scheduledJobs[idx] = { ...state.scheduledJobs[idx], ...body };
                        saveState();
                        json(res, { job: state.scheduledJobs[idx] });
                    } catch (err) {
                        json(res, { error: err.message }, 400);
                    }
                    return;
                }

                if (req.method === 'DELETE' && idParam) {
                    const idx = state.scheduledJobs.findIndex((j) => j.id === idParam);
                    if (idx === -1) return json(res, { error: 'Not found' }, 404);
                    state.scheduledJobs.splice(idx, 1);
                    saveState();
                    json(res, { ok: true });
                    return;
                }

                next();
            });
        },
    };
}
