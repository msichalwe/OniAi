import { useStore, TabId } from '../store'
import { ChatPanel } from './ChatPanel'
import { TerminalPanel } from './TerminalPanel'
import { TasksPanel } from './TasksPanel'
import { MemoryPanel } from './MemoryPanel'
import { LogsPanel } from './LogsPanel'
import { SettingsPanel } from './SettingsPanel'
import { MediaPanel } from './MediaPanel'
import { VoiceModeState } from '../hooks/useVoiceMode'
import { RefObject } from 'react'

interface Props {
  onSend: (text: string) => void
  camera: {
    active: boolean
    ready: boolean
    videoRef: RefObject<HTMLVideoElement | null>
    stopCamera: () => void
    captureFrame: () => string | null
  }
  screenCapture: string | null
  onCameraToggle: () => void
  onScreenToggle: () => void
  onAmbientToggle: () => void
  onVoiceModeToggle: () => void
  voiceOn: boolean
  voiceModeState: VoiceModeState
  voiceModeError: string | null
  ttsEnabled: boolean
  onTtsToggle: () => void
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'memory', label: 'Memory' },
  { id: 'logs', label: 'Logs' },
]

export function AppShell({
  onSend, camera, screenCapture,
  onCameraToggle, onScreenToggle, onAmbientToggle, onVoiceModeToggle,
  voiceOn, voiceModeState, voiceModeError,
  ttsEnabled, onTtsToggle
}: Props) {
  const { activeTab, setActiveTab, settingsOpen, setSettingsOpen, mode,
    ambientListening, screenCaptureActive, cameraActive, micActive, tasks } = useStore()

  const runningTasks = tasks.filter(t => t.status === 'running' || t.status === 'pending').length

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg-primary)] overflow-hidden">
      {/* Title bar */}
      <div
        className="h-11 flex items-center justify-between px-4 border-b border-[var(--border-light)] flex-shrink-0 bg-[var(--bg-secondary)]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-[var(--accent)] flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">O</span>
            </div>
            <span className="text-[var(--text-primary)] text-sm font-semibold">Oni</span>
          </div>
          <StatusDot mode={mode} />
        </div>

        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Feature indicators */}
          <div className="flex items-center gap-1 mr-2">
            <FeaturePill label="Ambient" active={ambientListening} onClick={onAmbientToggle} />
            <FeaturePill label="Screen" active={screenCaptureActive} onClick={onScreenToggle} />
            <FeaturePill label="Camera" active={cameraActive} onClick={onCameraToggle} />
            {voiceOn && <FeaturePill label="Voice" active={true} onClick={onVoiceModeToggle} accent />}
          </div>

          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all"
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <button onClick={() => window.api.window.minimize()} className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all" title="Minimize">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <button onClick={() => window.api.window.hide()} className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all" title="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="h-10 flex items-end px-4 gap-0 border-b border-[var(--border-light)] bg-[var(--bg-secondary)] flex-shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-[13px] font-medium transition-all relative ${
              activeTab === tab.id ? 'tab-active' : 'tab-inactive'
            }`}
          >
            {tab.label}
            {tab.id === 'tasks' && runningTasks > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center">
                {runningTasks}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Tab content */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeTab === 'chat' && (
            <ChatPanel
              onSend={onSend}
              voiceOn={voiceOn}
              voiceModeState={voiceModeState}
              voiceModeError={voiceModeError}
              onVoiceModeStop={onVoiceModeToggle}
            />
          )}
          {activeTab === 'terminal' && <TerminalPanel />}
          {activeTab === 'tasks' && <TasksPanel />}
          {activeTab === 'memory' && <MemoryPanel />}
          {activeTab === 'logs' && <LogsPanel />}
        </div>

        {/* Media sidebar */}
        {(camera.active || screenCapture) && (
          <MediaPanel
            cameraActive={camera.active}
            cameraReady={camera.ready}
            videoRef={camera.videoRef}
            screenCapture={screenCapture}
            onCameraClose={camera.stopCamera}
          />
        )}
      </div>

      {/* Settings overlay */}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          ttsEnabled={ttsEnabled}
          onTtsToggle={onTtsToggle}
          voiceOn={voiceOn}
          onVoiceModeToggle={onVoiceModeToggle}
        />
      )}
    </div>
  )
}

function StatusDot({ mode }: { mode: string }) {
  const colors: Record<string, string> = {
    idle: 'bg-[var(--success)]',
    listening: 'bg-green-500',
    thinking: 'bg-[var(--warning)]',
    responding: 'bg-[var(--accent)]',
  }
  const labels: Record<string, string> = {
    idle: 'Ready',
    listening: 'Listening',
    thinking: 'Thinking',
    responding: 'Responding',
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[mode] || 'bg-gray-400'} ${mode !== 'idle' ? 'animate-pulse' : ''}`} />
      <span className="text-[var(--text-tertiary)] text-[11px] font-medium">{labels[mode] || mode}</span>
    </div>
  )
}

function FeaturePill({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent?: boolean }) {
  if (!active) {return (
    <button onClick={onClick} className="text-[10px] px-2 py-0.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-all font-medium">
      {label}
    </button>
  )}
  return (
    <button onClick={onClick} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-all ${
      accent ? 'bg-[var(--accent)] text-white' : 'bg-[var(--accent-bg)] text-[var(--accent)] border border-[var(--border)]'
    }`}>
      {label} <span className="inline-block w-1 h-1 rounded-full bg-[var(--success)] ml-0.5 align-middle" />
    </button>
  )
}
