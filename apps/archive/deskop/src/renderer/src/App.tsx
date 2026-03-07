/// <reference types="../../preload/index.d.ts" />
import { useEffect, useCallback, useRef, useState } from 'react'
import { useStore } from './store'
import { LoginScreen } from './components/LoginScreen'
import { AppShell } from './components/AppShell'
import { StreamSpeaker, setVoiceEnabled } from './services/tts'
import { sendMessage, onChatEvent, extractMessageText, type GatewayChatEvent } from './services/gateway'
import { useCamera } from './hooks/useCamera'
import { useScreenCapture } from './hooks/useScreenCapture'
import { useVoiceMode } from './hooks/useVoiceMode'
import { useAmbientListening } from './hooks/useAmbientListening'

function formatToolArgs(argsJson: string): string {
  try {
    const args = JSON.parse(argsJson)
    if (args.command) {return `\`${args.command}\``}
    if (args.path) {return args.path}
    if (args.target) {return args.target}
    if (args.query) {return `"${args.query}"`}
    return argsJson.slice(0, 100)
  } catch {
    return argsJson.slice(0, 100)
  }
}

export default function App() {
  const store = useStore()
  const {
    apiKey, mode, messages, streamingText, thinkingText,
    ambientListening, screenCaptureActive,
    setApiKey, setMode,
    addMessage, setThinkingText, appendStreamingText, resetStreaming, commitStreaming,
    setScreenCapture, setCameraActive, setMicActive,
    setAmbientListening, setScreenCaptureActive, addLog, addTerminalEntry
  } = store

  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [voiceOn, setVoiceOn] = useState(false)

  const camera = useCamera()
  const screenCap = useScreenCapture()
  const ambient = useAmbientListening()
  const speakerRef = useRef(new StreamSpeaker())

  const voiceMode = useVoiceMode({
    apiKey: apiKey || '',
    onTranscript: (text) => addMessage({ role: 'user', content: text }),
    onResponse: (delta) => {
      appendStreamingText(delta)
      speakerRef.current.feed(delta)
    },
    onResponseDone: () => {
      commitStreaming()
      speakerRef.current.flush()
      setMode('idle')
    }
  })

  // Gateway connection is handled by LoginScreen
  // No API key loading needed here

  // Tray menu toggle listener
  useEffect(() => {
    const unsub = window.api.tray.onToggle((feature, enabled) => {
      if (feature === 'ambient-listening') {
        if (enabled) {handleAmbientStart()}
        else {handleAmbientStop()}
      } else if (feature === 'screen-capture') {
        if (enabled) {handleScreenStart()}
        else {handleScreenStop()}
      } else if (feature === 'camera') {
        if (enabled) {camera.startCamera()}
        else {camera.stopCamera()}
      }
    })
    return unsub
  }, [])

  useEffect(() => { setVoiceEnabled(ttsEnabled) }, [ttsEnabled])

  useEffect(() => {
    if (screenCap.lastCapture) {
      setScreenCapture(screenCap.lastCapture)
    }
  }, [screenCap.lastCapture])

  useEffect(() => { setCameraActive(camera.active) }, [camera.active])

  useEffect(() => {
    if (voiceMode.state === 'listening') {setMode('listening')}
    else if (voiceMode.state === 'speaking') {setMode('responding')}
    else if (voiceOn && voiceMode.state === 'off') {setMode('idle')}
  }, [voiceMode.state, voiceOn])

  // Ambient listening handler — sends transcripts to gateway
  const handleAmbientTranscript = useCallback(async (transcript: string) => {
    addLog(`Ambient heard: "${transcript}"`)
    addMessage({ role: 'system', content: `[Ambient] Heard: "${transcript}"` })

    resetStreaming()
    setMode('responding')

    const result = await sendMessage(`[Ambient] User said: "${transcript}"`)
    if (!result.ok) {
      addMessage({ role: 'assistant', content: `Error: ${result.error ?? 'Failed to send ambient transcript'}` })
      setMode('idle')
    }
    // Response arrives via gateway chat events
  }, [])

  const handleAmbientStart = useCallback(async () => {
    await ambient.start(handleAmbientTranscript)
    setAmbientListening(true)
    window.api.tray.sync('ambient-listening', true)
    addLog('Ambient listening started')
  }, [ambient, handleAmbientTranscript])

  const handleAmbientStop = useCallback(() => {
    ambient.stop()
    setAmbientListening(false)
    window.api.tray.sync('ambient-listening', false)
    addLog('Ambient listening stopped')
  }, [ambient])

  const handleScreenStart = useCallback(() => {
    screenCap.startAutoCapture(60_000)
    setScreenCaptureActive(true)
    window.api.tray.sync('screen-capture', true)
  }, [screenCap])

  const handleScreenStop = useCallback(() => {
    screenCap.stopAutoCapture()
    setScreenCaptureActive(false)
    window.api.tray.sync('screen-capture', false)
  }, [screenCap])

  // Gateway chat event listener — handles streaming responses from the gateway agent
  useEffect(() => {
    const unsub = onChatEvent((event: GatewayChatEvent) => {
      if (event.state === 'delta') {
        const text = extractMessageText(event.message)
        if (text) {
          setThinkingText('')
          appendStreamingText(text)
          speakerRef.current.feed(text)
        }
      } else if (event.state === 'final') {
        const text = extractMessageText(event.message)
        if (text) {
          // If we were streaming, commit. If not, add as a complete message.
          const currentStreaming = useStore.getState().streamingText
          if (currentStreaming) {
            speakerRef.current.flush()
            commitStreaming()
          } else {
            addMessage({ role: 'assistant', content: text })
            speakerRef.current.feed(text)
            speakerRef.current.flush()
          }
        }
        setMode('idle')
      } else if (event.state === 'error') {
        speakerRef.current.reset()
        commitStreaming()
        addMessage({ role: 'assistant', content: `Error: ${event.errorMessage ?? 'Unknown error'}` })
        addLog(`Gateway error: ${event.errorMessage ?? 'Unknown error'}`)
        setMode('idle')
      } else if (event.state === 'aborted') {
        speakerRef.current.reset()
        commitStreaming()
        setMode('idle')
      }
    })
    return unsub
  }, [])

  // Send a message via the gateway
  const handleSend = useCallback(async (text: string) => {
    if (mode === 'thinking' || mode === 'responding') {return}

    if (voiceOn && voiceMode.state !== 'off') {
      voiceMode.sendText(text)
      addMessage({ role: 'user', content: text })
      return
    }

    addMessage({ role: 'user', content: text })
    resetStreaming()
    speakerRef.current.reset()
    setMode('thinking')
    setThinkingText('Sending to gateway...')

    // Capture screen + camera for context
    const screenData = await screenCap.captureOnce()
    let cameraData: string | null = null
    if (camera.active) {
      for (let i = 0; i < 5; i++) {
        cameraData = camera.captureFrame()
        if (cameraData) {break}
        await new Promise(r => setTimeout(r, 200))
      }
    }

    setMode('responding')

    const result = await sendMessage(text, {
      screenCapture: screenData,
      cameraFrame: cameraData,
    })

    if (!result.ok) {
      speakerRef.current.reset()
      commitStreaming()
      addMessage({ role: 'assistant', content: `Error: ${result.error ?? 'Failed to send'}` })
      addLog(`Send error: ${result.error}`)
      setMode('idle')
    }
    // Response will arrive via gateway chat events (handled in useEffect above)
  }, [mode, voiceOn, voiceMode, camera, screenCap])

  const handleCameraToggle = useCallback(async () => {
    if (camera.active) {
      camera.stopCamera()
      window.api.tray.sync('camera', false)
    } else {
      await camera.startCamera()
      window.api.tray.sync('camera', true)
    }
  }, [camera])

  const handleScreenToggle = useCallback(() => {
    if (screenCaptureActive) {handleScreenStop()}
    else {handleScreenStart()}
  }, [screenCaptureActive, handleScreenStart, handleScreenStop])

  const handleAmbientToggle = useCallback(async () => {
    if (ambientListening) {handleAmbientStop()}
    else {await handleAmbientStart()}
  }, [ambientListening, handleAmbientStart, handleAmbientStop])

  const handleVoiceModeToggle = useCallback(async () => {
    if (voiceOn) { await voiceMode.stop(); setVoiceOn(false) }
    else { setVoiceOn(true); await voiceMode.start() }
  }, [voiceOn, voiceMode])

  if (mode === 'login') {return <LoginScreen />}

  return (
    <AppShell
      onSend={handleSend}
      camera={camera}
      screenCapture={screenCap.lastCapture}
      onCameraToggle={handleCameraToggle}
      onScreenToggle={handleScreenToggle}
      onAmbientToggle={handleAmbientToggle}
      onVoiceModeToggle={handleVoiceModeToggle}
      voiceOn={voiceOn}
      voiceModeState={voiceMode.state}
      voiceModeError={voiceMode.error}
      ttsEnabled={ttsEnabled}
      onTtsToggle={() => setTtsEnabled(v => !v)}
    />
  )
}
