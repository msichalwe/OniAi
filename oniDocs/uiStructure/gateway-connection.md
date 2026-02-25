# Gateway Connection — WebSocket Client Guide

## Overview

The OniAI Gateway exposes a single WebSocket endpoint at `ws://127.0.0.1:19100` (or `wss://` with TLS). All UI interactions happen over this connection using a typed JSON protocol.

## Connection Flow

```
┌─────────┐                          ┌─────────────┐
│  Client  │                          │   Gateway    │
└────┬─────┘                          └──────┬───────┘
     │                                       │
     │  1. Open WebSocket                    │
     │ ─────────────────────────────────────>│
     │                                       │
     │  2. event: connect.challenge          │
     │ <─────────────────────────────────────│
     │    { nonce: "abc123", ts: 1737... }   │
     │                                       │
     │  3. req: connect                      │
     │ ─────────────────────────────────────>│
     │    { auth, device, role, scopes }     │
     │                                       │
     │  4. res: hello-ok                     │
     │ <─────────────────────────────────────│
     │    { protocol: 3, auth?, policy }     │
     │                                       │
     │  5. Bidirectional RPC + Events        │
     │ <────────────────────────────────────>│
     └───────────────────────────────────────┘
```

## Step-by-Step Implementation

### 1. Open WebSocket

```typescript
const ws = new WebSocket("ws://127.0.0.1:19100");
```

### 2. Wait for Challenge

The Gateway sends a `connect.challenge` event immediately after the socket opens:

```typescript
ws.addEventListener("message", (ev) => {
  const frame = JSON.parse(ev.data);
  if (frame.type === "event" && frame.event === "connect.challenge") {
    const nonce = frame.payload.nonce; // string
    const ts = frame.payload.ts;       // number (epoch ms)
    sendConnect(nonce);
  }
});
```

### 3. Send Connect Request

```typescript
function sendConnect(nonce: string) {
  const id = crypto.randomUUID();
  const frame = {
    type: "req",
    id,
    method: "connect",
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "my-ui",            // client identifier
        version: "1.0.0",       // your app version
        platform: "web",        // web | macos | ios | android | linux
        mode: "webchat",        // webchat | operator | automation
      },
      role: "operator",
      scopes: ["operator.read", "operator.write", "operator.admin", "operator.approvals"],
      caps: [],
      auth: {
        token: "your-gateway-token",    // from ONI_GATEWAY_TOKEN
        // OR password: "your-password"  // from gateway.auth.password
      },
      device: {
        // Optional: device identity for pairing (requires crypto.subtle)
        id: "device-fingerprint",
        publicKey: "base64-ed25519-pubkey",
        signature: "base64-signed-payload",
        signedAt: Date.now(),
        nonce: nonce,
      },
      userAgent: navigator.userAgent,
      locale: navigator.language,
    },
  };
  ws.send(JSON.stringify(frame));
}
```

### 4. Handle Hello-OK Response

```typescript
// In your message handler:
if (frame.type === "res" && frame.ok) {
  const hello = frame.payload;
  // hello.type === "hello-ok"
  // hello.protocol === 3
  // hello.server?.version — gateway version string
  // hello.auth?.deviceToken — persist this for future connections
  // hello.policy?.tickIntervalMs — heartbeat interval (default 15000ms)
  // hello.snapshot — initial state snapshot (presence, health, etc.)
}
```

### 5. Send RPC Requests

```typescript
function request(method: string, params?: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: "req", id, method, params }));
  });
}

// Examples:
await request("chat.history", { sessionKey: "agent:main:main", limit: 200 });
await request("chat.send", { sessionKey: "agent:main:main", message: "Hello!" });
await request("channels.status");
await request("health");
await request("system-presence");
```

### 6. Listen for Events

```typescript
// In your message handler:
if (frame.type === "event") {
  switch (frame.event) {
    case "chat":       handleChatEvent(frame.payload); break;
    case "agent":      handleAgentEvent(frame.payload); break;
    case "presence":   handlePresenceEvent(frame.payload); break;
    case "health":     handleHealthEvent(frame.payload); break;
    case "cron":       handleCronEvent(frame.payload); break;
    case "log":        handleLogEvent(frame.payload); break;
    case "exec.approval.requested": handleExecApproval(frame.payload); break;
    case "update.available": handleUpdateAvailable(frame.payload); break;
  }
}
```

## Reconnection Strategy

```typescript
class GatewayClient {
  private backoffMs = 800;
  private maxBackoff = 15000;
  
  private scheduleReconnect() {
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, this.maxBackoff);
    setTimeout(() => this.connect(), delay);
  }
  
  // Reset backoff on successful hello-ok
  private onHello() {
    this.backoffMs = 800;
  }
}
```

## Heartbeat / Tick

After connection, the Gateway expects periodic activity. The `tickIntervalMs` in `hello-ok.policy` tells you the interval. If no messages are exchanged within ~2x this interval, the Gateway may consider the connection stale.

## Sequence Numbers

Events include an optional `seq` field (monotonically increasing). Track it to detect gaps:

```typescript
if (frame.seq !== null && lastSeq !== null && frame.seq > lastSeq + 1) {
  // Gap detected — may need to refresh state
}
lastSeq = frame.seq;
```

## Error Handling

Failed requests return:

```json
{
  "type": "res",
  "id": "...",
  "ok": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "authentication required",
    "details": { "detailCode": "..." }
  }
}
```

Common error codes:
- `AUTH_REQUIRED` — missing or invalid auth
- `PROTOCOL_MISMATCH` — version incompatibility
- `UNAVAILABLE` — gateway not ready
- `NOT_FOUND` — method or resource not found
- `INVALID_PARAMS` — bad request parameters
