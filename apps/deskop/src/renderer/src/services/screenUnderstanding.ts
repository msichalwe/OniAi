// Screen understanding: send screenshot to GPT-4o mini to get text description
// Stored in working context so ALL future prompts know what's on screen

import OpenAI from 'openai'
import { updateScreenContext } from './memory'

let _client: OpenAI | null = null

export function setScreenClient(client: OpenAI): void {
  _client = client
}

let _lastDescribeTs = 0
let _lastDescription: string | null = null
const MIN_DESCRIBE_INTERVAL_MS = 30_000  // every 30s max

export async function describeScreen(dataUrl: string): Promise<string | null> {
  if (!_client) return null
  if (Date.now() - _lastDescribeTs < MIN_DESCRIBE_INTERVAL_MS) return _lastDescription

  _lastDescribeTs = Date.now()

  try {
    const resp = await _client.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'low' }
            },
            {
              type: 'text',
              text: 'Describe what\'s on this screen in 2-3 sentences. Focus on: what application/website is open, what content is visible, and what the user appears to be working on. Be specific and concise.'
            }
          ]
        }
      ]
    })

    const description = resp.choices[0]?.message?.content?.trim() || null
    if (description) {
      _lastDescription = description
      await updateScreenContext(description)
    }
    return description
  } catch (e) {
    console.warn('Screen description failed:', e)
    return _lastDescription
  }
}

export function describeScreenAsync(dataUrl: string): void {
  describeScreen(dataUrl).catch(() => {})
}

export function getLastScreenDescription(): string | null {
  return _lastDescription
}
