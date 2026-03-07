// Heartbeat Scheduler - enables autonomous agent behavior
// Runs periodic checks so the AI can proactively act on:
// - Screen changes (new app, new content)
// - System state changes
// - Scheduled tasks
// - Memory-based follow-ups

import { getClient } from './openai-realtime'
import { getSystemSnapshot, formatSystemContext } from './systemContext'
import { loadWorkingContext, recallMemories } from './memory'
import { getLastScreenDescription } from './screenUnderstanding'
import { getLastObservation } from './cameraAwareness'
import { useStore } from '../store'

const MODEL = 'gpt-5.4'

interface HeartbeatContext {
  screenDescription: string | null
  cameraObservation: string | null
  systemContext: string | null
  activeApp: string | null
  activeWindowTitle: string | null
  recentMemories: string[]
  pendingTasks: string[]
}

let _heartbeatInterval: ReturnType<typeof setInterval> | null = null
let _lastHeartbeatTs = 0
const HEARTBEAT_INTERVAL_MS = 30_000 // every 30s
let _lastActiveApp = ''
let _lastWindowTitle = ''

export function startHeartbeat(): void {
  if (_heartbeatInterval) {return}

  log('Heartbeat scheduler started')

  _heartbeatInterval = setInterval(async () => {
    await runHeartbeat()
  }, HEARTBEAT_INTERVAL_MS)

  // Run first heartbeat after 10s
  setTimeout(runHeartbeat, 10_000)
}

export function stopHeartbeat(): void {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval)
    _heartbeatInterval = null
    log('Heartbeat scheduler stopped')
  }
}

async function runHeartbeat(): Promise<void> {
  const client = getClient()
  if (!client) {return}

  const store = useStore.getState()
  if (store.mode !== 'idle') {return} // don't interrupt active interactions

  const now = Date.now()
  if (now - _lastHeartbeatTs < HEARTBEAT_INTERVAL_MS - 1000) {return}
  _lastHeartbeatTs = now

  try {
    // Gather context
    const ctx = await gatherContext()

    // Check if anything meaningful changed since last heartbeat
    const appChanged = ctx.activeApp !== _lastActiveApp
    const windowChanged = ctx.activeWindowTitle !== _lastWindowTitle
    _lastActiveApp = ctx.activeApp || ''
    _lastWindowTitle = ctx.activeWindowTitle || ''

    // Check pending tasks
    const pendingTasks = store.tasks.filter(t => t.status === 'pending' || t.status === 'running')

    // Only invoke the AI if there's something worth acting on
    if (!appChanged && !windowChanged && pendingTasks.length === 0) {return}

    log(`Heartbeat: app=${ctx.activeApp}, window=${ctx.activeWindowTitle}, tasks=${pendingTasks.length}`)

    // If there are pending tasks, process the next one
    if (pendingTasks.length > 0) {
      const task = pendingTasks[0]
      store.updateTask(task.id, { status: 'running' })
      log(`Processing task: ${task.title}`)

      try {
        const response = await client.chat.completions.create({
          model: MODEL,
          max_completion_tokens: 1000,
          tools: getHeartbeatTools(),
          tool_choice: 'auto',
          messages: [
            {
              role: 'system',
              content: `You are Oni, an autonomous AI agent. You have a task to complete.
${ctx.systemContext || ''}
${ctx.screenDescription ? `Screen: ${ctx.screenDescription}` : ''}

Task: "${task.title}"
Description: ${task.description}

Execute this task using your tools. Be direct and efficient.`
            },
            { role: 'user', content: `Please complete this task: ${task.title}\n${task.description}` }
          ]
        })

        const msg = response.choices[0]?.message
        let output = msg?.content || ''

        // Execute any tool calls
        if (msg?.tool_calls) {
          for (const tc of msg.tool_calls) {
            try {
              const args = JSON.parse(tc.function.arguments)
              const result = await executeHeartbeatTool(tc.function.name, args)
              output += `\n[${tc.function.name}]: ${result.slice(0, 500)}`
            } catch (e) {
              output += `\n[${tc.function.name}]: Error - ${e}`
            }
          }
        }

        store.updateTask(task.id, { status: 'done', output })
        store.addMessage({ role: 'system', content: `[Task Complete] ${task.title}: ${output.slice(0, 200)}` })
        log(`Task completed: ${task.title}`)
      } catch (e) {
        store.updateTask(task.id, { status: 'failed', output: String(e) })
        log(`Task failed: ${task.title} - ${e}`)
      }
    }
  } catch (e) {
    log(`Heartbeat error: ${e}`)
  }
}

async function gatherContext(): Promise<HeartbeatContext> {
  let systemContext: string | null = null
  let activeApp: string | null = null
  let activeWindowTitle: string | null = null

  try {
    const snap = await getSystemSnapshot()
    systemContext = formatSystemContext(snap)
    activeApp = snap.activeApp
    activeWindowTitle = snap.activeWindowTitle
  } catch {}

  const recentMemories = (await recallMemories('recent activity', 5))
    .map(m => m.title)

  const pendingTasks = useStore.getState().tasks
    .filter(t => t.status === 'pending')
    .map(t => t.title)

  return {
    screenDescription: getLastScreenDescription(),
    cameraObservation: getLastObservation(),
    systemContext,
    activeApp,
    activeWindowTitle,
    recentMemories,
    pendingTasks
  }
}

function getHeartbeatTools(): import('openai').default.ChatCompletionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'run_command',
        description: 'Run a shell command',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string' },
            cwd: { type: 'string' }
          },
          required: ['command']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write a file',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } },
          required: ['path', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'open_app',
        description: 'Open an application or URL',
        parameters: {
          type: 'object',
          properties: { target: { type: 'string' } },
          required: ['target']
        }
      }
    }
  ]
}

async function executeHeartbeatTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'run_command':
      return window.api.agent.runCommand(args.command as string, args.cwd as string | undefined)
    case 'read_file':
      return window.api.agent.readFile(args.path as string)
    case 'write_file':
      await window.api.agent.writeFile(args.path as string, args.content as string)
      return 'Written.'
    case 'open_app':
      await window.api.agent.openApp(args.target as string)
      return 'Opened.'
    default:
      return `Unknown tool: ${name}`
  }
}

function log(msg: string): void {
  useStore.getState().addLog(msg)
}
