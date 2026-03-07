import { useState, useRef, useCallback } from 'react'
import { RealtimeSession, playAudio } from '../services/openai-realtime'
import { buildSystemPrompt, persistInteraction } from '../services/memory'
import { getSystemSnapshot, formatSystemContext } from '../services/systemContext'

export type VoiceModeState = 'off' | 'connecting' | 'listening' | 'speaking' | 'error'

interface UseVoiceModeOptions {
  apiKey: string
  onTranscript: (text: string) => void
  onResponse: (text: string) => void
  onResponseDone: () => void
}

export function useVoiceMode({ apiKey, onTranscript, onResponse, onResponseDone }: UseVoiceModeOptions) {
  const [state, setState] = useState<VoiceModeState>('off')
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<RealtimeSession | null>(null)
  const responseTextRef = useRef('')
  const lastTranscriptRef = useRef('')

  const start = useCallback(async () => {
    if (sessionRef.current) return
    setState('connecting')
    setError(null)
    responseTextRef.current = ''
    lastTranscriptRef.current = ''

    try {
      let sysCtx: string | null = null
      try {
        sysCtx = formatSystemContext(await getSystemSnapshot())
      } catch { /* non-fatal */ }

      const systemPrompt = await buildSystemPrompt('voice conversation', null, sysCtx)
      const session = new RealtimeSession(apiKey)
      sessionRef.current = session

      session.onTranscript = (text) => {
        lastTranscriptRef.current = text
        onTranscript(text)
      }

      session.onText = (delta) => {
        responseTextRef.current += delta
        onResponse(delta)
        setState('speaking')
      }

      session.onAudio = (pcm) => playAudio([pcm])

      session.onError = (msg) => { setError(msg); setState('error') }

      await session.connect(systemPrompt)
      await session.startMic()
      setState('listening')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
      setState('error')
      sessionRef.current = null
    }
  }, [apiKey, onTranscript, onResponse])

  const stop = useCallback(async () => {
    // Persist the last exchange to long-term memory
    if (lastTranscriptRef.current && responseTextRef.current) {
      await persistInteraction(lastTranscriptRef.current, responseTextRef.current)
    }
    if (responseTextRef.current) {
      onResponseDone()
    }
    responseTextRef.current = ''
    lastTranscriptRef.current = ''
    sessionRef.current?.disconnect()
    sessionRef.current = null
    setState('off')
    setError(null)
  }, [onResponseDone])

  const sendText = useCallback((text: string) => {
    sessionRef.current?.sendText(text)
  }, [])

  return { state, error, start, stop, sendText }
}
