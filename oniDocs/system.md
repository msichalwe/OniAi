# OniAI System — Complete Architecture & Design Reference

> **Purpose:** This document is a comprehensive study of the OniAI AI agent system, distilled from every documentation file in the project. Use it as a blueprint for building your own AI agent system.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Gateway (Core Control Plane)](#3-gateway-core-control-plane)
4. [WebSocket Protocol](#4-websocket-protocol)
5. [Agent Runtime](#5-agent-runtime)
6. [Session Management](#6-session-management)
7. [Multi-Agent Routing](#7-multi-agent-routing)
8. [Channels (Messaging Surfaces)](#8-channels-messaging-surfaces)
9. [Tools System](#9-tools-system)
10. [Skills Platform](#10-skills-platform)
11. [Plugin / Extension System](#11-plugin--extension-system)
12. [Command Queue](#12-command-queue)
13. [Streaming & Chunking](#13-streaming--chunking)
14. [Model Management & Failover](#14-model-management--failover)
15. [Nodes (Device Layer)](#15-nodes-device-layer)
16. [Automation (Cron, Webhooks, Hooks)](#16-automation-cron-webhooks-hooks)
17. [Sandboxing & Security](#17-sandboxing--security)
18. [Configuration System](#18-configuration-system)
19. [Web Control UI](#19-web-control-ui)
20. [Naming Conventions](#20-naming-conventions)
21. [Project Structure](#21-project-structure)
22. [Tech Stack](#22-tech-stack)
23. [Key Design Patterns to Replicate](#23-key-design-patterns-to-replicate)

---

## 1. System Overview

**OniAI** is a self-hosted, multi-channel gateway for AI agents. It is a **personal AI assistant** that connects messaging apps (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, and more) to an embedded AI coding agent (Pi). The system is:

- **Self-hosted** — runs on the operator's hardware under their rules.
- **Multi-channel** — one Gateway process serves many messaging surfaces simultaneously.
- **Agent-native** — built for coding agents with tool use, sessions, memory, and multi-agent routing.
- **Open source** — MIT licensed, TypeScript/ESM, community-driven.

### High-Level Flow

```
Chat Apps (WhatsApp/Telegram/Discord/Slack/Signal/iMessage/WebChat/...)
                 │
                 ▼
┌─────────────────────────────────┐
│           Gateway               │
│       (Control Plane)           │
│    ws://127.0.0.1:19100         │
└──────────────┬──────────────────┘
               │
               ├── Pi Agent (RPC mode — tool streaming + block streaming)
               ├── CLI (oni ...)
               ├── WebChat UI
               ├── macOS App (menu bar)
               ├── iOS / Android Nodes
               └── Control UI (browser dashboard)
```

### Core Concepts

| Concept     | Description                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------- |
| **Gateway** | Single long-lived process; the control plane for sessions, routing, channels, tools, and events |
| **Agent**   | An isolated "brain" with its own workspace, auth profiles, session store, and persona           |
| **Session** | A conversation context keyed by agent + channel + peer; stores transcripts as JSONL             |
| **Channel** | A messaging surface (WhatsApp, Telegram, etc.) connected to the Gateway                         |
| **Node**    | A device (macOS/iOS/Android) that exposes local capabilities (camera, canvas, system.run)       |
| **Tool**    | A typed function the agent can call (exec, browser, canvas, message, cron, etc.)                |
| **Skill**   | A Markdown instruction file that teaches the agent how to use tools                             |
| **Plugin**  | A TypeScript module that extends the Gateway with new channels, tools, commands, or services    |
| **Binding** | A routing rule that maps inbound messages to a specific agent                                   |

---

## 2. Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Gateway Process                    │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  Channel     │  │   Session    │  │   Agent     │ │
│  │  Connectors  │  │   Store      │  │   Runtime   │ │
│  │  (WA/TG/DC)  │  │   (JSONL)    │  │   (Pi RPC)  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                 │                  │        │
│  ┌──────┴─────────────────┴──────────────────┴─────┐ │
│  │              WebSocket Server                    │ │
│  │         (typed JSON protocol, port 19100)        │ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │                                 │
│  ┌─────────┐ ┌──────┴──────┐ ┌──────────┐ ┌───────┐ │
│  │ Plugins │ │  HTTP/WS    │ │ Tool     │ │ Cron  │ │
│  │ (jiti)  │ │  Endpoints  │ │ Engine   │ │ Sched │ │
│  └─────────┘ └─────────────┘ └──────────┘ └───────┘ │
└─────────────────────────────────────────────────────┘
         ▲              ▲              ▲
         │              │              │
    ┌────┴────┐   ┌─────┴─────┐  ┌────┴─────┐
    │ Clients │   │  Nodes    │  │  Control  │
    │(CLI/App)│   │(iOS/Mac)  │  │   UI      │
    └─────────┘   └───────────┘  └──────────┘
```

### Key Architectural Decisions

1. **Single Gateway per host** — exactly one Gateway owns the messaging session (e.g., one Baileys WhatsApp session).
2. **WebSocket-first** — all clients (CLI, web UI, macOS app, mobile nodes) connect via WS.
3. **Typed protocol** — TypeBox schemas define the wire protocol; JSON Schema and Swift models are generated from them.
4. **In-process plugins** — plugins run in the same process via jiti (TypeScript runtime loader).
5. **JSONL transcripts** — session history is append-only JSONL files, not a database.
6. **Config as source of truth** — `~/.oni/oni.json` (JSON5) drives all behavior; the Gateway watches it for hot-reload.

---

## 3. Gateway (Core Control Plane)

The Gateway is the heart of the system. It is a single long-lived Node.js process that:

- **Maintains provider connections** (WhatsApp via Baileys, Telegram via grammY, Discord via discord.js, Slack via Bolt, etc.)
- **Exposes a typed WS API** with requests, responses, and server-push events
- **Validates inbound frames** against JSON Schema
- **Emits events** like `agent`, `chat`, `presence`, `health`, `heartbeat`, `cron`
- **Serves the Control UI** and Canvas host over HTTP on the same port (default `19100`)
- **Manages sessions, routing, tool execution, and cron scheduling**

### Gateway Lifecycle

```
Start → Load config → Validate schema → Connect channels →
Open WS server → Load plugins → Load skills → Start cron →
Watch config for hot-reload → Accept client connections
```

### Key Gateway Endpoints

| Surface       | Path/Method                             |
| ------------- | --------------------------------------- |
| WebSocket API | `ws://127.0.0.1:19100`                  |
| Control UI    | (removed — see oniDocs/uiStructure/)    |
| Canvas Host   | `/__oni__/canvas/`                      |
| A2UI Host     | `/__oni__/a2ui/`                        |
| Health Check  | WS `health` method (also in `hello-ok`) |

### Gateway Modes

- **Local (default):** binds to loopback only
- **LAN:** binds to all interfaces (requires auth)
- **Remote:** accessible via Tailscale Serve/Funnel or SSH tunnels

### Gateway Lock

Only one Gateway per host. A lock file prevents multiple instances.

### Background Process

Can be supervised by launchd (macOS) or systemd (Linux) for auto-restart.

---

## 4. WebSocket Protocol

The protocol is the **single control plane + node transport** for all clients.

### Transport

- WebSocket, text frames with JSON payloads
- First frame **must** be a `connect` request

### Frame Types

```typescript
// Request
{ type: "req", id: string, method: string, params: object }

// Response
{ type: "res", id: string, ok: boolean, payload?: object, error?: object }

// Event (server-push)
{ type: "event", event: string, payload: object, seq?: number, stateVersion?: number }
```

### Handshake Flow

```
1. Gateway → Client: event:connect.challenge { nonce, ts }
2. Client → Gateway: req:connect { minProtocol, maxProtocol, client, role, scopes, caps, commands, permissions, auth, device }
3. Gateway → Client: res { hello-ok, protocol, policy, auth? }
```

### Roles & Scopes

**Roles:**

- `operator` — control plane client (CLI, UI, automation)
- `node` — capability host (camera, screen, canvas, system.run)

**Operator Scopes:** `operator.read`, `operator.write`, `operator.admin`, `operator.approvals`, `operator.pairing`

**Node Declarations:**

- `caps` — high-level capability categories (camera, canvas, screen, location, voice)
- `commands` — command allowlist (camera.snap, canvas.navigate, etc.)
- `permissions` — granular toggles (screen.record: true/false)

### Device Identity & Pairing

- All clients include a stable device identity (keypair fingerprint) on `connect`
- New device IDs require pairing approval
- Local connects (loopback) can be auto-approved
- Gateway issues device tokens for subsequent connections
- All connections must sign the server-provided `connect.challenge` nonce

### Auth

- If `ONI_GATEWAY_TOKEN` is set, `connect.params.auth.token` must match
- After pairing, the Gateway issues a device token scoped to role + scopes
- Device tokens can be rotated/revoked

### Idempotency

Side-effecting methods (`send`, `agent`) require idempotency keys for safe retry.

---

## 5. Agent Runtime

OniAI runs a single embedded agent runtime derived from **pi-mono** (a fork/integration of the Pi coding agent).

### Agent = Isolated Brain

Each agent has:

- **Workspace** — files, AGENTS.md, SOUL.md, USER.md, local notes, persona rules
- **State directory** (`agentDir`) — auth profiles, model registry, per-agent config
- **Session store** — chat history + routing state under `~/.oni/agents/<agentId>/sessions`

### Bootstrap Files (Injected into Agent Context)

On the first turn of a new session, these files are injected into the system prompt:

| File           | Purpose                                   |
| -------------- | ----------------------------------------- |
| `AGENTS.md`    | Operating instructions + "memory"         |
| `SOUL.md`      | Persona, boundaries, tone                 |
| `TOOLS.md`     | User-maintained tool notes                |
| `BOOTSTRAP.md` | One-time first-run ritual (deleted after) |
| `IDENTITY.md`  | Agent name/vibe/emoji                     |
| `USER.md`      | User profile + preferred address          |

Blank files are skipped. Large files are trimmed with a marker.

### Built-in Tools

Core tools (read/exec/edit/write) are always available, subject to tool policy. `TOOLS.md` does **not** control which tools exist; it's guidance for how the operator wants them used.

### Skills Loading (Three Sources)

1. **Bundled** — shipped with install
2. **Managed/local** — `~/.oni/skills`
3. **Workspace** — `<workspace>/skills`

Precedence: workspace > managed > bundled

### pi-mono Integration

OniAI reuses pieces of pi-mono (models/tools), but **session management, discovery, and tool wiring are OniAI-owned**. No legacy Pi/Tau session folders are read.

### Model Refs

Model refs use `provider/model` format (e.g., `anthropic/claude-opus-4-6`). Parsed by splitting on the first `/`.

---

## 6. Session Management

Sessions are the conversation state unit. They map message flows to agent contexts.

### Session Key Structure

- **Direct chats:** `agent:<agentId>:<mainKey>` (default key: `main`)
- **Group chats:** `agent:<agentId>:<channel>:group:<id>`
- **Channel chats:** `agent:<agentId>:<channel>:channel:<id>`
- **Cron jobs:** `cron:<job.id>`
- **Webhooks:** `hook:<uuid>`
- **Node runs:** `node-<nodeId>`

### DM Scope (Session Isolation)

Controls how direct messages are grouped:

| Scope                      | Behavior                                                 |
| -------------------------- | -------------------------------------------------------- |
| `main` (default)           | All DMs share the main session (continuity)              |
| `per-peer`                 | Isolate by sender ID across channels                     |
| `per-channel-peer`         | Isolate by channel + sender (recommended for multi-user) |
| `per-account-channel-peer` | Isolate by account + channel + sender (multi-account)    |

**Identity Links:** Map provider-prefixed peer IDs to canonical identity so the same person shares a DM session across channels.

### Storage

- **Store file:** `~/.oni/agents/<agentId>/sessions/sessions.json` (a JSON map of `sessionKey → metadata`)
- **Transcripts:** `~/.oni/agents/<agentId>/sessions/<SessionId>.jsonl` (append-only JSONL)

### Session Lifecycle

- **Daily reset:** defaults to 4:00 AM local time (stale = last update before most recent reset)
- **Idle reset (optional):** `idleMinutes` adds a sliding window; whichever expires first wins
- **Per-type overrides:** `resetByType` for `direct`, `group`, `thread`
- **Per-channel overrides:** `resetByChannel`
- **Manual reset:** `/new` or `/reset` in chat; delete keys from store or remove JSONL

### Session Maintenance

Bounded growth via configurable maintenance:

- `pruneAfter` — evict entries older than N days (default 30d)
- `maxEntries` — cap entry count (default 500)
- `rotateBytes` — rotate sessions.json when it exceeds size (default 10mb)
- `maxDiskBytes` — hard disk budget
- Modes: `warn` (report only) or `enforce` (apply cleanup)

### Session Pruning

Trims old tool results from in-memory context before LLM calls. Does **not** rewrite JSONL history.

### Pre-Compaction Memory Flush

When a session nears auto-compaction, the system runs a silent memory flush turn that reminds the model to write durable notes to disk.

---

## 7. Multi-Agent Routing

The Gateway can host **multiple isolated agents** with separate workspaces, auth, and sessions.

### What is an Agent?

```
~/.oni/
├── oni.json              ← Single config file
├── workspace/                 ← Default agent workspace
├── workspace-coding/          ← Second agent workspace
├── agents/
│   ├── main/
│   │   ├── agent/             ← Auth profiles, model registry
│   │   └── sessions/          ← Session store + JSONL transcripts
│   └── coding/
│       ├── agent/
│       └── sessions/
└── credentials/               ← Channel auth (WhatsApp creds, etc.)
```

### Bindings (Routing Rules)

Bindings route inbound messages to agents. **Most-specific wins:**

1. `peer` match (exact DM/group/channel ID)
2. `parentPeer` match (thread inheritance)
3. `guildId + roles` (Discord role routing)
4. `guildId` (Discord)
5. `teamId` (Slack)
6. `accountId` match for a channel
7. Channel-level match (`accountId: "*"`)
8. Fallback to default agent

```json5
{
  agents: {
    list: [
      { id: "home", workspace: "~/.oni/workspace-home" },
      { id: "work", workspace: "~/.oni/workspace-work" },
    ],
  },
  bindings: [
    { agentId: "home", match: { channel: "whatsapp", accountId: "personal" } },
    { agentId: "work", match: { channel: "whatsapp", accountId: "biz" } },
  ],
}
```

### Multiple Accounts

Channels supporting multiple accounts (WhatsApp, Telegram, Discord) use `accountId` to identify each login. Each can route to a different agent.

### Per-Agent Configuration

Each agent can override:

- **Workspace** and `agentDir`
- **Model** selection
- **Sandbox** mode and scope
- **Tool** allow/deny lists
- **Group chat** mention patterns
- **Skills** (workspace-level)

---

## 8. Channels (Messaging Surfaces)

Channels are the messaging backends. Each connects to a real messaging platform.

### Built-in Channels

| Channel                | Library/Method         | Config Key             |
| ---------------------- | ---------------------- | ---------------------- |
| WhatsApp               | Baileys (WhatsApp Web) | `channels.whatsapp`    |
| Telegram               | grammY                 | `channels.telegram`    |
| Discord                | discord.js             | `channels.discord`     |
| Slack                  | Bolt                   | `channels.slack`       |
| Signal                 | signal-cli             | `channels.signal`      |
| iMessage (legacy)      | imsg CLI (macOS)       | `channels.imessage`    |
| BlueBubbles (iMessage) | BlueBubbles API        | `channels.bluebubbles` |
| Google Chat            | Chat API               | `channels.googlechat`  |
| WebChat                | Gateway WS API         | (built-in)             |

### Extension Channels (Plugins)

| Channel         | Package           |
| --------------- | ----------------- |
| Microsoft Teams | `@oni/msteams`    |
| Matrix          | `@oni/matrix`     |
| Zalo            | `@oni/zalo`       |
| Zalo Personal   | `@oni/zalouser`   |
| Mattermost      | `@oni/mattermost` |
| Nostr           | `@oni/nostr`      |

### DM Policy (Access Control)

All DM-capable channels support a `dmPolicy` that gates inbound DMs **before** processing:

| Policy              | Behavior                                             |
| ------------------- | ---------------------------------------------------- |
| `pairing` (default) | Unknown senders get a pairing code; must be approved |
| `allowlist`         | Only senders in `allowFrom` are accepted             |
| `open`              | Allow anyone (requires `allowFrom: ["*"]`)           |
| `disabled`          | Ignore all DMs                                       |

### Group Chat Support

- **Mention gating:** Groups can require @-mentions to activate the bot
- **Group allowlists:** Restrict which groups the bot responds in
- **Per-group settings:** `requireMention`, activation mode
- **Broadcast groups:** Route a group to multiple agents

### Channel Features

- Media support (images, audio, video, documents)
- Voice note transcription
- Reactions, pins, threads
- Typing indicators
- Streaming/preview messages
- Channel-specific chunking limits

---

## 9. Tools System

Tools are **typed functions** the agent can call. They replace old skill-based shelling.

### Core Tools

| Tool                           | Purpose                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `exec`                         | Run shell commands in workspace                             |
| `process`                      | Manage background exec sessions (poll, log, kill)           |
| `read` / `write` / `edit`      | File operations                                             |
| `apply_patch`                  | Multi-hunk structured patches                               |
| `browser`                      | Control OniAI-managed Chrome/Chromium (CDP)                 |
| `canvas`                       | Drive node Canvas (present, eval, snapshot, A2UI)           |
| `nodes`                        | Discover/target paired nodes; camera, screen, notifications |
| `message`                      | Send messages across all channels                           |
| `cron`                         | Manage Gateway cron jobs and wakeups                        |
| `gateway`                      | Restart, config apply/patch, update                         |
| `web_search`                   | Brave Search API                                            |
| `web_fetch`                    | Fetch URL → markdown/text                                   |
| `image`                        | Analyze image with configured image model                   |
| `sessions_list`                | List active sessions                                        |
| `sessions_history`             | Fetch transcript for a session                              |
| `sessions_send`                | Message another session (agent-to-agent)                    |
| `sessions_spawn`               | Start a sub-agent run                                       |
| `session_status`               | Current session status                                      |
| `agents_list`                  | List available agents for spawning                          |
| `memory_search` / `memory_get` | Memory plugin tools                                         |

### Tool Profiles (Base Allowlists)

```
minimal   → session_status only
coding    → group:fs, group:runtime, group:sessions, group:memory, image
messaging → group:messaging, sessions_list/history/send, session_status
full      → no restriction (default)
```

### Tool Groups (Shorthands)

| Group              | Expands To                                       |
| ------------------ | ------------------------------------------------ |
| `group:runtime`    | exec, bash, process                              |
| `group:fs`         | read, write, edit, apply_patch                   |
| `group:sessions`   | sessions_list/history/send/spawn, session_status |
| `group:memory`     | memory_search, memory_get                        |
| `group:web`        | web_search, web_fetch                            |
| `group:ui`         | browser, canvas                                  |
| `group:automation` | cron, gateway                                    |
| `group:messaging`  | message                                          |
| `group:nodes`      | nodes                                            |

### Tool Policy Chain

```
Tool Profile (base) → Provider-specific policy → Allow list → Deny list (deny wins)
```

Per-agent overrides: `agents.list[].tools.profile`, `.allow`, `.deny`, `.byProvider`

### Loop Detection

Tracks recent tool-call history and blocks repetitive no-progress loops:

- `genericRepeat` — same tool + same params
- `knownPollNoProgress` — poll-like tools with identical output
- `pingPong` — alternating A/B/A/B patterns

### How Tools Are Presented to the Agent

Tools are exposed in two parallel channels:

1. **System prompt text** — human-readable list + guidance
2. **Tool schema** — structured function definitions sent to model API

---

## 10. Skills Platform

Skills teach the agent **how** to use tools. Each skill is a directory with a `SKILL.md` containing YAML frontmatter + instructions.

### Skill Format (AgentSkills-Compatible)

```markdown
---
name: nano-banana-pro
description: Generate or edit images via Gemini 3 Pro Image
metadata:
  {
    "oni":
      {
        "requires": { "bins": ["uv"], "env": ["GEMINI_API_KEY"] },
        "primaryEnv": "GEMINI_API_KEY",
      },
  }
---

[Instructions for the agent on how to use this skill...]
```

### Gating (Load-Time Filters)

Skills are filtered at load time using `metadata.oni`:

- `requires.bins` — binary must exist on PATH
- `requires.anyBins` — at least one must exist
- `requires.env` — env var must be set
- `requires.config` — config path must be truthy
- `os` — platform filter (darwin, linux, win32)
- `always: true` — skip all gates

### Config Overrides

```json5
{
  skills: {
    entries: {
      "nano-banana-pro": {
        enabled: true,
        apiKey: "KEY_HERE",
        env: { GEMINI_API_KEY: "KEY_HERE" },
      },
    },
  },
}
```

### Environment Injection

Per agent run: read skill metadata → apply env/apiKey → build system prompt → restore env after run.

### Session Snapshot

Skills are snapshotted when a session starts and reused for subsequent turns. Changes take effect on the next new session (or via hot-reload watcher).

### ClawHub (Skills Registry)

Public skills registry at `clawhub.com`. Install: `clawhub install <skill-slug>`. Update: `clawhub update --all`.

### Token Impact

Per-skill overhead: ~97 chars + name + description + location lengths. Base overhead (when ≥1 skill): ~195 chars.

---

## 11. Plugin / Extension System

Plugins are TypeScript modules loaded at runtime via **jiti** that extend the Gateway.

### What Plugins Can Register

- **Gateway RPC methods** (`api.registerGatewayMethod`)
- **Gateway HTTP handlers**
- **Agent tools** (`api.registerTool`)
- **CLI commands** (`api.registerCli`)
- **Background services** (`api.registerService`)
- **Hooks** (`api.registerHook`)
- **Provider auth flows** (`api.registerProvider`)
- **Messaging channels** (`api.registerChannel`)
- **Auto-reply commands** (`api.registerCommand`)
- **Skills** (via `skills` directories in manifest)

### Plugin Discovery & Precedence

1. Config paths (`plugins.load.paths`)
2. Workspace extensions (`<workspace>/.oni/extensions/`)
3. Global extensions (`~/.oni/extensions/`)
4. Bundled extensions (shipped with OniAI, disabled by default)

### Plugin Manifest

Each plugin must include `oni.plugin.json`:

```json
{
  "id": "my-plugin",
  "configSchema": { "type": "object", "properties": { ... } },
  "uiHints": { "apiKey": { "label": "API Key", "sensitive": true } }
}
```

### Plugin Slots (Exclusive Categories)

Some categories are exclusive (e.g., memory). Only one active at a time:

```json5
{ plugins: { slots: { memory: "memory-core" } } }
```

### Channel Plugin Pattern

```typescript
const plugin = {
  id: "acmechat",
  meta: { id: "acmechat", label: "AcmeChat", docsPath: "/channels/acmechat" },
  capabilities: { chatTypes: ["direct"] },
  config: {
    listAccountIds: (cfg) =>
      Object.keys(cfg.channels?.acmechat?.accounts ?? {}),
    resolveAccount: (cfg, accountId) =>
      cfg.channels?.acmechat?.accounts?.[accountId ?? "default"],
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ text }) => ({ ok: true }),
  },
};

export default function (api) {
  api.registerChannel({ plugin });
}
```

### Distribution

Plugins are published as npm packages under `@oni/*`. Install: `oni plugins install @oni/voice-call`.

---

## 12. Command Queue

Serializes inbound auto-reply runs to prevent agent run collisions.

### Design

- **Lane-aware FIFO queue** with configurable concurrency (default 1 per session, 4 global for `main` lane)
- Per-session lane guarantees only one active run per session
- Global lane caps overall parallelism via `agents.defaults.maxConcurrent`
- Pure TypeScript + promises (no external dependencies)

### Queue Modes (Per Channel)

| Mode                 | Behavior                                               |
| -------------------- | ------------------------------------------------------ |
| `steer`              | Inject into current run (cancels pending tool calls)   |
| `followup`           | Queue for next agent turn after current run ends       |
| `collect` (default)  | Coalesce all queued messages into single followup turn |
| `steer-backlog`      | Steer now AND preserve for followup                    |
| `interrupt` (legacy) | Abort active run, run newest message                   |

### Queue Options

- `debounceMs` — wait for quiet before starting followup (default 1000)
- `cap` — max queued messages per session (default 20)
- `drop` — overflow policy: `old`, `new`, `summarize`

---

## 13. Streaming & Chunking

Two separate streaming layers:

### Block Streaming (Channel Messages)

Emit completed **blocks** as the assistant writes (not token deltas):

```
Model output → text_delta/events → chunker → channel send (block replies)
```

**Controls:**

- `blockStreamingDefault`: on/off (default off)
- `blockStreamingBreak`: `text_end` (emit as you go) or `message_end` (flush once)
- `blockStreamingChunk`: `{ minChars, maxChars, breakPreference }`
- `blockStreamingCoalesce`: merge streamed blocks before send (reduce spam)

**Chunking Algorithm (EmbeddedBlockChunker):**

- Low bound: don't emit until buffer ≥ minChars
- High bound: prefer splits before maxChars
- Break preference: paragraph → newline → sentence → whitespace → hard break
- Code fences: never split inside; close + reopen if forced

### Preview Streaming (Telegram/Discord/Slack)

Update a temporary preview message while generating:

- `off` — disable
- `partial` — single preview, replaced with latest text
- `block` — chunked/appended preview updates
- `progress` — status preview during generation, final answer at completion

---

## 14. Model Management & Failover

### Selection Order

1. **Primary** model (`agents.defaults.model.primary`)
2. **Fallbacks** in order (`agents.defaults.model.fallbacks`)
3. **Provider auth failover** happens inside a provider before moving to next model

### Model Allowlist

`agents.defaults.models` defines the catalog + acts as allowlist for `/model` command. If set, only listed models can be selected.

### Model Switching in Chat

```
/model                       — numbered picker
/model list                  — compact list
/model 3                     — select by number
/model openai/gpt-5.2        — select by ref
/model status                — detailed view with auth status
```

### Auth Profile Rotation

Per-agent auth stored in `~/.oni/agents/<agentId>/agent/auth-profiles.json`. Supports OAuth, API keys, device codes. Cooldowns and rotation on failure.

### Image Model

`agents.defaults.imageModel` used when primary model can't accept images.

---

## 15. Nodes (Device Layer)

Nodes are paired devices that expose local capabilities over the Gateway WebSocket.

### Node Types

- **macOS** — system.run, system.notify, canvas, camera, screen recording
- **iOS** — canvas, voice wake, talk mode, camera, screen recording, Bonjour pairing
- **Android** — canvas, talk mode, camera, screen recording, optional SMS
- **Headless** — `oni node run` for server-side node capabilities

### Node Protocol

Nodes connect to the same WS server with `role: "node"` and declare:

- `caps` — capability categories
- `commands` — command allowlist
- `permissions` — granular toggle map

### Node Actions

- `camera.snap` / `camera.clip` — capture photo/video
- `screen.record` — screen recording
- `canvas.*` — navigate, present, eval, snapshot, A2UI
- `location.get` — GPS coordinates
- `system.run` — execute commands on the node
- `system.notify` — push notifications

### Pairing

Nodes require device pairing (approval + token). Gateway enforces server-side allowlists for commands.

---

## 16. Automation (Cron, Webhooks, Hooks)

### Cron Jobs

- Managed via `cron` tool or config
- Isolated sessions per cron job (fresh `sessionId` per run)
- Actions: `status`, `list`, `add`, `update`, `remove`, `run`, `runs`, `wake`

### Webhooks

- HTTP endpoints that trigger agent runs
- Configurable session key, token auth
- Support for Gmail Pub/Sub triggers

### Hooks

- Event-driven automation (e.g., `command:new`, gateway events)
- Plugin-registered or config-defined
- Eligibility rules (OS/bins/env/config requirements)

### Heartbeats

- Periodic agent wakeups for proactive behavior
- Configurable interval (`agents.defaults.heartbeat.every`)

---

## 17. Sandboxing & Security

### Security Model

**Personal assistant trust model:** one trusted operator boundary per gateway. Not a hostile multi-tenant boundary.

### Threat Model

```
Access Control (identity) → Scope (tools/permissions) → Model (assume manipulable)
```

### Sandboxing (Docker)

Run tool execution in Docker containers to limit blast radius.

**Modes:**

- `off` — no sandboxing (default)
- `non-main` — sandbox only non-main sessions (groups, channels)
- `all` — every session sandboxed

**Scope:**

- `session` — one container per session (default)
- `agent` — one container per agent
- `shared` — one container for all sandboxed sessions

**Workspace Access:**

- `none` (default) — sandbox sees its own workspace
- `ro` — agent workspace mounted read-only
- `rw` — agent workspace mounted read-write

### DM Access Control

Per-channel `dmPolicy`: pairing → allowlist → open → disabled

### Group Access Control

Group allowlists + mention gating. Groups check in order: groupPolicy/allowlists first, mention/reply second.

### Tool Policy

```json5
{
  tools: {
    profile: "messaging",
    deny: ["group:automation", "group:runtime"],
    fs: { workspaceOnly: true },
    exec: { security: "deny", ask: "always" },
    elevated: { enabled: false },
  },
}
```

### Exec Approvals

When an exec request needs approval:

1. Gateway broadcasts `exec.approval.requested`
2. Operator client resolves via `exec.approval.resolve`

### Credential Storage Map

| Credential          | Location                                             |
| ------------------- | ---------------------------------------------------- |
| WhatsApp creds      | `~/.oni/credentials/whatsapp/<accountId>/creds.json` |
| Telegram token      | config/env or `tokenFile`                            |
| Discord token       | config/env                                           |
| Slack tokens        | config/env                                           |
| Pairing allowlists  | `~/.oni/credentials/<channel>-allowFrom.json`        |
| Model auth profiles | `~/.oni/agents/<agentId>/agent/auth-profiles.json`   |

### Security Audit

```bash
oni security audit          # basic check
oni security audit --deep   # live Gateway probe
oni security audit --fix    # auto-fix where possible
```

---

## 18. Configuration System

### Config File

`~/.oni/oni.json` — JSON5 format (supports comments and trailing commas).

### Editing Methods

1. **Interactive wizard:** `oni onboard` / `oni configure`
2. **CLI one-liners:** `oni config get/set/unset`
3. **Control UI:** browser form + raw JSON editor
4. **Direct edit:** Gateway watches file for hot-reload

### Strict Validation

Only accepts configs matching the schema. Unknown keys cause Gateway to **refuse to start**. Run `oni doctor` for diagnostics.

### Key Config Sections

| Section           | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `agents.defaults` | Model, workspace, sandbox, tools, heartbeat |
| `agents.list`     | Multi-agent definitions                     |
| `bindings`        | Routing rules                               |
| `channels.*`      | Per-channel configuration                   |
| `session`         | DM scope, resets, maintenance               |
| `tools`           | Tool profiles, allow/deny, exec settings    |
| `plugins`         | Plugin enable/disable, slots, config        |
| `skills`          | Skill entries, overrides                    |
| `messages`        | Queue modes, TTS, group chat settings       |
| `gateway`         | Bind, auth, tailscale, nodes                |
| `browser`         | Browser tool configuration                  |
| `cron`            | Cron job definitions                        |

---

## 19. Web Control UI

Browser dashboard served directly from the Gateway on the same port.

### Features

- Chat interface (WebChat)
- Configuration editor (form + raw JSON)
- Session management
- Node management and pairing
- Channel status
- Skill management
- Health monitoring

### Access

- Local: `http://127.0.0.1:19100/`
- Remote: via Tailscale Serve/Funnel or SSH tunnel
- Requires secure context (HTTPS or localhost) for device identity

---

## 20. Naming Conventions

| Context              | Name              | Example                                    |
| -------------------- | ----------------- | ------------------------------------------ |
| **Product/brand**    | OniAI             | "OniAI is a personal AI assistant"         |
| **CLI command**      | `oni`             | `oni gateway`, `oni status`, `oni onboard` |
| **npm package**      | `oni`             | `npm install -g oni@latest`                |
| **Config file**      | `oni.json`        | `~/.oni/oni.json`                          |
| **Config keys**      | `oni` prefix      | `ONI_GATEWAY_TOKEN`, `ONI_PROFILE`         |
| **Environment vars** | `ONI_` prefix     | `ONI_SKIP_CHANNELS=1`                      |
| **State directory**  | `~/.oni/`         | `~/.oni/agents/`, `~/.oni/credentials/`    |
| **Plugin manifests** | `oni.plugin.json` | `extensions/slack/oni.plugin.json`         |
| **Entry point**      | `oni.mjs`         | `#!/usr/bin/env node` → `oni.mjs`          |

---

## 21. Project Structure

```
openOni/                        # Project root
├── oniDocs/                    # Custom system documentation
│   └── system.md              # This file — complete architecture reference
├── src/                        # Source code (TypeScript ESM)
│   ├── cli/                   # CLI wiring
│   ├── commands/              # CLI commands
│   ├── provider-web.ts        # Web provider
│   ├── infra/                 # Infrastructure (oni-root.ts, tmp-oni-dir.ts)
│   ├── media/                 # Media pipeline
│   ├── agents/                # Agent runtime, tools (oni-tools.ts)
│   ├── config/                # Config types (types.oni.ts)
│   ├── gateway/               # Gateway core
│   │   └── protocol/          # WS protocol (TypeBox schemas)
│   ├── routing/               # Message routing + session keys
│   ├── channels/              # Shared channel logic
│   └── terminal/              # Terminal UI (palette, tables)
├── extensions/                 # Plugin packages (each has oni.plugin.json)
│   ├── msteams/
│   ├── matrix/
│   ├── slack/
│   ├── discord/
│   ├── telegram/
│   ├── whatsapp/
│   ├── voice-call/
│   └── ...30+ more
├── packages/                   # Shared packages
├── oniDocs/uiStructure/         # UI architecture docs (for building custom UI)
├── skills/                     # Bundled skills (SKILL.md files)
├── docs/                       # Documentation (Mintlify)
├── scripts/                    # Build/release/utility scripts
├── test/                       # Test infrastructure
├── vendor/                     # Vendored dependencies (a2ui, etc.)
├── patches/                    # pnpm patches
├── dist/                       # Build output (generated)
├── oni.mjs                     # CLI entry point
├── oni.podman.env              # Podman environment
├── package.json                # Root package (name: "oni", bin: "oni")
├── pnpm-workspace.yaml         # Workspace definition
├── tsconfig.json               # TypeScript config
├── vitest.config.ts            # Test config
├── docker-compose.yml          # Docker compose
├── Dockerfile                  # Container build
├── AGENTS.md                   # Agent instructions
├── README.md                   # Project readme
└── VISION.md                   # Project vision
```

### Key Directories

- **`src/`** — all core logic; tests colocated as `*.test.ts`
- **`extensions/`** — plugin packages (each has own `package.json` + `oni.plugin.json`)
- **`skills/`** — bundled skills (SKILL.md files)
- **`docs/`** — documentation site
- **`scripts/`** — build, release, packaging scripts
- **`vendor/`** — vendored deps (A2UI renderer, specification)
- **`oniDocs/`** — custom architecture docs (this system.md)

---

## 22. Tech Stack

| Layer                | Technology                            |
| -------------------- | ------------------------------------- |
| **Language**         | TypeScript (ESM, strict typing)       |
| **Runtime**          | Node 22+ (Bun supported for dev)      |
| **Package Manager**  | pnpm (workspace monorepo)             |
| **Build**            | tsdown (bundler)                      |
| **Lint/Format**      | Oxlint + Oxfmt                        |
| **Test**             | Vitest (V8 coverage, 70% thresholds)  |
| **Type Check**       | tsgo                                  |
| **Protocol Schemas** | TypeBox → JSON Schema → Swift codegen |
| **Config Format**    | JSON5                                 |
| **Session Storage**  | JSONL files (no database)             |
| **Plugin Loader**    | jiti (TypeScript runtime loading)     |
| **WhatsApp**         | Baileys                               |
| **Telegram**         | grammY                                |
| **Discord**          | discord.js                            |
| **Slack**            | Bolt                                  |
| **Browser Control**  | CDP (Chrome DevTools Protocol)        |
| **Canvas**           | A2UI specification (v0.8/v0.9)        |
| **Container**        | Docker (sandbox)                      |
| **Docs**             | Mintlify                              |
| **Skills Registry**  | ClawHub                               |

---

## 23. Key Design Patterns to Replicate

### 1. Gateway as Single Control Plane

Everything flows through one process. This simplifies state management, session routing, and debugging. The Gateway owns all connections and is the single source of truth.

### 2. WebSocket-First Protocol

A typed WS protocol with request/response/event frames enables real-time bidirectional communication. TypeBox schemas provide both runtime validation and code generation.

### 3. Agent Isolation via Workspaces

Each agent is fully isolated: own workspace, own session store, own auth. This enables multi-persona setups without data leakage.

### 4. Binding-Based Routing

Declarative routing rules (bindings) map inbound messages to agents. Most-specific wins. This separates routing logic from business logic.

### 5. Tool-First Agent Design

Tools are typed functions with schemas, not shell commands parsed from text. The agent sees both human-readable descriptions and machine-readable schemas.

### 6. Plugin Architecture

Plugins run in-process via jiti. They can extend any surface: RPC, HTTP, CLI, tools, channels, skills, hooks. Manifest-driven discovery with allowlist security.

### 7. Session-as-JSONL

Append-only JSONL files for transcripts. No database needed. Simple, inspectable, and easy to back up. Session metadata lives in a JSON store file.

### 8. Skills as Markdown

Skills are just Markdown files with YAML frontmatter. They're human-readable, version-controllable, and can be gated by environment/config/binary presence at load time.

### 9. Config-Driven Everything

One JSON5 config file drives all behavior. Strict schema validation prevents misconfiguration. Hot-reload on file change. CLI, UI, and direct edit all supported.

### 10. Security by Default

Pairing-based DM access, mention gating for groups, tool profiles, exec approvals, Docker sandboxing. Start locked down, widen deliberately.

### 11. Queue Serialization

In-process FIFO queue per session prevents agent run collisions. Lane-aware concurrency caps protect shared resources.

### 12. Streaming Architecture

Two-layer streaming: block streaming for channel messages (coarse chunks) and preview streaming for live updates. Never sends partial/streaming replies to external messaging surfaces.

---

## Summary

OniAI is a mature, production-grade AI agent gateway. Its key innovation is treating the **Gateway as the single control plane** that bridges messaging surfaces, agent runtimes, device nodes, and automation — all through a typed WebSocket protocol. The system is designed for a **personal assistant** trust model with strong defaults and explicit opt-in for wider access.

To build your own system inspired by this architecture:

1. **Start with the Gateway** — WS server with typed protocol, config loading, and channel management
2. **Add the Agent Runtime** — embedded LLM integration with tool calling and session management
3. **Build Channel Connectors** — one per messaging platform, all feeding into the Gateway
4. **Implement Tools** — typed functions with schemas that the agent can call
5. **Add Skills** — Markdown-based instruction files for tool usage guidance
6. **Plugin System** — jiti-based extension loading for modularity
7. **Security Layer** — pairing, allowlists, sandboxing, tool policies
8. **Control UI** — web dashboard for monitoring and configuration

---

_Generated from the OniAI documentation corpus. Last studied: 2026-02-25._
