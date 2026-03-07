import { create } from 'zustand'

export type AppMode = 'login' | 'idle' | 'listening' | 'thinking' | 'responding'
export type TabId = 'chat' | 'terminal' | 'tasks' | 'memory' | 'logs'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface AgentTask {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'failed'
  description: string
  createdAt: number
  updatedAt: number
  output: string
}

export interface TerminalEntry {
  id: string
  command: string
  output: string
  timestamp: number
  cwd: string
  exitCode?: number
}

let _counter = 0
function uniqueId(prefix = 'msg'): string {
  return `${prefix}_${Date.now()}_${++_counter}`
}

interface OniState {
  apiKey: string | null
  gatewayUrl: string | null
  gatewayToken: string | null
  gatewayConnected: boolean
  mode: AppMode
  messages: Message[]
  thinkingText: string
  streamingText: string
  inputText: string
  screenCapture: string | null
  cameraActive: boolean
  micActive: boolean
  ambientListening: boolean
  screenCaptureActive: boolean

  // UI
  activeTab: TabId
  settingsOpen: boolean

  // Tasks
  tasks: AgentTask[]

  // Terminal
  terminalEntries: TerminalEntry[]

  // Logs
  logs: string[]

  setApiKey: (key: string | null) => void
  setGatewayUrl: (url: string | null) => void
  setGatewayToken: (token: string | null) => void
  setGatewayConnected: (connected: boolean) => void
  setMode: (mode: AppMode) => void
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void
  setThinkingText: (text: string) => void
  appendStreamingText: (text: string) => void
  resetStreaming: () => void
  commitStreaming: () => void
  setInputText: (text: string) => void
  setScreenCapture: (url: string | null) => void
  setCameraActive: (v: boolean) => void
  setMicActive: (v: boolean) => void
  setAmbientListening: (v: boolean) => void
  setScreenCaptureActive: (v: boolean) => void
  setActiveTab: (tab: TabId) => void
  setSettingsOpen: (v: boolean) => void
  clearMessages: () => void

  // Tasks
  addTask: (task: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateTask: (id: string, updates: Partial<AgentTask>) => void
  removeTask: (id: string) => void

  // Terminal
  addTerminalEntry: (entry: Omit<TerminalEntry, 'id' | 'timestamp'>) => void
  clearTerminal: () => void

  // Logs
  addLog: (msg: string) => void
  clearLogs: () => void
}

export const useStore = create<OniState>((set, get) => ({
  apiKey: null,
  gatewayUrl: null,
  gatewayToken: null,
  gatewayConnected: false,
  mode: 'login',
  messages: [],
  thinkingText: '',
  streamingText: '',
  inputText: '',
  screenCapture: null,
  cameraActive: false,
  micActive: false,
  ambientListening: false,
  screenCaptureActive: false,
  activeTab: 'chat',
  settingsOpen: false,
  tasks: [],
  terminalEntries: [],
  logs: [],

  setApiKey: (key) => set({ apiKey: key, mode: key ? 'idle' : 'login' }),
  setGatewayUrl: (url) => set({ gatewayUrl: url }),
  setGatewayToken: (token) => set({ gatewayToken: token }),
  setGatewayConnected: (connected) => set({ gatewayConnected: connected }),
  setMode: (mode) => set({ mode }),

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, { ...msg, id: uniqueId(), timestamp: Date.now() }]
    })),

  setThinkingText: (text) => set({ thinkingText: text }),

  appendStreamingText: (text) =>
    set((state) => ({ streamingText: state.streamingText + text })),

  resetStreaming: () => set({ streamingText: '', thinkingText: '' }),

  commitStreaming: () =>
    set((state) => {
      const text = state.streamingText.trim()
      if (!text) {return { streamingText: '', thinkingText: '' }}
      return {
        messages: [...state.messages, { id: uniqueId(), role: 'assistant', content: text, timestamp: Date.now() }],
        streamingText: '',
        thinkingText: ''
      }
    }),

  setInputText: (text) => set({ inputText: text }),
  setScreenCapture: (url) => set({ screenCapture: url }),
  setCameraActive: (v) => set({ cameraActive: v }),
  setMicActive: (v) => set({ micActive: v }),
  setAmbientListening: (v) => set({ ambientListening: v }),
  setScreenCaptureActive: (v) => set({ screenCaptureActive: v }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  clearMessages: () => set({ messages: [] }),

  // Tasks
  addTask: (task) => {
    const id = uniqueId('task')
    const now = Date.now()
    set((state) => ({
      tasks: [...state.tasks, { ...task, id, createdAt: now, updatedAt: now }]
    }))
    return id
  },
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t)
    })),
  removeTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) })),

  // Terminal
  addTerminalEntry: (entry) =>
    set((state) => ({
      terminalEntries: [...state.terminalEntries, { ...entry, id: uniqueId('term'), timestamp: Date.now() }]
    })),
  clearTerminal: () => set({ terminalEntries: [] }),

  // Logs
  addLog: (msg) =>
    set((state) => ({
      logs: [...state.logs.slice(-200), `[${new Date().toLocaleTimeString()}] ${msg}`]
    })),
  clearLogs: () => set({ logs: [] })
}))
