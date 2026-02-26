/**
 * WorkflowEngine — Executes workflow graphs step-by-step.
 *
 * Key concepts:
 * - DATA FLOWS downstream: every node receives the output of its upstream node
 *   as `input`. The condition node gates which branch runs but passes the
 *   ORIGINAL input through (not "true"/"false").
 * - AUTO-LISTEN: workflows with event triggers auto-subscribe to those events.
 *   When the event fires, the workflow executes with the event data as input.
 * - CONNECTION LABELS: connections from condition nodes carry a `label` field
 *   ("true" or "false") that the engine uses for branch routing.
 * - EXECUTION LOGS: every step is logged to workflowStore.executionLogs with
 *   timestamps, node info, input/output, and errors.
 */

import { commandRegistry } from './CommandRegistry.js';
import { eventBus } from './EventBus.js';
import useWorkflowStore from '../stores/workflowStore.js';
import useNotificationStore from '../stores/notificationStore.js';

// ─── All known kernel events (for UI dropdowns + auto-listen) ─────

export const KNOWN_EVENTS = [
    // ── Task lifecycle ──
    {
        name: 'task:created', category: 'Tasks',
        desc: 'Fires when a new task is created via the Task Manager',
        payload: '{ id, title, description, priority, status, dueDate }',
        example: '{ id: "abc", title: "Fix login", priority: "high", status: "todo" }',
    },
    {
        name: 'task:updated', category: 'Tasks',
        desc: 'Fires when any task field is modified (title, status, priority, etc.)',
        payload: '{ id, title, ...updatedFields }',
        example: '{ id: "abc", title: "Fix login", status: "in-progress" }',
    },
    {
        name: 'task:deleted', category: 'Tasks',
        desc: 'Fires when a task is permanently deleted',
        payload: '{ id, title }',
        example: '{ id: "abc", title: "Fix login" }',
    },
    {
        name: 'task:completed', category: 'Tasks',
        desc: 'Fires when a task status is set to "done" or "completed"',
        payload: '{ id, title, completedAt }',
        example: '{ id: "abc", title: "Fix login", completedAt: 1708750000000 }',
    },
    {
        name: 'task:due', category: 'Tasks',
        desc: 'Fires when a task\'s due date/time is reached (checked every 15s)',
        payload: '{ id, title, dueDate }',
        example: '{ id: "abc", title: "Review PR", dueDate: "2026-02-24T10:00:00Z" }',
    },
    {
        name: 'tasks:overdue', category: 'Tasks',
        desc: 'Fires periodically with a list of all tasks past their due date',
        payload: '[{ id, title, dueDate }, ...]',
        example: '[{ id: "abc", title: "Deploy v2", dueDate: "2026-02-23" }]',
    },
    // ── Calendar ──
    {
        name: 'event:created', category: 'Calendar',
        desc: 'Fires when a calendar event is created',
        payload: '{ id, title, start, end }',
        example: '{ id: "evt1", title: "Standup", start: "2026-02-24T09:00" }',
    },
    // ── Scheduler / Jobs ──
    {
        name: 'job:created', category: 'Scheduler',
        desc: 'Fires when a new scheduled job (cron/interval) is registered',
        payload: '{ id, name, interval }',
        example: '{ id: "job1", name: "Backup DB", interval: "1h" }',
    },
    {
        name: 'scheduler:job:fired', category: 'Scheduler',
        desc: 'Fires every time a scheduled job executes its tick',
        payload: '{ jobId, name, firedAt }',
        example: '{ jobId: "job1", name: "Backup DB", firedAt: 1708750000000 }',
    },
    {
        name: 'scheduler:notification', category: 'Scheduler',
        desc: 'Fires when the scheduler emits a notification (reminders, alerts)',
        payload: '{ message, type }',
        example: '{ message: "Task due in 5 min", type: "warning" }',
    },
    // ── Commands ──
    {
        name: 'command:executed', category: 'Commands',
        desc: 'Fires after any command finishes executing successfully',
        payload: '{ path, args, result }',
        example: '{ path: "system.notify", args: ["hello"], result: "OK" }',
    },
    {
        name: 'command:error', category: 'Commands',
        desc: 'Fires when a command throws an error or is not found',
        payload: '{ raw, error }',
        example: '{ raw: "bad.command()", error: "Command not found" }',
    },
    // ── Command Runs ──
    {
        name: 'run:created', category: 'Runs',
        desc: 'Fires when a command run is queued (before execution starts)',
        payload: '{ runId, commandPath }',
        example: '{ runId: "run_abc", commandPath: "system.windows.list" }',
    },
    {
        name: 'run:resolved', category: 'Runs',
        desc: 'Fires when a command run completes successfully with output',
        payload: '{ runId, output }',
        example: '{ runId: "run_abc", output: { value: [...], type: "list" } }',
    },
    {
        name: 'run:rejected', category: 'Runs',
        desc: 'Fires when a command run fails with an error',
        payload: '{ runId, error }',
        example: '{ runId: "run_abc", error: "Permission denied" }',
    },
    // ── Documents ──
    {
        name: 'document:opened', category: 'Documents',
        desc: 'Fires when a document is loaded in the Document Viewer',
        payload: '{ path, meta: { name, ext, size, pages } }',
        example: '{ path: "/Users/me/report.pdf", meta: { name: "report.pdf", pages: 5 } }',
    },
    // ── Windows ──
    {
        name: 'window:opened', category: 'Windows',
        desc: 'Fires when a new window/widget is opened',
        payload: '{ id, widgetType, title }',
        example: '{ id: "abc123", widgetType: "terminal", title: "Terminal" }',
    },
    {
        name: 'window:closed', category: 'Windows',
        desc: 'Fires when a window is closed',
        payload: '{ id, widgetType, title }',
        example: '{ id: "abc123", widgetType: "terminal", title: "Terminal" }',
    },
    {
        name: 'window:focused', category: 'Windows',
        desc: 'Fires when a window is focused/brought to front',
        payload: '{ id, widgetType, title }',
        example: '{ id: "abc123", widgetType: "file-explorer", title: "Files" }',
    },
    {
        name: 'window:minimized', category: 'Windows',
        desc: 'Fires when a window is minimized to the taskbar',
        payload: '{ id, widgetType, title }',
        example: '{ id: "abc123", widgetType: "browser", title: "Browser" }',
    },
    {
        name: 'window:maximized', category: 'Windows',
        desc: 'Fires when a window is maximized to full screen',
        payload: '{ id, widgetType, title }',
        example: '{ id: "abc123", widgetType: "code-editor", title: "Code Editor" }',
    },
    {
        name: 'window:restored', category: 'Windows',
        desc: 'Fires when a maximized window is restored to its original size',
        payload: '{ id, widgetType, title }',
        example: '{ id: "abc123", widgetType: "notes", title: "Notes" }',
    },
    // ── Desktops ──
    {
        name: 'desktop:switched', category: 'Desktops',
        desc: 'Fires when the user switches to a different virtual desktop',
        payload: '{ id, name, previousId }',
        example: '{ id: "desktop-2", name: "Desktop 2", previousId: "desktop-1" }',
    },
    {
        name: 'desktop:added', category: 'Desktops',
        desc: 'Fires when a new virtual desktop is created',
        payload: '{ id, name }',
        example: '{ id: "desktop-abc", name: "Desktop 3" }',
    },
    {
        name: 'desktop:removed', category: 'Desktops',
        desc: 'Fires when a virtual desktop is removed (windows moved to fallback)',
        payload: '{ id, name, movedTo }',
        example: '{ id: "desktop-abc", name: "Desktop 3", movedTo: "desktop-1" }',
    },
    {
        name: 'desktop:renamed', category: 'Desktops',
        desc: 'Fires when a virtual desktop is renamed',
        payload: '{ id, name }',
        example: '{ id: "desktop-1", name: "Work" }',
    },
    // ── Notifications ──
    {
        name: 'notification:created', category: 'Notifications',
        desc: 'Fires when a toast notification is shown to the user',
        payload: '{ id, message, type, timestamp }',
        example: '{ id: "n1", message: "Task completed!", type: "success", timestamp: 1708750000000 }',
    },
    // ── Theme / Appearance ──
    {
        name: 'theme:changed', category: 'Appearance',
        desc: 'Fires when the user switches between dark and light theme',
        payload: '{ theme }',
        example: '{ theme: "light" }',
    },
    {
        name: 'wallpaper:changed', category: 'Appearance',
        desc: 'Fires when the desktop wallpaper is changed',
        payload: '{ wallpaper }',
        example: '{ wallpaper: "gradient-ocean" }',
    },
    // ── Workflows (lifecycle) ──
    {
        name: 'workflow:created', category: 'Workflows',
        desc: 'Fires when a new workflow is created in the builder',
        payload: '{ id, name, nodeCount }',
        example: '{ id: "wf123", name: "Daily Report", nodeCount: 3 }',
    },
    {
        name: 'workflow:deleted', category: 'Workflows',
        desc: 'Fires when a workflow is permanently deleted',
        payload: '{ id, name }',
        example: '{ id: "wf123", name: "Daily Report" }',
    },
    {
        name: 'workflow:toggled', category: 'Workflows',
        desc: 'Fires when a workflow is enabled or disabled',
        payload: '{ id, name, enabled }',
        example: '{ id: "wf123", name: "Daily Report", enabled: false }',
    },
    {
        name: 'workflow:started', category: 'Workflows',
        desc: 'Fires when any workflow begins executing',
        payload: '{ wfId, name }',
        example: '{ wfId: "wf123", name: "Daily Report" }',
    },
    {
        name: 'workflow:completed', category: 'Workflows',
        desc: 'Fires when a workflow finishes (success or with errors)',
        payload: '{ wfId, status, errors }',
        example: '{ wfId: "wf123", status: "completed", errors: [] }',
    },
    {
        name: 'workflow:error', category: 'Workflows',
        desc: 'Fires when a workflow crashes with an unhandled error',
        payload: '{ wfId, error }',
        example: '{ wfId: "wf123", error: "Trigger node not found" }',
    },
    // ── System Heartbeat ──
    {
        name: 'system:heartbeat', category: 'System',
        desc: 'Fires every 30 minutes with a full health check — pending tasks, overdue items, system status',
        payload: '{ timestamp, uptime, health, pending: { tasks, overdue, dueToday }, system: { windows, desktops, scheduledJobs, activeWorkflows }, summary }',
        example: '{ health: "healthy", pending: { tasks: 5, overdue: 1, dueToday: 2 }, summary: "⚠️ 1 overdue · 📅 2 due today · 📋 5 pending tasks" }',
    },
    {
        name: 'system:boot', category: 'System',
        desc: 'Fires once when OniOS finishes initializing (all stores hydrated, commands registered)',
        payload: '{ timestamp, windowCount, workflowCount }',
        example: '{ timestamp: 1708750000000, windowCount: 3, workflowCount: 2 }',
    },
];

class WorkflowEngine {
    constructor() {
        this._running = new Map(); // wfId → { aborted }
        this._listeners = new Map(); // eventName → [{ wfId, handler }]
        this._initialized = false;
    }

    // ─── Auto-Listen for Event Triggers ────────────────

    /**
     * Scan all workflows for event triggers and subscribe to those events.
     * Call this on app init and whenever workflows change.
     */
    initListeners() {
        this.stopListeners();
        const store = useWorkflowStore.getState();

        for (const wf of store.workflows) {
            if (!wf.enabled) continue;
            for (const node of wf.nodes) {
                if (node.type === 'trigger' && node.config?.triggerType === 'event' && node.config?.eventName) {
                    this._subscribeEvent(wf.id, node.config.eventName);
                }
            }
        }

        this._initialized = true;
        const count = Array.from(this._listeners.values()).reduce((a, b) => a + b.length, 0);
        if (count > 0) {
            console.log(`[WorkflowEngine] Listening to ${count} event trigger(s) across ${this._listeners.size} event type(s)`);
        }
    }

    _subscribeEvent(wfId, eventName) {
        const handler = (data) => {
            // Don't re-trigger if already running
            if (this._running.has(wfId)) return;
            console.log(`[WorkflowEngine] Event "${eventName}" fired → executing workflow ${wfId}`);
            this.execute(wfId, data);
        };

        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, []);
        }
        this._listeners.get(eventName).push({ wfId, handler });
        eventBus.on(eventName, handler);
    }

    stopListeners() {
        for (const [eventName, entries] of this._listeners) {
            for (const { handler } of entries) {
                eventBus.off(eventName, handler);
            }
        }
        this._listeners.clear();
        this._initialized = false;
    }

    // ─── Logging helper ─────────────────────────────────

    _log(wfId, level, message, data = {}) {
        const store = useWorkflowStore.getState();
        store.addLog(wfId, { level, message, ...data });
    }

    // ─── Execute ───────────────────────────────────────

    /**
     * Execute a workflow by ID.
     * @param {string} wfId
     * @param {any} triggerInput — optional input to the trigger node (event data, manual input, etc.)
     * @returns {{ success, error?, status }}
     */
    async execute(wfId, triggerInput = null) {
        const store = useWorkflowStore.getState();
        const wf = store.getWorkflow(wfId);
        if (!wf) return { success: false, error: 'Workflow not found' };

        // Abort any existing run
        if (this._running.has(wfId)) {
            this._running.get(wfId).aborted = true;
        }

        const ctx = { aborted: false, errors: [], startedAt: Date.now() };
        this._running.set(wfId, ctx);

        store.clearLogs(wfId);
        store.resetNodeStates(wfId);
        store.updateWorkflow(wfId, { lastRunAt: Date.now(), lastRunStatus: 'running' });

        this._log(wfId, 'info', `▶ Workflow "${wf.name}" started`, { nodeCount: wf.nodes.length });
        eventBus.emit('workflow:started', { wfId, name: wf.name });

        try {
            const triggerNodes = wf.nodes.filter((n) => n.type === 'trigger');
            if (triggerNodes.length === 0) {
                this._log(wfId, 'error', '✗ No trigger node found — cannot execute');
                store.updateWorkflow(wfId, { lastRunStatus: 'error' });
                return { success: false, error: 'No trigger node found' };
            }

            for (const trigger of triggerNodes) {
                if (ctx.aborted) break;
                await this._executeNode(wfId, trigger.id, triggerInput, ctx);
            }

            const elapsed = Date.now() - ctx.startedAt;
            const hasErrors = ctx.errors.length > 0;
            const finalStatus = ctx.aborted ? 'aborted' : hasErrors ? 'completed_with_errors' : 'completed';

            if (ctx.aborted) {
                this._log(wfId, 'warn', `⏹ Workflow aborted after ${elapsed}ms`);
            } else if (hasErrors) {
                this._log(wfId, 'warn', `⚠ Workflow completed with ${ctx.errors.length} error(s) in ${elapsed}ms`, { errors: ctx.errors });
            } else {
                this._log(wfId, 'success', `✓ Workflow completed successfully in ${elapsed}ms`);
            }

            store.updateWorkflow(wfId, { lastRunStatus: finalStatus });
            eventBus.emit('workflow:completed', { wfId, status: finalStatus, errors: ctx.errors });
            this._running.delete(wfId);
            return { success: !ctx.aborted, status: finalStatus, errors: ctx.errors };
        } catch (err) {
            const elapsed = Date.now() - ctx.startedAt;
            this._log(wfId, 'error', `✗ Workflow crashed after ${elapsed}ms: ${err.message}`);
            store.updateWorkflow(wfId, { lastRunStatus: 'error' });
            eventBus.emit('workflow:error', { wfId, error: err.message });
            this._running.delete(wfId);
            return { success: false, error: err.message };
        }
    }

    abort(wfId) {
        const ctx = this._running.get(wfId);
        if (ctx) {
            ctx.aborted = true;
            this._log(wfId, 'warn', '⏹ Abort requested');
            useWorkflowStore.getState().updateWorkflow(wfId, { lastRunStatus: 'aborted' });
            eventBus.emit('workflow:aborted', { wfId });
        }
    }

    isRunning(wfId) {
        return this._running.has(wfId);
    }

    // ─── Node Execution ────────────────────────────────

    async _executeNode(wfId, nodeId, input, ctx) {
        if (ctx.aborted) return null;

        const store = useWorkflowStore.getState();
        const wf = store.getWorkflow(wfId);
        if (!wf) return null;
        const node = wf.nodes.find((n) => n.id === nodeId);
        if (!node) return null;

        // Skip if already completed in this run
        if (node.status === 'resolved' || node.status === 'rejected') return node.output;

        const nodeStart = Date.now();

        // Store the incoming input on the node so the UI can show data flow
        store.updateNode(wfId, nodeId, { status: 'running', input });

        this._log(wfId, 'info', `→ [${node.type}] "${node.label}" started`, {
            nodeId, nodeType: node.type,
            input: this._summarize(input),
        });

        let output = null;

        try {
            switch (node.type) {
                case 'trigger':
                    output = this._execTrigger(node, input);
                    break;
                case 'command':
                    output = await this._execCommandNode(node, input);
                    break;
                case 'condition':
                    output = this._evalCondition(node, input);
                    break;
                case 'delay':
                    output = await this._execDelay(node, input, ctx);
                    break;
                case 'output':
                    output = this._execOutputNode(node, input);
                    break;
                case 'http':
                    output = await this._execHttpNode(node, input, ctx);
                    break;
                case 'mcp':
                    output = await this._execMcpNode(node, input);
                    break;
                case 'ai':
                    output = await this._execAiNode(node, input);
                    break;
                default:
                    output = input;
            }

            const elapsed = Date.now() - nodeStart;
            store.updateNode(wfId, nodeId, { status: 'resolved', output });

            this._log(wfId, 'success', `✓ [${node.type}] "${node.label}" resolved (${elapsed}ms)`, {
                nodeId, nodeType: node.type,
                output: this._summarize(output),
            });
        } catch (err) {
            const elapsed = Date.now() - nodeStart;
            const errMsg = err.message || String(err);
            store.updateNode(wfId, nodeId, { status: 'rejected', output: errMsg });
            ctx.errors.push({ nodeId, label: node.label, error: errMsg });

            this._log(wfId, 'error', `✗ [${node.type}] "${node.label}" failed (${elapsed}ms): ${errMsg}`, {
                nodeId, nodeType: node.type,
            });
            // Don't propagate — skip downstream of this failed node
            return null;
        }

        // Execute downstream nodes
        if (ctx.aborted) return output;

        if (node.type === 'condition' || (node.type === 'ai' && node.config?.mode === 'decide')) {
            // Condition gates branches but passes ORIGINAL input downstream
            await this._followConditionBranches(wfId, nodeId, output, input, ctx);
        } else {
            const downstream = store.getDownstream(wfId, nodeId);
            for (const next of downstream) {
                if (ctx.aborted) break;
                await this._executeNode(wfId, next.id, output, ctx);
            }
        }

        return output;
    }

    /** Truncate data for log display */
    _summarize(val) {
        if (val === null || val === undefined) return null;
        if (typeof val === 'string') return val.length > 120 ? val.substring(0, 120) + '…' : val;
        try {
            const s = JSON.stringify(val);
            return s.length > 200 ? s.substring(0, 200) + '…' : s;
        } catch { return String(val); }
    }

    // ─── Node Type Executors ───────────────────────────

    _execTrigger(node, input) {
        const cfg = node.config || {};
        // For event triggers, input is the event data
        if (cfg.triggerType === 'event' && input && input !== 'triggered') {
            // Wrap event data with metadata
            return typeof input === 'object'
                ? { _event: cfg.eventName, ...input }
                : { _event: cfg.eventName, data: input };
        }
        // Manual trigger
        return input ?? { _trigger: 'manual', timestamp: Date.now() };
    }

    async _execCommandNode(node, input) {
        const cfg = node.config || {};
        let commandStr = cfg.command || '';

        if (!commandStr) throw new Error('No command configured');

        // Replace {{input}} with actual input value
        if (input !== null && input !== undefined) {
            const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
            commandStr = commandStr.replace(/\{\{input\}\}/g, inputStr);
        }

        const handle = commandRegistry.execute(commandStr, 'workflow');
        const run = await handle.await();

        if (!run) throw new Error(`No result from: ${commandStr}`);
        if (run.status === 'rejected') throw new Error(run.error || `Failed: ${commandStr}`);

        return run.output !== undefined ? run.output : `Done: ${commandStr}`;
    }

    _evalCondition(node, input) {
        const cfg = node.config || {};
        const field = cfg.field || '';
        const op = cfg.operator || 'exists';
        const compareValue = cfg.value ?? '';

        // Extract the actual value to compare — supports deep dot-notation paths
        let actual = input;
        if (field && input != null) {
            // Use resolvePath for deep access (e.g. "data.id", "items[0].name", ".length")
            const parts = field.split(/\.|\[(\d+)\]/).filter(Boolean);
            let cursor = input;
            for (const part of parts) {
                if (cursor == null) { cursor = undefined; break; }
                cursor = /^\d+$/.test(part) ? (Array.isArray(cursor) ? cursor[Number(part)] : undefined) : cursor[part];
            }
            actual = cursor;
        }

        const actualStr = String(actual ?? '');
        const compareStr = String(compareValue);

        let result;
        switch (op) {
            case 'equals': result = actualStr === compareStr; break;
            case 'notEquals': result = actualStr !== compareStr; break;
            case 'contains': result = actualStr.includes(compareStr); break;
            case 'notContains': result = !actualStr.includes(compareStr); break;
            case 'greaterThan': result = Number(actual) > Number(compareValue); break;
            case 'lessThan': result = Number(actual) < Number(compareValue); break;
            case 'exists': result = actual !== null && actual !== undefined && actual !== ''; break;
            case 'empty': result = !actual || actual === ''; break;
            default: result = true;
        }

        // Return structured result so UI can show what was compared
        return {
            _condition: true,
            result,
            operator: op,
            actual: actualStr.substring(0, 100),
            expected: compareStr.substring(0, 100),
            field: field || '(input)',
        };
    }

    async _followConditionBranches(wfId, nodeId, conditionOutput, originalInput, ctx) {
        const store = useWorkflowStore.getState();
        const wf = store.getWorkflow(wfId);
        if (!wf) return;

        const result = conditionOutput?.result ?? true;

        // Get connections FROM this condition node
        const connections = wf.connections.filter((c) => c.from === nodeId);

        if (connections.length === 0) return;

        // If only one connection, always follow it
        if (connections.length === 1) {
            const next = wf.nodes.find((n) => n.id === connections[0].to);
            if (next && !ctx.aborted) {
                await this._executeNode(wfId, next.id, originalInput, ctx);
            }
            return;
        }

        // Multiple connections: route by connection label OR node label
        for (const conn of connections) {
            if (ctx.aborted) break;
            const next = wf.nodes.find((n) => n.id === conn.to);
            if (!next) continue;

            const connLabel = (conn.label || '').toLowerCase();
            const nodeLabel = (next.label || '').toLowerCase();
            const isTrueBranch =
                connLabel === 'true' || connLabel === 'yes' ||
                nodeLabel.includes('true') || nodeLabel.includes('yes') || nodeLabel.includes('then');
            const isFalseBranch =
                connLabel === 'false' || connLabel === 'no' ||
                nodeLabel.includes('false') || nodeLabel.includes('no') || nodeLabel.includes('else');

            if (result && (isTrueBranch || (!isTrueBranch && !isFalseBranch))) {
                await this._executeNode(wfId, next.id, originalInput, ctx);
            } else if (!result && (isFalseBranch || (!isTrueBranch && !isFalseBranch))) {
                await this._executeNode(wfId, next.id, originalInput, ctx);
            }
        }
    }

    async _execDelay(node, input, ctx) {
        const seconds = Number(node.config?.seconds) || 1;
        const ms = seconds * 1000;
        await new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
                if (ctx.aborted || Date.now() - start >= ms) resolve();
                else setTimeout(check, 200);
            };
            check();
        });
        // Pass input through — delay doesn't transform data
        return input;
    }

    // ─── HTTP Node Executor ────────────────────────────

    async _execHttpNode(node, input, ctx) {
        const cfg = node.config || {};
        const method = (cfg.method || 'GET').toUpperCase();
        let url = cfg.url || '';
        if (!url) throw new Error('No URL configured');

        // Interpolate {{input}} and {{input.field}} in URL, body, headers
        const interpolate = (str) => {
            if (!str || typeof str !== 'string') return str;
            return str.replace(/\{\{input(?:\.([^}]+))?\}\}/g, (_, path) => {
                if (!path) return typeof input === 'string' ? input : JSON.stringify(input ?? '');
                return String(this._resolvePath(input, path) ?? '');
            });
        };

        url = interpolate(url);

        // Build headers
        const headers = {};
        (cfg.headers || []).forEach(h => {
            if (h.key) headers[interpolate(h.key)] = interpolate(h.value);
        });

        // Auth
        if (cfg.authType === 'bearer' && cfg.authToken) {
            headers['Authorization'] = `Bearer ${cfg.authToken}`;
        } else if (cfg.authType === 'basic' && cfg.authUser) {
            headers['Authorization'] = `Basic ${btoa(`${cfg.authUser}:${cfg.authPass || ''}`)}`;
        } else if (cfg.authType === 'apikey' && cfg.authToken) {
            headers[cfg.authHeaderName || 'X-API-Key'] = cfg.authToken;
        }

        // Build fetch options
        const fetchOpts = { method, headers };
        if (['POST', 'PUT', 'PATCH'].includes(method) && cfg.body) {
            const bodyStr = interpolate(cfg.body);
            fetchOpts.body = bodyStr;
            if (!headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            }
        }

        // Timeout via AbortController
        const timeout = (Number(cfg.timeout) || 30) * 1000;
        const controller = new AbortController();
        fetchOpts.signal = controller.signal;
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            const res = await fetch(url, fetchOpts);
            clearTimeout(timer);

            const contentType = res.headers.get('content-type') || '';
            let body;
            if (contentType.includes('application/json')) {
                body = await res.json();
            } else {
                body = await res.text();
            }

            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}: ${typeof body === 'string' ? body.substring(0, 200) : JSON.stringify(body).substring(0, 200)}`);
            }

            // Extract response path if configured
            if (cfg.responsePath && typeof body === 'object') {
                body = this._resolvePath(body, cfg.responsePath) ?? body;
            }

            return {
                _http: true,
                status: res.status,
                statusText: res.statusText,
                url,
                method,
                data: body,
            };
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') {
                throw new Error(`HTTP request timed out after ${cfg.timeout || 30}s`);
            }
            throw err;
        }
    }

    // ─── MCP Node Executor ─────────────────────────────

    async _execMcpNode(node, input) {
        const cfg = node.config || {};
        if (!cfg.serverName) throw new Error('No MCP server configured');
        if (!cfg.toolName) throw new Error('No MCP tool configured');

        // Resolve input mapping — interpolate {{input.field}} in param values
        let params = cfg.inputMapping || {};
        if (typeof params === 'string') {
            try { params = JSON.parse(params); } catch { params = {}; }
        }

        const resolvedParams = {};
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
                resolvedParams[key] = value.replace(/\{\{input(?:\.([^}]+))?\}\}/g, (_, path) => {
                    if (!path) return typeof input === 'string' ? input : JSON.stringify(input ?? '');
                    return String(this._resolvePath(input, path) ?? '');
                });
            } else {
                resolvedParams[key] = value;
            }
        }

        // Call server-side MCP proxy
        const res = await fetch('/api/mcp/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                server: cfg.serverName,
                tool: cfg.toolName,
                arguments: resolvedParams,
            }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error || `MCP call failed: ${res.status}`);
        }

        let output = data.result ?? data;

        // Extract output path if configured
        if (cfg.outputPath && typeof output === 'object') {
            output = this._resolvePath(output, cfg.outputPath) ?? output;
        }

        return {
            _mcp: true,
            server: cfg.serverName,
            tool: cfg.toolName,
            data: output,
        };
    }

    // ─── AI Node Executor ──────────────────────────────

    async _execAiNode(node, input) {
        const cfg = node.config || {};
        if (!cfg.prompt) throw new Error('No prompt configured');

        const apiUrl = cfg.apiUrl || '';
        const apiKey = cfg.apiKey || '';
        const model = cfg.model || 'gpt-4o-mini';
        const mode = cfg.mode || 'transform';
        const temperature = cfg.temperature ?? 0.7;
        const outputFormat = cfg.outputFormat || 'json';

        if (!apiUrl) throw new Error('No AI API endpoint configured. Set the API URL in the node config.');
        if (!apiKey) throw new Error('No API key configured. Set the API Key in the node config.');

        // Build the system prompt based on mode
        const modeInstructions = {
            transform: 'You are a data transformation assistant. Transform the input data according to the user\'s instructions. Return ONLY the transformed data.',
            classify: 'You are a classification assistant. Classify the input into the categories specified. Return a JSON object with "category" and "confidence" fields.',
            extract: 'You are a data extraction assistant. Extract the requested fields from the input. Return a JSON object with the extracted fields.',
            decide: 'You are a decision assistant. Analyze the input and decide true or false based on the criteria. Return a JSON object: {"result": true/false, "reason": "..."}',
            generate: 'You are a content generation assistant. Generate content based on the prompt and input data.',
            summarize: 'You are a summarization assistant. Summarize the input data concisely.',
        };

        const systemPrompt = modeInstructions[mode] || modeInstructions.transform;
        const jsonInstruction = outputFormat === 'json'
            ? '\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no explanation — just the JSON object.'
            : '';

        const inputStr = typeof input === 'string' ? input : JSON.stringify(input ?? '', null, 2);
        const userMessage = `${cfg.prompt}\n\nInput data:\n${inputStr}`;

        const body = {
            model,
            messages: [
                { role: 'system', content: systemPrompt + jsonInstruction },
                { role: 'user', content: userMessage },
            ],
            temperature,
        };

        if (outputFormat === 'json') {
            body.response_format = { type: 'json_object' };
        }

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok) {
            const errMsg = data.error?.message || data.error || JSON.stringify(data).substring(0, 200);
            throw new Error(`AI API error (${res.status}): ${errMsg}`);
        }

        const content = data.choices?.[0]?.message?.content || data.content || '';

        // Parse JSON if expected
        let parsed = content;
        if (outputFormat === 'json') {
            try {
                parsed = JSON.parse(content);
            } catch {
                // Try extracting JSON from markdown code fence
                const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (match) {
                    try { parsed = JSON.parse(match[1].trim()); } catch { /* keep as string */ }
                }
            }
        }

        // For decide mode, ensure structured output for branch routing
        if (mode === 'decide') {
            const result = typeof parsed === 'object' ? parsed.result : String(parsed).toLowerCase().includes('true');
            return {
                _condition: true,
                _ai: true,
                result: Boolean(result),
                reason: typeof parsed === 'object' ? parsed.reason : content,
                model,
                mode,
            };
        }

        return {
            _ai: true,
            mode,
            model,
            data: parsed,
            rawContent: content,
        };
    }

    // ─── Deep Path Resolution Helper ──────────────────

    _resolvePath(obj, path) {
        if (!path || obj == null) return obj;
        const parts = path.split(/\.|\[(\d+)\]/).filter(Boolean);
        let cursor = obj;
        for (const part of parts) {
            if (cursor == null) return undefined;
            cursor = /^\d+$/.test(part) ? (Array.isArray(cursor) ? cursor[Number(part)] : undefined) : cursor[part];
        }
        return cursor;
    }

    _execOutputNode(node, input) {
        const cfg = node.config || {};
        const action = cfg.action || 'log';
        const inputStr = typeof input === 'string' ? input : JSON.stringify(input ?? '');

        const msg = cfg.message
            ? cfg.message.replace(/\{\{input\}\}/g, inputStr)
            : inputStr || 'Workflow complete';

        if (action === 'notify') {
            // Directly call notification store — this guarantees the toast appears
            useNotificationStore.getState().addNotification(msg, 'info', 6000);
        }

        // Always return a result object so output is meaningful
        return {
            _output: true,
            action,
            message: msg,
            rawInput: input,
            timestamp: Date.now(),
        };
    }
}

export const workflowEngine = new WorkflowEngine();
export default workflowEngine;
