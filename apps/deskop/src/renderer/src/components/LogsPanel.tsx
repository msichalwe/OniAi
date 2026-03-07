import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export function LogsPanel() {
  const { logs, clearLogs } = useStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#1a1a1a]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#333] flex-shrink-0">
        <span className="text-[#888] text-xs font-mono">System Logs ({logs.length})</span>
        {logs.length > 0 && (
          <button onClick={clearLogs} className="text-[#555] hover:text-[#999] text-xs font-mono transition-colors">Clear</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-2 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-[#555] text-center py-8">No logs yet</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="text-[#888] py-0.5 leading-relaxed break-all hover:text-[#bbb] transition-colors">
              {log}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
