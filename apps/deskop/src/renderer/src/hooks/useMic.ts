import { useState, useRef, useCallback } from 'react'

export type MicState = 'idle' | 'requesting' | 'active' | 'error'

export function useMic() {
  const [state, setState] = useState<MicState>('idle')
  const [interim, setInterim] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isActiveRef = useRef(false)  // stable ref — avoids stale closures
  const onTranscriptRef = useRef<((text: string, final: boolean) => void) | null>(null)

  const startListening = useCallback(async (onTranscript: (text: string, final: boolean) => void) => {
    setState('requesting')
    onTranscriptRef.current = onTranscript

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      isActiveRef.current = true
      setState('active')

      if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
        console.warn('Web Speech API not available — using mic stream only')
        return
      }

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SR()
      recognitionRef.current = recognition
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1

      recognition.onresult = (event) => {
        let interimText = ''
        let finalText = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            finalText += result[0].transcript
          } else {
            interimText += result[0].transcript
          }
        }
        if (finalText) {
          setInterim('')
          onTranscriptRef.current?.(finalText.trim(), true)
        } else {
          setInterim(interimText)
          onTranscriptRef.current?.(interimText, false)
        }
      }

      recognition.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return
        console.warn('Speech recognition error:', e.error)
      }

      recognition.onend = () => {
        // Auto-restart only if we're still supposed to be active
        if (isActiveRef.current) {
          try { recognition.start() } catch { /* ignore restart race */ }
        }
      }

      recognition.start()
    } catch (e) {
      console.error('Mic access denied:', e)
      isActiveRef.current = false
      setState('error')
    }
  }, [])

  const stopListening = useCallback(() => {
    isActiveRef.current = false
    recognitionRef.current?.abort()
    recognitionRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    onTranscriptRef.current = null
    setInterim('')
    setState('idle')
  }, [])

  return {
    state,
    interim,
    startListening,
    stopListening,
    stream: streamRef.current
  }
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}
