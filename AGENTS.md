# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Repository Guidelines

- Repo: https://github.com/oni/oni
- GitHub issues/comments/PR comments: use literal multiline strings or `-F - <<'EOF'` (or $'...') for real newlines; never embed "\\n".
- GitHub comment footgun: never use `gh issue/pr comment -b "..."` when body contains backticks or shell chars. Always use single-quoted heredoc (`-F - <<'EOF'`) so no command substitution/escaping corruption.
- GitHub linking footgun: don't wrap issue/PR refs like `#24643` in backticks when you want auto-linking. Use plain `#24643` (optionally add full URL).
- Security advisory analysis: before triage/severity decisions, read `SECURITY.md` to align with OniAI's trust model and design boundaries.

---

## Architecture Overview

OniAI is a self-hosted, multi-channel AI agent gateway. One long-lived process (the Gateway) connects 10+ messaging platforms to an embedded AI coding agent (Pi) through a WebSocket control plane.

```
Chat Apps (WhatsApp/Telegram/Discord/Slack/Signal/iMessage/LINE/...)
                 │
                 ▼
         ┌───────────────┐
         │    Gateway     │  ← WebSocket control plane (ws://127.0.0.1:19100)
         │  server.impl  │     HTTP: hooks, OpenAI-compat, Control UI, canvas
         └───────┬───────┘
                 │
    ┌────────────┼────────────┬──────────────┐
    │            │            │              │
  Agent      Channels      Tools         Plugins
  Runtime    Connectors    Engine        Extensions
    │            │            │              │
  Sessions   10+ built-in  exec, browser  40 packages
  Memory     38 extensions  read, write   (channels,
  Routing    adapters       cron, message  tools, hooks)
```

**Key design decisions:**
- Single process per host, not multi-tenant (personal assistant trust model)
- Plugin-first: channels, tools, hooks all extensible via TypeScript modules
- Append-only JSONL session transcripts with DAG parent-chain structure
- Provider-agnostic model selection (50+ LLM providers)
- Lazy loading throughout (CLI commands, plugins, models load on-demand)

**Core concepts:**

| Concept     | Description |
|-------------|-------------|
| **Gateway** | Single long-lived process; WebSocket + HTTP control plane for sessions, routing, channels, tools, events |
| **Agent**   | Isolated "brain" with workspace, auth profiles, session store, and persona |
| **Session** | Conversation context keyed by `agent:<agentId>:<channel>:<chatType>:<peerId>` ; stored as JSONL |
| **Channel** | Messaging surface connector (WhatsApp, Telegram, etc.) with adapter interfaces |
| **Node**    | Connected device (macOS/iOS/Android) exposing local capabilities (camera, canvas, system.run) |
| **Tool**    | Typed function the agent can call (exec, browser, canvas, message, cron, etc.) |
| **Skill**   | Markdown instruction file teaching the agent how to use tools (`skills/*/SKILL.md`) |
| **Plugin**  | TypeScript module extending the gateway with channels, tools, commands, or services |
| **Binding** | Routing rule mapping inbound messages to a specific agent |

Full architecture reference: `oniDocs/system.md` (23 sections). UI architecture for building custom frontends: `oniDocs/uiStructure/`.

---

## Gateway Deep Dive (`src/gateway/` — 189 files)

### Server Bootstrap (`server.impl.ts` — 785 lines)
Entry: `src/gateway/server.ts` exports `startGatewayServer()` → calls `server.impl.ts`. Initializes subsystems in order: config validation → auth → plugin registry → channel manager → cron → mDNS discovery → node registry → health monitor → heartbeat → browser → update checker → HTTP + WS server → hook runners.

### HTTP Layer (`server-http.ts`)
Request routing order: security headers → WS upgrade skip → hooks (`/hooks/*`) → OpenAI-compat (`/v1/chat/completions`, `/v1/responses`) → Slack events → plugin HTTP (`/api/channels/*`) → canvas → Control UI (SPA) → 404.

### WebSocket Runtime
`server-ws-runtime.ts` → `server/ws-connection.ts`: per-connection auth state machine (pending → connected/failed), 30s handshake timeout, unique connection IDs, presence tracking.

### RPC Method System (`server-methods.ts` + `server-methods/*.ts`)
28+ handler files. Request frame: `{ type: "request", id, method, params }` → dispatched to handler → response frame. Key method groups: `connect`, `chat`, `agent`, `agents`, `channels`, `cron`, `config`, `wizard`, `skills`, `models`, `nodes`, `devices`, `exec.approvals`, `sessions`, `health`, `doctor`, `system`, `send`, `browser`, `voicewake`, plus plugin-contributed methods.

### Key Gateway Files

| File | Purpose |
|------|---------|
| `server.impl.ts` | Main bootstrap, subsystem initialization |
| `server-http.ts` | HTTP routing (hooks, OpenAI-compat, canvas, Control UI) |
| `server/ws-connection.ts` | Per-connection auth, handshake, message dispatch |
| `server-methods.ts` | RPC method registry and dispatcher |
| `server-chat.ts` | Chat run registry, tool event routing, agent event handling |
| `server-channels.ts` | Channel lifecycle (exponential backoff: 5s→5min, max 10 retries) |
| `server-broadcast.ts` | Event publishing with scope guards, drop-if-slow, state versioning |
| `server-plugins.ts` | Plugin loading via jiti dynamic import |
| `server-cron.ts` | Cron service with isolated agent execution |
| `auth.ts` | Multi-mode auth (none, token, password, trusted-proxy, Tailscale) |
| `credentials.ts` | Credential loading with precedence rules |
| `hooks.ts` | External HTTP webhooks (`/hooks/wake`, `/hooks/agent`) |
| `node-registry.ts` | Connected device tracking + remote invocation RPC |
| `server-startup.ts` | Background services (browser, Gmail watcher, channels, plugins) |
| `server-runtime-state.ts` | Shared runtime state for all RPC handlers |
| `server-runtime-config.ts` | Config hot-reload (non-breaking in-place, restart for breaking) |
| `protocol/index.ts` | AJV-based message schemas and validation |
| `control-ui.ts` | Control UI SPA serving + avatar endpoint |

---

## Agent Runtime (`src/agents/` — 431 files)

### Message-to-Response Flow
```
Message → resolveAgentRoute() → loadSession()
  → runEmbeddedPiAgent()
    → resolve model/provider/auth
    → load SessionManager (JSONL transcript)
    → build system prompt (base + workspace + skills + channel hints)
    → createOniAICodingTools() with policies applied
    → streamSimple() model call in loop:
        context overflow? → compact transcript (summarize + trim)
        stream tokens → partial reply callbacks
        detect tool calls → execute with before-hook → append results
        continue until stop_reason = "end_turn"
  → updateSessionStore() → deliver to channel
```

### Key Agent Files

| File | Purpose |
|------|---------|
| `pi-embedded-runner/run.ts` | Main agent run loop |
| `pi-embedded-runner/run/attempt.ts` | Single model invocation + tool execution loop |
| `pi-embedded-runner/runs.ts` | Global active run registry (mid-stream queue, abort) |
| `pi-embedded-runner/compact.ts` | Context overflow compaction (summarize + trim, up to 3 retries) |
| `pi-embedded-runner/model.ts` | Model discovery chain: registry → inline → OpenRouter → custom |
| `pi-embedded-runner/system-prompt.ts` | System prompt layers: base → channel hints → workspace → skills → sandbox |
| `pi-embedded-subscribe.ts` | Stream processing (delta accumulation, thinking tags, tool call parsing) |
| `pi-tools.ts` + `oni-tools.ts` | Tool creation (exec, browser, canvas, message, cron, memory, etc.) |
| `pi-tools.policy.ts` | Tool policy layers: owner-only → subagent → sandbox → channel → user |
| `agent-scope.ts` | Agent identity resolution from session keys |
| `models-config.ts` | 50+ provider catalog (Anthropic, OpenAI, Gemini, Ollama, vLLM, etc.) |
| `pi-model-discovery.ts` | Model discovery from registry, npm, credentials |
| `model-selection.ts` | Model selection priority + auth profile rotation + cooldowns |
| `memory-search.ts` | Hybrid vector + keyword memory search integration |
| `compaction.ts` | Session compaction logic (summary, token counting, verification) |

### Session Key Format
`agent:<agentId>:<channel>:<chatType>:<peerId>:...`
- Subagent: `...subagent:<id>:...` (depth tracked via `:subagent:` count)
- Cron: `agent:<agentId>:cron:run:<jobId>`
- Session store: TTL cache (45s), write locking, disk budget enforcement

### Tool Policy Tiers (composable, applied in order)
1. **Owner-only** — gates sensitive tools by sender identity
2. **Subagent restrictions** — deny gateway/cron/memory tools; deny spawn at max depth
3. **Sandbox** — workspace FS restrictions
4. **Channel/role** — Discord guild role-based policies
5. **User-configured** — glob pattern allow/deny (`exec*`, `memory_*`, `*_send`)

### Model Selection Priority
User selection → session override → agent config → global default → fallback chain. Auth profile rotation with cooldowns on failure.

---

## Routing (`src/routing/`)

Tier-based agent route resolution (first match wins):
1. Peer matching (direct DM or thread)
2. Parent peer inheritance (thread parent route)
3. Guild + roles (Discord member role-based)
4. Guild-only (broader guild)
5. Team-based (Teams/workspace)
6. Account-level (per-account binding)
7. Channel-wide (wildcard account `*`)
8. Default agent (`resolveDefaultAgentId()`)

Bindings in `config.agents.<agentId>.bindings` match: channel + accountId + optional peer/guild/roles/team.

---

## Channels — Messaging Surfaces

### Shared Infrastructure (`src/channels/`)
Plugin adapter interfaces: `ChannelSetupAdapter`, `ChannelConfigAdapter`, `ChannelOutboundAdapter`, `ChannelStatusAdapter`, `ChannelGroupAdapter`, `ChannelPairingAdapter`, `ChannelSecurityAdapter`, `ChannelAuthAdapter`, `ChannelCommandAdapter`, `ChannelResolverAdapter`, `ChannelGatewayAdapter`, `ChannelHeartbeatAdapter`, `ChannelThreadingAdapter`.

Message normalization per channel in `channels/normalize/`. Outbound delivery in `channels/outbound/`. Typing indicator lifecycle in `channels/typing.ts`.

### Built-in Channels

| Channel | Connection | Code | Key Features |
|---------|-----------|------|-------------|
| **Telegram** | Bot API (long poll/webhook) | `src/telegram/` (97 files) | Media groups, inline buttons, forum topics, model picker |
| **Discord** | Gateway WebSocket | `src/discord/` (123 files) | Embeds, components, modals, threads, voice, guild roles |
| **Slack** | Socket Mode + Events API | `src/slack/` (50 files) | Block Kit, modals, workflows, file upload |
| **Signal** | signal-cli RPC + SSE | `src/signal/` (28 files) | E2E encrypted, phone-based, SSE reconnect with backoff |
| **iMessage** | BlueBubbles HTTP | `src/imessage/` (16 files) | Apple ecosystem, chat IDs, BlueBubbles relay |
| **WhatsApp** | Baileys (web) | `src/web/` (45 files) | QR login, media optimization, broadcast groups |
| **LINE** | Messaging API webhook | `src/line/` (42 files) | Flex messages, rich menus, templates, markdown conversion |

### Extension Channels (`extensions/`)
38 packages: `msteams`, `matrix`, `googlechat`, `irc`, `mattermost`, `feishu`, `zalo`, `zalouser`, `twitch`, `nostr`, `nextcloud-talk`, `synology-chat`, `tlon`, `voice-call`, `talk-voice`, `bluebubbles`, plus infrastructure extensions (`memory-core`, `memory-lancedb`, `llm-task`, `open-prose`, `lobster`, `diagnostics-otel`, `copilot-proxy`, `device-pair`, `phone-control`, `thread-ownership`, auth extensions).

### DM Pairing (`src/pairing/`)
Unknown senders must be approved. Flow: user DMs bot → check allowlist → generate setup code → notify owner → owner approves via reaction/command → add to allowlist.

---

## CLI System (`src/cli/`, `src/commands/`)

### Entry Chain
`oni.mjs` → `src/entry.ts` (respawn with warning suppression, profile parsing) → `src/cli/run-main.ts` → Commander.js `buildProgram()`.

### Command Registration
**Lazy loading**: placeholders with `allowUnknownOption(true)` — real handler registered on first invocation, then reparsed. **Fast-path routing** (`src/cli/program/routes.ts`): frequently-called commands (`health`, `status`, `config get`, `models list`, `sessions`, `agents list`, `memory status`) bypass full Commander.js parsing for speed.

### Core Commands
`setup`, `onboard`, `configure`, `config` (get/set/unset), `doctor`, `dashboard`, `reset`, `uninstall`, `message`, `memory`, `agent`, `agents`, `status`, `health`, `sessions`, `browser`

### Sub-CLI Commands
`gateway`, `daemon`, `logs`, `system`, `models`, `approvals`, `nodes`, `devices`, `node`, `sandbox`, `tui`, `cron`, `dns`, `docs`, `hooks`, `webhooks`, `qr`, `pairing`, `plugins`, `channels`, `directory`, `security`, `skills`, `update`, `completion`, `acp`

### Terminal UI Patterns
- **Palette** (`src/terminal/palette.ts`): warm tan/brown accent colors — always use shared palette, no hardcoded colors
- **Progress** (`src/cli/progress.ts`): OSC progress → spinner → line → log fallbacks
- **Tables** (`src/terminal/table.ts`): ANSI-safe wrapping, unicode borders, flexible columns
- **Theme** (`src/terminal/theme.ts`): `theme.accent()`, `.success()`, `.error()`, `.warn()`, `.muted()`, `.command()`, `.heading()`

### TUI (`src/tui/`)
Interactive terminal UI built on `@mariozechner/pi-tui`. Modes: normal message, `/command`, `!shell`. Session persistence, streaming responses, model/thinking level persistence.

### Onboarding Wizard (`src/wizard/`)
`@clack/prompts`-based interactive setup. Flows: risk acknowledgement → gateway config (quickstart/advanced) → workspace setup → skill configuration → channel setup.

---

## Plugin System

### Plugin SDK (`src/plugin-sdk/`)
~200+ exports for extension development: channel types, adapters, helpers, media/link understanding, security utilities, account resolution, deduplication, persistent storage.

### Plugin Lifecycle
Discovery (npm/HTTP/workspace/bundled) → install (`npm install --omit=dev` in plugin dir) → load (jiti dynamic import with SDK alias) → register (tools, hooks, channels, providers, services, HTTP routes, CLI commands).

### Plugin Registry (`src/plugins/registry.ts`)
Tracks: plugin metadata (id, name, version, source, status), tools, hooks, channels, providers, services, commands, gatewayHandlers, httpRoutes, cliRegistrars, diagnostics.

### Extension Points
- **Hooks**: before-agent-start, llm, after-tool-call, gateway, compaction, message, subagent, session
- **HTTP routes**: `/api/channels/*` namespace
- **CLI commands**: registered via `entry.register()` with collision detection
- **Gateway methods**: plugin-contributed RPC methods

### Extension API (`src/extensionAPI.ts`)
Single entry exporting everything plugins need — used as `import { ... } from "oni/plugin-sdk"`.

---

## Configuration System (`src/config/`)

- **Format**: JSON5 (`~/.oni/oni.json` or `config.json5`) — supports comments, trailing commas, unquoted keys
- **Validation**: Zod schemas (`src/config/zod-schema.ts`) with JSON Schema generation for UI
- **Profile isolation**: `--profile <name>` → `~/.oni-<name>/`
- **Env substitution**: `${VARIABLE}` resolved in config values (`src/config/env-substitution.ts`)
- **Hot-reload**: file watcher applies non-breaking changes live, triggers restart for breaking ones
- **Modular types**: `types.agent-defaults.ts`, `types.agents.ts`, `types.auth.ts`, `types.channels.ts`, `types.gateway.ts`, `types.hooks.ts`, `types.models.ts`, `types.plugins.ts`, `types.sandbox.ts`, `types.skills.ts`, `types.tools.ts`
- **Defaults**: `applyAgentDefaults()`, `applyModelDefaults()`, `applyLoggingDefaults()`, `applySessionDefaults()`, `applyCompactionDefaults()`

---

## Infrastructure Subsystems

| Subsystem | Location | Purpose |
|-----------|----------|---------|
| **Browser** | `src/browser/` | Playwright-based automation; Express server for tab/profile control; AI screenshot analysis; CDP integration; extension relay |
| **Media** | `src/media/` | Temp hosting (TTL-based), MIME detection, image/audio ops, inbound path policy |
| **Media Understanding** | `src/media-understanding/` | Vision, transcription, video description via Gemini/Claude/Deepgram/custom providers |
| **Link Understanding** | `src/link-understanding/` | URL extraction, CLI-based processing with timeout |
| **Memory** | `src/memory/` | Hybrid vector + keyword search (SQLite-vec + BM25 FTS), auto-extraction, bubble system (person/episode/preference/note/place/topic) |
| **Canvas Host** | `src/canvas-host/` | A2UI interactive canvas for iOS/Android; WebSocket live reload; file resolver with security boundary |
| **Node Host** | `src/node-host/` | Device communication bridge; connect to gateway, register node, handle invoke requests for local skills |
| **TTS** | `src/tts/` | OpenAI, ElevenLabs, Edge providers; directive parsing (`{tts: model, voice}`); output: MP3/Opus/PCM |
| **Cron** | `src/cron/` | Persistent job scheduling; delivery to agents, webhooks, channels; timezone-aware; session reaper |
| **Events** | `src/events/` | Trigger-based event bus; persistent trigger store; max 200 event log entries |
| **Security** | `src/security/` | Comprehensive audit (filesystem, config, plugins, sandbox, models); SSRF guards; tool policies; safe binary enforcement; trust journal |
| **Process** | `src/process/` | Child process execution, kill tree, lanes (concurrency pools), restart recovery with backoff |
| **Daemon** | `src/daemon/` | Platform-specific service management: launchd (macOS), systemd (Linux), schtasks (Windows) |
| **Infra** | `src/infra/` | Device identity, Bonjour/mDNS discovery, SSH tunnels, npm integrity, file locking, secure random, retry/backoff |
| **Hooks** | `src/hooks/` | User-authored automation (JS/TS with YAML frontmatter); Gmail watcher integration; hook discovery and lifecycle |
| **Logging** | `src/logging/` | Structured logging, analytics, redaction |
| **Markdown** | `src/markdown/` | Markdown processing and formatting |
| **Projects** | `src/projects/` | Project detection and workspace context |
| **Auto-reply** | `src/auto-reply/` | Auto-reply system with abort shortcuts |
| **Tasks** | `src/tasks/` | Persistent autonomous work queue |
| **ACP** | `src/acp/` | Agent Control Protocol (MCP integration) |

---

## Native Apps

### Desktop (`apps/deskop/`) — Electron + React 19 + Tailwind + Zustand
- **Main process** (`src/main/index.ts`): 1200x800 frameless window, IPC handlers (screen capture, SQLite, store, system info, tray)
- **Preload** (`src/preload/index.ts`): IPC bridge exposing `window.api` (captureScreen, store, db, window, system, tray)
- **Renderer** (`src/renderer/src/`): Multi-panel layout — Chat, Memory, Media, Settings, Terminal, Tasks, Logs
- **Services**: gateway connection, OpenAI Realtime API (voice mode), memory extraction, TTS (Web Speech + StreamSpeaker)
- **Hooks**: useCamera (720p), useMic, useVoiceMode, useScreenCapture (1920x1080), useAmbientListening (2s silence buffer)
- **Memory**: bubble system (person, episode, preference, note, place, topic) with SQLite WAL persistence
- System tray with Cmd+Shift+O toggle

### iOS (`apps/onios/`) — React Native / Expo
Scaffolded/in-progress. Currently being refactored from `apps/onimobile/`.

### macOS — SwiftUI menubar app
Code in `apps/macos/`. Uses `Observation` framework (`@Observable`, `@Bindable`).

### Android
Gradle-based. Scripts: `pnpm android:assemble`, `pnpm android:install`, `pnpm android:run`, `pnpm android:test`.

---

## Documentation & Skills

### Docs (`docs/`) — Mintlify at docs.oni.ai
48 subdirectories: `channels/`, `cli/` (47 command docs), `tools/`, `providers/`, `platforms/`, `automation/`, `reference/`, `concepts/`, `nodes/`, `help/`, `security/`, `install/`, `zh-CN/` (generated), `ja-JP/` (generated).

### Architecture Docs (`oniDocs/`)
- `system.md` — 23-section complete architecture reference
- `uiStructure/` — Gateway connection protocol, chat interface, views/tabs, settings, state management, security/auth guides for building custom frontends

### Skills (`skills/`)
40+ bundled Markdown instruction files: `coding-agent`, `discord`, `healthcheck`, `himalaya` (email), `model-usage`, `nano-pdf`, `openhue`, `session-logs`, `spotify-player`, `peekaboo` (camera), and more.

---

## Key Design Patterns

- **Dependency injection**: `createDefaultDeps()` and `GatewayRequestContext` passed to all handlers
- **Lazy loading**: CLI commands, plugins, models all load on-demand for fast startup
- **Append-only JSONL**: Session transcripts with parent chain (DAG) structure via SessionManager
- **Exponential backoff**: Channel restarts (5s→5min), SSE reconnect, auth cooldowns
- **State versioning**: Presence/health versions for client sync; broadcasts include version
- **Composable policies**: Tool allow/deny as layered glob pattern filters
- **Hook system**: User/plugin code at lifecycle events (before-agent-start, before-tool-call, etc.)
- **Stream processing**: Delta accumulation with boundary detection (thinking tags, tool calls, partial replies)
- **Rate limiting**: Per-IP brute force (auth), hook auth, control-plane writes (per client/actor)
- **Graceful shutdown**: Hook runners for cleanup, close handlers for all subsystems, timeout management

---

## Project Structure & Module Organization

- Source code: `src/` (CLI wiring in `src/cli`, commands in `src/commands`, web provider in `src/provider-web.ts`, infra in `src/infra`, media pipeline in `src/media`).
- Tests: colocated `*.test.ts`.
- Docs: `docs/` (images, queue, Pi config). Built output lives in `dist/`.
- Plugins/extensions: live under `extensions/*` (workspace packages). Keep plugin-only deps in the extension `package.json`; do not add them to the root `package.json` unless core uses them.
- Plugins: install runs `npm install --omit=dev` in plugin dir; runtime deps must live in `dependencies`. Avoid `workspace:*` in `dependencies` (npm install breaks); put `oni` in `devDependencies` or `peerDependencies` instead (runtime resolves `oni/plugin-sdk` via jiti alias).
- Installers served from `https://oni.ai/*`: live in the sibling repo `../oni.ai` (`public/install.sh`, `public/install-cli.sh`, `public/install.ps1`).
- Messaging channels: always consider **all** built-in + extension channels when refactoring shared logic (routing, allowlists, pairing, command gating, onboarding, docs).
  - Core channel docs: `docs/channels/`
  - Core channel code: `src/telegram`, `src/discord`, `src/slack`, `src/signal`, `src/imessage`, `src/web` (WhatsApp web), `src/channels`, `src/routing`
  - Extensions (channel plugins): `extensions/*` (e.g. `extensions/msteams`, `extensions/matrix`, `extensions/zalo`, `extensions/zalouser`, `extensions/voice-call`)
- When adding channels/extensions/apps/docs, update `.github/labeler.yml` and create matching GitHub labels (use existing channel/extension label colors).

---

## Build System

- **Bundler**: tsdown (multi-entry). Entries: `src/entry.ts`, `src/cli/daemon-cli.ts`, `src/plugin-sdk/index.ts`, `src/plugin-sdk/account-id.ts`, `src/extensionAPI.ts`, bundled hook handlers.
- **TypeScript**: `tsconfig.json` — target es2023, module NodeNext, strict mode, declaration files. Path alias: `oni/plugin-sdk` → `src/plugin-sdk/index.ts`.
- **Type-checker**: `pnpm tsgo` uses `@typescript/native-preview` (Go-based, faster than tsc).
- **Linting**: Oxlint with type-aware rules (unicorn, typescript, oxc plugins). Config: `.oxlintrc.json`.
- **Formatting**: Oxfmt. Config: `.oxfmtrc.jsonc`. Swift: swiftformat + swiftlint.
- **Container**: `Dockerfile` — node:22-bookworm base, Bun for builds, optional Playwright browser install, non-root `node` user, entrypoint: `oni gateway run --allow-unconfigured`.

### Key Scripts (`scripts/`)
- `committer` — Staged commit wrapper (respects .gitignore)
- `bundle-a2ui.sh` — A2UI canvas asset bundling
- `package-mac-app.sh` — macOS app packaging
- `codesign-mac-app.sh` / `create-dmg.sh` — macOS signing and DMG
- `release-check.ts` — Pre-release validation
- `test-parallel.mjs` — Parallel test runner
- `clawlog.sh` — macOS unified log querying
- `run-node.mjs` / `watch-node.mjs` — Dev runners
- `protocol-gen.ts` / `protocol-gen-swift.ts` — Protocol schema generation
- `http/` — REST client examples for API testing

---

## Docs Linking (Mintlify)

- Docs are hosted on Mintlify (docs.oni.ai).
- Internal doc links in `docs/**/*.md`: root-relative, no `.md`/`.mdx` (example: `[Config](/configuration)`).
- When working with documentation, read the mintlify skill.
- Section cross-references: use anchors on root-relative paths (example: `[Hooks](/configuration#hooks)`).
- Doc headings and anchors: avoid em dashes and apostrophes in headings because they break Mintlify anchor links.
- When Peter asks for links, reply with full `https://docs.oni.ai/...` URLs (not root-relative).
- When you touch docs, end the reply with the `https://docs.oni.ai/...` URLs you referenced.
- README (GitHub): keep absolute docs URLs (`https://docs.oni.ai/...`) so links work on GitHub.
- Docs content must be generic: no personal device names/hostnames/paths; use placeholders like `user@gateway-host` and "gateway host".

## Docs i18n (zh-CN)

- `docs/zh-CN/**` is generated; do not edit unless the user explicitly asks.
- Pipeline: update English docs → adjust glossary (`docs/.i18n/glossary.zh-CN.json`) → run `scripts/docs-i18n` → apply targeted fixes only if instructed.
- Translation memory: `docs/.i18n/zh-CN.tm.jsonl` (generated).
- See `docs/.i18n/README.md`.
- The pipeline can be slow/inefficient; if it's dragging, ping @jospalmbier on Discord instead of hacking around it.

## exe.dev VM ops (general)

- Access: stable path is `ssh exe.dev` then `ssh vm-name` (assume SSH key already set).
- SSH flaky: use exe.dev web terminal or Shelley (web agent); keep a tmux session for long ops.
- Update: `sudo npm i -g oni@latest` (global install needs root on `/usr/lib/node_modules`).
- Config: use `oni config set ...`; ensure `gateway.mode=local` is set.
- Discord: store raw token only (no `DISCORD_BOT_TOKEN=` prefix).
- Restart: stop old gateway and run:
  `pkill -9 -f oni-gateway || true; nohup oni gateway run --bind loopback --port 19100 --force > /tmp/oni-gateway.log 2>&1 &`
- Verify: `oni channels status --probe`, `ss -ltnp | rg 19100`, `tail -n 120 /tmp/oni-gateway.log`.

## Build, Test, and Development Commands

- Runtime baseline: Node **22+** (keep Node + Bun paths working).
- Install deps: `pnpm install`
- If deps are missing (for example `node_modules` missing, `vitest not found`, or `command not found`), run the repo's package-manager install command (prefer lockfile/README-defined PM), then rerun the exact requested command once. Apply this to test/build/lint/typecheck/dev commands; if retry still fails, report the command and first actionable error.
- Pre-commit hooks: `prek install` (runs same checks as CI)
- Also supported: `bun install` (keep `pnpm-lock.yaml` + Bun patching in sync when touching deps/patches).
- Prefer Bun for TypeScript execution (scripts, dev, tests): `bun <file.ts>` / `bunx <tool>`.
- Run CLI in dev: `pnpm oni ...` (bun) or `pnpm dev`.
- Node remains supported for running built output (`dist/*`) and production installs.
- Mac packaging (dev): `scripts/package-mac-app.sh` defaults to current arch. Release checklist: `docs/platforms/mac/release.md`.
- Type-check/build: `pnpm build`
- TypeScript checks: `pnpm tsgo` (uses `@typescript/native-preview`, the Go-based TypeScript type-checker — faster than `tsc`)
- Lint/format: `pnpm check`
- Format check: `pnpm format` (oxfmt --check)
- Format fix: `pnpm format:fix` (oxfmt --write)
- Tests: `pnpm test` (vitest); coverage: `pnpm test:coverage`
- Run a single test file: `vitest run path/to/file.test.ts`
- Run a single test by name: `vitest run -t "test name pattern"`
- Vitest configs: `vitest.unit.config.ts` (unit, used by `pnpm test:fast`), `vitest.e2e.config.ts` (e2e), `vitest.gateway.config.ts` (gateway integration), `vitest.extensions.config.ts` (extension tests), `vitest.live.config.ts` (live/real-key tests), `vitest.config.ts` (default/all)
- Gateway dev mode: `pnpm gateway:dev` (skips channels) or `pnpm gateway:watch` (file watcher)
- TUI: `pnpm tui` or `pnpm tui:dev`
- iOS: `pnpm ios:build`, `pnpm ios:run`, `pnpm ios:open` (Xcode)
- Android: `pnpm android:assemble`, `pnpm android:install`, `pnpm android:run`
- macOS app: `pnpm mac:package`, `pnpm mac:restart`
- Protocol schema: `pnpm protocol:check` (generate + verify no diff)
- Dead code analysis: `pnpm deadcode:knip`, `pnpm deadcode:ts-prune`, `pnpm deadcode:ts-unused`

## Coding Style & Naming Conventions

- Language: TypeScript (ESM). Prefer strict typing; avoid `any`.
- Formatting/linting via Oxlint and Oxfmt; run `pnpm check` before commits.
- Never add `@ts-nocheck` and do not disable `no-explicit-any`; fix root causes and update Oxlint/Oxfmt config only when required.
- Never share class behavior via prototype mutation (`applyPrototypeMixins`, `Object.defineProperty` on `.prototype`, or exporting `Class.prototype` for merges). Use explicit inheritance/composition (`A extends B extends C`) or helper composition so TypeScript can typecheck.
- If this pattern is needed, stop and get explicit approval before shipping; default behavior is to split/refactor into an explicit class hierarchy and keep members strongly typed.
- In tests, prefer per-instance stubs over prototype mutation (`SomeClass.prototype.method = ...`) unless a test explicitly documents why prototype-level patching is required.
- Add brief code comments for tricky or non-obvious logic.
- Keep files concise; extract helpers instead of "V2" copies. Use existing patterns for CLI options and dependency injection via `createDefaultDeps`.
- Aim to keep files under ~500 LOC; guideline only (not a hard guardrail). Split/refactor when it improves clarity or testability.
- Naming: use **OniAI** for product/app/docs headings; use `oni` for CLI command, package/binary, paths, and config keys.

## Release Channels (Naming)

- stable: tagged releases only (e.g. `vYYYY.M.D`), npm dist-tag `latest`.
- beta: prerelease tags `vYYYY.M.D-beta.N`, npm dist-tag `beta` (may ship without macOS app).
- beta naming: prefer `-beta.N`; do not mint new `-1/-2` betas. Legacy `vYYYY.M.D-<patch>` and `vYYYY.M.D.beta.N` remain recognized.
- dev: moving head on `main` (no tag; git checkout main).

## Testing Guidelines

- Framework: Vitest with V8 coverage thresholds (70% lines/branches/functions/statements).
- Naming: match source names with `*.test.ts`; e2e in `*.e2e.test.ts`.
- Run `pnpm test` (or `pnpm test:coverage`) before pushing when you touch logic.
- Do not set test workers above 16; tried already.
- If local Vitest runs cause memory pressure (common on non-Mac-Studio hosts), use `ONI_TEST_PROFILE=low ONI_TEST_SERIAL_GATEWAY=1 pnpm test` for land/gate runs.
- Live tests (real keys): `CLAWDBOT_LIVE_TEST=1 pnpm test:live` (OniAI-only) or `LIVE=1 pnpm test:live` (includes provider live tests). Docker: `pnpm test:docker:live-models`, `pnpm test:docker:live-gateway`. Onboarding Docker E2E: `pnpm test:docker:onboard`.
- Full kit + what's covered: `docs/testing.md`.
- Changelog: user-facing changes only; no internal/meta notes (version alignment, appcast reminders, release process).
- Pure test additions/fixes generally do **not** need a changelog entry unless they alter user-facing behavior or the user asks for one.
- Mobile: before using a simulator, check for connected real devices (iOS + Android) and prefer them when available.

## Commit & Pull Request Guidelines

**Full maintainer PR workflow (optional):** If you want the repo's end-to-end maintainer workflow (triage order, quality bar, rebase rules, commit/changelog conventions, co-contributor policy, and the `review-pr` > `prepare-pr` > `merge-pr` pipeline), see `.agents/skills/PR_WORKFLOW.md`. Maintainers may use other workflows; when a maintainer specifies a workflow, follow that. If no workflow is specified, default to PR_WORKFLOW.

- Create commits with `scripts/committer "<msg>" <file...>`; avoid manual `git add`/`git commit` so staging stays scoped.
- Follow concise, action-oriented commit messages (e.g., `CLI: add verbose flag to send`).
- Group related changes; avoid bundling unrelated refactors.
- PR submission template (canonical): `.github/pull_request_template.md`
- Issue submission templates (canonical): `.github/ISSUE_TEMPLATE/`

## Shorthand Commands

- `sync`: if working tree is dirty, commit all changes (pick a sensible Conventional Commit message), then `git pull --rebase`; if rebase conflicts and cannot resolve, stop; otherwise `git push`.

## Git Notes

- If `git branch -d/-D <branch>` is policy-blocked, delete the local ref directly: `git update-ref -d refs/heads/<branch>`.
- Bulk PR close/reopen safety: if a close action would affect more than 5 PRs, first ask for explicit user confirmation with the exact PR count and target scope/query.

## GitHub Search (`gh`)

- Prefer targeted keyword search before proposing new work or duplicating fixes.
- Use `--repo oni/oni` + `--match title,body` first; add `--match comments` when triaging follow-up threads.
- PRs: `gh search prs --repo oni/oni --match title,body --limit 50 -- "auto-update"`
- Issues: `gh search issues --repo oni/oni --match title,body --limit 50 -- "auto-update"`
- Structured output example:
  `gh search issues --repo oni/oni --match title,body --limit 50 --json number,title,state,url,updatedAt -- "auto update" --jq '.[] | "\(.number) | \(.state) | \(.title) | \(.url)"'`

## Security & Configuration Tips

- Web provider stores creds at `~/.oni/credentials/`; rerun `oni login` if logged out.
- Pi sessions live under `~/.oni/sessions/` by default; the base directory is not configurable.
- Environment variables: see `~/.profile`.
- Never commit or publish real phone numbers, videos, or live configuration values. Use obviously fake placeholders in docs, tests, and examples.
- Release flow: always read `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md` before any release work; do not ask routine questions once those docs answer them.

## Security Model

- **Personal assistant trust model** — one trusted operator per gateway, not multi-tenant
- **DM pairing** by default (unknown senders must be approved)
- **Mention gating** for group chats
- **Tool profiles** and exec approval workflows
- **`supervised` exec mode** — auto-approve reads, prompt for mutations
- **Comprehensive audit** (`oni security audit`) — filesystem perms, config secrets, plugin safety, sandbox validation, model hygiene
- **SSRF protection** — private IP blocking, fetch guards (`src/infra/net/ssrf.ts`, `src/infra/net/fetch-guard.ts`)
- **Trust journal** — `~/.oni/trust-journal.jsonl`
- **Safe binary policy** — whitelist/blacklist enforcement for exec tools

## GHSA (Repo Advisory) Patch/Publish

- Before reviewing security advisories, read `SECURITY.md`.
- Fetch: `gh api /repos/oni/oni/security-advisories/<GHSA>`
- Latest npm: `npm view oni version --userconfig "$(mktemp)"`
- Private fork PRs must be closed:
  `fork=$(gh api /repos/oni/oni/security-advisories/<GHSA> | jq -r .private_fork.full_name)`
  `gh pr list -R "$fork" --state open` (must be empty)
- Description newline footgun: write Markdown via heredoc to `/tmp/ghsa.desc.md` (no `"\\n"` strings)
- Build patch JSON via jq: `jq -n --rawfile desc /tmp/ghsa.desc.md '{summary,severity,description:$desc,vulnerabilities:[...]}' > /tmp/ghsa.patch.json`
- GHSA API footgun: cannot set `severity` and `cvss_vector_string` in the same PATCH; do separate calls.
- Patch + publish: `gh api -X PATCH /repos/oni/oni/security-advisories/<GHSA> --input /tmp/ghsa.patch.json` (publish = include `"state":"published"`; no `/publish` endpoint)
- If publish fails (HTTP 422): missing `severity`/`description`/`vulnerabilities[]`, or private fork has open PRs
- Verify: re-fetch; ensure `state=published`, `published_at` set; `jq -r .description | rg '\\\\n'` returns nothing

## Troubleshooting

- Rebrand/migration issues or legacy config/service warnings: run `oni doctor` (see `docs/gateway/doctor.md`).

## Agent-Specific Notes

- Vocabulary: "makeup" = "mac app".
- Never edit `node_modules` (global/Homebrew/npm/git installs too). Updates overwrite. Skill notes go in `tools.md` or `AGENTS.md`.
- When adding a new `AGENTS.md` anywhere in the repo, also add a `CLAUDE.md` symlink pointing to it (example: `ln -s AGENTS.md CLAUDE.md`).
- Signal: "update fly" => `fly ssh console -a flawd-bot -C "bash -lc 'cd /data/clawd/oni && git pull --rebase origin main'"` then `fly machines restart e825232f34d058 -a flawd-bot`.
- When working on a GitHub Issue or PR, print the full URL at the end of the task.
- When answering questions, respond with high-confidence answers only: verify in code; do not guess.
- Never update the Carbon dependency.
- Any dependency with `pnpm.patchedDependencies` must use an exact version (no `^`/`~`).
- Patching dependencies (pnpm patches, overrides, or vendored changes) requires explicit approval; do not do this by default.
- CLI progress: use `src/cli/progress.ts` (`osc-progress` + `@clack/prompts` spinner); don't hand-roll spinners/bars.
- Status output: keep tables + ANSI-safe wrapping (`src/terminal/table.ts`); `status --all` = read-only/pasteable, `status --deep` = probes.
- Gateway currently runs only as the menubar app; there is no separate LaunchAgent/helper label installed. Restart via the OniAI Mac app or `scripts/restart-mac.sh`; to verify/kill use `launchctl print gui/$UID | grep oni` rather than assuming a fixed label. **When debugging on macOS, start/stop the gateway via the app, not ad-hoc tmux sessions; kill any temporary tunnels before handoff.**
- macOS logs: use `./scripts/clawlog.sh` to query unified logs for the OniAI subsystem; it supports follow/tail/category filters and expects passwordless sudo for `/usr/bin/log`.
- If shared guardrails are available locally, review them; otherwise follow this repo's guidance.
- SwiftUI state management (iOS/macOS): prefer the `Observation` framework (`@Observable`, `@Bindable`) over `ObservableObject`/`@StateObject`; don't introduce new `ObservableObject` unless required for compatibility, and migrate existing usages when touching related code.
- Connection providers: when adding a new connection, update every UI surface and docs (macOS app, web UI, mobile if applicable, onboarding/overview docs) and add matching status + configuration forms so provider lists and settings stay in sync.
- Version locations: `package.json` (CLI), `apps/android/app/build.gradle.kts` (versionName/versionCode), `apps/ios/Sources/Info.plist` + `apps/ios/Tests/Info.plist` (CFBundleShortVersionString/CFBundleVersion), `apps/macos/Sources/OniAI/Resources/Info.plist` (CFBundleShortVersionString/CFBundleVersion), `docs/install/updating.md` (pinned npm version), `docs/platforms/mac/release.md` (APP_VERSION/APP_BUILD examples), Peekaboo Xcode projects/Info.plists (MARKETING_VERSION/CURRENT_PROJECT_VERSION).
- "Bump version everywhere" means all version locations above **except** `appcast.xml` (only touch appcast when cutting a new macOS Sparkle release).
- **Restart apps:** "restart iOS/Android apps" means rebuild (recompile/install) and relaunch, not just kill/launch.
- **Device checks:** before testing, verify connected real devices (iOS/Android) before reaching for simulators/emulators.
- iOS Team ID lookup: `security find-identity -p codesigning -v` → use Apple Development (…) TEAMID. Fallback: `defaults read com.apple.dt.Xcode IDEProvisioningTeamIdentifiers`.
- A2UI bundle hash: `src/canvas-host/a2ui/.bundle.hash` is auto-generated; ignore unexpected changes, and only regenerate via `pnpm canvas:a2ui:bundle` (or `scripts/bundle-a2ui.sh`) when needed. Commit the hash as a separate commit.
- Release signing/notary keys are managed outside the repo; follow internal release docs.
- Notary auth env vars (`APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_API_KEY_P8`) are expected in your environment (per internal release docs).
- **Multi-agent safety:** do **not** create/apply/drop `git stash` entries unless explicitly requested (this includes `git pull --rebase --autostash`). Assume other agents may be working; keep unrelated WIP untouched and avoid cross-cutting state changes.
- **Multi-agent safety:** when the user says "push", you may `git pull --rebase` to integrate latest changes (never discard other agents' work). When the user says "commit", scope to your changes only. When the user says "commit all", commit everything in grouped chunks.
- **Multi-agent safety:** do **not** create/remove/modify `git worktree` checkouts (or edit `.worktrees/*`) unless explicitly requested.
- **Multi-agent safety:** do **not** switch branches / check out a different branch unless explicitly requested.
- **Multi-agent safety:** running multiple agents is OK as long as each agent has its own session.
- **Multi-agent safety:** when you see unrecognized files, keep going; focus on your changes and commit only those.
- Lint/format churn:
  - If staged+unstaged diffs are formatting-only, auto-resolve without asking.
  - If commit/push already requested, auto-stage and include formatting-only follow-ups in the same commit (or a tiny follow-up commit if needed), no extra confirmation.
  - Only ask when changes are semantic (logic/data/behavior).
- Lobster seam: use the shared CLI palette in `src/terminal/palette.ts` (no hardcoded colors); apply palette to onboarding/config prompts and other TTY UI output as needed.
- **Multi-agent safety:** focus reports on your edits; avoid guard-rail disclaimers unless truly blocked; when multiple agents touch the same file, continue if safe; end with a brief "other files present" note only if relevant.
- Bug investigations: read source code of relevant npm dependencies and all related local code before concluding; aim for high-confidence root cause.
- Code style: add brief comments for tricky logic; keep files under ~500 LOC when feasible (split/refactor as needed).
- Tool schema guardrails (google-antigravity): avoid `Type.Union` in tool input schemas; no `anyOf`/`oneOf`/`allOf`. Use `stringEnum`/`optionalStringEnum` (Type.Unsafe enum) for string lists, and `Type.Optional(...)` instead of `... | null`. Keep top-level tool schema as `type: "object"` with `properties`.
- Tool schema guardrails: avoid raw `format` property names in tool schemas; some validators treat `format` as a reserved keyword and reject the schema.
- When asked to open a "session" file, open the Pi session logs under `~/.oni/agents/<agentId>/sessions/*.jsonl` (use the `agent=<id>` value in the Runtime line of the system prompt; newest unless a specific ID is given), not the default `sessions.json`. If logs are needed from another machine, SSH via Tailscale and read the same path there.
- Do not rebuild the macOS app over SSH; rebuilds must be run directly on the Mac.
- Never send streaming/partial replies to external messaging surfaces (WhatsApp, Telegram); only final replies should be delivered there. Streaming/tool events may still go to internal UIs/control channel.
- Voice wake forwarding tips:
  - Command template should stay `oni-mac agent --message "${text}" --thinking low`; `VoiceWakeForwarder` already shell-escapes `${text}`. Don't add extra quotes.
  - launchd PATH is minimal; ensure the app's launch agent PATH includes standard system paths plus your pnpm bin (typically `$HOME/Library/pnpm`) so `pnpm`/`oni` binaries resolve when invoked via `oni-mac`.
- For manual `oni message send` messages that include `!`, use the heredoc pattern noted below to avoid the Bash tool's escaping.
- Release guardrails: do not change version numbers without operator's explicit consent; always ask permission before running any npm publish/release step.
- Beta release guardrail: when using a beta Git tag (for example `vYYYY.M.D-beta.N`), publish npm with a matching beta version suffix (for example `YYYY.M.D-beta.N`) rather than a plain version on `--tag beta`; otherwise the plain version name gets consumed/blocked.

## NPM + 1Password (publish/verify)

- Use the 1password skill; all `op` commands must run inside a fresh tmux session.
- Sign in: `eval "$(op signin --account my.1password.com)"` (app unlocked + integration on).
- OTP: `op read 'op://Private/Npmjs/one-time password?attribute=otp'`.
- Publish: `npm publish --access public --otp="<otp>"` (run from the package dir).
- Verify without local npmrc side effects: `npm view <pkg> version --userconfig "$(mktemp)"`.
- Kill the tmux session after publish.

## Plugin Release Fast Path (no core `oni` publish)

- Release only already-on-npm plugins. Source list is in `docs/reference/RELEASING.md` under "Current npm plugin list".
- Run all CLI `op` calls and `npm publish` inside tmux to avoid hangs/interruption:
  - `tmux new -d -s release-plugins-$(date +%Y%m%d-%H%M%S)`
  - `eval "$(op signin --account my.1password.com)"`
- 1Password helpers:
  - password used by `npm login`:
    `op item get Npmjs --format=json | jq -r '.fields[] | select(.id=="password").value'`
  - OTP:
    `op read 'op://Private/Npmjs/one-time password?attribute=otp'`
- Fast publish loop (local helper script in `/tmp` is fine; keep repo clean):
  - compare local plugin `version` to `npm view <name> version`
  - only run `npm publish --access public --otp="<otp>"` when versions differ
  - skip if package is missing on npm or version already matches.
- Keep `oni` untouched: never run publish from repo root unless explicitly requested.
- Post-check for each release:
  - per-plugin: `npm view @oni/<name> version --userconfig "$(mktemp)"` should be `2026.2.17`
  - core guard: `npm view oni version --userconfig "$(mktemp)"` should stay at previous version unless explicitly requested.

## Changelog Release Notes

- When cutting a mac release with beta GitHub prerelease:
  - Tag `vYYYY.M.D-beta.N` from the release commit (example: `v2026.2.15-beta.1`).
  - Create prerelease with title `oni YYYY.M.D-beta.N`.
  - Use release notes from `CHANGELOG.md` version section (`Changes` + `Fixes`, no title duplicate).
  - Attach at least `OniAI-YYYY.M.D.zip` and `OniAI-YYYY.M.D.dSYM.zip`; include `.dmg` if available.

- Keep top version entries in `CHANGELOG.md` sorted by impact:
  - `### Changes` first.
  - `### Fixes` deduped and ranked with user-facing fixes first.
- Before tagging/publishing, run:
  - `node --import tsx scripts/release-check.ts`
  - `pnpm release:check`
  - `pnpm test:install:smoke` or `ONI_INSTALL_SMOKE_SKIP_NONROOT=1 pnpm test:install:smoke` for non-root smoke path.
