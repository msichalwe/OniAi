# OniOS — Architecture & Implementation Plan

> **Version**: 0.1.0 (Draft)
> **Last Updated**: February 2026
> **Status**: Planning Phase

---

## Table of Contents

1. [Vision Recap](#vision-recap)
2. [Architecture Overview](#architecture-overview)
3. [Oni Gateway Integration](#oni-gateway-integration)
4. [Widget System](#widget-system)
5. [Command Pallet](#command-pallet)
6. [API Pallet](#api-pallet)
7. [Skill System](#skill-system)
8. [Electron Shell](#electron-shell)
9. [Implementation Phases](#implementation-phases)
10. [File Structure](#file-structure)

---

## 1. Vision Recap

OniOS is a **browser-based operating system** where the AI agent (powered by the Oni gateway) and the human share the **exact same interface**. Every widget exposes commands; the AI uses the same commands the human uses. The previous sample app proved the concept but was disconnected from the Oni gateway — it used raw OpenAI calls and a hacky HTTP bridge. This rewrite deeply integrates OniOS as a **first-class Oni app** that treats the gateway as its kernel-level brain.

### Key Principle

```
Human clicks "Open Terminal"  →  commandRegistry.execute('terminal.open')  →  Terminal widget opens
AI decides to run a command   →  commandRegistry.execute('terminal.exec')  →  Same Terminal widget opens
                                       ↕
                              Oni Gateway (WebSocket)
                              Agent brain, memory, routing
```

The Oni gateway IS the brain. OniOS is the body.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         ELECTRON SHELL                            │
│   Native menus · System tray · Notifications · Auto-update        │
│   node-pty (native terminal) · File system access                 │
├──────────────────────────────────────────────────────────────────┤
│                         RENDERER (React)                          │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    Desktop Shell                         │     │
│  │  Taskbar · Dock · Wallpaper · Window Manager             │     │
│  │  Command Palette (⌘K) · Notification Center              │     │
│  │  App Drawer · Context Menus · Multi-Desktop               │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    Widget Layer                           │     │
│  │  24 widgets, each with:                                   │     │
│  │    - React component (UI)                                 │     │
│  │    - Command pallet (registered commands)                 │     │
│  │    - API pallet (REST endpoints)                          │     │
│  │    - Context reporter (live state → AI)                   │     │
│  │    - Skill definitions (AI tool schemas)                  │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    Core Engine                            │     │
│  │  CommandRegistry · WidgetRegistry · EventBus              │     │
│  │  ContextEngine · SkillsRegistry · WorkflowEngine          │     │
│  │  AgentManager · CommandRunTracker                         │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    State Layer (Zustand)                   │     │
│  │  windowStore · commandStore · taskStore · themeStore       │     │
│  │  desktopStore · notificationStore · passwordStore         │     │
│  │  storageStore · workflowStore                             │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                    ONI GATEWAY BRIDGE                              │
│  WebSocket client → ws://127.0.0.1:19100                         │
│  Auth: gateway token from ~/.oni/oni.json                        │
│  Bidirectional: OniOS sends user messages, receives AI actions    │
│  Widget context sync: pushes live widget state to gateway         │
│  Command execution: gateway can execute any registered command    │
├──────────────────────────────────────────────────────────────────┤
│                    ONI GATEWAY (External)                          │
│  Agent brain · Memory · Session management · Channel routing      │
│  Skills · Workspace files (SOUL.md, IDENTITY.md, etc.)           │
│  Multi-channel: Telegram, Discord, WhatsApp + OniOS              │
└──────────────────────────────────────────────────────────────────┘
```

### Key Difference from Sample App

| Aspect | Sample (Old) | OniOS (New) |
|--------|-------------|-------------|
| **AI Brain** | Built-in OpenAI calls, local agent loop | Oni Gateway via WebSocket |
| **Identity** | Local SOUL.md files | Shared Oni workspace (cross-platform) |
| **Skills** | HTTP curl bridge (SKILL.md hack) | Native gateway RPC, registered commands |
| **Memory** | Local JSON files | Oni session management + memory system |
| **Channels** | OniOS only | Same agent on Telegram, Discord, AND OniOS |
| **Terminal** | Vite plugin (dev-only) | Electron node-pty (native, production-ready) |
| **Distribution** | `npm run dev` only | Electron app (macOS, Linux, Windows) |

---

## 3. Oni Gateway Integration

### Connection Layer (`src/bridge/OniGatewayBridge.ts`)

OniOS connects to the Oni gateway as a **channel client** — just like Telegram or Discord, but with richer capabilities.

```typescript
interface OniGatewayBridge {
  // Connection
  connect(url: string, token: string): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;

  // Messaging (user ↔ agent)
  sendMessage(content: string, metadata?: MessageMetadata): void;
  onAgentMessage(handler: (msg: AgentMessage) => void): void;

  // Command execution (gateway → OniOS)
  onCommandRequest(handler: (cmd: CommandRequest) => CommandResult): void;

  // Widget context (OniOS → gateway)
  pushWidgetContext(contexts: WidgetContext[]): void;

  // Skill registration (OniOS → gateway)
  registerSkills(skills: SkillDefinition[]): void;
}
```

### How It Works

1. **Startup**: OniOS reads `~/.oni/oni.json` for gateway URL + token, connects via WebSocket
2. **Registration**: OniOS registers itself as the `onios` channel and pushes its skill catalog
3. **User chat**: User types in Oni Chat widget → message sent to gateway → agent processes → response streamed back
4. **AI actions**: Agent decides to execute a command → gateway sends command request → OniOS executes via CommandRegistry → result sent back
5. **Context sync**: Every 5s (or on change), OniOS pushes live widget context to the gateway so the agent knows what's on screen

### Channel Registration

OniOS registers as an Oni channel plugin:

```typescript
// extensions/onios/index.ts (Oni gateway plugin)
export const meta: ChannelMeta = {
  id: "onios",
  label: "OniOS Desktop",
  blurb: "AI-powered desktop OS with 24 interactive widgets",
  emoji: "🖥️",
  selectionLabel: "OniOS",
  quickstartAllowFrom: true,
};
```

---

## 4. Widget System

### Widget Definition Standard

Every widget in OniOS follows this contract:

```typescript
interface WidgetDefinition {
  id: string;                           // e.g. "terminal"
  component: React.FC<WidgetProps>;     // React component
  title: string;                        // Window title
  icon: LucideIcon;                     // Taskbar/dock icon
  singleton: boolean;                   // One instance or many?
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  commands: CommandDefinition[];         // Commands this widget registers
  api: ApiEndpoint[];                   // REST endpoints this widget exposes
  skills: SkillDefinition[];            // AI tool schemas
  contextReporter?: () => WidgetContext; // Live state for AI awareness
}
```

### Complete Widget Catalog

#### 4.1 Terminal (`terminal`)

Real PTY shell with full ANSI support via node-pty + xterm.js.

| Command | Args | Description |
|---------|------|-------------|
| `terminal.open` | — | Open new terminal window |
| `terminal.exec` | `(command: string)` | Execute shell command |
| `terminal.sendInput` | `(input: string)` | Send raw input to active terminal |
| `terminal.sendCtrlC` | — | Send Ctrl+C to active terminal |
| `terminal.getCwd` | — | Get current working directory |
| `terminal.getHistory` | `(count?: number)` | Get recent command history |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/terminal/exec` | `{ command }` | `{ output, exitCode }` |
| POST | `/api/terminal/open` | — | `{ windowId, sessionId }` |
| GET | `/api/terminal/sessions` | — | `{ sessions[] }` |
| POST | `/api/terminal/input` | `{ sessionId, input }` | `{ ok }` |

**AI Context:**
```json
{ "widget": "terminal", "cwd": "/Users/me/project", "lastCommand": "npm test", "lastOutput": "5 passed", "isRunning": false }
```

**Skills:**
- `run_terminal_command` — Execute a shell command
- `open_terminal` — Open a new terminal window
- `send_terminal_input` — Send input to running process
- `get_terminal_output` — Read recent terminal output

---

#### 4.2 File Explorer (`file-explorer`)

Browse, navigate, open, rename, delete files on the real filesystem.

| Command | Args | Description |
|---------|------|-------------|
| `system.files.openExplorer` | `(path?: string)` | Open explorer at path |
| `system.files.list` | — | List root folders |
| `system.files.navigate` | `(path: string)` | Navigate to path |
| `system.files.openFile` | `(filePath: string)` | Open file in viewer |
| `system.files.createFile` | `(path, content?)` | Create a file |
| `system.files.createFolder` | `(path)` | Create a folder |
| `system.files.deleteFile` | `(path)` | Delete file/folder |
| `system.files.rename` | `(oldPath, newPath)` | Rename file/folder |
| `system.files.copy` | `(src, dest)` | Copy file |
| `system.files.move` | `(src, dest)` | Move file |
| `system.files.readFile` | `(path)` | Read file contents |
| `system.files.writeFile` | `(path, content)` | Write file contents |
| `system.files.search` | `(query, path?)` | Search files by name |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/files/list` | `?path=` | `{ entries[] }` |
| POST | `/api/files/read` | `{ path }` | `{ content, mime }` |
| POST | `/api/files/write` | `{ path, content }` | `{ ok }` |
| POST | `/api/files/create` | `{ path, type }` | `{ ok }` |
| POST | `/api/files/delete` | `{ path }` | `{ ok }` |
| POST | `/api/files/rename` | `{ old, new }` | `{ ok }` |
| POST | `/api/files/copy` | `{ src, dest }` | `{ ok }` |
| POST | `/api/files/move` | `{ src, dest }` | `{ ok }` |
| POST | `/api/files/search` | `{ query, path? }` | `{ results[] }` |

**AI Context:**
```json
{ "widget": "file-explorer", "currentPath": "/Users/me/Documents", "selectedFiles": ["report.pdf"], "fileCount": 42 }
```

---

#### 4.3 Browser (`browser`)

Embedded web browser with URL bar and navigation.

| Command | Args | Description |
|---------|------|-------------|
| `browser.open` | — | Open empty browser |
| `browser.openUrl` | `(url: string)` | Navigate to URL |
| `browser.searchGoogle` | `(query: string)` | Google search |
| `browser.back` | — | Go back |
| `browser.forward` | — | Go forward |
| `browser.refresh` | — | Refresh page |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/browser/open` | `{ url }` | `{ windowId }` |
| POST | `/api/browser/search` | `{ query }` | `{ windowId }` |

**AI Context:**
```json
{ "widget": "browser", "url": "https://github.com", "title": "GitHub", "loading": false }
```

---

#### 4.4 Code Editor (`code-editor`)

Monaco-based editor with syntax highlighting, multi-file support.

| Command | Args | Description |
|---------|------|-------------|
| `code.open` | `(projectPath?: string)` | Open editor |
| `code.openProject` | `(path: string)` | Open project folder |
| `code.openFile` | `(filePath: string)` | Open specific file |
| `code.saveFile` | `(filePath?: string)` | Save current file |
| `code.saveAll` | — | Save all open files |
| `code.getContent` | `(filePath: string)` | Get file content |
| `code.setContent` | `(filePath, content)` | Set file content |
| `code.getActiveFile` | — | Get active file path |
| `code.getOpenFiles` | — | List open files |
| `code.closeFile` | `(filePath: string)` | Close a file tab |
| `code.find` | `(query: string)` | Find in file |
| `code.replace` | `(find, replace)` | Find and replace |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/code/open` | `{ path }` | `{ windowId }` |
| POST | `/api/code/save` | `{ path, content }` | `{ ok }` |
| GET | `/api/code/content` | `?path=` | `{ content, language }` |
| GET | `/api/code/files` | — | `{ openFiles[] }` |

**AI Context:**
```json
{ "widget": "code-editor", "activeFile": "src/App.tsx", "language": "typescript", "openFiles": 3, "unsaved": true }
```

---

#### 4.5 Notes (`notes`)

Create, edit, and manage markdown notes persisted to disk.

| Command | Args | Description |
|---------|------|-------------|
| `document.open` | — | Open notes app |
| `document.create` | `(title?: string)` | Create new note |
| `document.list` | — | List all notes |
| `document.read` | `(path: string)` | Read a note |
| `document.update` | `(path, content)` | Update note content |
| `document.delete` | `(path: string)` | Delete a note |
| `document.search` | `(query: string)` | Search notes |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/notes/list` | — | `{ notes[] }` |
| POST | `/api/notes/create` | `{ title, content }` | `{ path }` |
| POST | `/api/notes/read` | `{ path }` | `{ content }` |
| POST | `/api/notes/update` | `{ path, content }` | `{ ok }` |
| POST | `/api/notes/delete` | `{ path }` | `{ ok }` |
| POST | `/api/notes/search` | `{ query }` | `{ results[] }` |

---

#### 4.6 Task Manager (`task-manager`)

Tasks with priorities, due dates, scheduling, and completion tracking.

| Command | Args | Description |
|---------|------|-------------|
| `task.add` | `(title, priority?, due?)` | Create a task |
| `task.list` | `(filter?)` | List tasks |
| `task.complete` | `(taskId)` | Mark task done |
| `task.delete` | `(taskId)` | Delete a task |
| `task.update` | `(taskId, updates)` | Update task fields |
| `schedule.add` | `(title, cron)` | Add scheduled task |
| `schedule.list` | — | List schedules |
| `schedule.delete` | `(scheduleId)` | Delete schedule |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/tasks/create` | `{ title, priority, dueDate }` | `{ task }` |
| GET | `/api/tasks/list` | `?filter=` | `{ tasks[] }` |
| POST | `/api/tasks/complete` | `{ id }` | `{ ok }` |
| POST | `/api/tasks/delete` | `{ id }` | `{ ok }` |

---

#### 4.7 Calendar (`calendar`)

Events and tasks in a calendar view.

| Command | Args | Description |
|---------|------|-------------|
| `calendar.open` | — | Open calendar |
| `event.add` | `(title, date, time?)` | Add event |
| `event.list` | `(startDate?, endDate?)` | List events |
| `event.delete` | `(eventId)` | Delete event |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/calendar/events` | `?start=&end=` | `{ events[] }` |
| POST | `/api/calendar/events` | `{ title, date, time }` | `{ event }` |
| DELETE | `/api/calendar/events/:id` | — | `{ ok }` |

---

#### 4.8 Weather (`weather`)

Live weather data via API.

| Command | Args | Description |
|---------|------|-------------|
| `widgets.weather.getCurrent` | `(city?)` | Current weather |
| `widgets.weather.getWeekly` | `(city?)` | Weekly forecast |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/weather/current` | `?city=` | `{ temp, condition, ... }` |
| GET | `/api/weather/forecast` | `?city=` | `{ days[] }` |

---

#### 4.9 Calculator (`calculator`)

Standard calculator with expression evaluation.

| Command | Args | Description |
|---------|------|-------------|
| `widgets.calculator.open` | — | Open calculator |
| `widgets.calculator.calculate` | `(expr: string)` | Evaluate expression |

---

#### 4.10 Web Search (`web-search`)

Brave Search integration.

| Command | Args | Description |
|---------|------|-------------|
| `web.search` | `(query: string)` | Search the web |
| `web.searchImages` | `(query: string)` | Image search |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/search/web` | `{ query }` | `{ results[] }` |
| POST | `/api/search/images` | `{ query }` | `{ images[] }` |

---

#### 4.11 Maps (`maps`)

Embedded map viewer.

| Command | Args | Description |
|---------|------|-------------|
| `maps.open` | — | Open maps |
| `maps.navigate` | `(lat, lng)` | Go to coordinates |
| `maps.search` | `(place: string)` | Search for a place |

---

#### 4.12 Media Player (`media-player`)

Play audio/video files.

| Command | Args | Description |
|---------|------|-------------|
| `system.media.playVideo` | `(src: string)` | Play video |
| `system.media.playAudio` | `(src: string)` | Play audio |
| `system.media.open` | — | Open empty player |
| `system.media.pause` | — | Pause playback |
| `system.media.resume` | — | Resume playback |

---

#### 4.13 Camera (`camera`)

WebRTC camera with capture.

| Command | Args | Description |
|---------|------|-------------|
| `camera.open` | — | Open camera |
| `camera.capture` | `(filename?)` | Take photo |
| `camera.listPhotos` | — | List captured photos |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/camera/capture` | — | `{ path, base64 }` |
| GET | `/api/camera/photos` | — | `{ photos[] }` |

---

#### 4.14 Password Manager (`password-manager`)

Encrypted password storage.

| Command | Args | Description |
|---------|------|-------------|
| `password.add` | `(site, username, pw)` | Add entry |
| `password.get` | `(site)` | Get password |
| `password.list` | — | List entries |
| `password.delete` | `(id)` | Delete entry |
| `password.generate` | `(length?)` | Generate password |
| `password.search` | `(query)` | Search entries |

---

#### 4.15 Workflow Builder (`workflow-builder`)

Visual node-based automation builder.

| Command | Args | Description |
|---------|------|-------------|
| `workflow.create` | `(name, description?)` | Create workflow |
| `workflow.run` | `(workflowId)` | Execute workflow |
| `workflow.list` | — | List workflows |
| `workflow.get` | `(workflowId)` | Get workflow details |
| `workflow.delete` | `(workflowId)` | Delete workflow |
| `workflow.addNode` | `(workflowId, node)` | Add node to workflow |
| `workflow.connect` | `(workflowId, from, to)` | Connect nodes |

---

#### 4.16 Storage Manager (`storage`)

Key-value data store with namespaces.

| Command | Args | Description |
|---------|------|-------------|
| `storage.open` | — | Open storage UI |
| `storage.set` | `(ns, key, value)` | Set value |
| `storage.get` | `(ns, key)` | Get value |
| `storage.delete` | `(ns, key)` | Delete key |
| `storage.list` | `(ns?)` | List keys |
| `storage.stats` | — | Storage statistics |
| `storage.export` | `(ns?)` | Export data |
| `storage.search` | `(query)` | Search values |

**API Pallet:**

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/storage/set` | `{ ns, key, value }` | `{ ok }` |
| POST | `/api/storage/get` | `{ ns, key }` | `{ value }` |
| POST | `/api/storage/delete` | `{ ns, key }` | `{ ok }` |
| GET | `/api/storage/list` | `?ns=` | `{ entries[] }` |
| POST | `/api/storage/search` | `{ query }` | `{ results[] }` |

---

#### 4.17 Activity Log (`activity-log`)

Real-time log of all system activity.

| Command | Args | Description |
|---------|------|-------------|
| `system.activity.open` | — | Open activity log |
| `system.activity.clear` | — | Clear log |
| `system.activity.search` | `(query)` | Search logs |

---

#### 4.18 Agent Viewer (`agent-viewer`)

Real-time view of sub-agent activity (one widget per agent).

| Command | Args | Description |
|---------|------|-------------|
| `agent.view` | `(agentId)` | View agent activity |
| `agent.spawn` | `(name, task)` | Spawn sub-agent |
| `agent.list` | — | List active agents |
| `agent.stop` | `(agentId)` | Stop agent |
| `agent.message` | `(agentId, msg)` | Send message to agent |

---

#### 4.19 Oni Chat (`oni-chat`)

The primary AI chat interface — connected to the Oni gateway.

| Command | Args | Description |
|---------|------|-------------|
| `oni.chat` | — | Open chat |
| `oni.send` | `(message)` | Send message to agent |
| `oni.clearHistory` | — | Clear chat history |
| `oni.getHistory` | `(count?)` | Get recent messages |

---

#### 4.20 Settings (`settings`)

Theme, wallpaper, API keys, system config.

| Command | Args | Description |
|---------|------|-------------|
| `system.settings.open` | — | Open settings |
| `system.settings.toggleTheme` | — | Toggle dark/light |
| `system.settings.setWallpaper` | `(path)` | Set wallpaper |
| `system.settings.getConfig` | — | Get all settings |
| `system.settings.setConfig` | `(key, value)` | Set a setting |

---

#### 4.21 Clock & System Info (`clock`)

| Command | Args | Description |
|---------|------|-------------|
| `system.info.clock` | — | Show clock |
| `system.info.uptime` | — | System uptime |
| `system.info.memory` | — | Memory usage |

---

#### 4.22 Documentation (`docs`)

Built-in documentation viewer.

| Command | Args | Description |
|---------|------|-------------|
| `system.docs.open` | `(page?)` | Open docs |
| `system.docs.commands` | — | Command reference |
| `system.docs.architecture` | — | Architecture docs |

---

#### 4.23 File Viewer (`file-viewer`)

| Command | Args | Description |
|---------|------|-------------|
| `viewer.openFile` | `(filePath)` | Open file in viewer |

---

#### 4.24 Document Viewer (`document-viewer`)

Renders PDFs, Word docs, spreadsheets.

| Command | Args | Description |
|---------|------|-------------|
| `document.open` | `(filePath?)` | Open viewer |
| `document.find` | `(query)` | Find in document |
| `document.index` | — | Reindex documents |

---

## 5. Command Pallet

### Registration

Every widget auto-registers its commands on mount. Commands use dot-notation and are discoverable by the AI.

```typescript
// src/core/CommandRegistry.ts
interface CommandRegistration {
  path: string;              // e.g. "terminal.exec"
  handler: (...args: any[]) => any;
  meta: {
    description: string;
    icon?: LucideIcon;
    widget?: string;         // Which widget this command belongs to
    source?: "system" | "widget" | "plugin";
    dangerous?: boolean;     // Requires confirmation
  };
}
```

### System Commands (Always Available)

| Command | Description |
|---------|-------------|
| `system.notify` | Show notification toast |
| `system.screenshot` | Capture desktop screenshot |
| `system.setReminder` | Set timed reminder |
| `system.lock` | Lock the desktop |
| `system.sleep` | Sleep timer |
| `help` | Open documentation |
| `system.commands.list` | List all commands |
| `system.commands.search` | Search commands |

### Window Management Commands

| Command | Description |
|---------|-------------|
| `window.open` | Open a widget by type |
| `window.close` | Close a window |
| `window.focus` | Focus a window |
| `window.minimize` | Minimize a window |
| `window.maximize` | Maximize/restore a window |
| `window.tile` | Tile windows (left/right/grid) |
| `window.list` | List open windows |
| `desktop.switch` | Switch virtual desktop |
| `desktop.create` | Create virtual desktop |

### Command Chaining

```
terminal.exec("git status") | system.notify("Done")
system.files.list | storage.set("cache", "files", $result)
web.search("react hooks") | document.create("Research Notes")
```

---

## 6. API Pallet

Every widget exposes a REST API. All endpoints are served from the Electron main process on a local HTTP server (default: `http://localhost:5173`).

### Base URL Pattern

```
http://localhost:{port}/api/{widget}/{action}
```

### Global API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system/info` | OS info, uptime, memory |
| GET | `/api/system/widgets` | List all registered widgets |
| GET | `/api/system/commands` | List all registered commands |
| POST | `/api/system/execute` | Execute a command string |
| GET | `/api/system/context` | Get all widget contexts |
| GET | `/api/system/health` | Health check |
| WS | `/api/ws` | WebSocket for real-time events |

### API Authentication

Local requests from the Oni gateway use the gateway token:

```
Authorization: Bearer <oni-gateway-token>
```

---

## 7. Skill System

### How Skills Map to the Oni Gateway

Each widget's commands are converted to **Oni gateway skills** and registered when OniOS connects.

```typescript
// Skill definition (sent to gateway)
interface OniOSSkill {
  id: string;                    // "onios.terminal.exec"
  name: string;                  // "Run Terminal Command"
  description: string;
  parameters: JSONSchema;        // OpenAI function-calling schema
  group: string;                 // "terminal"
  widget?: string;               // Opens this widget
}
```

### Skill Groups

| Group | Skills | Count |
|-------|--------|-------|
| `files` | open_file_explorer, list_folders, create_file, create_folder, delete_file, rename_file, copy_file, move_file, read_file, write_file, search_files | 11 |
| `terminal` | run_terminal_command, open_terminal, send_terminal_input, get_terminal_output | 4 |
| `browser` | open_browser, open_url, google_search | 3 |
| `code` | open_code_editor, open_project, open_file, save_file, get_content, set_content | 6 |
| `notes` | create_note, list_notes, read_note, update_note, delete_note, search_notes | 6 |
| `tasks` | create_task, list_tasks, complete_task, delete_task, update_task | 5 |
| `calendar` | add_event, list_events, delete_event | 3 |
| `weather` | get_current_weather, get_weekly_forecast | 2 |
| `search` | web_search, image_search | 2 |
| `media` | play_video, play_audio, pause_media | 3 |
| `camera` | open_camera, capture_photo, list_photos | 3 |
| `passwords` | add_password, get_password, list_passwords, delete_password, generate_password | 5 |
| `workflows` | create_workflow, run_workflow, list_workflows, delete_workflow | 4 |
| `storage` | storage_set, storage_get, storage_delete, storage_list, storage_search | 5 |
| `agents` | spawn_agent, list_agents, stop_agent, message_agent, view_agent | 5 |
| `windows` | open_window, close_window, focus_window, minimize_window, maximize_window, list_windows, tile_windows | 7 |
| `system` | notify, screenshot, toggle_theme, set_wallpaper, get_system_info | 5 |
| **Total** | | **~79 skills** |

### Gateway Skill File (`extensions/onios/skills/SKILL.md`)

```markdown
---
name: onios
description: "Control OniOS desktop — 24 widgets, 79 skills, full AI-human shared workspace."
metadata: { "oni": { "emoji": "🖥️", "always": true } }
---

# OniOS Desktop Control

OniOS exposes all desktop actions as native gateway commands.
When OniOS is connected, use the onios.* tool functions directly.
No curl/HTTP needed — commands execute natively via the gateway bridge.
```

---

## 8. Electron Shell

### Architecture

```
┌──────────────────────────────────────┐
│           Electron Main Process       │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │ Gateway Bridge (WebSocket)       │ │
│  │ Local HTTP API Server            │ │
│  │ node-pty Terminal Manager        │ │
│  │ File System Access (native)      │ │
│  │ System Tray + Native Menus       │ │
│  │ Auto-Updater                     │ │
│  │ Notification Bridge (native)     │ │
│  └─────────────────────────────────┘ │
│               ↕ IPC                   │
│  ┌─────────────────────────────────┐ │
│  │ Electron Renderer (BrowserWindow)│ │
│  │ React App (Desktop Shell)        │ │
│  │ Widget Layer + Stores            │ │
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘
```

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `pty:create` | renderer → main | Create terminal session |
| `pty:input` | renderer → main | Send input to PTY |
| `pty:output` | main → renderer | Terminal output stream |
| `pty:resize` | renderer → main | Resize terminal |
| `fs:*` | renderer → main | File system operations |
| `gateway:connect` | renderer → main | Connect to Oni gateway |
| `gateway:message` | both directions | Gateway messages |
| `gateway:status` | main → renderer | Connection status |
| `system:notification` | renderer → main | Native notification |
| `system:tray` | main → renderer | Tray icon actions |

### Web Mode (Fallback)

When running without Electron (pure browser via `npm run dev`), the app falls back to:
- Vite plugins for filesystem/terminal (dev mode only)
- WebSocket proxy to Oni gateway
- No native notifications, no tray icon

---

## 9. Implementation Phases

### Phase 1: Foundation (Week 1-2)

- [ ] Scaffold Electron + React + TypeScript project
- [ ] Set up Vite for renderer, electron-builder for packaging
- [ ] Port core engine from sample: CommandRegistry, WidgetRegistry, EventBus
- [ ] Convert to TypeScript with proper interfaces
- [ ] Implement OniGatewayBridge (WebSocket client)
- [ ] Basic desktop shell: window manager, taskbar, dock
- [ ] 3 core widgets: Terminal, File Explorer, Oni Chat

### Phase 2: Widget Port (Week 3-4)

- [ ] Port all 24 widgets from sample app (maintain UI design)
- [ ] Convert widgets to TypeScript
- [ ] Implement API pallet for each widget
- [ ] Implement context reporters for each widget
- [ ] Add widget-level command registration

### Phase 3: Gateway Deep Integration (Week 5-6)

- [ ] Create `extensions/onios` Oni channel plugin
- [ ] Implement skill registration (all 79 skills)
- [ ] Widget context sync to gateway (agent awareness)
- [ ] Agent command execution (gateway → OniOS)
- [ ] Sub-agent management + AgentViewer integration
- [ ] Session/memory integration with Oni

### Phase 4: Electron Native Features (Week 7-8)

- [ ] node-pty terminal (replace WebSocket PTY)
- [ ] Native filesystem access (replace Vite plugins)
- [ ] System tray + native menus
- [ ] Native notifications
- [ ] Auto-updater
- [ ] macOS/Linux/Windows packaging

### Phase 5: Polish & Ship (Week 9-10)

- [ ] Theming system (dark/light + custom)
- [ ] Keyboard shortcuts system
- [ ] Multi-desktop support
- [ ] Performance optimization (widget lazy loading)
- [ ] Comprehensive test suite
- [ ] Documentation site
- [ ] First release builds

---

## 10. File Structure

```
apps/onios/
├── docs/
│   ├── plan.md                    # This file
│   ├── api-reference.md           # Full API documentation
│   └── widget-guide.md            # Widget development guide
├── electron/
│   ├── main.ts                    # Electron main process
│   ├── preload.ts                 # Preload script (IPC bridge)
│   ├── gateway-bridge.ts          # Oni gateway WebSocket client
│   ├── terminal-manager.ts        # node-pty session manager
│   ├── file-system.ts             # Native fs operations
│   ├── api-server.ts              # Local HTTP API server
│   ├── tray.ts                    # System tray
│   └── updater.ts                 # Auto-update
├── src/
│   ├── main.tsx                   # React entry point
│   ├── App.tsx                    # Root component + command registration
│   ├── core/
│   │   ├── CommandRegistry.ts     # Command engine
│   │   ├── CommandParser.ts       # Command string parser
│   │   ├── CommandRunTracker.ts   # Execution tracking
│   │   ├── WidgetRegistry.ts      # Widget definitions
│   │   ├── SkillsRegistry.ts      # AI skill definitions
│   │   ├── ContextEngine.ts       # Widget context aggregation
│   │   ├── EventBus.ts            # Pub/sub events
│   │   ├── AgentManager.ts        # Sub-agent lifecycle
│   │   ├── WorkflowEngine.ts      # Workflow execution
│   │   └── useWidgetContext.ts     # Widget context hook
│   ├── bridge/
│   │   ├── OniGatewayBridge.ts    # Gateway connection layer
│   │   ├── SkillSync.ts           # Skill registration to gateway
│   │   └── ContextSync.ts         # Widget context push to gateway
│   ├── widgets/
│   │   ├── Terminal/
│   │   │   ├── Terminal.tsx
│   │   │   ├── Terminal.css
│   │   │   ├── commands.ts        # terminal.* commands
│   │   │   ├── api.ts             # /api/terminal/* endpoints
│   │   │   └── skills.ts          # AI skill definitions
│   │   ├── FileExplorer/
│   │   ├── Browser/
│   │   ├── CodeEditor/
│   │   ├── Notes/
│   │   ├── TaskManager/
│   │   ├── Calendar/
│   │   ├── Weather/
│   │   ├── Calculator/
│   │   ├── WebSearch/
│   │   ├── Maps/
│   │   ├── MediaPlayer/
│   │   ├── Camera/
│   │   ├── PasswordManager/
│   │   ├── WorkflowBuilder/
│   │   ├── Storage/
│   │   ├── ActivityLog/
│   │   ├── AgentViewer/
│   │   ├── OniChat/
│   │   ├── Settings/
│   │   ├── Clock/
│   │   ├── Docs/
│   │   ├── FileViewer/
│   │   └── DocumentViewer/
│   ├── shell/
│   │   ├── Desktop.tsx            # Desktop + wallpaper
│   │   ├── Taskbar.tsx            # Bottom taskbar
│   │   ├── Dock.tsx               # App launcher dock
│   │   ├── WindowManager.tsx      # Window chrome (drag/resize)
│   │   ├── CommandPalette.tsx     # ⌘K launcher
│   │   ├── NotificationCenter.tsx
│   │   ├── ContextMenu.tsx
│   │   └── AppDrawer.tsx
│   ├── stores/
│   │   ├── windowStore.ts
│   │   ├── commandStore.ts
│   │   ├── taskStore.ts
│   │   ├── themeStore.ts
│   │   ├── desktopStore.ts
│   │   ├── notificationStore.ts
│   │   ├── passwordStore.ts
│   │   ├── storageStore.ts
│   │   └── workflowStore.ts
│   ├── styles/
│   │   ├── globals.css
│   │   ├── theme.css
│   │   └── widgets.css
│   └── types/
│       ├── commands.ts
│       ├── widgets.ts
│       ├── gateway.ts
│       └── skills.ts
├── extensions/
│   └── onios/
│       ├── index.ts               # Oni channel plugin
│       ├── package.json
│       └── skills/
│           └── SKILL.md           # Gateway skill file
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.yml
└── README.md
```

---

## Design Principles

1. **Every widget is a reflection of Oni** — The AI doesn't use a separate API. It uses the same commands, sees the same widgets, reads the same context.

2. **Commands are the universal interface** — Human clicks a button → command. AI decides an action → same command. Everything is auditable, chainable, observable.

3. **The gateway IS the brain** — OniOS doesn't run its own agent loop. The Oni gateway handles agent logic, memory, routing, and cross-platform identity. OniOS is the richest execution environment.

4. **Maintain the sample's design** — The UI, widget layouts, theming, and visual design from the sample app are preserved. The rewrite is architectural, not cosmetic.

5. **Electron for real power** — Native terminal (node-pty), real filesystem access, system tray, native notifications. The browser fallback works for dev but the Electron shell is the production target.

---

*This plan is a living document. Update as architecture decisions are made.*
