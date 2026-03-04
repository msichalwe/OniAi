import * as SecureStore from 'expo-secure-store';

export type GatewayEvent = {
  type: 'event';
  event: string;
  payload: Record<string, unknown>;
};

export type GatewayResponse = {
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
};

type PendingRequest = {
  resolve: (value: GatewayResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type GatewayClientConfig = {
  host: string;
  port: number;
  token: string;
  tls?: boolean;
  onEvent?: (event: GatewayEvent) => void;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: string) => void;
  onChatDelta?: (delta: { text: string; sessionKey: string; runId: string }) => void;
  onChatEnd?: (data: { sessionKey: string; runId: string }) => void;
};

const CONNECT_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 60_000;
const RECONNECT_DELAY_MS = 3_000;

let requestIdCounter = 0;
function nextRequestId(): string {
  return `mob_${++requestIdCounter}_${Date.now().toString(36)}`;
}

export class OniGatewayClient {
  private ws: WebSocket | null = null;
  private config: GatewayClientConfig;
  private pending = new Map<string, PendingRequest>();
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(config: GatewayClientConfig) {
    this.config = config;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  connect() {
    this.stopped = false;
    this.doConnect();
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  private doConnect() {
    if (this.stopped) return;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const scheme = this.config.tls ? 'wss' : 'ws';
    const url = `${scheme}://${this.config.host}:${this.config.port}`;

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.config.onError?.(`WebSocket create failed: ${String(err)}`);
      this.scheduleReconnect();
      return;
    }

    const connectTimer = setTimeout(() => {
      if (!this.connected) {
        this.ws?.close();
        this.config.onError?.('Connection timeout');
        this.scheduleReconnect();
      }
    }, CONNECT_TIMEOUT_MS);

    this.ws.onopen = () => {
      clearTimeout(connectTimer);
      // Send connect frame with auth
      this.ws?.send(JSON.stringify({
        method: 'connect',
        params: {
          token: this.config.token,
          client: {
            name: 'oni-mobile',
            displayName: 'Oni Mobile',
            version: '1.0.0',
            platform: 'mobile',
          },
          scopes: ['chat', 'events'],
        },
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        this.handleMessage(data);
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onerror = () => {
      clearTimeout(connectTimer);
      this.config.onError?.('WebSocket error');
    };

    this.ws.onclose = (event) => {
      clearTimeout(connectTimer);
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) {
        this.config.onDisconnect?.(event.reason || 'closed');
      }
      this.rejectAllPending('connection closed');
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    };
  }

  private handleMessage(data: Record<string, unknown>) {
    // Connect response
    if (data.type === 'event' && data.event === 'connect.ok') {
      this.connected = true;
      this.config.onConnect?.();
      return;
    }

    // Challenge response (some gateways use challenge-response auth)
    if (data.type === 'event' && data.event === 'connect.challenge') {
      // Respond with token
      this.ws?.send(JSON.stringify({
        method: 'connect',
        params: {
          token: this.config.token,
          client: {
            name: 'oni-mobile',
            displayName: 'Oni Mobile',
            version: '1.0.0',
            platform: 'mobile',
          },
          scopes: ['chat', 'events'],
        },
      }));
      return;
    }

    // RPC response
    if (data.id && typeof data.id === 'string') {
      const pending = this.pending.get(data.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(data.id);
        pending.resolve(data as GatewayResponse);
      }
      return;
    }

    // Chat streaming events
    if (data.type === 'event') {
      const event = data as GatewayEvent;
      if (event.event === 'chat.delta') {
        const payload = event.payload as { text?: string; sessionKey?: string; runId?: string };
        if (payload.text) {
          this.config.onChatDelta?.({
            text: payload.text,
            sessionKey: payload.sessionKey ?? '',
            runId: payload.runId ?? '',
          });
        }
      }
      if (event.event === 'chat.end') {
        const payload = event.payload as { sessionKey?: string; runId?: string };
        this.config.onChatEnd?.({
          sessionKey: payload.sessionKey ?? '',
          runId: payload.runId ?? '',
        });
      }
      this.config.onEvent?.(event);
    }
  }

  async request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected');
    }
    const id = nextRequestId();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (res) => resolve(res.payload as T),
        reject,
        timer,
      });

      this.ws?.send(JSON.stringify({ id, method, params }));
    });
  }

  async sendChat(message: string, sessionKey?: string): Promise<void> {
    await this.request('chat.send', {
      message,
      sessionKey,
    });
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, RECONNECT_DELAY_MS);
  }

  private rejectAllPending(reason: string) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}

// Persistent config storage
const CONFIG_KEY = 'oni_gateway_config';

export type StoredConfig = {
  host: string;
  port: number;
  token: string;
  tls?: boolean;
};

export async function saveGatewayConfig(config: StoredConfig) {
  await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(config));
}

export async function loadGatewayConfig(): Promise<StoredConfig | null> {
  try {
    const raw = await SecureStore.getItemAsync(CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredConfig;
  } catch {
    return null;
  }
}

export async function clearGatewayConfig() {
  await SecureStore.deleteItemAsync(CONFIG_KEY);
}
