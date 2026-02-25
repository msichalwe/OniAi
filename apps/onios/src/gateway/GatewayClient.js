/**
 * GatewayClient — Full bridge between OniOS frontend and Oni gateway.
 *
 * This is the central nervous system connecting the browser UI to the
 * gateway AI brain. It handles:
 *
 * 1. **Action Event Stream** — subscribes to /api/oni/events SSE to receive
 *    real-time notifications when the gateway AI executes actions
 *    (tasks, windows, terminal, notes, etc.)
 *
 * 2. **Local Command Execution** — when action events include a `command` hint,
 *    executes them via commandRegistry so widgets actually open/update on screen.
 *
 * 3. **Widget Context Sync** — periodically pushes current widget state to the
 *    gateway so the AI knows what's on screen.
 *
 * 4. **Status Tracking** — tracks gateway connection state and exposes it to UI.
 *
 * Architecture:
 *   Gateway AI → exec curl /api/oni/actions/terminal → oniPlugin handles it →
 *   pushes event to ACTION_EVENT_BUS → SSE /api/oni/events → GatewayClient
 *   receives → executes terminal.exec() via commandRegistry → Terminal widget opens
 */

import { commandRegistry } from '../core/CommandRegistry.js';
import { eventBus } from '../core/EventBus.js';

class GatewayClient {
    constructor() {
        this._status = 'disconnected'; // disconnected | connecting | connected | error
        this._eventSource = null;
        this._statusListeners = [];
        this._actionListeners = [];
        this._reconnectTimer = null;
        this._contextSyncInterval = null;
        this._actionHistory = []; // recent actions for chat display
    }

    get connected() {
        return this._status === 'connected';
    }

    get status() {
        return this._status;
    }

    /** Recent action events (for chat widget to display) */
    get actionHistory() {
        return this._actionHistory;
    }

    // ─── Event Stream Connection ─────────────────────────

    /**
     * Connect to the /api/oni/events SSE stream.
     * This is the primary connection — all gateway AI actions flow through here.
     */
    connect() {
        if (this._eventSource) {
            this._eventSource.close();
        }

        this._setStatus('connecting');

        try {
            this._eventSource = new EventSource('/api/oni/events');

            this._eventSource.addEventListener('connected', () => {
                this._setStatus('connected');
                console.log('[GatewayClient] Connected to action event stream');
                this._startContextSync();
            });

            this._eventSource.addEventListener('action', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this._handleActionEvent(data);
                } catch (err) {
                    console.warn('[GatewayClient] Failed to parse action event:', err);
                }
            });

            this._eventSource.onerror = () => {
                if (this._eventSource?.readyState === EventSource.CLOSED) {
                    this._setStatus('disconnected');
                    this._stopContextSync();
                    this._scheduleReconnect();
                } else {
                    this._setStatus('error');
                }
            };
        } catch (err) {
            console.error('[GatewayClient] Connection failed:', err);
            this._setStatus('error');
            this._scheduleReconnect();
        }
    }

    /** Disconnect from the event stream */
    disconnect() {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        this._stopContextSync();
        if (this._eventSource) {
            this._eventSource.close();
            this._eventSource = null;
        }
        this._setStatus('disconnected');
    }

    // ─── Action Event Handling ───────────────────────────

    /**
     * Handle an action event from the gateway.
     * This is where the magic happens: gateway AI actions become widget commands.
     */
    _handleActionEvent(data) {
        // Store in history for chat display
        this._actionHistory.push(data);
        if (this._actionHistory.length > 100) this._actionHistory.shift();

        // Notify all action listeners (chat widget uses this)
        for (const listener of this._actionListeners) {
            try { listener(data); } catch { /* listener error */ }
        }

        // Emit on eventBus for any component to listen
        eventBus.emit('gateway:action', data);

        // Execute frontend command if provided
        if (data.type === 'action_done' && data.command) {
            this._executeCommand(data.command, data);
        }
    }

    /**
     * Execute a commandRegistry command from a gateway action event.
     * This is how gateway AI actions translate to widget operations.
     */
    async _executeCommand(commandStr, actionData) {
        try {
            console.log(`[GatewayClient] Executing: ${commandStr}`);
            const handle = commandRegistry.execute(commandStr, 'ai');
            const result = await handle.await();

            eventBus.emit('gateway:command:executed', {
                command: commandStr,
                actionType: actionData.actionType,
                result,
            });

            return result;
        } catch (err) {
            console.warn(`[GatewayClient] Command failed: ${commandStr}`, err);
            eventBus.emit('gateway:command:error', {
                command: commandStr,
                actionType: actionData.actionType,
                error: err.message,
            });
            return null;
        }
    }

    // ─── Widget Context Sync ─────────────────────────────

    /**
     * Push current widget context to the gateway so the AI knows
     * what's on screen. Runs every 10 seconds while connected.
     */
    _startContextSync() {
        this._stopContextSync();
        this._contextSyncInterval = setInterval(() => {
            this._syncContext();
        }, 10000);
        // Initial sync
        this._syncContext();
    }

    _stopContextSync() {
        if (this._contextSyncInterval) {
            clearInterval(this._contextSyncInterval);
            this._contextSyncInterval = null;
        }
    }

    async _syncContext() {
        try {
            // Import dynamically to avoid circular deps
            const { widgetContext } = await import('../core/WidgetContextProvider.js');
            const summary = widgetContext?.getSummary?.() || '';
            if (summary) {
                // Push to server for the gateway AI's next message context
                await fetch('/api/oni/context', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ widgetContext: summary, timestamp: Date.now() }),
                }).catch(() => { /* endpoint may not exist yet */ });
            }
        } catch { /* context provider not ready */ }
    }

    // ─── Listeners ───────────────────────────────────────

    /** Subscribe to status changes */
    onStatusChange(listener) {
        this._statusListeners.push(listener);
        return () => {
            this._statusListeners = this._statusListeners.filter(l => l !== listener);
        };
    }

    /** Subscribe to action events (for chat widget live updates) */
    onAction(listener) {
        this._actionListeners.push(listener);
        return () => {
            this._actionListeners = this._actionListeners.filter(l => l !== listener);
        };
    }

    // ─── Internal ────────────────────────────────────────

    _setStatus(status) {
        const prev = this._status;
        this._status = status;
        if (prev !== status) {
            eventBus.emit('gateway:status', status);
            for (const listener of this._statusListeners) {
                try { listener(status); } catch { /* listener error */ }
            }
        }
    }

    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (this._status !== 'connected') {
                console.log('[GatewayClient] Reconnecting...');
                this.connect();
            }
        }, 5000);
    }

    // ─── Helper methods for widgets ──────────────────────

    /** Get the gateway agent identity from server */
    async getAgentIdentity() {
        const res = await fetch('/api/oni/status');
        const data = await res.json();
        return {
            name: data.agentName,
            model: data.agentModel,
            id: data.agentId,
        };
    }

    /** Reset a chat session */
    async resetSession(sessionKey) {
        // Sessions are managed by the gateway — this is a no-op hint
        console.log(`[GatewayClient] Session reset requested: ${sessionKey}`);
    }

    /** Clear action history */
    clearHistory() {
        this._actionHistory = [];
    }
}

// ─── Singleton ───────────────────────────────────────

export const gateway = new GatewayClient();

// Auto-connect on load
if (typeof window !== 'undefined') {
    // Delay slightly to let the app initialize
    setTimeout(() => {
        gateway.connect();
        console.log('[GatewayClient] Auto-connecting to action event stream');
    }, 1000);
}

export default gateway;
