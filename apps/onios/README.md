# 🦊 OniOS

> AI-powered desktop operating system built on the Oni gateway.

OniOS is a visual desktop OS that runs in the browser (and Electron), where the AI agent and the human share the **exact same interface**. Every widget exposes commands; the AI uses the same commands the human uses.

## Architecture

- **24 widgets** — Terminal, Browser, Code Editor, File Explorer, Notes, Tasks, Calendar, and more
- **79 AI skills** — Every widget action is an AI-callable skill registered with the Oni gateway
- **Command pallet** — Dot-notation commands that are chainable, observable, and source-tagged
- **Gateway bridge** — WebSocket connection to the Oni gateway for agent brain, memory, and cross-platform identity
- **Electron shell** — Native terminal (node-pty), filesystem access, system tray, notifications

## Quick Start

```bash
cd apps/onios
npm install
npm run dev          # Vite dev server (browser mode)
npm run dev:electron # Electron + Vite (desktop mode)
```

## Project Structure

```
apps/onios/
├── docs/plan.md              # Full architecture plan
├── electron/main.ts          # Electron main process
├── src/
│   ├── main.tsx              # React entry
│   ├── App.tsx               # Root + command registration
│   ├── core/                 # CommandRegistry, WidgetRegistry, EventBus
│   ├── bridge/               # OniGatewayBridge (WebSocket to gateway)
│   ├── shell/                # Desktop, Taskbar, Window Manager
│   ├── widgets/              # 24 widget components (Phase 2)
│   ├── stores/               # Zustand state management
│   └── styles/               # CSS theming
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Documentation

- **[Architecture Plan](docs/plan.md)** — Full architecture, widget specs, command pallets, API design
- **[Vision](../core/VISION.md)** — The OniOS vision document

## Status

**Phase 1: Foundation** — Scaffold complete. Core engine (CommandRegistry, WidgetRegistry, EventBus, Gateway Bridge) implemented. Desktop shell with taskbar ready.

Next: Install dependencies, port widgets from sample app, deep gateway integration.
