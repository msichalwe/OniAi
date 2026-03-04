export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageWidgetType =
  | 'text'
  | 'thinking'
  | 'tool-call'
  | 'terminal'
  | 'browser'
  | 'subagent'
  | 'image'
  | 'voice'
  | 'file'
  | 'code'
  | 'error';

export type MessageWidget = {
  type: MessageWidgetType;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  collapsed?: boolean;
};

export type ChatMessage = {
  id: string;
  role: MessageRole;
  text: string;
  widgets?: MessageWidget[];
  timestamp: number;
  streaming?: boolean;
  mediaUrl?: string;
  mediaType?: 'image' | 'voice' | 'file';
  replyToId?: string;
};

export type SessionInfo = {
  sessionKey: string;
  sessionId: string;
  model?: string;
  provider?: string;
  label?: string;
};

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
