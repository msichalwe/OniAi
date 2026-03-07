// Camera awareness: periodically capture frame -> GPT-4o describes person/environment
// Stored as memory so Oni builds a persistent model of who it's talking to

import OpenAI from 'openai'
import { storeMemory } from './memory'

let _client: OpenAI | null = null

export function setCameraClient(client: OpenAI): void {
  _client = client
}

let _lastObserveTs = 0
let _observeCount = 0
let _lastObservation: string | null = null
const OBSERVE_INTERVAL_MS = 60_000  // every 60s max

export async function observeCamera(frameDataUrl: string): Promise<string | null> {
  if (!_client) {return null}
  if (Date.now() - _lastObserveTs < OBSERVE_INTERVAL_MS) {return _lastObservation}
  if (!frameDataUrl) {return null}

  _lastObserveTs = Date.now()
  _observeCount++

  try {
    const isFirst = _observeCount <= 1
    const prompt = isFirst
      ? `You are looking through a camera at the user. Describe:
1. The person you see (approximate age, mood/expression, what they're doing, hair/notable features)
2. Their environment (room, lighting, what's visible around them)
Keep it to 2-3 sentences, factual and warm. Start with "I can see..."`
      : `You are looking through a camera at the user. Has anything noticeably changed from before?
Briefly describe the person's current expression/mood and any change in their activity. 1-2 sentences. Start with "Looking at you now..."`

    const resp = await _client.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 150,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: frameDataUrl, detail: 'low' }
            },
            { type: 'text', text: prompt }
          ]
        }
      ]
    })

    const observation = resp.choices[0]?.message?.content?.trim() || null

    if (observation) {
      _lastObservation = observation
      await storeMemory(
        observation,
        'semantic',
        0.7,
        ['camera-observation', 'user-appearance', 'visual']
      )
    }

    return observation
  } catch (e) {
    console.warn('Camera observation failed:', e)
    return _lastObservation
  }
}

export function observeCameraAsync(frameDataUrl: string): void {
  observeCamera(frameDataUrl).catch(() => {})
}

export function getLastObservation(): string | null {
  return _lastObservation
}
