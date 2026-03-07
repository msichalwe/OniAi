# OniOS — The Vision

> A web-based operating system where AI isn't bolted on — it's the nervous system.

---

## What Is OniOS?

OniOS is a **visual desktop operating system that runs in the browser**, built from the ground up so that an AI agent and a human share the same workspace. Think of it as macOS or Windows — but instead of Siri sitting in a corner waiting for "Hey Siri," the AI (Hailey) is woven into every layer of the OS.

The core idea is simple:

**The exact same interface a human uses to control the OS is the exact same interface the AI uses.**

There's no separate "AI API." There's no hidden admin panel. When the human opens a terminal, they use a command. When the AI opens a terminal, it uses the same command. When the human watches the AI work, they see real windows opening, real files being created, real terminal output scrolling — because it's all happening through the same system.

```
Human clicks "Open Terminal"  →  commandRegistry.execute('terminal.exec')  →  Terminal widget opens
AI decides to run a command   →  commandRegistry.execute('terminal.exec')  →  Same Terminal widget opens
```

The human is never in the dark. The AI is never in a black box.

---

## The Widget System

### What Are Widgets?

Widgets are the visual building blocks of OniOS. Every app is a widget. Every window on the desktop is a widget instance rendered inside a draggable, resizable window frame.

| Widget | What It Does |
|--------|-------------|
| **Terminal** | Real PTY shell (node-pty + xterm.js). Full ANSI color, tab completion, the works. |
| **File Explorer** | Browse, navigate, open, rename, delete files on the real filesystem. |
| **Browser** | Embedded web browser (iframe-based) with URL bar and navigation. |
| **Code Editor** | Monaco-based code editor with syntax highlighting, multiple files. |
| **Notes** | Create, edit, list markdown notes. Persisted to disk. |
| **Calendar** | Events + tasks in a calendar view. |
| **Task Manager** | Create, complete, delete tasks with priorities and schedules. |
| **Weather** | Live weather data for any city. |
| **Calculator** | Standard calculator. |
| **Maps** | Embedded map viewer. |
| **Web Search** | Brave Search integration for web queries. |
| **Media Player** | Play audio/video files from the filesystem. |
| **Workflow Builder** | Visual node-based automation builder (triggers → actions → conditions). |
| **Storage Manager** | Key-value data store with namespaces, search, import/export. |
| **Password Manager** | Encrypted password storage with generation. |
| **Camera** | WebRTC camera with photo capture, gallery, timer, mirror mode. |
| **Agent Viewer** | Real-time activity viewer for AI sub-agents (one per agent). |
| **Settings** | Theme, wallpaper, API keys, system config. |
| **Oni Chat** | The AI chat panel (Hailey's main interface). |

### How Widgets Work

Every widget is a React component registered in `widgetRegistry.js`:

```js
'terminal': {
    component: TerminalWidget,
    title: 'Terminal',
    icon: Terminal,
    singleton: false,           // Can have multiple instances
    defaultWidth: 700,
    defaultHeight: 440,
    commands: ['terminal.exec'], // Commands that open/control this widget
}
```

**Adding a new widget to OniOS takes 3 steps:**
1. Create a React component in `src/widgets/YourWidget/`
2. Add an entry to `WIDGET_REGISTRY`
3. Register commands for it in `App.jsx`

That's it. The window manager, focus system, minimize/maximize, drag/resize — all handled automatically. The widget just renders its content.

### Widget Context (AI Awareness)

Every widget can report its live state to the AI via `useWidgetContext()`:

```js
// Inside Terminal widget
useWidgetContext(windowId, 'terminal', {
    lastCommand: 'npm run build',
    lastOutput: 'Build successful',
    cwd: '/Users/me/project',
});
```

The AI reads this context every turn. So when you say "what's happening in the terminal?", Hailey already knows — she can see the last command, its output, the working directory. She has **eyes** into every open widget.

---

## The Command System — The Universal Interface

This is the most important architectural decision in OniOS.

### Commands Are Everything

Every action in the OS — human or AI — goes through the **CommandRegistry**:

```
browser.openUrl("github.com")      → Opens a browser window to GitHub
terminal.exec("ls -la")            → Runs a command in the terminal
task.add("Buy milk", "high")       → Creates a high-priority task
system.settings.toggleTheme()      → Switches dark/light mode
agent.spawn("Research", "Find...") → Spawns a sub-agent
```

Commands are:
- **Discoverable** — The AI can list every command available (`commandRegistry.list()`)
- **Composable** — Chain commands with pipes: `cmd1 | cmd2 | cmd3`
- **Observable** — Every execution emits events, gets logged, is auditable
- **Source-tagged** — Every command is tagged `source: 'human'` or `source: 'ai'`

### Why This Matters

When an AI agent wants to control OniOS, it doesn't need:
- A special SDK
- Authentication tokens
- Complex API clients
- Hidden admin endpoints

It just needs to output a string: `"terminal.exec('git status')"`. That's the entire integration surface. Any LLM that can produce text can drive OniOS.

---

## The AI Layer — Hailey

### Who Is Hailey?

Hailey is the embedded AI agent. She's not a chatbot sitting in a sidebar — she's the OS's brain. She:

- **Sees** what's on screen (via widget context)
- **Acts** by executing commands (same ones the human uses)
- **Remembers** via workspace files and conversation persistence
- **Delegates** by spawning sub-agents for complex tasks
- **Reacts** with an animated avatar that shows her emotional state

### The Workspace Files (Personality Layer)

Hailey's personality, memory, and operating instructions live in markdown files inside `src/ai/workspace/`:

| File | Purpose |
|------|---------|
| **SOUL.md** | Who she is. Personality, boundaries, tone, core truths. "You're not a chatbot. You're the brain of this OS." |
| **IDENTITY.md** | Name, emoji, vibe, platform info. The quick-reference identity card. |
| **USER.md** | Who the human is. Name, timezone, preferences. "Call them Mr S." |
| **MEMORY.md** | Persistent observations and preferences. Long-term memory that survives sessions. |
| **TOOLS.md** | User-maintained notes about the local environment — camera names, SSH hosts, credentials, etc. |
| **AGENTS.md** | Operating instructions. Session startup protocol, memory management, safety rules, heartbeat behavior, sub-agent guidelines, group chat etiquette. |

These files are **injected into the system prompt** at every agent turn. They ARE Hailey's personality. Change SOUL.md and she changes.

### The Agent Loop

```
User sends message
    ↓
System prompt assembled (workspace files + kernel state + tool schemas)
    ↓
LLM call (streaming via SSE)
    ↓
If AI returns tool calls:
    → Execute each tool (native, not HTTP)
    → Append results to conversation
    → Continue LLM call (loop back)
    ↓
Final text response streamed to OniChat widget
    ↓
Conversation persisted to disk (~/.onios/ai/conversations/)
```

The AI can make **multiple tool calls per turn** and the loop continues until she has a final answer. This is how she can: open a terminal → run a command → read the output → open a file → write results — all in one user request.

### Sub-Agents

For complex or long-running tasks, Hailey can **spawn sub-agents**:

```
User: "Research the top 5 React frameworks and organize my project files"

Hailey:
  → spawn_agent("Research Agent", "Search for top 5 React frameworks, compare features")
  → spawn_agent("File Organizer", "Scan ~/Projects, group by language, create summary")
  → Both agents get their own AgentViewer widget (visible to user)
  → Both work in parallel
  → Results reported back when done
  → Hailey compiles final answer
```

Each sub-agent:
- Gets its own **AgentViewer widget** so the user can watch it work in real-time
- Has access to the same skills/commands as the main agent
- Can receive messages from Hailey or the user
- Reports status: spawning → working → waiting → completed/failed
- Has a live activity log (tool calls, thinking, messages, results)

### The Skills System

Skills are how the AI discovers and uses tools. Each skill is registered in `SkillsRegistry.js`:

```js
{
    id: 'run_terminal_command',
    group: 'terminal',
    description: 'Execute a shell command in the terminal',
    parameters: {
        type: 'object',
        properties: {
            command: { type: 'string', description: 'Shell command to run' },
        },
        required: ['command'],
    },
    command: 'terminal.exec',          // Maps to a registered command
    buildArgs: (p) => [p.command],     // Transforms AI params → command args
    opensWidget: 'terminal',           // Tells the AI this opens a widget
}
```

Skills are automatically converted to **OpenAI function-calling tool schemas** and sent to the LLM. When the AI calls a skill, the system:

1. Looks up the skill by ID
2. Extracts parameters from the AI's function call
3. Runs `buildArgs()` to transform them
4. Executes the underlying command via CommandRegistry
5. Returns the result to the AI

**Current skill count: ~60+** across groups: terminal, files, browser, search, tasks, calendar, notes, code, settings, weather, passwords, workflows, storage, camera, agents, windows, desktops, system.

---

## OpenClaw Integration

### What Is OpenClaw?

[OpenClaw](https://github.com/nichochar/openclaw) is an open-source AI agent framework that gives LLMs a persistent identity across platforms (Telegram, Discord, WhatsApp, CLI, etc.). It provides:

- **Workspace files** (SOUL.md, IDENTITY.md, etc.) for personality
- **Skills** (SKILL.md files) that teach the AI how to use external tools
- **A gateway** (WebSocket server) that routes messages between channels
- **Session management** and **memory persistence**

### How OniOS Connects to OpenClaw

OniOS has **two modes** for its AI:

#### Mode 1: Native Brain (Default)
OniOS reads the workspace files directly and runs its own agent loop. No dependency on OpenClaw being installed. The AI calls tools natively (in-process) instead of via HTTP.

```
OniOS reads src/ai/workspace/*.md → builds system prompt → calls LLM API directly
```

#### Mode 2: OpenClaw Gateway (Optional)
If OpenClaw is installed (`~/.openclaw/`), OniOS can sync with it:

- **Identity sync** — OniOS appends its platform-specific sections to OpenClaw's SOUL.md, IDENTITY.md, TOOLS.md
- **Skill installation** — OniOS generates a `SKILL.md` file and installs it into OpenClaw's skills directory (`~/.openclaw/workspace/skills/onios/SKILL.md`)
- **Chat routing** — Messages can be sent through OpenClaw's gateway CLI, enabling the same AI personality across Telegram, Discord, AND OniOS simultaneously

```
Telegram message → OpenClaw Gateway → Agent (same SOUL.md) → Response
OniOS message    → OpenClaw Gateway → Agent (same SOUL.md) → Response + OniOS actions
```

### How SKILL.md Works

In OpenClaw, a **SKILL.md** file teaches the AI how to use a specific tool. It's a markdown file with YAML frontmatter:

```markdown
---
name: onios
description: "OniOS desktop control. Use exec tool with curl to call 
  http://localhost:5173/api/openclaw/actions/{action}."
metadata: { "openclaw": { "emoji": "🖥️", "always": true } }
---

# OniOS — Use `exec` with `curl` to control the desktop

Base URL: `http://localhost:5173/api/openclaw/actions/{action}`

## Actions Quick Ref
**task** — `{"action":"create|list|complete","title":"...","priority":"high"}`
**terminal** — `{"action":"open|run","command":"..."}`
**window** — `{"action":"open|close","widgetType":"terminal|browser|..."}`
...

## Examples
Create task:
`exec: curl -sS -X POST .../actions/task -d '{"action":"create","title":"Buy milk"}'`
```

When OpenClaw loads this skill, the AI learns:
1. What the tool is (OniOS desktop control)
2. What actions are available (task, terminal, window, file, etc.)
3. How to call them (POST JSON to specific endpoints)
4. Real examples to follow

**In native mode**, OniOS doesn't need SKILL.md — the skills are registered programmatically in `SkillsRegistry.js` and converted directly to function-calling schemas. But the SKILL.md approach is what makes cross-platform compatibility work: the same AI personality can control OniOS whether it's running natively or through the OpenClaw gateway.

---

## What The Platform Is Trying To Achieve

### The Big Picture

OniOS is building toward a future where:

1. **AI agents have a real workspace** — not just a chat window, but a full desktop with apps, files, terminals, and visual feedback. The AI can see what's happening, act on it, and show the human what it's doing.

2. **The human is always in the loop** — Every AI action is visible. Every window it opens, every command it runs, every file it creates. The human can watch, intervene, override, or collaborate at any time. No black boxes.

3. **One personality, everywhere** — Through the workspace files (SOUL.md, etc.), the AI maintains the same personality whether it's in OniOS, Telegram, Discord, or a CLI session. OpenClaw provides the cross-platform identity layer; OniOS provides the richest execution environment.

4. **Parallel intelligence** — The main agent can spawn sub-agents for complex tasks. Each sub-agent gets its own visible widget. The user sees multiple agents working simultaneously — like watching a team of assistants coordinate in real-time.

5. **The OS becomes the AI's body** — Widgets are its eyes (camera, browser, file explorer). Commands are its hands (terminal, file operations, task creation). The activity log is its audit trail. Memory files are its long-term memory. The desktop IS the AI.

### The Feedback Loop

```
┌──────────┐     commands      ┌──────────┐     visual output    ┌──────────┐
│          │ ───────────────► │          │ ──────────────────► │          │
│  AI Agent │                  │  OniOS   │                     │  Human   │
│ (Hailey)  │ ◄─────────────── │  Kernel  │ ◄────────────────── │  (Mr S)  │
│          │   tool results    │          │    human commands    │          │
└──────────┘                  └──────────┘                     └──────────┘
      ▲                             │                                │
      │         widget context      │         watches, intervenes    │
      └─────────────────────────────┘────────────────────────────────┘
```

The AI acts → the human sees → the human can override → the AI adapts. This is **collaborative intelligence**, not blind automation.

### Current State vs. End Goal

| Layer | Current State | End Goal |
|-------|--------------|----------|
| **Widgets** | 20+ widgets, all AI-controllable | Extensible plugin system, community widgets |
| **AI Brain** | Native agent loop, streaming, tool calling | Full autonomous agent with background work |
| **Sub-Agents** | Spawn + track + viewer widget | True parallel execution with own LLM loops |
| **Heartbeat** | 15s scheduler tick exists | AI-driven proactive background checks |
| **Memory** | Workspace files + conversation persistence | Vector search, auto-learning, memory consolidation |
| **OpenClaw** | Gateway sync, skill installation | Seamless cross-platform identity + actions |
| **Skills** | 60+ registered, function-calling | Dynamic skill discovery, user-created skills |
| **Inter-Agent Comms** | Message bus exists | Full ping-pong conversations between agents |

### The North Star

> **OniOS should feel like having a brilliant coworker who happens to live inside your computer.** They can see your screen, use your apps, manage your tasks, research things for you, organize your files, and even delegate work to other AI workers — all while you watch and collaborate. Not a chatbot. Not an assistant. A digital teammate.

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Zustand (state), Pure CSS (theming) |
| **Backend** | Vite dev-server middleware plugins (zero separate server) |
| **Terminal** | node-pty + xterm.js over WebSocket |
| **Filesystem** | Node.js fs APIs exposed as REST endpoints |
| **AI** | OpenAI-compatible API (any provider), SSE streaming |
| **Agent Framework** | Native agent loop (inspired by OpenClaw patterns) |
| **Persistence** | JSON files on disk (~/.onios/ai/) |
| **Icons** | Lucide React |
| **Search** | Brave Search API |

---

*This document describes the vision as of February 2026. OniOS is actively evolving.*
