import { useState, useRef, useCallback } from 'react'
import OpenAI from 'openai'
import { getClient } from '../services/openai-realtime'

export type AmbientState = 'off' | 'listening' | 'error'

// Uses OpenAI Whisper for transcription since Electron doesn't support
// the Web Speech API (webkitSpeechRecognition). Records 10s chunks,
// transcribes, and fires the callback if meaningful speech is detected.

export function useAmbientListening() {
  const [state, setState] = useState<AmbientState>('off')
  const streamRef = useRef<MediaStream | null>(null)
  const isActiveRef = useRef(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onTranscriptRef = useRef<((text: string) => void) | null>(null)

  const transcribeChunk = useCallback(async (blob: Blob) => {
    const client = getClient()
    if (!client || blob.size < 5000) return // skip tiny/silent chunks

    try {
      const file = new File([blob], 'ambient.webm', { type: 'audio/webm' })
      const response = await client.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        language: 'en'
      })
      const text = response.text?.trim()
      if (text && text.length > 5 && !isNoiseOnly(text)) {
        onTranscriptRef.current?.(text)
      }
    } catch (e) {
      console.warn('Ambient transcription failed:', e)
    }
  }, [])

  const start = useCallback(async (onTranscript: (text: string) => void) => {
    if (isActiveRef.current) return
    onTranscriptRef.current = onTranscript

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      })
      isActiveRef.current = true
      setState('listening')

      // Record in 8-second chunks
      function startRecording() {
        if (!isActiveRef.current || !streamRef.current) return

        const recorder = new MediaRecorder(streamRef.current, {
          mimeType: 'audio/webm;codecs=opus'
        })
        recorderRef.current = recorder
        const chunks: Blob[] = []

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }

        recorder.onstop = () => {
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: 'audio/webm' })
            transcribeChunk(blob)
          }
          // Start next recording cycle
          if (isActiveRef.current) {
            setTimeout(startRecording, 500)
          }
        }

        recorder.start()

        // Stop after 8 seconds to send for transcription
        setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop()
          }
        }, 8000)
      }

      startRecording()
    } catch (e) {
      console.error('Ambient listening failed:', e)
      isActiveRef.current = false
      setState('error')
    }
  }, [transcribeChunk])

  const stop = useCallback(() => {
    isActiveRef.current = false
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    onTranscriptRef.current = null
    setState('off')
  }, [])

  return { state, start, stop }
}

// Filter out whisper hallucinations on silence
function isNoiseOnly(text: string): boolean {
  const noise = [
    'thank you', 'thanks for watching', 'subscribe', 'bye',
    'you', 'the end', 'music', 'applause', 'silence',
    'hmm', 'um', 'uh'
  ]
  const lower = text.toLowerCase().trim()
  return noise.some(n => lower === n) || lower.length < 3
}
