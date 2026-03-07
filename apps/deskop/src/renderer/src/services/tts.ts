// Text-to-speech: Web Speech Synthesis (instant, no API cost)
// Falls back gracefully if not available

let voiceEnabled = true
export let currentUtterance: SpeechSynthesisUtterance | null = null
let preferredVoice: SpeechSynthesisVoice | null = null

function pickVoice(): SpeechSynthesisVoice | null {
  if (preferredVoice) return preferredVoice
  const voices = speechSynthesis.getVoices()
  // Prefer Samantha (macOS), then any en-US
  const samantha = voices.find(v => v.name === 'Samantha')
  const enUS = voices.find(v => v.lang === 'en-US' && v.localService)
  preferredVoice = samantha || enUS || voices[0] || null
  return preferredVoice
}

export function setVoiceEnabled(enabled: boolean): void {
  voiceEnabled = enabled
  if (!enabled) stopSpeaking()
}

export function isVoiceEnabled(): boolean {
  return voiceEnabled
}

export function speak(text: string, priority: 'normal' | 'interrupt' = 'normal'): void {
  if (!voiceEnabled || !('speechSynthesis' in window)) return

  // Strip markdown
  const clean = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  if (!clean) return

  if (priority === 'interrupt') stopSpeaking()

  const utter = new SpeechSynthesisUtterance(clean)
  utter.voice = pickVoice()
  utter.rate = 1.05
  utter.pitch = 1.0
  utter.volume = 1.0
  currentUtterance = utter
  speechSynthesis.speak(utter)
}

export function stopSpeaking(): void {
  speechSynthesis.cancel()
  currentUtterance = null
}

export function isSpeaking(): boolean {
  return speechSynthesis.speaking
}

// Speak in chunks as text streams in (avoids waiting for full response)
export class StreamSpeaker {
  private buffer = ''
  private readonly minChunkLength = 60  // speak when we have a full sentence

  feed(text: string): void {
    if (!voiceEnabled) return
    this.buffer += text
    // Look for natural break points
    const breakPattern = /[.!?]\s+|[.!?]$/
    const match = this.buffer.match(breakPattern)
    if (match && match.index !== undefined && this.buffer.length >= this.minChunkLength) {
      const toSpeak = this.buffer.slice(0, match.index + match[0].length)
      this.buffer = this.buffer.slice(match.index + match[0].length)
      speak(toSpeak)
    }
  }

  flush(): void {
    if (this.buffer.trim()) {
      speak(this.buffer.trim())
      this.buffer = ''
    }
  }

  reset(): void {
    this.buffer = ''
    stopSpeaking()
  }
}
