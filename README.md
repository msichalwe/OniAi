# OniAI — Self-Hosted Multi-Channel AI Gateway

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node-%3E%3D22-green?style=for-the-badge" alt="Node >= 22">
  <img src="https://img.shields.io/badge/TypeScript-ESM-blue?style=for-the-badge" alt="TypeScript ESM">
</p>

**OniAI** is a self-hosted, multi-channel AI agent gateway. It connects messaging platforms to an embedded AI coding agent — all through a single WebSocket control plane.

Run it on your own hardware. Own your data. Connect your channels. Build your assistant.

---

## Features

- **Multi-channel** — WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Microsoft Teams, Google Chat, Matrix, and more
- **Single gateway** — one process manages all channels, sessions, tools, and routing
- **Agent-native** — built-in tool calling (exec, browser, files, web search), session management, and memory
- **Multi-agent** — route different channels/contacts to different agent personas
- **Plugin system** — extend with new channels, tools, and commands via TypeScript plugins
- **Sandboxing** — optional Docker isolation for tool execution
- **Skills** — Markdown-based instruction files that teach the agent how to use tools
- **Node support** — pair macOS/iOS/Android devices for camera, canvas, and remote execution
- **Cron & automation** — scheduled agent jobs and webhook triggers
- **CLI-first** — full-featured terminal interface with rich theming

## Quick Start

**Requirements:** Node >= 22

```bash
# Install globally
npm install -g oni@latest

# Run the guided setup wizard
oni onboard

# Or start the gateway directly
oni gateway run --port 19100
```

## From Source

```bash
git clone https://github.com/msichalwe/OniAi_zm.git
cd OniAi_zm

pnpm install
pnpm build

# Run in dev mode
pnpm oni onboard
```

## Architecture

```
Messaging Apps (WhatsApp/Telegram/Discord/Slack/Signal/...)
                 │
                 ▼
         ┌───────────────┐
         │    Gateway     │  ← WebSocket control plane (port 19100)
         │   (oni.mjs)   │
         └───────┬───────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
  Agent      Channels      Tools
  Runtime    Connectors    Engine
    │            │            │
  Sessions   WhatsApp     exec, browser,
  Memory     Telegram     read, write,
  Routing    Discord...   cron, message...
```

## Key Commands

```bash
oni onboard              # Guided setup wizard
oni gateway run          # Start the gateway
oni status               # Check gateway status
oni channels status      # Check channel connections
oni doctor               # Diagnose issues
oni config set <key> <v> # Update configuration
oni security audit       # Security check
oni pairing list <ch>    # List pending DM pairings
```

## Configuration

Config file: `~/.oni/oni.json` (JSON5 format)

```json5
{
  gateway: {
    mode: "local",
    bind: "loopback",
    port: 19100,
  },
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-sonnet-4-20250514" },
    },
  },
  channels: {
    whatsapp: { dmPolicy: "pairing" },
    telegram: { dmPolicy: "pairing" },
  },
  tools: { profile: "coding" },
}
```

## Project Structure

```
├── src/                    # Core source (TypeScript ESM)
│   ├── gateway/            # WebSocket server + protocol
│   ├── agents/             # Agent runtime + tools
│   ├── routing/            # Message routing + sessions
│   ├── channels/           # Shared channel logic
│   ├── cli/                # CLI commands
│   └── config/             # Configuration system
├── extensions/             # 30+ plugin packages
├── skills/                 # Bundled agent skills
├── scripts/                # Build + utility scripts
├── oniDocs/                # Architecture documentation
│   ├── system.md           # Complete system reference
│   └── uiStructure/        # UI architecture (for custom frontends)
├── oni.mjs                 # CLI entry point
├── package.json            # name: "oni", bin: "oni"
└── Dockerfile              # Container build
```

## Documentation

- **[oniDocs/system.md](oniDocs/system.md)** — Complete architecture reference (23 sections)
- **[oniDocs/uiStructure/](oniDocs/uiStructure/)** — Build your own UI (gateway connection, protocol, chat, views, settings, auth)

## Security

OniAI uses a **personal assistant trust model** — one trusted operator per gateway.

- DM pairing by default (unknown senders must be approved)
- Mention gating for group chats
- Tool profiles and exec approvals
- Optional Docker sandboxing
- Run `oni security audit` regularly

## Attribution

This project uses [OniAI](https://github.com/oni/oni) as its foundational base. OniAI is an independent project and is **not affiliated with, endorsed by, or associated with** the OniAI project or its maintainers in any way. OniAI is licensed under the MIT License.

## License

[MIT](LICENSE)
