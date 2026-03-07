import { useEffect, useRef } from 'react'
import { Message } from '../store'
import { useStore } from '../store'
import { VoiceModeState } from '../hooks/useVoiceMode'

interface Props {
  onSend: (text: string) => void
  voiceOn: boolean
  voiceModeState: VoiceModeState
  voiceModeError: string | null
  onVoiceModeStop: () => void
}

const PROMPTS = [
  "What's on my screen?",
  "Help me focus",
  "Run 'ls' in my home directory",
  "What apps am I running?"
]

export function ChatPanel({ onSend, voiceOn, voiceModeState, voiceModeError, onVoiceModeStop }: Props) {
  const { messages, streamingText, thinkingText, inputText, setInputText, mode } = useStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const busy = mode === 'thinking' || mode === 'responding'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, thinkingText])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (inputText.trim() && !busy) {
        onSend(inputText.trim())
        setInputText('')
      }
    }
  }

  const isEmpty = messages.length === 0 && !streamingText && !thinkingText

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
        {voiceOn ? (
          <VoiceView state={voiceModeState} error={voiceModeError} onStop={onVoiceModeStop} />
        ) : isEmpty ? (
          <EmptyState onSend={onSend} />
        ) : (
          <>
            {messages.map(msg => (
              <MessageRow key={msg.id} message={msg} />
            ))}
            {thinkingText && (
              <div className="flex items-start gap-3 py-2 animate-fade-in">
                <AgentAvatar />
                <div className="bg-[var(--bg-secondary)] rounded-xl rounded-tl-sm px-4 py-3 border border-[var(--border-light)] max-w-[75%]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[var(--accent)] text-[10px] font-bold uppercase tracking-wider">thinking</span>
                    <PulseDots />
                  </div>
                  <p className="text-[var(--text-tertiary)] text-sm italic">{thinkingText}</p>
                </div>
              </div>
            )}
            {streamingText && (
              <div className="flex items-start gap-3 py-2">
                <AgentAvatar />
                <div className="bg-[var(--bg-secondary)] rounded-xl rounded-tl-sm px-4 py-3 border border-[var(--accent)]/20 max-w-[75%]">
                  <div className="text-sm text-[var(--text-primary)] leading-relaxed">
                    <FormattedText text={streamingText} />
                    <span className="inline-block w-0.5 h-4 bg-[var(--accent)] ml-0.5 animate-blink align-middle rounded-full" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!voiceOn && (
        <div className="px-6 pb-4 pt-2 border-t border-[var(--border-light)] flex-shrink-0 bg-[var(--bg-primary)]">
          <div className="flex gap-3 items-end">
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Oni..."
              rows={1}
              disabled={busy}
              className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 resize-none min-h-[44px] max-h-[140px] disabled:opacity-40 shadow-sm"
            />
            <button
              onClick={() => { if (inputText.trim() && !busy) { onSend(inputText.trim()); setInputText('') } }}
              disabled={!inputText.trim() || busy}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--accent)] disabled:opacity-20 hover:bg-[var(--accent-light)] active:scale-95 transition-all flex-shrink-0 shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageRow({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    const isAction = message.content.startsWith('[Action]')
    const isResult = message.content.startsWith('[Result]')
    const isAmbient = message.content.startsWith('[Ambient]')
    const isTask = message.content.startsWith('[Task')

    let borderColor = 'border-[var(--border-light)]'
    let bgColor = 'bg-[var(--bg-secondary)]/50'
    let textColor = 'text-[var(--text-tertiary)]'
    let icon = '>'

    if (isAction) { borderColor = 'border-[var(--accent)]/30'; bgColor = 'bg-[var(--accent-bg)]/50'; textColor = 'text-[var(--accent)]'; icon = '$' }
    else if (isResult) { borderColor = 'border-[var(--success)]/30'; bgColor = 'bg-green-50'; textColor = 'text-[var(--success)]'; icon = '>' }
    else if (isAmbient) { borderColor = 'border-[var(--warning)]/30'; bgColor = 'bg-amber-50'; textColor = 'text-[var(--warning)]'; icon = '~' }
    else if (isTask) { borderColor = 'border-[var(--info)]/30'; bgColor = 'bg-blue-50'; textColor = 'text-[var(--info)]'; icon = '#' }

    return (
      <div className="py-1 animate-fade-in">
        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${borderColor} ${bgColor}`}>
          <span className={`${textColor} text-xs font-mono font-bold flex-shrink-0 mt-0.5`}>{icon}</span>
          <p className={`text-xs font-mono leading-relaxed break-all ${textColor}`}>{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-3 py-2 ${isUser ? 'flex-row-reverse' : ''} animate-fade-in`}>
      {!isUser && <AgentAvatar />}
      <div className={`max-w-[75%] px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'rounded-xl rounded-tr-sm bg-[var(--accent)] text-white ml-auto shadow-sm'
          : 'rounded-xl rounded-tl-sm bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-primary)]'
      }`}>
        <FormattedText text={message.content} />
      </div>
    </div>
  )
}

function AgentAvatar() {
  return (
    <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
      <span className="text-[11px] font-bold text-white">O</span>
    </div>
  )
}

function PulseDots() {
  return (
    <div className="flex gap-0.5 items-center">
      {[0, 1, 2].map(i => (
        <div key={i} className="w-1 h-1 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  )
}

function EmptyState({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 h-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-md">
          <span className="text-2xl font-bold text-white">O</span>
        </div>
        <div className="text-center">
          <p className="text-[var(--text-primary)] text-lg font-semibold">What can I help with?</p>
          <p className="text-[var(--text-tertiary)] text-sm mt-1">I can run commands, search the web, manage files, and more.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
        {PROMPTS.map(p => (
          <button key={p} onClick={() => onSend(p)}
            className="text-left px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-tertiary)] hover:border-[var(--border)] transition-all"
          >{p}</button>
        ))}
      </div>
    </div>
  )
}

function VoiceView({ state, error, onStop }: { state: VoiceModeState; error: string | null; onStop: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 h-full">
      <div className="relative flex items-center justify-center">
        <div className={`absolute w-24 h-24 rounded-full bg-[var(--accent)] opacity-10 animate-pulse-ring`} />
        <div className={`relative w-16 h-16 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-lg ${state === 'speaking' ? 'scale-110' : ''} transition-transform`}>
          {state === 'connecting' ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          )}
        </div>
      </div>
      <div className="text-center">
        <p className="text-[var(--text-primary)] text-sm font-medium capitalize">{state}</p>
        {error && <p className="text-[var(--error)] text-xs mt-1">{error}</p>}
      </div>
      <button onClick={onStop} className="px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-tertiary)] transition-all">
        Exit voice mode
      </button>
    </div>
  )
}

function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const code = part.slice(3, -3).replace(/^\w*\n/, '')
          return <code key={i} className="block bg-[var(--text-primary)] text-green-300 rounded-lg px-3 py-2 my-2 text-xs font-mono overflow-x-auto">{code}</code>
        }
        return <InlineFormatted key={i} text={part} />
      })}
    </span>
  )
}

function InlineFormatted({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          {return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>}
        if (part.startsWith('`') && part.endsWith('`'))
          {return <code key={i} className="bg-[var(--bg-tertiary)] px-1 py-0.5 rounded text-xs font-mono text-[var(--accent)]">{part.slice(1, -1)}</code>}
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
