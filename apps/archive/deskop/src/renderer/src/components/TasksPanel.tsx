import { useState } from 'react'
import { useStore, AgentTask } from '../store'

export function TasksPanel() {
  const { tasks, addTask, updateTask, removeTask } = useStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  function handleAdd() {
    if (!title.trim()) {return}
    addTask({
      title: title.trim(),
      description: description.trim() || title.trim(),
      status: 'pending',
      output: ''
    })
    setTitle('')
    setDescription('')
  }

  const pending = tasks.filter(t => t.status === 'pending')
  const running = tasks.filter(t => t.status === 'running')
  const done = tasks.filter(t => t.status === 'done')
  const failed = tasks.filter(t => t.status === 'failed')

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Add task */}
      <div className="px-6 py-4 border-b border-[var(--border-light)] flex-shrink-0">
        <h3 className="text-[var(--text-primary)] text-sm font-semibold mb-3">Schedule a Task</h3>
        <div className="flex flex-col gap-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title (e.g. 'Check git status every 5 min')"
            className="bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] shadow-sm"
          />
          <div className="flex gap-2">
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Description (optional)"
              className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] shadow-sm"
            />
            <button
              onClick={handleAdd}
              disabled={!title.trim()}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-30 hover:bg-[var(--accent-light)] transition-all shadow-sm"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-[var(--text-tertiary)] text-sm">No tasks yet</p>
            <p className="text-[var(--text-muted)] text-xs">Add a task above for the agent to work on autonomously</p>
          </div>
        ) : (
          <div className="space-y-4">
            {running.length > 0 && <TaskGroup label="Running" tasks={running} onRemove={removeTask} onUpdate={updateTask} />}
            {pending.length > 0 && <TaskGroup label="Pending" tasks={pending} onRemove={removeTask} onUpdate={updateTask} />}
            {done.length > 0 && <TaskGroup label="Completed" tasks={done} onRemove={removeTask} onUpdate={updateTask} />}
            {failed.length > 0 && <TaskGroup label="Failed" tasks={failed} onRemove={removeTask} onUpdate={updateTask} />}
          </div>
        )}
      </div>
    </div>
  )
}

function TaskGroup({ label, tasks, onRemove, onUpdate }: {
  label: string; tasks: AgentTask[]; onRemove: (id: string) => void; onUpdate: (id: string, u: Partial<AgentTask>) => void
}) {
  return (
    <div>
      <h4 className="text-[var(--text-tertiary)] text-xs font-semibold uppercase tracking-wider mb-2">{label}</h4>
      <div className="space-y-2">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} onRemove={() => onRemove(task.id)} onRetry={() => onUpdate(task.id, { status: 'pending', output: '' })} />
        ))}
      </div>
    </div>
  )
}

function TaskCard({ task, onRemove, onRetry }: { task: AgentTask; onRemove: () => void; onRetry: () => void }) {
  const [expanded, setExpanded] = useState(false)

  const statusColors: Record<string, string> = {
    pending: 'bg-[var(--warning)]/20 text-[var(--warning)]',
    running: 'bg-[var(--accent)]/20 text-[var(--accent)]',
    done: 'bg-[var(--success)]/20 text-[var(--success)]',
    failed: 'bg-[var(--error)]/20 text-[var(--error)]',
  }

  return (
    <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${statusColors[task.status]}`}>
          {task.status}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[var(--text-primary)] text-sm font-medium truncate">{task.title}</p>
          <p className="text-[var(--text-tertiary)] text-xs truncate">{task.description}</p>
        </div>
        <div className="flex items-center gap-1">
          {task.status === 'failed' && (
            <button onClick={(e) => { e.stopPropagation(); onRetry() }} className="text-[var(--accent)] text-xs hover:underline">Retry</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>
      {expanded && task.output && (
        <div className="px-4 pb-3 border-t border-[var(--border-light)]">
          <pre className="text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-all mt-2 max-h-48 overflow-y-auto">{task.output}</pre>
        </div>
      )}
    </div>
  )
}
