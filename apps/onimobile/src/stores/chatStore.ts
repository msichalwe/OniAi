/**
 * chatStore — Zustand store for AI chat messages.
 */

import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  sections?: any[]; // Rich content sections from gateway
  isVoice?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  sessionId: string;
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
  newSession: () => void;
}

let msgCounter = 0;

const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  sessionId: `session_${Date.now()}`,

  addMessage: (msg) => {
    const id = `msg_${Date.now()}_${++msgCounter}`;
    set((s) => ({
      messages: [...s.messages, { ...msg, id, timestamp: Date.now() }],
    }));
  },

  setLoading: (isLoading) => set({ isLoading }),

  clearMessages: () => set({ messages: [] }),

  newSession: () =>
    set({ messages: [], sessionId: `session_${Date.now()}`, isLoading: false }),
}));

export default useChatStore;
