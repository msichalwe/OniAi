/**
 * OniGatewayBridge — WebSocket client that connects OniOS to the Oni gateway.
 *
 * This is the central integration point: OniOS sends user messages to the gateway,
 * receives agent responses, and the gateway can execute commands on OniOS.
 */

import { eventBus } from '../core/EventBus.js';
import { commandRegistry } from '../core/CommandRegistry.js';

class OniGatewayBridge {
  constructor() {
    this.ws = null;
    this.url = '';
    this.token = '';
    this._status = 'disconnected'; // disconnected | connecting | connected | error
    this.reconnectTimer = null;
    this.messageHandlers = [];
    this.contextSyncInterval = null;
  }

  get status() {
    return this._status;
  }

  async connect(url, token) {
    this.url = url;
    this.token = token;
    this._status = 'connecting';
    eventBus.emit('gateway:status', this._status);

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${url}?token=${encodeURIComponent(token)}&channel=onios`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this._status = 'connected';
          eventBus.emit('gateway:status', this._status);
          console.log('[OniGatewayBridge] Connected to Oni gateway');
          this._registerAsChannel();
          this._startContextSync();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this._handleMessage(event.data);
        };

        this.ws.onclose = () => {
          this._status = 'disconnected';
          eventBus.emit('gateway:status', this._status);
          this._stopContextSync();
          this._scheduleReconnect();
        };

        this.ws.onerror = () => {
          this._status = 'error';
          eventBus.emit('gateway:status', this._status);
          reject(new Error('Gateway connection failed'));
        };
      } catch (err) {
        this._status = 'error';
        reject(err);
      }
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._stopContextSync();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._status = 'disconnected';
    eventBus.emit('gateway:status', this._status);
  }

  isConnected() {
    return this._status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send a user message to the gateway agent.
   */
  sendMessage(content, metadata = {}) {
    if (!this.isConnected()) {
      console.warn('[OniGatewayBridge] Not connected');
      return;
    }
    this.ws.send(JSON.stringify({
      type: 'message',
      content,
      channel: 'onios',
      timestamp: Date.now(),
      ...metadata,
    }));
  }

  /**
   * Register a handler for agent messages.
   */
  onAgentMessage(handler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Push widget context to the gateway so the AI knows what's on screen.
   */
  pushWidgetContext(contexts) {
    if (!this.isConnected()) return;
    this.ws.send(JSON.stringify({
      type: 'widget_context',
      contexts,
      timestamp: Date.now(),
    }));
  }

  /**
   * Push all registered skills to the gateway.
   */
  pushSkills(skills) {
    if (!this.isConnected()) return;
    this.ws.send(JSON.stringify({
      type: 'register_skills',
      skills,
      timestamp: Date.now(),
    }));
  }

  // ─── Private ───────────────────────────────────────────

  _registerAsChannel() {
    if (!this.isConnected()) return;
    // Register OniOS as a channel with its capabilities
    const commands = commandRegistry.list();
    this.ws.send(JSON.stringify({
      type: 'register',
      channel: 'onios',
      capabilities: {
        widgets: true,
        commands: commands.length,
        context: true,
        subAgents: true,
      },
    }));
  }

  _startContextSync() {
    // Sync widget context to gateway every 5 seconds
    this.contextSyncInterval = setInterval(() => {
      if (!this.isConnected()) return;
      // Collect context from all open widgets via the widgetContext provider
      try {
        const { widgetContext } = require('../core/WidgetContextProvider.js');
        if (widgetContext) {
          const allContexts = widgetContext.getAll?.() || [];
          if (allContexts.length > 0) {
            this.pushWidgetContext(allContexts);
          }
        }
      } catch {
        // WidgetContextProvider not ready yet
      }
    }, 5000);
  }

  _stopContextSync() {
    if (this.contextSyncInterval) {
      clearInterval(this.contextSyncInterval);
      this.contextSyncInterval = null;
    }
  }

  _handleMessage(raw) {
    try {
      const data = JSON.parse(raw);

      // Agent response message
      if (data.type === 'agent_message' || data.type === 'message') {
        const msg = {
          role: data.role || 'assistant',
          content: data.content || '',
          timestamp: data.timestamp || Date.now(),
        };
        for (const handler of this.messageHandlers) {
          handler(msg);
        }
        eventBus.emit('gateway:message', msg);
      }

      // Command request from gateway (AI wants to execute an OniOS command)
      if (data.type === 'command_request') {
        this._executeGatewayCommand(data);
      }

      // Skill request from gateway
      if (data.type === 'skill_request') {
        this._executeGatewaySkill(data);
      }
    } catch (err) {
      console.error('[OniGatewayBridge] Parse error:', err);
    }
  }

  async _executeGatewayCommand(data) {
    try {
      const handle = commandRegistry.execute(
        data.command + (data.args?.length ? `(${data.args.map(a => JSON.stringify(a)).join(',')})` : ''),
        'ai'
      );
      const result = await handle.await();
      if (this.isConnected()) {
        this.ws.send(JSON.stringify({
          type: 'command_result',
          id: data.id,
          ok: true,
          result,
        }));
      }
    } catch (err) {
      if (this.isConnected()) {
        this.ws.send(JSON.stringify({
          type: 'command_result',
          id: data.id,
          ok: false,
          error: String(err),
        }));
      }
    }
  }

  async _executeGatewaySkill(data) {
    try {
      const { skillsRegistry } = await import('../core/SkillsRegistry.js');
      const skill = skillsRegistry?.getSkill?.(data.skillId);
      if (!skill) throw new Error(`Skill not found: ${data.skillId}`);

      const args = skill.buildArgs(data.params || {});
      const handle = commandRegistry.execute(
        `${skill.command}(${args.map(a => JSON.stringify(a)).join(',')})`,
        'ai'
      );
      const result = await handle.await();
      if (this.isConnected()) {
        this.ws.send(JSON.stringify({
          type: 'skill_result',
          id: data.id,
          ok: true,
          result,
        }));
      }
    } catch (err) {
      if (this.isConnected()) {
        this.ws.send(JSON.stringify({
          type: 'skill_result',
          id: data.id,
          ok: false,
          error: String(err),
        }));
      }
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this._status === 'disconnected' && this.url) {
        console.log('[OniGatewayBridge] Reconnecting...');
        this.connect(this.url, this.token).catch(() => {
          this._scheduleReconnect();
        });
      }
    }, 5000);
  }
}

export const gatewayBridge = new OniGatewayBridge();
export default gatewayBridge;
