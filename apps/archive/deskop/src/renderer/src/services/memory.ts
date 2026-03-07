// Memory Bubble System - interconnected knowledge graph
// Categories: person | episode | preference | note | place | topic

export type BubbleCategory = 'person' | 'episode' | 'preference' | 'note' | 'place' | 'topic'

export interface MemoryBubble {
  id: string
  category: BubbleCategory
  title: string
  content: string
  entities: string[]
  links: string[]
  timestamp: number
  importance: number      // 0-1
  accessCount: number
  lastAccessed: number
  tags: string[]
  color?: string
}

export interface WorkingContext {
  screenContext: string | null
  lastScreenCapture: number
}

export const CATEGORY_COLORS: Record<BubbleCategory, string> = {
  person: '#3b82f6',
  episode: '#8b5cf6',
  preference: '#f59e0b',
  note: '#10b981',
  place: '#ef4444',
  topic: '#6366f1'
}

const STORE_CTX = 'oni_working'

function uid(): string {
  return `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// Load ALL bubbles from SQLite
export async function getAllBubbles(): Promise<MemoryBubble[]> {
  try {
    return await window.api.db.getBubbles()
  } catch (e) {
    console.error('Failed to load bubbles:', e)
    return []
  }
}

// Create a new bubble with auto-linking
export async function createBubble(
  category: BubbleCategory,
  title: string,
  content: string,
  opts: {
    entities?: string[]
    links?: string[]
    importance?: number
    tags?: string[]
  } = {}
): Promise<MemoryBubble> {
  const bubbles = await getAllBubbles()

  const bubble: MemoryBubble = {
    id: uid(),
    category,
    title,
    content,
    entities: opts.entities || [],
    links: opts.links || [],
    timestamp: Date.now(),
    importance: opts.importance || 0.5,
    accessCount: 0,
    lastAccessed: Date.now(),
    tags: opts.tags || []
  }

  // Auto-link by shared entities
  const newEntities = new Set(bubble.entities.map(e => e.toLowerCase()))
  for (const existing of bubbles) {
    const sharedEntity = existing.entities.some(e => newEntities.has(e.toLowerCase()))
    const titleMatch = newEntities.has(existing.title.toLowerCase())
    if (sharedEntity || titleMatch) {
      if (!bubble.links.includes(existing.id)) {bubble.links.push(existing.id)}
      if (!existing.links.includes(bubble.id)) {
        existing.links.push(bubble.id)
        await window.api.db.insertBubble(existing).catch(() => {})
      }
    }
  }

  await window.api.db.insertBubble(bubble)
  return bubble
}

// Backward compat alias
export async function storeMemory(
  content: string,
  _type: 'episodic' | 'semantic',
  importance = 0.5,
  tags: string[] = []
): Promise<void> {
  const category: BubbleCategory = tags.includes('camera-observation') ? 'note' : 'episode'
  await createBubble(category, content.slice(0, 60), content, { importance, tags })
}

// Recall memories matching a query - keyword-based scoring
export async function recallMemories(query: string, limit = 8): Promise<MemoryBubble[]> {
  const bubbles = await getAllBubbles()
  if (!query.trim()) {return bubbles.slice(0, limit)}

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) {return bubbles.slice(0, limit)}

  const scored = bubbles.map(b => {
    const searchText = `${b.title} ${b.content} ${b.entities.join(' ')} ${b.tags.join(' ')}`.toLowerCase()
    let score = 0

    const matched = words.filter(w => searchText.includes(w)).length
    score += (matched / words.length) * 0.35

    for (const entity of b.entities) {
      if (words.some(w => entity.toLowerCase().includes(w))) {score += 0.2}
    }

    if (words.some(w => b.title.toLowerCase().includes(w))) {score += 0.15}

    const daysOld = (Date.now() - b.timestamp) / 86400000
    score += Math.max(0, 0.15 * (1 - daysOld / 7))

    score += b.importance * 0.15

    return { bubble: b, score }
  })

  const results = scored
    .filter(s => s.score > 0.05)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)

  // Bump access counts
  for (const { bubble } of results) {
    bubble.accessCount++
    bubble.lastAccessed = Date.now()
    window.api.db.updateBubbleAccess(bubble.id, bubble.accessCount, bubble.lastAccessed).catch(() => {})
  }

  return results.map(s => s.bubble)
}

// Delete a bubble
export async function deleteBubble(id: string): Promise<void> {
  await window.api.db.deleteBubble(id)
}

// Working context
export async function loadWorkingContext(): Promise<WorkingContext> {
  const ctxStr = localStorage.getItem(STORE_CTX)
  if (ctxStr) {
    try {
      return JSON.parse(ctxStr) as WorkingContext
    } catch {
      // ignore
    }
  }
  return { screenContext: null, lastScreenCapture: 0 }
}

export async function updateScreenContext(description: string): Promise<void> {
  localStorage.setItem(STORE_CTX, JSON.stringify({
    screenContext: description, lastScreenCapture: Date.now()
  } satisfies WorkingContext))
}

export async function clearWorkingMemory(): Promise<void> {
  localStorage.setItem(STORE_CTX, JSON.stringify({ screenContext: null, lastScreenCapture: 0 }))
}

// AI entity extraction + bubble creation after each interaction
export async function extractAndStoreBubbles(
  userMsg: string,
  assistantMsg: string,
  client: import('openai').default
): Promise<void> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-5.4',
      response_format: { type: 'json_object' },
      max_completion_tokens: 500,
      messages: [
        {
          role: 'system',
          content: `You extract structured memories from conversations. Return JSON with an array "bubbles", each having:
- "category": one of "person", "episode", "preference", "note", "place", "topic"
- "title": short label (2-5 words)
- "content": one-sentence description
- "entities": array of key names/topics/places mentioned
- "importance": 0.0-1.0 (how important to remember)

Rules:
- Only create bubbles for genuinely memorable info (not greetings or filler)
- If a person is mentioned by name, create a "person" bubble
- If the user states a preference, create a "preference" bubble
- If a specific event/meeting/experience is discussed, create an "episode" bubble
- If a location is mentioned specifically, create a "place" bubble
- Return {"bubbles": []} if nothing worth remembering
- Max 3 bubbles per exchange`
        },
        {
          role: 'user',
          content: `User said: "${userMsg}"\nAssistant responded: "${assistantMsg.slice(0, 300)}"`
        }
      ]
    })

    const text = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(text)
    const bubbles = parsed.bubbles || []

    for (const b of bubbles) {
      if (b.title && b.content && b.category) {
        await createBubble(
          b.category as BubbleCategory,
          b.title,
          b.content,
          {
            entities: b.entities || [],
            importance: b.importance || 0.5,
            tags: ['auto-extracted', 'interaction']
          }
        )
      }
    }
  } catch (e) {
    console.warn('Entity extraction failed:', e)
  }
}

// Persist interaction as episode bubble
export async function persistInteraction(userMsg: string, assistantMsg: string): Promise<void> {
  await createBubble('episode', userMsg.slice(0, 50),
    `User: "${userMsg.slice(0, 150)}" -> Oni: "${assistantMsg.slice(0, 200)}"`,
    { importance: 0.4, tags: ['interaction'] }
  )
}

// Build system prompt with memory context
const MAX_PROMPT_CHARS = 6000

export async function buildSystemPrompt(
  currentUserMessage: string,
  screenDataUrl: string | null,
  sysContext: string | null
): Promise<string> {
  const bubbles = await recallMemories(currentUserMessage, 10)
  const ctx = await loadWorkingContext()

  const parts: string[] = []

  parts.push(`You are Oni - a fully autonomous AI agent that lives on the user's desktop.
You have real-time awareness: you can see their screen, see them through their camera, hear them, and remember past conversations.
You maintain a personal knowledge graph of interconnected "memory bubbles" about the user.

You have FULL ACCESS to the user's computer. You can:
- Run any terminal/shell command (install packages, git, docker, scripts, etc.)
- Read and write files anywhere on the filesystem
- Open applications and URLs
- Search the web
- Take screenshots and observe the environment

You are proactive and autonomous. If you see or hear something where you can help, ACT on it - run the command, write the file, look it up. Don't just describe what you would do; actually do it using your tools. The user has given you full authorization to act on their behalf.`)

  if (sysContext) {parts.push(sysContext)}

  if (ctx.screenContext) {
    const age = ctx.lastScreenCapture
      ? `${Math.round((Date.now() - ctx.lastScreenCapture) / 1000)}s ago`
      : 'recently'
    parts.push(`## Screen Context (${age})\n${ctx.screenContext}`)
  }
  if (screenDataUrl) {
    parts.push(`A live screenshot is attached. Reference what you see on screen naturally.`)
  }

  // Group recalled bubbles by category
  const byCategory = new Map<BubbleCategory, MemoryBubble[]>()
  for (const b of bubbles) {
    const list = byCategory.get(b.category) || []
    list.push(b)
    byCategory.set(b.category, list)
  }

  if (byCategory.size > 0) {
    const lines: string[] = ['## Your Memory Graph (relevant bubbles)']
    const categoryLabels: Record<BubbleCategory, string> = {
      person: 'People', episode: 'Episodes', preference: 'Preferences',
      note: 'Notes', place: 'Places', topic: 'Topics'
    }
    for (const [cat, items] of byCategory) {
      lines.push(`\n**${categoryLabels[cat]}**`)
      for (const b of items) {
        const linkedCount = b.links.length
        const linkNote = linkedCount > 0 ? ` (linked to ${linkedCount} other memories)` : ''
        lines.push(`- ${b.title}: ${b.content}${linkNote}`)
      }
    }
    parts.push(lines.join('\n'))
  }

  parts.push(`## Behavior
- You are an autonomous agent - take action first, explain after. Use your tools freely.
- Reference your memory bubbles naturally: "I remember you mentioned...", "Last time we talked about..."
- If you see something on screen where you can help (error message, code issue, task), proactively act
- If the user asks you to do something, DO it (run command, write file, open app) - don't just describe steps
- If ambient listening is on and you hear them struggling, jump in and help
- Be concise and action-oriented. Show results, not instructions.
- The full conversation history is in the messages - refer back naturally`)

  let prompt = parts.join('\n\n')
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt = prompt.slice(0, MAX_PROMPT_CHARS) + '\n\n[Context truncated]'
  }
  return prompt
}
