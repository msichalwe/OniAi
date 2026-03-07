import OpenAI from 'openai'
import { buildSystemPrompt, persistInteraction, extractAndStoreBubbles } from './memory'
import { getSystemSnapshot, formatSystemContext } from './systemContext'
import { setScreenClient } from './screenUnderstanding'
import { setCameraClient } from './cameraAwareness'

// Types
export type StreamChunk =
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; args: string }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'done'; fullText: string }
  | { type: 'error'; message: string }

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const MODEL = 'gpt-5.4'

// Singleton client
let client: OpenAI | null = null

export function initOpenAI(apiKey: string): void {
  client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  setScreenClient(client)
  setCameraClient(client)
}

export function getClient(): OpenAI | null {
  return client
}

// Singleton AudioContext
let _audioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext({ sampleRate: 24000 })
  }
  return _audioCtx
}

export function playAudio(pcm16Data: Int16Array[]): void {
  const ctx = getAudioCtx()
  const float32Data = pcm16Data.map(chunk => {
    const f32 = new Float32Array(chunk.length)
    for (let i = 0; i < chunk.length; i++) {f32[i] = chunk[i] / 32768}
    return f32
  })
  const totalLength = float32Data.reduce((s, a) => s + a.length, 0)
  if (totalLength === 0) {return}
  const buffer = ctx.createBuffer(1, totalLength, 24000)
  const channel = buffer.getChannelData(0)
  let offset = 0
  for (const chunk of float32Data) {
    channel.set(chunk, offset)
    offset += chunk.length
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start()
}

// ── Tool definitions for agentic behavior ──────────────────────────

const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'run_terminal_command',
      description: 'Execute a shell command on the user\'s computer and return the output. Use for any system task: installing packages, running scripts, git operations, file management, searching, process management, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute (bash/zsh)' },
          cwd: { type: 'string', description: 'Working directory (optional, defaults to home)' },
          timeout: { type: 'number', description: 'Timeout in ms (optional, default 30000)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file on the user\'s computer.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file on the user\'s computer. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
          content: { type: 'string', description: 'Content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories at a given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to list' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_application',
      description: 'Open an application or URL on the user\'s computer.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Application name (e.g. "Safari", "Terminal") or URL to open' }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web and return results. Use when the user asks about current events, needs to look something up, etc.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_system_info',
      description: 'Get current system information: running apps, active window, CPU/memory usage, etc.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'capture_screen',
      description: 'Take a screenshot of the user\'s screen right now.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
]

// Execute a tool call via IPC to main process
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'run_terminal_command': {
        const result = await window.api.agent.runCommand(
          args.command as string,
          args.cwd as string | undefined,
          args.timeout as number | undefined
        )
        return result
      }
      case 'read_file': {
        return await window.api.agent.readFile(args.path as string)
      }
      case 'write_file': {
        await window.api.agent.writeFile(args.path as string, args.content as string)
        return `File written successfully to ${args.path}`
      }
      case 'list_directory': {
        return await window.api.agent.listDirectory(args.path as string)
      }
      case 'open_application': {
        await window.api.agent.openApp(args.target as string)
        return `Opened: ${args.target}`
      }
      case 'search_web': {
        return await window.api.agent.searchWeb(args.query as string)
      }
      case 'get_system_info': {
        const info = await window.api.system.getInfo()
        const activeWin = await window.api.system.getActiveWindow()
        const apps = await window.api.system.getRunningApps()
        return JSON.stringify({ ...info, activeWindow: activeWin, runningApps: apps }, null, 2)
      }
      case 'capture_screen': {
        const screenshot = await window.api.captureScreen()
        return screenshot ? 'Screenshot captured and attached.' : 'Failed to capture screen.'
      }
      default:
        return `Unknown tool: ${name}`
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`
  }
}

// Realtime WebSocket session (voice mode)
export class RealtimeSession {
  private ws: WebSocket | null = null
  private micStream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private apiKey: string

  public onText: ((text: string) => void) | null = null
  public onAudio: ((pcm: Int16Array) => void) | null = null
  public onError: ((msg: string) => void) | null = null
  public onTranscript: ((text: string) => void) | null = null

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async connect(systemPrompt: string): Promise<void> {
    const url = 'wss://api.openai.com/v1/realtime?model=gpt-5.4-realtime'
    this.ws = new WebSocket(url, [
      'realtime',
      `openai-insecure-api-key.${this.apiKey}`,
      'openai-beta.realtime-v1'
    ])

    return new Promise((resolve, reject) => {
      if (!this.ws) {return reject(new Error('No WebSocket'))}

      this.ws.onopen = () => {
        this.send({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: systemPrompt,
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 800
            }
          }
        })
        resolve()
      }

      this.ws.onmessage = (ev) => this.handleEvent(JSON.parse(ev.data))
      this.ws.onerror = () => { reject(new Error('WebSocket error')); this.onError?.('Connection failed') }
      this.ws.onclose = () => this.cleanup()
    })
  }

  private handleEvent(ev: Record<string, unknown>): void {
    switch (ev.type) {
      case 'response.audio_transcript.delta':
        if (this.onText && ev.delta) {this.onText(ev.delta as string)}
        break
      case 'response.audio.delta':
        if (this.onAudio && ev.delta) {
          const bin = atob(ev.delta as string)
          const pcm = new Int16Array(bin.length / 2)
          for (let i = 0; i < bin.length; i += 2)
            {pcm[i / 2] = bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8)}
          this.onAudio(pcm)
        }
        break
      case 'conversation.item.input_audio_transcription.completed':
        if (this.onTranscript && ev.transcript) {this.onTranscript(ev.transcript as string)}
        break
      case 'error':
        this.onError?.((ev.error as Record<string, string>)?.message || 'Unknown error')
        break
    }
  }

  async startMic(): Promise<void> {
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.audioCtx = new AudioContext({ sampleRate: 24000 })
    const source = this.audioCtx.createMediaStreamSource(this.micStream)

    const workletCode = `
      class RecorderProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0]
          if (input.length > 0) {
            const channelData = input[0]
            if (channelData && channelData.length > 0) {
              this.port.postMessage(channelData)
            }
          }
          return true
        }
      }
      registerProcessor('recorder-worklet', RecorderProcessor)
    `
    const blob = new Blob([workletCode], { type: 'application/javascript' })
    const workletUrl = URL.createObjectURL(blob)

    await this.audioCtx.audioWorklet.addModule(workletUrl)
    URL.revokeObjectURL(workletUrl)

    this.workletNode = new AudioWorkletNode(this.audioCtx, 'recorder-worklet')
    source.connect(this.workletNode)
    this.workletNode.connect(this.audioCtx.destination)

    let buffer: number[] = []

    this.workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        buffer = []
        return
      }

      const f32 = e.data
      for (let i = 0; i < f32.length; i++) {
        buffer.push(Math.max(-32768, Math.min(32767, f32[i] * 32767)))
      }

      if (buffer.length >= 4096) {
        const chunk = buffer.splice(0, 4096)
        const pcm = new Int16Array(chunk)
        const bytes = new Uint8Array(pcm.buffer)
        let b64 = ''
        for (let i = 0; i < bytes.length; i += 8192) {
          b64 += String.fromCharCode(...bytes.slice(i, i + 8192))
        }
        this.send({ type: 'input_audio_buffer.append', audio: btoa(b64) })
      }
    }
  }

  stopMic(): void {
    if (this.workletNode) {
      this.workletNode.disconnect()
      this.workletNode.port.close()
      this.workletNode = null
    }
    this.micStream?.getTracks().forEach(t => t.stop())
    this.micStream = null
    this.audioCtx?.close()
    this.audioCtx = null
  }

  sendText(text: string): void {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
    })
    this.send({ type: 'response.create' })
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {this.ws.send(JSON.stringify(data))}
  }

  disconnect(): void { this.stopMic(); this.ws?.close(); this.ws = null }
  private cleanup(): void { this.stopMic(); this.ws = null }
}

// Rate limiting
let _requestTimestamps: number[] = []
const MAX_REQUESTS_PER_MINUTE = 20

function checkRateLimit(): boolean {
  const now = Date.now()
  _requestTimestamps = _requestTimestamps.filter(ts => now - ts < 60000)
  if (_requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {return false}
  _requestTimestamps.push(now)
  return true
}

// ── Agentic streaming response with tool use loop ──────────────────

const MAX_HISTORY = 20
const MAX_TOOL_ROUNDS = 10  // prevent infinite loops

export async function* streamResponse(
  userMessage: string,
  history: ConversationMessage[],
  cameraFrame: string | null,
  screenCapture: string | null
): AsyncGenerator<StreamChunk> {
  if (!client) { yield { type: 'error', message: 'OpenAI not initialized' }; return }

  if (!checkRateLimit()) {
    yield { type: 'error', message: 'Rate limit reached. Please wait a moment.' }
    return
  }

  // 1. Gather live system context
  yield { type: 'thinking', text: 'Reading environment...' }
  let sysCtx: string | null = null
  try {
    sysCtx = formatSystemContext(await getSystemSnapshot())
  } catch { /* non-fatal */ }

  // 2. Build system prompt
  yield { type: 'thinking', text: 'Recalling context...' }
  const systemPrompt = await buildSystemPrompt(userMessage, screenCapture, sysCtx)

  // 3. Build messages array
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt }
  ]

  const recentHistory = history.slice(-MAX_HISTORY)
  for (const msg of recentHistory) {
    if (msg.role === 'system') {continue}
    messages.push({ role: msg.role, content: msg.content })
  }

  // Current user message with attached images
  const currentContent: OpenAI.ChatCompletionContentPart[] = [
    { type: 'text', text: userMessage }
  ]

  if (cameraFrame) {
    currentContent.push(
      { type: 'image_url', image_url: { url: cameraFrame, detail: 'low' } },
      { type: 'text', text: '(Live camera frame showing the user.)' }
    )
  }

  if (screenCapture) {
    currentContent.push(
      { type: 'image_url', image_url: { url: screenCapture, detail: 'auto' } },
      { type: 'text', text: '(Live screenshot of the user\'s screen.)' }
    )
  }

  messages.push({ role: 'user', content: currentContent })

  // 4. Agentic loop - stream with tool calls
  yield { type: 'thinking', text: 'Thinking...' }

  let fullResponse = ''
  let toolRounds = 0

  try {
    while (toolRounds < MAX_TOOL_ROUNDS) {
      toolRounds++

      const stream = await client.chat.completions.create({
        model: MODEL,
        stream: true,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_completion_tokens: 4096
      })

      let currentToolCalls: Map<number, { id: string; name: string; args: string }> = new Map()
      let hasToolCalls = false
      let responseContent = ''

      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        if (!choice) {continue}

        // Text content
        const delta = choice.delta?.content || ''
        if (delta) {
          responseContent += delta
          fullResponse += delta
          yield { type: 'text', text: delta }
        }

        // Tool calls
        if (choice.delta?.tool_calls) {
          hasToolCalls = true
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index
            if (!currentToolCalls.has(idx)) {
              currentToolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: '' })
            }
            const entry = currentToolCalls.get(idx)!
            if (tc.id) {entry.id = tc.id}
            if (tc.function?.name) {entry.name = tc.function.name}
            if (tc.function?.arguments) {entry.args += tc.function.arguments}
          }
        }

        // Stop reason
        if (choice.finish_reason === 'stop') {
          // Normal completion, no more tool calls
          hasToolCalls = false
          break
        }
      }

      if (!hasToolCalls || currentToolCalls.size === 0) {
        // Done - no tool calls, just text
        break
      }

      // Process tool calls
      // Add assistant message with tool calls to history
      const toolCallsArray = Array.from(currentToolCalls.values())
      messages.push({
        role: 'assistant',
        content: responseContent || null,
        tool_calls: toolCallsArray.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.args }
        }))
      })

      // Execute each tool and add results
      for (const tc of toolCallsArray) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.args) } catch { args = {} }

        yield { type: 'tool_call', name: tc.name, args: tc.args }
        yield { type: 'thinking', text: `Running ${tc.name}...` }

        const result = await executeTool(tc.name, args)

        // Truncate very long results
        const truncatedResult = result.length > 8000
          ? result.slice(0, 8000) + '\n\n[Output truncated]'
          : result

        yield { type: 'tool_result', name: tc.name, result: truncatedResult.slice(0, 500) }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: truncatedResult
        })
      }

      // Continue the loop - model will process tool results
      yield { type: 'thinking', text: 'Processing results...' }
    }

    // 5. Persist to long-term memory
    if (fullResponse.trim()) {
      await persistInteraction(userMessage, fullResponse)
      extractAndStoreBubbles(userMessage, fullResponse, client).catch(() => {})
    }

    yield { type: 'done', fullText: fullResponse }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    if (msg.includes('429') || msg.includes('rate')) {
      yield { type: 'error', message: 'Rate limit hit. Please wait a minute and try again.' }
    } else {
      yield { type: 'error', message: msg }
    }
  }
}

// Ambient response - proactive AI from overheard speech
export async function* streamAmbientResponse(
  transcript: string,
  context: { screenContext: string | null; activeApp: string | null }
): AsyncGenerator<StreamChunk> {
  if (!client) {return}
  if (!checkRateLimit()) {return}

  try {
    const stream = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      max_completion_tokens: 500,
      tools: TOOLS,
      tool_choice: 'auto',
      messages: [
        {
          role: 'system',
          content: `You are Oni, a fully autonomous desktop AI assistant with ambient hearing. You just overheard the user say something.
${context.screenContext ? `They are currently looking at: ${context.screenContext}` : ''}
${context.activeApp ? `Active app: ${context.activeApp}` : ''}

You have full access to their computer - you can run commands, open apps, read/write files, and search the web.

Rules:
- If what they said suggests they need help, DO something proactive - run a command, look something up, open an app
- If it's just casual talk, singing, or talking to someone else, respond with exactly: [SKIP]
- Be brief and action-oriented. Do the thing, then tell them what you did.
- Start with something natural like "I heard you mention..." or "On it -"`
        },
        { role: 'user', content: `Overheard: "${transcript}"` }
      ]
    })

    let fullResponse = ''
    let hasToolCalls = false
    const toolCallAccum: Map<number, { id: string; name: string; args: string }> = new Map()

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) {continue}

      const delta = choice.delta?.content || ''
      if (delta) {
        fullResponse += delta
        if (fullResponse.includes('[SKIP]')) {return}
        yield { type: 'text', text: delta }
      }

      if (choice.delta?.tool_calls) {
        hasToolCalls = true
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index
          if (!toolCallAccum.has(idx)) {
            toolCallAccum.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: '' })
          }
          const entry = toolCallAccum.get(idx)!
          if (tc.id) {entry.id = tc.id}
          if (tc.function?.name) {entry.name = tc.function.name}
          if (tc.function?.arguments) {entry.args += tc.function.arguments}
        }
      }
    }

    // Execute any tool calls from ambient response
    if (hasToolCalls && toolCallAccum.size > 0) {
      for (const tc of toolCallAccum.values()) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.args) } catch {}

        yield { type: 'tool_call', name: tc.name, args: tc.args }
        const result = await executeTool(tc.name, args)
        yield { type: 'tool_result', name: tc.name, result: result.slice(0, 300) }

        // Follow up with the result
        const followUp = await client.chat.completions.create({
          model: MODEL,
          max_completion_tokens: 200,
          messages: [
            { role: 'system', content: 'You just ran a tool for the user. Briefly summarize what happened in 1-2 sentences.' },
            { role: 'user', content: `Tool: ${tc.name}\nResult: ${result.slice(0, 2000)}` }
          ]
        })
        const summary = followUp.choices[0]?.message?.content || ''
        if (summary) {
          fullResponse += ' ' + summary
          yield { type: 'text', text: ' ' + summary }
        }
      }
    }

    if (fullResponse.trim() && !fullResponse.includes('[SKIP]')) {
      yield { type: 'done', fullText: fullResponse }
    }
  } catch {
    // Ambient responses are best-effort
  }
}
