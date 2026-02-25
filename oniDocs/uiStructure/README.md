# OniAI UI Architecture — Build Your Own Control Interface

> **Purpose:** This directory documents the complete UI architecture of the OniAI Gateway Control UI that was removed from `ui/`. Use these docs to build your own frontend that connects to the OniAI Gateway.

## Documents

| File | Description |
|------|-------------|
| [gateway-connection.md](./gateway-connection.md) | How to connect to the Gateway via WebSocket |
| [protocol-reference.md](./protocol-reference.md) | Full WS protocol: frames, methods, events |
| [chat-interface.md](./chat-interface.md) | Chat message handling, streaming, tool display |
| [views-and-tabs.md](./views-and-tabs.md) | All UI views/tabs and what data they consume |
| [settings-and-config.md](./settings-and-config.md) | Configuration form, settings persistence, themes |
| [state-management.md](./state-management.md) | App state shape, controllers, data flow |
| [security-and-auth.md](./security-and-auth.md) | Device identity, pairing, auth tokens |

## Quick Start

To build a custom OniAI frontend:

1. Open a WebSocket to `ws://127.0.0.1:19100`
2. Wait for `connect.challenge` event (contains a nonce)
3. Send `connect` request with auth + device identity
4. Receive `hello-ok` — you're connected
5. Call RPC methods (`chat.send`, `chat.history`, `channels.status`, etc.)
6. Listen for server-push events (`chat`, `agent`, `presence`, `health`, etc.)

See [gateway-connection.md](./gateway-connection.md) for the full handshake flow.
