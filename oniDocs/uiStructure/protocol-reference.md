# Gateway Protocol Reference — RPC Methods & Events

## Frame Types

All communication uses JSON text frames over WebSocket.

### Request (Client → Gateway)

```json
{ "type": "req", "id": "uuid", "method": "method.name", "params": { ... } }
```

### Response (Gateway → Client)

```json
{ "type": "res", "id": "uuid", "ok": true, "payload": { ... } }
{ "type": "res", "id": "uuid", "ok": false, "error": { "code": "...", "message": "..." } }
```

### Event (Gateway → Client, server-push)

```json
{ "type": "event", "event": "event.name", "payload": { ... }, "seq": 42 }
```

---

## RPC Methods

### Chat

| Method | Params | Description |
|--------|--------|-------------|
| `chat.send` | `{ sessionKey, message, attachments?, thinkingLevel?, idempotencyKey }` | Send a user message |
| `chat.history` | `{ sessionKey, limit? }` | Fetch conversation history |
| `chat.abort` | `{ sessionKey, runId }` | Abort an active agent run |

**chat.send params:**
- `sessionKey` — session to send to (e.g., `"agent:main:main"`)
- `message` — text content
- `attachments` — array of `{ content: base64, mimeType: string }` or `{ url: string }`
- `thinkingLevel` — optional thinking mode override
- `idempotencyKey` — UUID for dedup (required for side-effecting calls)

**chat.history response:**
```json
{
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": [{ "type": "text", "text": "Hi!" }] }
  ],
  "thinkingLevel": "default"
}
```

### Sessions

| Method | Params | Description |
|--------|--------|-------------|
| `sessions.list` | `{ kinds?, limit?, activeMinutes?, messageLimit? }` | List sessions |
| `sessions.preview` | `{ sessionKey, limit? }` | Preview session messages |
| `sessions.delete` | `{ sessionKey }` | Delete a session |
| `sessions.reset` | `{ sessionKey }` | Reset a session (clear history) |

**sessions.list response:**
```json
{
  "sessions": [
    {
      "sessionKey": "agent:main:main",
      "sessionId": "uuid",
      "agentId": "main",
      "kind": "direct",
      "label": "Main",
      "lastMessageAt": 1737264000000,
      "messageCount": 42,
      "messages": []
    }
  ],
  "defaults": {
    "defaultAgentId": "main",
    "mainKey": "main",
    "mainSessionKey": "agent:main:main"
  }
}
```

### Channels

| Method | Params | Description |
|--------|--------|-------------|
| `channels.status` | `{}` | Full channel status snapshot |
| `channels.whatsapp.start` | `{ accountId? }` | Start WhatsApp connection |
| `channels.whatsapp.stop` | `{ accountId? }` | Stop WhatsApp connection |
| `channels.whatsapp.logout` | `{ accountId? }` | Logout + delete creds |
| `channels.whatsapp.qr` | `{ accountId? }` | Get QR code for linking |

**channels.status response:**
```json
{
  "ts": 1737264000000,
  "channelOrder": ["whatsapp", "telegram", "discord", "slack"],
  "channelLabels": { "whatsapp": "WhatsApp", "telegram": "Telegram" },
  "channels": {
    "whatsapp": { "configured": true, "linked": true, "connected": true }
  },
  "channelAccounts": {
    "whatsapp": [{ "accountId": "default", "connected": true }]
  }
}
```

### Agents

| Method | Params | Description |
|--------|--------|-------------|
| `agents.list` | `{}` | List configured agents |
| `agents.files.list` | `{ agentId }` | List agent workspace files |
| `agents.files.read` | `{ agentId, filename }` | Read agent file content |
| `agents.files.write` | `{ agentId, filename, content }` | Write agent file |
| `agents.identity` | `{ agentId? }` | Get agent identity (name, avatar, emoji) |
| `tools.catalog` | `{ agentId? }` | Get runtime tool catalog |

### Skills

| Method | Params | Description |
|--------|--------|-------------|
| `skills.status` | `{ agentId? }` | Skill status report |

### Nodes

| Method | Params | Description |
|--------|--------|-------------|
| `system-presence` | `{}` | List connected devices/nodes |
| `nodes.status` | `{}` | Node status (capabilities, permissions) |
| `nodes.describe` | `{ nodeId }` | Detailed node info |

### Devices (Pairing)

| Method | Params | Description |
|--------|--------|-------------|
| `devices.list` | `{}` | List device pairings |
| `devices.approve` | `{ deviceId }` | Approve pending pairing |
| `devices.reject` | `{ deviceId }` | Reject pending pairing |
| `device.token.rotate` | `{ deviceId }` | Rotate device token |
| `device.token.revoke` | `{ deviceId }` | Revoke device token |

### Configuration

| Method | Params | Description |
|--------|--------|-------------|
| `config.get` | `{}` | Get current config |
| `config.schema` | `{}` | Get JSON Schema for config |
| `config.apply` | `{ config }` | Validate + write config + restart |
| `config.patch` | `{ patch }` | Merge partial update + restart |

### Exec Approvals

| Method | Params | Description |
|--------|--------|-------------|
| `exec.approvals.get` | `{ target? }` | Get exec approval settings |
| `exec.approvals.set` | `{ target?, approvals }` | Update exec approval settings |
| `exec.approval.resolve` | `{ id, action }` | Approve/reject pending exec request |

### Cron

| Method | Params | Description |
|--------|--------|-------------|
| `cron.status` | `{}` | Cron scheduler status |
| `cron.list` | `{ limit?, offset?, sort?, enabled?, search? }` | List cron jobs |
| `cron.add` | `{ job }` | Add a cron job |
| `cron.update` | `{ jobId, patch }` | Update a cron job |
| `cron.remove` | `{ jobId }` | Remove a cron job |
| `cron.run` | `{ jobId }` | Trigger a cron job now |
| `cron.runs` | `{ jobId?, limit?, offset? }` | List cron run history |

### Health & Status

| Method | Params | Description |
|--------|--------|-------------|
| `health` | `{}` | Gateway health snapshot |
| `gateway.restart` | `{ delayMs? }` | Restart gateway |
| `update.run` | `{}` | Check for + apply updates |

### Logs

| Method | Params | Description |
|--------|--------|-------------|
| `logs.query` | `{ limit?, offset?, level?, search? }` | Query gateway logs |

### Usage / Analytics

| Method | Params | Description |
|--------|--------|-------------|
| `usage.sessions` | `{ agentId?, range? }` | Session usage data |
| `usage.cost` | `{ agentId?, range? }` | Cost/token usage summary |
| `usage.timeseries` | `{ agentId?, range?, interval? }` | Time-series usage data |

---

## Server-Push Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connect.challenge` | `{ nonce, ts }` | Pre-handshake challenge |
| `chat` | `{ runId, sessionKey, state, message?, errorMessage? }` | Chat message delta/final/abort |
| `agent` | `{ runId, sessionKey, type, ... }` | Agent lifecycle (tool calls, thinking, etc.) |
| `presence` | `{ entries, status? }` | Connected devices/clients changed |
| `health` | `{ channels, gateway, ... }` | Health status changed |
| `channels` | `{ snapshot }` | Channel status changed |
| `log` | `{ level, message, ts }` | Gateway log entry |
| `cron` | `{ type, jobId?, ... }` | Cron event (run started/completed) |
| `exec.approval.requested` | `{ id, command, agent, ... }` | Exec needs approval |
| `exec.approval.resolved` | `{ id, action, ... }` | Exec approval resolved |
| `update.available` | `{ currentVersion, latestVersion }` | New version available |
| `config.changed` | `{}` | Config was modified |
| `session.reset` | `{ sessionKey }` | Session was reset |

### Chat Event States

The `chat` event `state` field:
- `delta` — streaming text chunk
- `final` — completed message
- `aborted` — run was aborted
- `error` — run errored

### Agent Event Types

The `agent` event `type` field:
- `tool_call.start` — tool invocation started
- `tool_call.result` — tool returned result
- `tool_call.error` — tool errored
- `thinking.start` — model started thinking
- `thinking.end` — model stopped thinking
- `compaction` — context compaction occurred
- `fallback` — model fallback activated
