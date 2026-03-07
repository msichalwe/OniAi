import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'

export function TerminalPanel() {
  const { terminalEntries, addTerminalEntry, clearTerminal } = useStore()
  const [input, setInput] = useState('')
  const [cwd, setCwd] = useState('~')
  const [running, setRunning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalEntries])

  async function handleRun() {
    if (!input.trim() || running) {return}
    const cmd = input.trim()
    setInput('')
    setRunning(true)

    try {
      const output = await window.api.agent.runCommand(cmd, cwd === '~' ? undefined : cwd, 30000)
      addTerminalEntry({ command: cmd, output, cwd })

      // Track cd commands
      if (cmd.startsWith('cd ')) {
        const dir = cmd.slice(3).trim()
        if (dir.startsWith('/')) {setCwd(dir)}
        else if (dir === '~') {setCwd('~')}
        else {setCwd(cwd === '~' ? `~/${dir}` : `${cwd}/${dir}`)}
      }
    } catch (e: any) {
      addTerminalEntry({ command: cmd, output: `Error: ${e.message}`, cwd })
    }

    setRunning(false)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#1a1a1a]">
      {/* Terminal output */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 font-mono text-sm">
        {terminalEntries.length === 0 && (
          <div className="text-[#666] py-8 text-center text-xs">
            Terminal ready. Type a command below.
          </div>
        )}
        {terminalEntries.map(entry => (
          <div key={entry.id} className="mb-3 animate-fade-in">
            <div className="flex items-center gap-2 text-[#888] text-xs mb-0.5">
              <span className="text-[#6B8F71]">{entry.cwd}</span>
              <span className="text-[#444]">$</span>
            </div>
            <div className="text-[#E0D5C7] text-sm font-semibold">{entry.command}</div>
            {entry.output && (
              <pre className="text-[#999] text-xs mt-1 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">{entry.output}</pre>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[#333] flex items-center gap-2 flex-shrink-0">
        <span className="text-[#6B8F71] text-xs font-mono flex-shrink-0">{cwd} $</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleRun()}
          placeholder="Type a command..."
          disabled={running}
          className="flex-1 bg-transparent text-[#E0D5C7] text-sm font-mono placeholder:text-[#555] focus:outline-none disabled:opacity-50"
          autoFocus
        />
        {terminalEntries.length > 0 && (
          <button onClick={clearTerminal} className="text-[#555] hover:text-[#999] text-xs font-mono transition-colors" title="Clear">
            clear
          </button>
        )}
      </div>
    </div>
  )
}
