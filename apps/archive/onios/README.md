# 🦊 OniOS

> AI-powered desktop operating system built on the Oni gateway.

OniOS is a visual desktop OS that runs in the browser, where the AI agent and the human share the **exact same interface**. Every widget exposes commands; the AI uses the same commands the human uses. The Oni gateway is the brain — OniOS is the body.

## Quick Start

```bash
cd apps/onios
npm install
npm run dev     # Start at http://localhost:5173
```

## macOS Service (auto-start on login)

```bash
./macos/install-service.sh    # Install launchd agent
./macos/uninstall-service.sh  # Remove launchd agent
```

## Architecture

- **24 widgets** — Terminal, Browser, Code Editor, File Explorer, Notes, Tasks, Calendar, Weather, Calculator, WebSearch, Maps, MediaPlayer, Camera, PasswordManager, WorkflowBuilder, Storage, ActivityLog, AgentViewer, OniChat, Settings, Clock, Docs, FileViewer, DocumentViewer
- **60+ AI skills** — Every widget action is an AI-callable skill
- **Command pallet** — Dot-notation commands, chainable with pipes, source-tagged
- **Oni Gateway bridge** — WebSocket client + REST API bridge to Oni gateway
- **macOS native services** — Native notifications, Spotlight indexing, clipboard, TTS, screenshot, system info, battery, network, running apps

## Key Endpoints

| Endpoint                 | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| `/api/oni/status`        | Gateway connection status                                   |
| `/api/oni/chat`          | Send message to agent via gateway                           |
| `/api/oni/actions/*`     | OniOS action API (task, window, note, terminal, file, etc.) |
| `/api/macos/system`      | macOS system info (battery, disk, CPU, chip)                |
| `/api/macos/notify`      | Native macOS notifications                                  |
| `/api/macos/clipboard/*` | Clipboard read/write                                        |
| `/api/macos/say`         | Text-to-speech                                              |
| `/api/macos/screenshot`  | Take screenshot                                             |

## Project Structure

```
apps/onios/
├── docs/plan.md               # Full architecture plan
├── macos/                     # macOS native service files
│   ├── ai.oni.onios.plist     # launchd user agent
│   ├── install-service.sh     # Install as macOS service
│   ├── uninstall-service.sh   # Remove macOS service
│   └── notify.sh              # Native notification helper
├── plugins/
│   ├── oniPlugin.js           # Oni gateway integration (chat, actions, skills)
│   ├── macosPlugin.js         # macOS native APIs (notify, clipboard, TTS, etc.)
│   ├── filesystemPlugin.js    # File system REST API
│   ├── terminalPlugin.js      # Terminal WebSocket (node-pty)
│   ├── aiMemoryPlugin.js      # AI memory + conversation persistence
│   └── ...                    # scheduler, docs, storage, MCP proxy
├── src/
│   ├── main.jsx               # React entry
│   ├── App.jsx                # Root + command registration (2900+ lines)
│   ├── core/                  # CommandRegistry, WidgetRegistry, EventBus, SkillsRegistry
│   ├── bridge/                # OniGatewayBridge (WebSocket to gateway)
│   ├── widgets/               # 24 widget components
│   ├── stores/                # Zustand state management
│   ├── components/            # Desktop shell, Taskbar, Window Manager
│   └── ai/                    # AI workspace files (SOUL.md, etc.)
├── package.json
└── vite.config.js
```

## Documentation

- **[Architecture Plan](docs/plan.md)** — Full architecture, widget specs, command pallets, API design
- **[Vision](../core/VISION.md)** — The OniOS vision document
