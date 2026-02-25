/**
 * GatewayClient — Single WebSocket RPC client for the Oni gateway.
 *
 * Every widget uses this instead of direct fetch() calls to /api/ai/*.
 * Wraps the Oni gateway's JSON-RPC-like protocol over WebSocket.
 *
 * Usage:
 *   import { gateway } from '../gateway/GatewayClient';
 *   await gateway.connect('ws://127.0.0.1:19100', 'my-token');
 *   const health = await gateway.request('health');
 *   const sessions = await gateway.request('sessions.list');
 */

import { eventBus } from '../core/EventBus.js';

let _requestId = 0;
function nextId() { return `onios-${++_requestId}-${Date.now()}`; }

class GatewayClient {
    constructor() {
        this.ws = null;
        this.url = '';
        this.token = '';
        this._status = 'disconnected'; // disconnected | connecting | connected | error
        this._reconnectTimer = null;
        this._pendingRequests = new Map(); // id → { resolve, reject, timeout }
        this._eventHandlers = new Map(); // event → Set<handler>
        this._statusHandlers = new Set();
        this._chatStreamHandlers = new Map(); // runId → handler
    }

    // ─── Connection ──────────────────────────────────────

    get status() { return this._status; }
    get connected() { return this._status === 'connected' && this.ws?.readyState === WebSocket.OPEN; }

    async connect(url, token) {
        if (this.connected) return;
        this.url = url;
        this.token = token;
        this._setStatus('connecting');

        return new Promise((resolve, reject) => {
            try {
                const wsUrl = token
                    ? `${url}?token=${encodeURIComponent(token)}`
                    : url;
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    this._setStatus('connected');
                    console.log('[GatewayClient] Connected to', url);
                    // Send connect frame
                    this._sendRaw({
                        type: 'req',
                        id: nextId(),
                        method: 'connect',
                        params: {
                            client: 'onios',
                            version: '0.1.0',
                            role: 'operator',
                        },
                    });
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    this._handleMessage(event.data);
                };

                this.ws.onclose = () => {
                    this._setStatus('disconnected');
                    this._rejectAllPending('Connection closed');
                    this._scheduleReconnect();
                };

                this.ws.onerror = () => {
                    this._setStatus('error');
                    reject(new Error('Gateway connection failed'));
                };
            } catch (err) {
                this._setStatus('error');
                reject(err);
            }
        });
    }

    disconnect() {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        this._rejectAllPending('Disconnected');
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this._setStatus('disconnected');
    }

    onStatusChange(handler) {
        this._statusHandlers.add(handler);
        return () => this._statusHandlers.delete(handler);
    }

    // ─── RPC Request ─────────────────────────────────────

    /**
     * Send a JSON-RPC request to the gateway and await the response.
     * @param {string} method - e.g. 'health', 'sessions.list', 'config.get'
     * @param {object} params - method parameters
     * @param {number} timeoutMs - request timeout (default 30s)
     * @returns {Promise<object>} response payload
     */
    request(method, params = {}, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('Not connected to gateway'));
                return;
            }

            const id = nextId();
            const timeout = setTimeout(() => {
                this._pendingRequests.delete(id);
                reject(new Error(`Gateway request timeout: ${method}`));
            }, timeoutMs);

            this._pendingRequests.set(id, { resolve, reject, timeout, method });

            this._sendRaw({
                type: 'req',
                id,
                method,
                params,
            });
        });
    }

    // ─── Convenience Methods ─────────────────────────────

    async health() {
        return this.request('health');
    }

    async getConfig() {
        return this.request('config.get');
    }

    async listModels() {
        return this.request('models.list');
    }

    async listSessions(params = {}) {
        return this.request('sessions.list', params);
    }

    async previewSessions(keys, opts = {}) {
        return this.request('sessions.preview', { keys, ...opts });
    }

    async resetSession(key, reason = 'reset') {
        return this.request('sessions.reset', { key, reason });
    }

    async deleteSession(key) {
        return this.request('sessions.delete', { key });
    }

    async listSkills() {
        return this.request('skills.list');
    }

    async getAgentIdentity(params = {}) {
        return this.request('agent.identity', params);
    }

    /**
     * Send a chat message through the gateway agent.
     * Returns immediately; stream deltas arrive via onChatStream().
     * @param {string} message - user message
     * @param {string} sessionKey - session key (e.g. 'onios:main')
     * @param {object} opts - { attachments, channel }
     * @returns {Promise<object>} initial response (contains runId)
     */
    async chatSend(message, sessionKey, opts = {}) {
        return this.request('agent', {
            message,
            key: sessionKey,
            channel: opts.channel || 'onios',
            ...opts,
        }, 120000); // 2 min timeout for chat
    }

    /**
     * Register a handler for chat stream events (deltas, tool calls, done).
     * @param {string} sessionKey
     * @param {function} handler - receives { event, data }
     * @returns {function} unsubscribe
     */
    onChatStream(sessionKey, handler) {
        if (!this._chatStreamHandlers.has(sessionKey)) {
            this._chatStreamHandlers.set(sessionKey, new Set());
        }
        this._chatStreamHandlers.get(sessionKey).add(handler);
        return () => this._chatStreamHandlers.get(sessionKey)?.delete(handler);
    }

    // ─── Gateway Events ──────────────────────────────────

    /**
     * Subscribe to gateway broadcast events.
     * @param {string} event - e.g. 'chat.delta', 'chat.done', 'agent.run'
     * @param {function} handler
     * @returns {function} unsubscribe
     */
    on(event, handler) {
        if (!this._eventHandlers.has(event)) {
            this._eventHandlers.set(event, new Set());
        }
        this._eventHandlers.get(event).add(handler);
        return () => this._eventHandlers.get(event)?.delete(handler);
    }

    // ─── Private ─────────────────────────────────────────

    _setStatus(status) {
        this._status = status;
        eventBus.emit('gateway:status', status);
        for (const handler of this._statusHandlers) {
            try { handler(status); } catch { /* skip */ }
        }
    }

    _sendRaw(obj) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    _handleMessage(raw) {
        try {
            const msg = JSON.parse(raw);

            // Response to a pending request
            if (msg.type === 'res' && msg.id && this._pendingRequests.has(msg.id)) {
                const pending = this._pendingRequests.get(msg.id);
                this._pendingRequests.delete(msg.id);
                clearTimeout(pending.timeout);

                if (msg.ok === false || msg.error) {
                    pending.reject(new Error(msg.error?.message || `Gateway error: ${pending.method}`));
                } else {
                    pending.resolve(msg.payload ?? msg.result ?? msg);
                }
                return;
            }

            // Broadcast event from gateway
            if (msg.type === 'event' || msg.event) {
                const eventName = msg.event || msg.type;
                const data = msg.data || msg.payload || msg;

                // Route chat events to stream handlers
                if (eventName?.startsWith('chat.') || eventName?.startsWith('agent.')) {
                    const sessionKey = data?.sessionKey || data?.key;
                    if (sessionKey && this._chatStreamHandlers.has(sessionKey)) {
                        for (const handler of this._chatStreamHandlers.get(sessionKey)) {
                            try { handler({ event: eventName, data }); } catch { /* skip */ }
                        }
                    }
                    // Also broadcast to wildcard chat handlers
                    if (this._chatStreamHandlers.has('*')) {
                        for (const handler of this._chatStreamHandlers.get('*')) {
                            try { handler({ event: eventName, data }); } catch { /* skip */ }
                        }
                    }
                }

                // Emit to event handlers
                const handlers = this._eventHandlers.get(eventName);
                if (handlers) {
                    for (const handler of handlers) {
                        try { handler(data); } catch { /* skip */ }
                    }
                }

                // Emit to wildcard handlers
                const wildcardHandlers = this._eventHandlers.get('*');
                if (wildcardHandlers) {
                    for (const handler of wildcardHandlers) {
                        try { handler({ event: eventName, data }); } catch { /* skip */ }
                    }
                }

                eventBus.emit(`gateway:${eventName}`, data);
                return;
            }

            // Unknown message — emit as raw
            eventBus.emit('gateway:raw', msg);
        } catch (err) {
            console.error('[GatewayClient] Parse error:', err);
        }
    }

    _rejectAllPending(reason) {
        for (const [id, pending] of this._pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(reason));
        }
        this._pendingRequests.clear();
    }

    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (this._status === 'disconnected' && this.url) {
                console.log('[GatewayClient] Reconnecting...');
                this.connect(this.url, this.token).catch(() => {
                    this._scheduleReconnect();
                });
            }
        }, 5000);
    }
}

export const gateway = new GatewayClient();
export default gateway;
