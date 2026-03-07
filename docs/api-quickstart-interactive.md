# Interactive Mode — API Quickstart

Gateway-level ambient AI with mic, camera, and screen awareness.

## Config (`oni.json`)

```json5
{
  "interactive": {
    "enabled": true,
    "wakeWords": ["oni", "hey oni"],
    "directedWindowSec": 15,
    "silenceResetSec": 5,
    "classifier": {
      "mode": "hybrid",       // "wake_only" | "llm" | "hybrid"
      "confidenceThreshold": 0.7
    },
    "transcription": {
      "language": "en",
      "chunkDurationSec": 8
    },
    "vision": {
      "screenIntervalMs": 5000,
      "cameraIntervalMs": 2000
    },
    "rateLimits": {
      "transcriptionPerMin": 8,
      "visionPerMin": 6,
      "classifierPerMin": 10
    },
    "tts": { "autoReply": true },
    "defaults": { "inputs": ["mic"] }
  }
}
```

## Gateway WS Methods

### `interactive.start`
Start an interactive session for the current connection.

**Params:**
```json
{ "agentId": "default", "sessionKey": "optional", "inputs": ["mic", "camera"] }
```

**Response:**
```json
{
  "mode": "listening",
  "enabledInputs": ["mic", "camera"],
  "connId": "abc123",
  "sessionKey": "agent:default:interactive:abc123",
  "agentId": "default",
  "startedAt": 1234567890,
  "lastActivityAt": 1234567890,
  "directedUntil": null,
  "directedReason": null
}
```

### `interactive.stop`
Stop the interactive session.

**Response:** `{ "stopped": true }`

### `interactive.enable`
Enable additional input sources on an active session.

**Params:** `{ "inputs": ["camera", "screen"] }`

### `interactive.disable`
Disable input sources on an active session.

**Params:** `{ "inputs": ["camera"] }`

### `interactive.status`
Get current session status.

**Response:**
```json
{
  "active": true,
  "session": { "mode": "listening", "enabledInputs": ["mic"], ... },
  "activeSessions": 1
}
```

### `interactive.configure`
Get resolved interactive config (read-only).

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/interactive` | Start with default inputs |
| `/interactive enable mic,camera,screen,ambient` | Enable specific inputs |
| `/interactive disable camera` | Disable specific inputs |
| `/interactive status` | Show session status |
| `/exit interactive` | Stop interactive mode |

---

## Client → Gateway Protocol Frames

### Audio
```json
{ "type": "interactive.audio.chunk", "data": "<base64 PCM16>", "sampleRate": 24000 }
{ "type": "interactive.audio.end" }
```

### Vision
```json
{ "type": "interactive.frame", "source": "camera", "data": "<base64 jpeg>", "ts": 1234567890 }
{ "type": "interactive.frame", "source": "screen", "data": "<base64 jpeg>", "ts": 1234567890 }
```

### Push-to-talk
```json
{ "type": "interactive.ptt", "active": true }
```

---

## Gateway → Client Broadcast Events

| Event | Payload | When |
|-------|---------|------|
| `interactive.state` | `{ mode, enabledInputs, connId }` | Any state transition |
| `interactive.transcript` | `{ text, final, directed, source }` | Speech transcribed |
| `interactive.response.start` | `{ runId }` | Agent starts responding |
| `interactive.response.delta` | `{ text, runId }` | Streaming response token |
| `interactive.response.audio` | `{ data, format }` | TTS audio chunk |
| `interactive.response.done` | `{ fullText, runId }` | Agent done responding |
| `interactive.action` | `{ tool, args, result }` | Agent tool execution |

---

## State Machine

```
idle → listening → directed → responding → listening
                 ↗ (wake word / PTT / classifier / follow-up)
                 ← (silence timeout / directed window expires)
```

**Modes:**
- **idle** — No interactive session
- **listening** — Transcribing audio, classifying intent
- **directed** — User is talking to Oni (wake word detected, PTT active, or classifier confident)
- **responding** — Agent is generating a response
- **processing** — Agent is running tools

---

## Rate Limiting

Per-session sliding-window (1 minute):
- **Transcription**: max 8 calls/min (configurable)
- **Vision**: max 6 calls/min (configurable)
- **Classifier**: max 10 calls/min (configurable)

Excess calls are silently dropped (no error). Configurable in `oni.json` under `interactive.rateLimits`.

---

## Intent Detection ("Is this directed at me?")

1. **Wake word** (instant, zero cost) — regex match for configured wake words
2. **Follow-up window** (30s) — if user recently interacted, treat as directed
3. **Push-to-talk** — explicit client signal
4. **LLM micro-classifier** (~100 tokens) — uses gateway's configured model, rate-limited

Modes: `wake_only` (1 only), `llm` (1 + 4), `hybrid` (all four, default).
