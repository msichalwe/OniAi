# OniOS Gateway-Native Overhaul Plan

> **Status**: Awaiting approval
> **Date**: February 2026
> **Goal**: Strip all in-app AI, auth, storage, and agent logic. Make the Oni gateway the single brain. Every widget becomes a thin UI shell driven by the gateway.

---

## Executive Summary

The current OniOS has a **split brain** problem — it runs its own AI agent loop (`aiMemoryPlugin`), manages its own API keys/OAuth, stores conversations locally (`~/.onios/ai/`), and has a separate personality system (`SystemPersonality.js`). This duplicates what the Oni gateway already does natively via its RPC methods:

| Gateway Method | What It Does | OniOS Duplicate to Remove |
|---|---|---|
| `chat.send` | Send message → agent → response (streaming) | `aiMemoryPlugin /api/ai/chat` (2200 lines) |
| `sessions.*` | Session CRUD, reset, preview, compact | In-app conversation persistence |
| `agent.*` | Agent identity, run, wait | `AIMemoryService.buildChatMessages()` |
| `config.*` | Gateway config (models, providers) | `aiMemoryPlugin /api/ai/config` + Settings API key wizard |
| `models.*` | List available models | `aiMemoryPlugin /api/ai/auth/models` |
| `skills.*` | List/manage skills | `SkillsRegistry.toPrimaryTools()` local-only |
| `health` | Gateway health | None (keep) |
| `system.*` | System info | None (keep macOS plugin) |

**The overhaul removes ~4000 lines of duplicated code and makes every widget a gateway-native client.**

---

## Phase 1: DELETE — Remove In-App AI Layer

### Files to Delete Entirely

| File | Lines | Why |
|------|-------|-----|
| `plugins/aiMemoryPlugin.js` | ~2212 | Entire in-app AI: chat proxy, OAuth, API keys, memory, conversations, embeddings, knowledge base |
| `src/core/AIMemoryService.js` | ~404 | Client-side facade for the above |
| `src/core/SystemPersonality.js` | ~729 | Hardcoded system prompt builder — gateway has SOUL.md/IDENTITY.md |
| `src/core/ServerSync.js` | ~300 | Server sync for widget state — replaced by gateway sessions |
| `plugins/openclawPlugin.js` | ~888 | Legacy OpenClaw plugin (already replaced by oniPlugin but file still exists) |

### Code to Remove from Existing Files

| File | What to Remove |
|------|---------------|
| `src/widgets/Settings/Settings.jsx` | Entire "AI Authentication" section (OAuth wizard, API key management, model selection). Keep only: Theme, Wallpaper, Gateway Connection settings |
| `src/widgets/OniAssistant/OniChatWidget.jsx` | Remove direct OpenAI streaming logic, tool-call agent loop, `aiMemory.buildChatMessages()`. Replace with gateway `chat.send` via WebSocket |
| `src/stores/storageStore.js` | Remove `oniData`, AI memory stats, OpenClaw workspace display. Rewire to gateway sessions/config |
| `src/widgets/Storage/Storage.jsx` | Remove AI Memory tab, OpenClaw workspace file viewer. Replace with gateway session list + config viewer |
| `src/App.jsx` | Remove `aiMemory` imports, `getKernelState()` (replace with gateway context push), direct AI references |
| `vite.config.js` | Remove `aiMemoryPlugin()` from plugins array |

---

## Phase 2: REWIRE — Gateway-Native Widget Architecture

### New Core: `src/gateway/GatewayClient.js`

A single WebSocket client that wraps the Oni gateway RPC protocol. Every widget uses this instead of direct `fetch()` calls.

```js
class GatewayClient {
  // Connection
  connect(url, token) → Promise<void>
  disconnect()
  isConnected() → boolean
  onStatusChange(handler) → unsubscribe

  // RPC (mirrors gateway methods)
  request(method, params) → Promise<response>

  // Convenience wrappers
  chat.send(message, sessionKey, opts) → AsyncIterator<delta>
  sessions.list() → Promise<sessions[]>
  sessions.reset(key) → Promise<void>
  sessions.preview(keys) → Promise<previews[]>
  config.get() → Promise<config>
  models.list() → Promise<models[]>
  skills.list() → Promise<skills[]>
  agent.identity() → Promise<identity>
  health() → Promise<health>
}
```

### Widget Rewiring Matrix

Every widget that currently calls `/api/ai/*` or uses `aiMemory.*` gets rewired to use `GatewayClient`:

| Widget | Current Source | New Source | Changes |
|--------|--------------|-----------|---------|
| **Oni Chat** | `fetch('/api/ai/chat')` + local agent loop | `gateway.chat.send()` via WS | Complete rewrite of chat logic. No local tool-call loop — gateway handles it. Stream deltas from gateway events. |
| **Settings** | `aiMemory.getAuthStatus()`, API key wizard, OAuth flow | `gateway.config.get()`, `gateway.models.list()` | Remove 400+ lines of auth wizard. Show gateway URL, connection status, agent identity, model from gateway config. |
| **Storage** | `localStorage` + `~/.onios/storage.json` + AI memory viewer | `gateway.sessions.list()` + `gateway.config.get()` | Widget state persists through gateway sessions. Show sessions, not raw localStorage. |
| **Terminal** | Vite `terminalPlugin` (node-pty over WS) | Keep for local dev, add gateway `exec` tool as alternative | Terminal remains local (needs PTY), but AI-driven terminal commands go through gateway exec tool. |
| **File Explorer** | Vite `filesystemPlugin` (REST) | Keep for local dev, add gateway file tools | Same as terminal — local filesystem needs server access, but AI file operations go through gateway. |
| **Notes** | Vite `documentPlugin` | Keep local, but conversation notes can come from gateway sessions | |
| **Task Manager** | `taskStore` (Zustand + localStorage) | Keep local store, but AI task creation goes through gateway | |
| **Calendar** | `taskStore` events | Same as tasks | |
| **Weather** | Direct API fetch | Keep as-is (no gateway involvement needed) | |
| **Calculator** | Pure local | Keep as-is | |
| **Web Search** | Brave Search via MCP proxy | Keep, but can also use gateway `web.search` | |
| **Agent Viewer** | `agentManager` (local sub-agents) | `gateway.sessions.list()` + subscribe to gateway agent events | Show real gateway sub-agent sessions, not fake local ones |
| **Workflow Builder** | `workflowStore` + `WorkflowEngine` | Keep local engine, but AI-triggered workflows go through gateway | |
| **Password Manager** | `passwordStore` (Zustand + localStorage) | Keep local (sensitive data should NOT go through gateway) | |
| **Camera** | WebRTC (local) | Keep as-is | |
| **Maps** | Embedded map (local) | Keep as-is | |
| **Media Player** | Local file/URL playback | Keep as-is | |
| **Browser** | iframe (local) | Keep as-is | |
| **Code Editor** | Monaco (local) | Keep, but AI code operations go through gateway | |
| **Clock** | Local time | Keep, add gateway system info | |
| **Activity Log** | Local `eventBus` events | Keep local events + add gateway event stream | |
| **Docs** | Static docs | Keep as-is | |
| **File Viewer** | Local file viewer | Keep as-is | |
| **Document Viewer** | mammoth/pdf-parse | Keep as-is | |

---

## Phase 3: REBUILD — Settings Widget

### New Settings Structure

```
Settings
├── 🦊 Gateway Connection
│   ├── Gateway URL: ws://127.0.0.1:19100 [editable]
│   ├── Status: 🟢 Connected / 🔴 Disconnected
│   ├── Agent: "Hailey" (gpt-4o via anthropic)
│   ├── Model: [dropdown from gateway.models.list()]
│   ├── [Connect] [Disconnect] buttons
│   └── Gateway Token: [masked, copy button]
│
├── 🎨 Appearance
│   ├── Theme: Dark / Light
│   ├── Wallpaper: [presets + custom upload]
│   └── Font size
│
├── 🖥️ Desktop
│   ├── Multi-desktop settings
│   └── Window behavior
│
├── ℹ️ About
│   ├── OniOS version
│   ├── Gateway version
│   ├── Agent workspace files (read from gateway)
│   └── macOS system info (from macOS plugin)
│
└── 🔧 Advanced
    ├── Gateway skill installation
    ├── Workspace identity sync
    └── Debug logs
```

**Removed entirely:**
- ❌ AI Authentication (OAuth wizard, API key input)
- ❌ Model selection from OpenAI directly
- ❌ API key management for Brave Search, etc.
- ❌ Personality editor (use Oni workspace SOUL.md instead)

---

## Phase 4: REBUILD — Oni Chat Widget

### Current Flow (REMOVE)
```
User types → OniChatWidget → fetch('/api/ai/chat') → aiMemoryPlugin →
  builds system prompt → calls OpenAI API directly → streams SSE →
  if tool_calls: client executes tools → fetch('/api/ai/chat/continue') → loop
```

### New Flow (GATEWAY-NATIVE)
```
User types → OniChatWidget → gateway.chat.send(message, sessionKey) →
  Gateway agent processes (SOUL.md + skills + memory) →
  Gateway streams deltas via WebSocket events →
  If tool execution needed: gateway executes tools (exec, web_fetch, etc.) →
  Final response streamed back to OniOS
```

**Key differences:**
1. No local tool-call agent loop — the gateway handles the full agent loop
2. No local system prompt building — the gateway uses workspace files
3. No local conversation persistence — gateway manages sessions
4. No API key needed in OniOS — the gateway has its own auth
5. Widget context is pushed TO the gateway, not injected into a local prompt

### Chat Widget State
```js
// Before (complex local state)
const [aiMode, setAiMode] = useState("personal");
const [conversationId, setConversationId] = useState(null);
// + OAuth state, tool execution state, kernel state building...

// After (simple gateway state)
const [sessionKey, setSessionKey] = useState("onios:main");
const [connected, setConnected] = useState(false);
// Gateway handles everything else
```

---

## Phase 5: REBUILD — Storage Widget

### Current (REMOVE)
- Shows `localStorage` entries, widget state, AI memories, OpenClaw workspace files
- Has tabs: All, System, Storage, Widget State, AI Memory, OpenClaw

### New (GATEWAY-NATIVE)
- **Sessions tab**: List gateway sessions (`sessions.list`), preview messages (`sessions.preview`), reset/delete
- **Config tab**: Gateway configuration (`config.get`)
- **Skills tab**: Installed skills (`skills.list`)
- **Local tab**: OniOS local storage (theme, preferences — minimal)

---

## Phase 6: NATIVE FEATURES — Per-Widget Enhancements

### Terminal
- **macOS**: Native `osascript` notifications when long-running commands finish
- **Gateway**: AI-driven commands execute through gateway `exec` tool, results visible in terminal
- Keep local PTY for interactive use

### File Explorer
- **macOS**: Spotlight metadata, Quick Look preview integration
- **Gateway**: AI file operations (create, read, write) go through gateway
- Keep local filesystem REST API for browsing

### Oni Chat
- **macOS**: Native notification on agent response when OniOS is in background
- **Gateway**: Full streaming via gateway WebSocket, session management

### Camera
- **macOS**: Native screenshot via `screencapture`, photo saved to `~/.onios/screenshots/`
- **Gateway**: Photos can be sent as attachments to gateway agent

### Activity Log
- **Gateway**: Subscribe to gateway events (agent runs, tool executions, session changes)
- Show both local OniOS events and gateway events in unified log

---

## Phase 7: CLEANUP — Remove Dead Code

After all rewiring is done:

1. Delete `plugins/aiMemoryPlugin.js`
2. Delete `plugins/openclawPlugin.js`
3. Delete `src/core/AIMemoryService.js`
4. Delete `src/core/SystemPersonality.js`
5. Delete `src/core/ServerSync.js`
6. Remove `aiMemory` imports from all files
7. Remove `/api/ai/*` endpoint references
8. Clean up `vite.config.js` (remove aiMemoryPlugin)
9. Update `package.json` (remove unused AI deps if any)
10. Update `docs/plan.md` to reflect new architecture

---

## New Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                       OniOS (Browser/Electron)                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    Desktop Shell                         │     │
│  │  Taskbar · Dock · Window Manager · Command Palette       │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    Widget Layer (24 widgets)              │     │
│  │  Each widget is a THIN UI SHELL:                         │     │
│  │    - Renders data from gateway or local sources           │     │
│  │    - Sends user actions to gateway via GatewayClient      │     │
│  │    - Receives updates via gateway WebSocket events        │     │
│  │    - Local-only widgets (Calculator, Maps) unchanged      │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │              GatewayClient (WebSocket RPC)                │     │
│  │  Single connection to ws://127.0.0.1:19100                │     │
│  │  Methods: chat.send, sessions.*, config.*, models.*,      │     │
│  │           skills.*, agent.*, health, system.*             │     │
│  │  Auth: gateway token from ~/.oni/oni.json                 │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │              Local Vite Plugins (dev server only)         │     │
│  │  filesystemPlugin · terminalPlugin · documentPlugin       │     │
│  │  schedulerPlugin · docsPlugin · storagePlugin             │     │
│  │  macosPlugin · oniPlugin (action API for gateway skills)  │     │
│  │                                                           │     │
│  │  ❌ REMOVED: aiMemoryPlugin (2200 lines)                 │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│                    ONI GATEWAY (ws://127.0.0.1:19100)             │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  Agent Brain                                              │     │
│  │  - Workspace: SOUL.md, IDENTITY.md, MEMORY.md, TOOLS.md  │     │
│  │  - Skills (tools): exec, web_fetch, + OniOS skills        │     │
│  │  - Memory: vector search, long-term persistence           │     │
│  │  - Models: multi-provider (OpenAI, Anthropic, etc.)       │     │
│  ├─────────────────────────────────────────────────────────┤     │
│  │  Sessions                                                 │     │
│  │  - onios:main (OniOS primary chat)                        │     │
│  │  - Per-channel sessions (Telegram, Discord, etc.)         │     │
│  │  - Sub-agent sessions                                     │     │
│  ├─────────────────────────────────────────────────────────┤     │
│  │  RPC Methods                                              │     │
│  │  chat.send · sessions.* · config.* · models.*             │     │
│  │  skills.* · agent.* · health · system.* · send.*          │     │
│  │  cron.* · web.* · tts.* · browser.* · logs.*             │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Order

1. **Create `GatewayClient.js`** — single WebSocket RPC client
2. **Rebuild Settings widget** — gateway-only, no API keys
3. **Rebuild Oni Chat widget** — gateway `chat.send` streaming
4. **Rebuild Storage widget** — gateway sessions + config
5. **Rebuild Agent Viewer** — gateway sub-agent sessions
6. **Rewire App.jsx** — remove aiMemory, add GatewayClient provider
7. **Delete dead code** — aiMemoryPlugin, SystemPersonality, ServerSync, AIMemoryService
8. **Update vite.config.js** — remove aiMemoryPlugin
9. **Test all 24 widgets** — verify nothing broke
10. **Update docs/plan.md** — reflect new architecture

---

## What STAYS Unchanged

- **24 widget UI components** — visual design preserved
- **CommandRegistry** — local command execution for UI
- **WidgetRegistry** — widget definitions
- **EventBus** — local pub/sub for widget communication
- **SkillsRegistry** — still needed to tell gateway what OniOS can do
- **Zustand stores** — window, desktop, theme, notification, command (local UI state)
- **macOS plugin** — native integrations
- **Oni plugin** — action API for gateway to call OniOS
- **Terminal/Filesystem plugins** — local dev server features
- **All CSS/theming** — unchanged

## What Gets REMOVED

- **aiMemoryPlugin.js** (~2212 lines) — entire in-app AI proxy
- **AIMemoryService.js** (~404 lines) — client facade for above
- **SystemPersonality.js** (~729 lines) — hardcoded system prompt
- **ServerSync.js** (~300 lines) — unused server sync
- **openclawPlugin.js** (~888 lines) — legacy plugin
- **Settings: Auth wizard** (~400 lines) — OAuth + API key management
- **OniChat: Agent loop** (~300 lines) — local tool-call execution loop
- **storageStore: AI tabs** (~100 lines) — AI memory display
- **Total removed: ~5300 lines**

---

*This plan removes the split brain and makes OniOS a pure gateway client. Approve to begin implementation.*
