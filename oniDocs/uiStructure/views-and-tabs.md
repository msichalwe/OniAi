# Views & Tabs — UI Sections and Their Data Sources

## Tab Navigation

The UI is organized into tab groups. Each tab maps to a URL path and consumes specific Gateway RPC methods/events.

### Tab Groups

| Group | Tabs |
|-------|------|
| **Chat** | `chat` |
| **Control** | `overview`, `channels`, `instances`, `sessions`, `usage`, `cron` |
| **Agent** | `agents`, `skills`, `nodes` |
| **Settings** | `config`, `debug`, `logs` |

### Tab → Path Mapping

| Tab | URL Path | Icon |
|-----|----------|------|
| `chat` | `/chat` (also `/`) | messageSquare |
| `overview` | `/overview` | barChart |
| `channels` | `/channels` | link |
| `instances` | `/instances` | radio |
| `sessions` | `/sessions` | fileText |
| `usage` | `/usage` | barChart |
| `cron` | `/cron` | loader |
| `agents` | `/agents` | folder |
| `skills` | `/skills` | zap |
| `nodes` | `/nodes` | monitor |
| `config` | `/config` | settings |
| `debug` | `/debug` | bug |
| `logs` | `/logs` | scrollText |

---

## View Details

### Chat View (`/chat`)

**Purpose:** Primary chat interface for conversing with the agent.

**Data sources:**
- `chat.history` — load conversation history
- `chat.send` — send messages
- `chat.abort` — abort active runs

**Events consumed:**
- `chat` — streaming message deltas/finals
- `agent` — tool call lifecycle

**State:**
- `chatMessages`, `chatStream`, `chatRunId`, `chatSending`, `chatLoading`
- `chatAttachments`, `chatQueue`, `chatThinkingLevel`

---

### Overview View (`/overview`)

**Purpose:** Dashboard showing gateway health, channel status, and quick stats.

**Data sources:**
- `health` — gateway health snapshot
- `channels.status` — channel connection states
- `system-presence` — connected devices
- `sessions.list` — active session count

**Events consumed:**
- `health`, `presence`, `channels`

---

### Channels View (`/channels`)

**Purpose:** Manage messaging channel connections (WhatsApp, Telegram, Discord, etc.).

**Data sources:**
- `channels.status` — per-channel status + per-account details
- `channels.whatsapp.start/stop/logout/qr` — WhatsApp management
- `channels.config.get/set` — per-channel config

**Per-channel views display:**
- Connection status (configured/linked/connected)
- Account details (multiple accounts per channel)
- DM policy and allowlists
- QR code flow for WhatsApp linking
- Token/credential sources

---

### Instances View (`/instances`)

**Purpose:** Show connected Gateway client instances (CLI, web UI, macOS app, nodes).

**Data sources:**
- `system-presence` — connected client list with device IDs, roles, scopes

**Displays:**
- Device ID, client name, version, platform
- Connection role (operator/node)
- Active scopes
- Connection time

---

### Sessions View (`/sessions`)

**Purpose:** List and manage active conversation sessions.

**Data sources:**
- `sessions.list` — session list with metadata
- `sessions.preview` — message preview
- `sessions.delete/reset` — session management

**Displays:**
- Session key, kind (direct/group/cron/hook), agent ID
- Last message time, message count
- Session label
- Active/stale status

---

### Usage View (`/usage`)

**Purpose:** Token usage, cost tracking, and analytics.

**Data sources:**
- `usage.sessions` — per-session usage data
- `usage.cost` — cost/token summaries
- `usage.timeseries` — usage over time

**Displays:**
- Token counts (input/output/cache)
- Cost estimates by model/provider
- Time-series charts
- Per-session breakdowns
- Model usage distribution

---

### Cron View (`/cron`)

**Purpose:** Manage scheduled agent jobs.

**Data sources:**
- `cron.status` — scheduler state
- `cron.list` — job list with filtering/sorting
- `cron.add/update/remove` — job management
- `cron.run` — manual trigger
- `cron.runs` — execution history

**Displays:**
- Job list (expression, channel, session, enabled state)
- Run history with status, duration, delivery
- Job editor (add/edit/clone forms)
- Next run time calculation

---

### Agents View (`/agents`)

**Purpose:** Manage agent configurations, files, tools, and skills.

**Data sources:**
- `agents.list` — configured agents
- `agents.files.list/read/write` — workspace files (AGENTS.md, SOUL.md, etc.)
- `agents.identity` — name, avatar, emoji
- `tools.catalog` — runtime tool list per agent

**Sub-panels:**
- **Status** — agent overview, model, workspace path
- **Files** — AGENTS.md, SOUL.md, TOOLS.md, USER.md editor
- **Tools** — tool catalog with groups, deny/allow status
- **Skills** — per-agent skill eligibility

---

### Skills View (`/skills`)

**Purpose:** View skill status and eligibility.

**Data sources:**
- `skills.status` — skill report (loaded, gated, disabled)

**Displays:**
- Skill list with load status
- Gate reasons (missing bins, env, config)
- Source (bundled/managed/workspace)
- Per-skill env/config requirements

---

### Nodes View (`/nodes`)

**Purpose:** Manage paired devices (macOS, iOS, Android nodes) and exec approvals.

**Data sources:**
- `nodes.status` — node capabilities and permissions
- `system-presence` — connected nodes
- `devices.list/approve/reject` — device pairing
- `exec.approvals.get/set` — exec approval settings
- `exec.approval.resolve` — pending approval actions

**Sub-views:**
- **Nodes list** — connected nodes with caps/commands
- **Device pairing** — pending/approved devices
- **Exec approvals** — allowlist editor per gateway/node

---

### Config View (`/config`)

**Purpose:** Edit the `oni.json` configuration file.

**Data sources:**
- `config.get` — current config JSON
- `config.schema` — JSON Schema for validation
- `config.apply/patch` — save changes + restart

**Modes:**
- **Form mode** — structured form with validation, search, hints
- **Raw JSON mode** — direct JSON editor

**Features:**
- Schema-driven form generation
- Real-time validation
- Search across config keys
- Dirty state tracking
- Save + auto-restart

---

### Debug View (`/debug`)

**Purpose:** Gateway internals for debugging.

**Data sources:**
- `health` — detailed health snapshot
- Various debug methods

**Displays:**
- Health snapshot (raw JSON)
- Connected clients
- Channel internals
- Method call tester

---

### Logs View (`/logs`)

**Purpose:** Real-time gateway log viewer.

**Data sources:**
- `logs.query` — historical logs
- `log` events — real-time log stream

**Features:**
- Level filtering (debug/info/warn/error)
- Text search
- Auto-scroll with pause
- Log export (download as text)

---

## Polling Strategy

Views refresh data based on tab visibility:

```
Tab becomes active → load initial data → subscribe to events → poll on interval
Tab becomes inactive → stop polling
```

Default poll intervals:
- Overview: 15s
- Channels: 30s
- Sessions: 30s
- Presence: via events (no polling needed)
- Cron: 30s
- Logs: real-time via events
