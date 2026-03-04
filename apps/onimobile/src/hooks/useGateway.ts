import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OniGatewayClient,
  loadGatewayConfig,
  saveGatewayConfig,
  type GatewayEvent,
  type StoredConfig,
} from '../lib/gateway-client';
import type { ChatMessage, ConnectionState } from '../types/messages';

let globalClient: OniGatewayClient | null = null;

export function useGateway() {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string>('');
  const [config, setConfig] = useState<StoredConfig | null>(null);
  const clientRef = useRef<OniGatewayClient | null>(null);
  const msgIdCounter = useRef(0);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const id = `msg_${++msgIdCounter.current}_${Date.now()}`;
    const full: ChatMessage = { ...msg, id, timestamp: Date.now() };
    setMessages((prev) => [...prev, full]);
    return id;
  }, []);

  const updateLastAssistant = useCallback((text: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.streaming) {
        return [...prev.slice(0, -1), { ...last, text, streaming: true }];
      }
      return prev;
    });
  }, []);

  const finalizeLastAssistant = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }];
      }
      return prev;
    });
    setStreamingText('');
  }, []);

  const connect = useCallback(async (cfg: StoredConfig) => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    setState('connecting');
    await saveGatewayConfig(cfg);
    setConfig(cfg);

    const client = new OniGatewayClient({
      ...cfg,
      onConnect: () => {
        setState('connected');
        addMessage({ role: 'system', text: '🟢 Connected to Oni gateway' });
      },
      onDisconnect: (reason) => {
        setState('disconnected');
        addMessage({ role: 'system', text: `🔴 Disconnected: ${reason}` });
      },
      onError: (error) => {
        setState('error');
        console.warn('Gateway error:', error);
      },
      onChatDelta: (delta) => {
        setStreamingText((prev) => {
          const next = prev + delta.text;
          // Check if we already have a streaming message
          setMessages((msgs) => {
            const last = msgs[msgs.length - 1];
            if (last?.role === 'assistant' && last.streaming) {
              return [...msgs.slice(0, -1), { ...last, text: next }];
            }
            // Create new streaming message
            const id = `msg_${++msgIdCounter.current}_${Date.now()}`;
            return [...msgs, { id, role: 'assistant', text: next, timestamp: Date.now(), streaming: true }];
          });
          return next;
        });
      },
      onChatEnd: () => {
        finalizeLastAssistant();
      },
      onEvent: (event) => {
        handleEvent(event);
      },
    });

    clientRef.current = client;
    globalClient = client;
    client.connect();
  }, [addMessage, finalizeLastAssistant]);

  const handleEvent = useCallback((event: GatewayEvent) => {
    // Handle specific events for UI updates
    if (event.event === 'heartbeat') return;
    if (event.event === 'exec.approval.requested') {
      const req = event.payload as { id: string; request: { command: string } };
      addMessage({
        role: 'system',
        text: `🔐 Exec approval needed: ${req.request?.command}`,
        widgets: [{
          type: 'tool-call',
          title: 'Exec Approval',
          content: JSON.stringify(req.request, null, 2),
        }],
      });
    }
  }, [addMessage]);

  const sendMessage = useCallback(async (text: string) => {
    if (!clientRef.current?.isConnected) return;
    addMessage({ role: 'user', text });
    setStreamingText('');
    try {
      await clientRef.current.sendChat(text);
    } catch (err) {
      addMessage({ role: 'system', text: `❌ Send failed: ${String(err)}` });
    }
  }, [addMessage]);

  const sendCommand = useCallback(async (command: string, params: Record<string, unknown> = {}) => {
    if (!clientRef.current?.isConnected) throw new Error('Not connected');
    return clientRef.current.request(command, params);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    loadGatewayConfig().then((cfg) => {
      if (cfg) {
        setConfig(cfg);
        connect(cfg);
      }
    });
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  return {
    state,
    messages,
    streamingText,
    config,
    connect,
    sendMessage,
    sendCommand,
    addMessage,
    client: clientRef.current,
  };
}

export function getGatewayClient(): OniGatewayClient | null {
  return globalClient;
}
