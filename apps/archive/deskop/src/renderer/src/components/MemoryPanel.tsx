import { useState, useEffect, useCallback } from 'react'
import { MemoryBubble, getAllBubbles, storeMemory, deleteBubble, BubbleCategory, CATEGORY_COLORS } from '../services/memory'

export function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryBubble[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [filterCategory, setFilterCategory] = useState<BubbleCategory | 'all'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const all = await getAllBubbles()
    setMemories(all)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [load])

  async function handleAddNote() {
    if (!newNote.trim()) {return}
    setAdding(true)
    await storeMemory(newNote.trim(), 'semantic', 0.8, ['user-note', 'manual'])
    setNewNote('')
    setAdding(false)
    load()
  }

  async function handleDelete(id: string) {
    await deleteBubble(id)
    load()
  }

  const filtered = memories.filter(m => {
    if (filterCategory !== 'all' && m.category !== filterCategory) {return false}
    if (query.trim()) {
      const q = query.toLowerCase()
      return `${m.title} ${m.content} ${m.entities.join(' ')}`.toLowerCase().includes(q)
    }
    return true
  })

  const categories: (BubbleCategory | 'all')[] = ['all', 'person', 'episode', 'preference', 'note', 'place', 'topic']
  const typeCount = (c: BubbleCategory) => memories.filter(m => m.category === c).length

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-[var(--border-light)] flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[var(--text-primary)] text-sm font-semibold">Memory Graph</h3>
          <span className="text-[var(--text-muted)] text-xs">{memories.length} memories</span>
        </div>
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all border ${
                filterCategory === cat
                  ? 'bg-[var(--accent-bg)] border-[var(--border)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
              }`}>
              {cat === 'all' ? `All (${memories.length})` : `${cat} (${typeCount(cat)})`}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Search memories..." value={query} onChange={e => setQuery(e.target.value)}
          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] shadow-sm" />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1">
            <p className="text-[var(--text-tertiary)] text-sm">No memories {query ? 'found' : 'yet'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => (
              <div key={m.id} className="group flex items-start gap-3 px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border)] transition-all">
                <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: CATEGORY_COLORS[m.category] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[var(--text-primary)] text-sm font-medium truncate">{m.title}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase" style={{ color: CATEGORY_COLORS[m.category], backgroundColor: CATEGORY_COLORS[m.category] + '15' }}>{m.category}</span>
                  </div>
                  <p className="text-[var(--text-tertiary)] text-xs leading-relaxed line-clamp-2">{m.content}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[var(--text-muted)] text-[10px]">{formatAge(m.timestamp)}</span>
                    {m.entities.length > 0 && <span className="text-[var(--text-muted)] text-[10px]">| {m.entities.slice(0, 3).join(', ')}</span>}
                  </div>
                </div>
                <button onClick={() => handleDelete(m.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--error)] transition-all flex-shrink-0">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 pb-4 pt-3 border-t border-[var(--border-light)] flex-shrink-0">
        <div className="flex gap-2">
          <input type="text" placeholder="Add a manual memory..." value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNote()}
            className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] shadow-sm" />
          <button onClick={handleAddNote} disabled={adding || !newNote.trim()}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-30 hover:bg-[var(--accent-light)] transition-all shadow-sm">Save</button>
        </div>
      </div>
    </div>
  )
}

function formatAge(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) {return 'just now'}
  if (mins < 60) {return `${mins}m ago`}
  if (hours < 24) {return `${hours}h ago`}
  return `${days}d ago`
}
