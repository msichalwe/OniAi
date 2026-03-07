/// <reference types="../../../preload/index.d.ts" />

/**
 * Gateway service — renderer-side interface to the Oni gateway.
 *
 * Replaces direct OpenAI SDK calls. All AI reasoning goes through the
 * gateway's agent pipeline via WebSocket (bridged through Electron IPC).
 *
 * Local features (screen capture, camera, TTS, ambient listening) stay local.
 * The gateway handles: model routing, sessions, memory, tool execution (server-side).
 */

// ── Types ───────────────────────────────────────────────────────────

export type GatewayConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface GatewayConfig {
  url: string    // wss://your-server:19100
  token?: string // gateway auth token
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

export type ChatEventCallback = (event: GatewayChatEvent) => void
export type StatusCallback = (state: GatewayConnectionState, message: string) => void

// ── State ───────────────────────────────────────────────────────────

let _connectionState: GatewayConnectionState = 'disconnected'
let _statusCallbacks: StatusCallback[] = []
let _chatCallbacks: ChatEventCallback[] = []
let _cleanupFns: Array<() => void> = []

// ── Connection management ───────────────────────────────────────────

export async function connectToGateway(config: GatewayConfig): Promise<boolean> {
  // Clean up previous listeners
  _cleanupFns.forEach(fn => fn())
  _cleanupFns = []

  _connectionState = 'connecting'
  notifyStatus('connecting', 'Connecting to gateway...')

  // Register event listeners via preload IPC
  const unsubChat = window.api.gateway.onChat((event) => {
    _chatCallbacks.forEach(cb => cb(event))
  })
  _cleanupFns.push(unsubChat)

  const unsubStatus = window.api.gateway.onStatus(({ status, message }) => {
    if (status === 'connected') {
      _connectionState = 'connected'
      notifyStatus('connected', message)
    } else if (status === 'error') {
      _connectionState = 'error'
      notifyStatus('error', message)
    } else if (status === 'disconnected') {
      _connectionState = 'disconnected'
      notifyStatus('disconnected', message)
    }
  })
  _cleanupFns.push(unsubStatus)

  const unsubHello = window.api.gateway.onHello(() => {
    _connectionState = 'connected'
    notifyStatus('connected', 'Connected to Oni gateway')
  })
  _cleanupFns.push(unsubHello)

  // Initiate connection via main process
  const result = await window.api.gateway.connect(config.url, config.token)
  if (!result.ok) {
    _connectionState = 'error'
    notifyStatus('error', result.error ?? 'Connection failed')
    return false
  }

  return true
}

export async function disconnectFromGateway(): Promise<void> {
  _cleanupFns.forEach(fn => fn())
  _cleanupFns = []
  await window.api.gateway.disconnect()
  _connectionState = 'disconnected'
  notifyStatus('disconnected', 'Disconnected')
}

export function getConnectionState(): GatewayConnectionState {
  return _connectionState
}

// ── Chat ────────────────────────────────────────────────────────────

export async function sendMessage(
  message: string,
  opts?: {
    sessionKey?: string
    thinking?: string
    screenCapture?: string | null
    cameraFrame?: string | null
  }
): Promise<{ ok: boolean; runId?: string; error?: string }> {
  if (_connectionState !== 'connected') {
    return { ok: false, error: 'Not connected to gateway' }
  }

  // Build attachments from screen/camera captures
  const attachments: Array<{
    type: string
    mimeType: string
    fileName: string
    content: string
  }> = []

  if (opts?.screenCapture) {
    attachments.push({
      type: 'image',
      mimeType: 'image/png',
      fileName: 'screen.png',
      content: opts.screenCapture,
    })
  }

  if (opts?.cameraFrame) {
    attachments.push({
      type: 'image',
      mimeType: 'image/jpeg',
      fileName: 'camera.jpg',
      content: opts.cameraFrame,
    })
  }

  const result = await window.api.gateway.send(message, {
    sessionKey: opts?.sessionKey,
    thinking: opts?.thinking,
    attachments: attachments.length > 0 ? attachments : undefined,
  })

  return result
}

export async function abortCurrentRun(sessionKey?: string, runId?: string): Promise<void> {
  await window.api.gateway.abort(sessionKey, runId)
}

export async function loadChatHistory(
  sessionKey?: string,
  limit?: number
): Promise<unknown> {
  const result = await window.api.gateway.history(sessionKey, limit)
  return result.ok ? result.data : null
}

export async function setSessionKey(key: string): Promise<void> {
  await window.api.gateway.setSession(key)
}

// ── Event subscriptions ─────────────────────────────────────────────

export function onChatEvent(callback: ChatEventCallback): () => void {
  _chatCallbacks.push(callback)
  return () => {
    _chatCallbacks = _chatCallbacks.filter(cb => cb !== callback)
  }
}

export function onStatusChange(callback: StatusCallback): () => void {
  _statusCallbacks.push(callback)
  return () => {
    _statusCallbacks = _statusCallbacks.filter(cb => cb !== callback)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function notifyStatus(state: GatewayConnectionState, message: string): void {
  _statusCallbacks.forEach(cb => cb(state, message))
}

// ── Message content extraction ──────────────────────────────────────

/**
 * Extract the text content from a gateway chat event message.
 * Gateway messages follow the Pi/Oni transcript format:
 * { role, content: [{ type: "text", text: "..." }, ...] }
 */
export function extractMessageText(message?: Record<string, unknown>): string {
  if (!message) return ''

  // Direct content string
  if (typeof message.content === 'string') {
    return message.content
  }

  // Content array with text parts
  if (Array.isArray(message.content)) {
    return (message.content as Array<{ type?: string; text?: string }>)
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text!)
      .join('')
  }

  return ''
}

/**
 * Extract the role from a gateway chat event message.
 */
export function extractMessageRole(message?: Record<string, unknown>): string {
  if (!message) return 'assistant'
  return typeof message.role === 'string' ? message.role : 'assistant'
}
