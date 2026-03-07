import { useStore } from '../store'
import { clearWorkingMemory } from '../services/memory'
import { stopSpeaking } from '../services/tts'
import { disconnectFromGateway } from '../services/gateway'

interface Props {
  onClose: () => void
  ttsEnabled: boolean
  onTtsToggle: () => void
  voiceOn: boolean
  onVoiceModeToggle: () => void
}

export function SettingsPanel({ onClose, ttsEnabled, onTtsToggle, voiceOn, onVoiceModeToggle }: Props) {
  const { clearMessages, setApiKey, setGatewayUrl, setGatewayToken, setGatewayConnected, setMode } = useStore()

  async function handleClear() {
    stopSpeaking()
    clearMessages()
    await clearWorkingMemory()
  }

  async function handleLogout() {
    stopSpeaking()
    await disconnectFromGateway()
    await window.api.store.delete('oni_gateway_url')
    await window.api.store.delete('oni_gateway_token')
    await window.api.store.delete('oni_api_key')
    setGatewayUrl(null)
    setGatewayToken(null)
    setGatewayConnected(false)
    setApiKey(null)
    clearMessages()
    setMode('login')
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="w-full max-w-sm bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl shadow-xl p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[var(--text-primary)] text-base font-semibold">Settings</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="space-y-3">
          <SettingsRow label="Text-to-Speech" description="Read responses aloud" active={ttsEnabled} onToggle={onTtsToggle} />
          <SettingsRow label="Voice Mode" description="Real-time voice conversation" active={voiceOn} onToggle={onVoiceModeToggle} />

          <div className="border-t border-[var(--border-light)] pt-3 mt-4 space-y-2">
            <button onClick={handleClear} className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-all">
              Clear conversation
            </button>
            <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--error)] hover:bg-red-50 transition-all">
              Logout
            </button>
          </div>
        </div>

        <p className="text-[var(--text-muted)] text-[10px] text-center mt-6 uppercase tracking-wider font-medium">
          Oni Gateway | Shortcut: Cmd+Shift+O
        </p>
      </div>
    </div>
  )
}

function SettingsRow({ label, description, active, onToggle }: {
  label: string; description: string; active: boolean; onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-all">
      <div>
        <p className="text-[var(--text-primary)] text-sm font-medium">{label}</p>
        <p className="text-[var(--text-tertiary)] text-xs">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`w-10 h-6 rounded-full transition-all flex items-center ${active ? 'bg-[var(--accent)] justify-end' : 'bg-[var(--border)] justify-start'}`}
      >
        <div className="w-4 h-4 rounded-full bg-white shadow-sm mx-1" />
      </button>
    </div>
  )
}
