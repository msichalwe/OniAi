import { ElectronAPI } from '@electron-toolkit/preload'

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

export interface GatewayChatEvent {
  runId: string
  sessionKey: string
  seq: number
  state: 'delta' | 'final' | 'aborted' | 'error'
  message?: Record<string, unknown>
  errorMessage?: string
  usage?: unknown
  stopReason?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      captureScreen: () => Promise<string | null>
      store: {
        get: (key: string) => Promise<unknown>
        set: (key: string, value: unknown) => Promise<void>
        delete: (key: string) => Promise<void>
      }
      db: {
        getBubbles: () => Promise<any[]>
        insertBubble: (bubble: any) => Promise<void>
        updateBubbleAccess: (id: string, accessCount: number, lastAccessed: number) => Promise<void>
        deleteBubble: (id: string) => Promise<void>
      }
      window: {
        minimize: () => Promise<void>
        hide: () => Promise<void>
        drag: (x: number, y: number) => Promise<void>
        setAlwaysOnTop: (value: boolean) => Promise<void>
        resize: (width: number, height: number) => Promise<void>
      }
      system: {
        getInfo: () => Promise<SystemInfo>
        getActiveWindow: () => Promise<{ appName: string; windowTitle: string } | null>
        getRunningApps: () => Promise<string[]>
      }
      tray: {
        sync: (feature: string, enabled: boolean) => Promise<void>
        onToggle: (callback: (feature: string, enabled: boolean) => void) => () => void
      }
      gateway: {
        connect: (url: string, token?: string) => Promise<{ ok: boolean; error?: string }>
        disconnect: () => Promise<{ ok: boolean }>
        send: (message: string, opts?: {
          sessionKey?: string;
          thinking?: string;
          attachments?: Array<{ type?: string; mimeType?: string; fileName?: string; content?: unknown }>;
        }) => Promise<{ ok: boolean; runId?: string; status?: string; error?: string }>
        history: (sessionKey?: string, limit?: number) => Promise<{ ok: boolean; data?: unknown; error?: string }>
        abort: (sessionKey?: string, runId?: string) => Promise<{ ok: boolean; error?: string }>
        status: () => Promise<{ connected: boolean }>
        setSession: (sessionKey: string) => Promise<{ ok: boolean }>
        onChat: (callback: (event: GatewayChatEvent) => void) => () => void
        onStatus: (callback: (data: { status: string; message: string }) => void) => () => void
        onHello: (callback: (data: unknown) => void) => () => void
        onAgentEvent: (callback: (data: unknown) => void) => () => void
      }
      agent: {
        runCommand: (command: string, cwd?: string, timeout?: number) => Promise<string>
        readFile: (path: string) => Promise<string>
        writeFile: (path: string, content: string) => Promise<void>
        listDirectory: (path: string) => Promise<string>
        openApp: (target: string) => Promise<void>
        searchWeb: (query: string) => Promise<string>
      }
    }
  }
}
