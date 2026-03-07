import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Screen capture
  captureScreen: (): Promise<string | null> =>
    ipcRenderer.invoke('capture-screen'),

  // Persistent store
  store: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('store-get', key),
    set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('store-set', key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('store-delete', key)
  },

  // SQLite Database (Memory Graph)
  db: {
    getBubbles: (): Promise<any[]> => ipcRenderer.invoke('db-get-bubbles'),
    insertBubble: (bubble: any): Promise<void> => ipcRenderer.invoke('db-insert-bubble', bubble),
    updateBubbleAccess: (id: string, accessCount: number, lastAccessed: number): Promise<void> =>
      ipcRenderer.invoke('db-update-bubble-access', id, accessCount, lastAccessed),
    deleteBubble: (id: string): Promise<void> => ipcRenderer.invoke('db-delete-bubble', id)
  },

  // Window controls
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window-minimize'),
    hide: (): Promise<void> => ipcRenderer.invoke('window-hide'),
    drag: (x: number, y: number): Promise<void> => ipcRenderer.invoke('window-drag', x, y),
    setAlwaysOnTop: (value: boolean): Promise<void> => ipcRenderer.invoke('set-always-on-top', value),
    resize: (width: number, height: number): Promise<void> => ipcRenderer.invoke('window-resize', width, height)
  },

  // System context
  system: {
    getInfo: (): Promise<SystemInfo> => ipcRenderer.invoke('get-system-info'),
    getActiveWindow: (): Promise<{ appName: string; windowTitle: string } | null> =>
      ipcRenderer.invoke('get-active-window'),
    getRunningApps: (): Promise<string[]> => ipcRenderer.invoke('get-running-apps')
  },

  // Tray sync
  tray: {
    sync: (feature: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('tray-sync', feature, enabled),
    onToggle: (callback: (feature: string, enabled: boolean) => void) => {
      const handler = (_event: any, feature: string, enabled: boolean) => callback(feature, enabled)
      ipcRenderer.on('tray-toggle', handler)
      return () => ipcRenderer.removeListener('tray-toggle', handler)
    }
  },

  // Gateway bridge
  gateway: {
    connect: (url: string, token?: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('gateway-connect', url, token),
    disconnect: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('gateway-disconnect'),
    send: (message: string, opts?: {
      sessionKey?: string;
      thinking?: string;
      attachments?: Array<{ type?: string; mimeType?: string; fileName?: string; content?: unknown }>;
    }): Promise<{ ok: boolean; runId?: string; status?: string; error?: string }> =>
      ipcRenderer.invoke('gateway-send', message, opts),
    history: (sessionKey?: string, limit?: number): Promise<{ ok: boolean; data?: unknown; error?: string }> =>
      ipcRenderer.invoke('gateway-history', sessionKey, limit),
    abort: (sessionKey?: string, runId?: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('gateway-abort', sessionKey, runId),
    status: (): Promise<{ connected: boolean }> =>
      ipcRenderer.invoke('gateway-status'),
    setSession: (sessionKey: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('gateway-set-session', sessionKey),
    onChat: (callback: (event: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('gateway-chat', handler)
      return () => ipcRenderer.removeListener('gateway-chat', handler)
    },
    onStatus: (callback: (data: { status: string; message: string }) => void) => {
      const handler = (_event: any, data: { status: string; message: string }) => callback(data)
      ipcRenderer.on('gateway-status', handler)
      return () => ipcRenderer.removeListener('gateway-status', handler)
    },
    onHello: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('gateway-hello', handler)
      return () => ipcRenderer.removeListener('gateway-hello', handler)
    },
    onAgentEvent: (callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('gateway-agent-event', handler)
      return () => ipcRenderer.removeListener('gateway-agent-event', handler)
    },
  },

  // Agentic capabilities
  agent: {
    runCommand: (command: string, cwd?: string, timeout?: number): Promise<string> =>
      ipcRenderer.invoke('agent-run-command', command, cwd, timeout),
    readFile: (path: string): Promise<string> =>
      ipcRenderer.invoke('agent-read-file', path),
    writeFile: (path: string, content: string): Promise<void> =>
      ipcRenderer.invoke('agent-write-file', path, content),
    listDirectory: (path: string): Promise<string> =>
      ipcRenderer.invoke('agent-list-directory', path),
    openApp: (target: string): Promise<void> =>
      ipcRenderer.invoke('agent-open-app', target),
    searchWeb: (query: string): Promise<string> =>
      ipcRenderer.invoke('agent-search-web', query)
  }
}

export interface SystemInfo {
  platform: string
  os: string
  osRelease: string
  hostname: string
  username: string
  homedir: string
  arch: string
  cpuModel: string
  cpuCores: number
  totalMemGb: string
  freeMemGb: string
  screenWidth: number
  screenHeight: number
  scaleFactor: number
  timezone: string
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
