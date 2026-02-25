import React, { useState } from "react";
import {
  BookOpen,
  Terminal,
  Layers,
  Zap,
  Cpu,
  Puzzle,
  GitBranch,
  Clock,
  Globe,
  Shield,
} from "lucide-react";
import "./Docs.css";

const PAGES = {
  overview: { title: "Overview", icon: BookOpen, content: OverviewPage },
  architecture: {
    title: "Architecture",
    icon: Layers,
    content: ArchitecturePage,
  },
  widgets: { title: "All Widgets", icon: Puzzle, content: WidgetGuidePage },
  commands: {
    title: "Command Reference",
    icon: Terminal,
    content: CommandReferencePage,
  },
  workflows: {
    title: "Workflow Builder",
    icon: GitBranch,
    content: WorkflowsPage,
  },
  scheduler: {
    title: "Scheduler & Tasks",
    icon: Clock,
    content: SchedulerPage,
  },
  ai: { title: "AI Integration", icon: Cpu, content: AIIntegrationPage },
  api: { title: "REST API", icon: Globe, content: RestApiPage },
  security: {
    title: "Password Manager",
    icon: Shield,
    content: PasswordManagerPage,
  },
  extending: { title: "Extending OniOS", icon: Zap, content: ExtendingPage },
};

export default function Docs({ page: initialPage }) {
  const [activePage, setActivePage] = useState(initialPage || "overview");
  const PageContent = PAGES[activePage]?.content || OverviewPage;
  return (
    <div className="docs-widget">
      <div className="docs-sidebar">
        <div className="docs-sidebar-section">Documentation</div>
        {Object.entries(PAGES).map(([key, { title, icon: Icon }]) => (
          <button
            key={key}
            className={`docs-sidebar-item ${activePage === key ? "active" : ""}`}
            onClick={() => setActivePage(key)}
          >
            <Icon />
            {title}
          </button>
        ))}
      </div>
      <div className="docs-content">
        <PageContent />
      </div>
    </div>
  );
}

/* ================================================================
   OVERVIEW
   ================================================================ */
function OverviewPage() {
  return (
    <div className="docs-page">
      <h1>OniOS Documentation</h1>
      <p>
        OniOS is a command-driven, widget-based visual operating system built
        for AI-human collaboration. Every action in the system is a callable
        command using dot-notation. Any AI agent or LLM that can emit command
        strings can control the entire OS. OniOS serves as a visual middleware
        layer between AI and traditional operating systems -- giving humans eyes
        into what AI is doing, and giving AI a structured way to interact with
        the real world.
      </p>
      <div className="docs-callout info">
        <span className="docs-callout-icon">i</span>
        <div>
          <strong>Quick Start:</strong> Press <code>Cmd+K</code> (or{" "}
          <code>Ctrl+K</code>) to open the command palette. Type any command
          like <code>terminal.open()</code> and press Enter.
        </div>
      </div>

      <h2>System Capabilities</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Multi-window management</strong>
            </td>
            <td>
              Drag, resize, minimize, maximize, z-index stacking, taskbar
              integration
            </td>
          </tr>
          <tr>
            <td>
              <strong>Real filesystem access</strong>
            </td>
            <td>
              Browse, read, write, delete, rename files on the actual machine
              via REST API
            </td>
          </tr>
          <tr>
            <td>
              <strong>Terminal emulator</strong>
            </td>
            <td>
              Full PTY shell via node-pty over WebSocket with ANSI 256-color
              support
            </td>
          </tr>
          <tr>
            <td>
              <strong>Built-in browser</strong>
            </td>
            <td>
              Embedded iframe with URL navigation, Google search, quick links
            </td>
          </tr>
          <tr>
            <td>
              <strong>Code editor</strong>
            </td>
            <td>
              Project browser with syntax-aware file viewing, multi-file open,
              save support
            </td>
          </tr>
          <tr>
            <td>
              <strong>Document viewer</strong>
            </td>
            <td>
              PDF, Word (.docx), Excel (.xlsx/.xls), CSV, and plain text with
              in-document search
            </td>
          </tr>
          <tr>
            <td>
              <strong>Full-text document search</strong>
            </td>
            <td>
              TF-IDF indexed search across all indexed documents with snippet
              extraction
            </td>
          </tr>
          <tr>
            <td>
              <strong>Workflow automation</strong>
            </td>
            <td>
              Visual node-based workflow builder with triggers, commands,
              conditions, delays, outputs
            </td>
          </tr>
          <tr>
            <td>
              <strong>Task management</strong>
            </td>
            <td>
              Tasks with priorities, due dates, statuses, and automatic overdue
              notifications
            </td>
          </tr>
          <tr>
            <td>
              <strong>Calendar events</strong>
            </td>
            <td>Date-based events with start/end times</td>
          </tr>
          <tr>
            <td>
              <strong>Scheduled jobs</strong>
            </td>
            <td>
              Cron-like job scheduler that auto-fires commands at intervals
            </td>
          </tr>
          <tr>
            <td>
              <strong>Password manager</strong>
            </td>
            <td>
              Encrypted vault with password generation, strength scoring,
              categories, search
            </td>
          </tr>
          <tr>
            <td>
              <strong>Universal search</strong>
            </td>
            <td>
              Search across commands, windows, files, and document contents
              simultaneously
            </td>
          </tr>
          <tr>
            <td>
              <strong>Command run tracking</strong>
            </td>
            <td>
              Every command execution tracked with run ID, status, output,
              timing, pipe chains
            </td>
          </tr>
          <tr>
            <td>
              <strong>Context engine</strong>
            </td>
            <td>
              Full OS context snapshot for AI agents -- open windows, recent
              files, document index
            </td>
          </tr>
          <tr>
            <td>
              <strong>Event bus</strong>
            </td>
            <td>
              Pub/sub system for inter-widget communication and workflow
              triggers
            </td>
          </tr>
          <tr>
            <td>
              <strong>AI source tagging</strong>
            </td>
            <td>
              Every command tagged as "human" or "ai" for full audit trail
              transparency
            </td>
          </tr>
          <tr>
            <td>
              <strong>Theme system</strong>
            </td>
            <td>
              Dark and light themes with gradient wallpaper presets and custom
              uploads
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Tech Stack</h2>
      <ul>
        <li>
          <strong>Frontend</strong> -- React 19, Vite 6, Zustand 5
        </li>
        <li>
          <strong>Backend</strong> -- Vite dev server plugins (Express-like
          middleware)
        </li>
        <li>
          <strong>Terminal</strong> -- xterm.js + node-pty over WebSocket
        </li>
        <li>
          <strong>Styling</strong> -- Pure CSS with Apple-inspired frosted glass
          aesthetic
        </li>
        <li>
          <strong>State</strong> -- Zustand stores with localStorage persistence
        </li>
        <li>
          <strong>Document parsing</strong> -- pdf-parse, mammoth, xlsx
          libraries
        </li>
      </ul>

      <h2>Getting Started</h2>
      <div className="docs-code-block">
        {`# Install dependencies
npm install

# Start development server
npm run dev

# Server starts at http://localhost:5173
# External docs at /docs, Swagger at /swagger`}
      </div>

      <h2>Key Commands to Try</h2>
      <div className="docs-code-block">
        {`terminal.open()                    Open a terminal
system.files.openExplorer()        Browse the filesystem
browser.openUrl("github.com")      Open a website
code.open("/path/to/project")      Open code editor
document.open("/path/to/file.pdf") Open a document
task.add("Fix login bug")          Create a task
workflow.open()                    Open the workflow builder
password.open()                    Open password manager
search.all("query")                Universal search
context.summary()                  Full OS context for AI`}
      </div>
    </div>
  );
}

/* ================================================================
   ARCHITECTURE
   ================================================================ */
function ArchitecturePage() {
  return (
    <div className="docs-page">
      <h1>System Architecture</h1>
      <p>
        OniOS is built on a layered architecture where commands flow through a
        central registry to produce visual widgets managed by a window system.
        All state is managed by Zustand stores with selective localStorage
        persistence.
      </p>

      <h2>Architecture Layers</h2>
      <div className="docs-arch-diagram">
        <div className="docs-arch-layer">
          <span className="docs-arch-label">Input</span>
          <div className="docs-arch-boxes">
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(10,132,255,0.15)",
                color: "var(--accent-blue)",
              }}
            >
              Human (Command Bar)
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(191,90,242,0.15)",
                color: "var(--accent-purple)",
              }}
            >
              AI Agent (API)
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(48,209,88,0.15)",
                color: "var(--accent-green)",
              }}
            >
              Workflow Engine
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(255,159,10,0.15)",
                color: "var(--accent-orange)",
              }}
            >
              Scheduler
            </div>
          </div>
        </div>
        <div className="docs-arch-layer">
          <span className="docs-arch-arrow">v</span>
        </div>
        <div className="docs-arch-layer">
          <span className="docs-arch-label">Engine</span>
          <div className="docs-arch-boxes">
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(255,159,10,0.15)",
                color: "var(--accent-orange)",
              }}
            >
              CommandParser
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(255,159,10,0.15)",
                color: "var(--accent-orange)",
              }}
            >
              CommandRegistry
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(255,159,10,0.15)",
                color: "var(--accent-orange)",
              }}
            >
              EventBus
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(255,159,10,0.15)",
                color: "var(--accent-orange)",
              }}
            >
              CommandRunTracker
            </div>
          </div>
        </div>
        <div className="docs-arch-layer">
          <span className="docs-arch-arrow">v</span>
        </div>
        <div className="docs-arch-layer">
          <span className="docs-arch-label">State</span>
          <div className="docs-arch-boxes">
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(48,209,88,0.15)",
                color: "var(--accent-green)",
              }}
            >
              windowStore
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(48,209,88,0.15)",
                color: "var(--accent-green)",
              }}
            >
              commandStore
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(48,209,88,0.15)",
                color: "var(--accent-green)",
              }}
            >
              workflowStore
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(48,209,88,0.15)",
                color: "var(--accent-green)",
              }}
            >
              taskStore
            </div>
          </div>
        </div>
        <div className="docs-arch-layer">
          <span className="docs-arch-arrow">v</span>
        </div>
        <div className="docs-arch-layer">
          <span className="docs-arch-label">UI</span>
          <div className="docs-arch-boxes">
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(255,55,95,0.15)",
                color: "var(--accent-pink)",
              }}
            >
              Desktop
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(255,55,95,0.15)",
                color: "var(--accent-pink)",
              }}
            >
              Window Manager
            </div>
            <div
              className="docs-arch-box"
              style={{
                background: "rgba(255,55,95,0.15)",
                color: "var(--accent-pink)",
              }}
            >
              Widget Components
            </div>
          </div>
        </div>
      </div>

      <h2>Core Modules</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Module</th>
            <th>File</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>CommandParser</strong>
            </td>
            <td>
              <code>core/CommandParser.js</code>
            </td>
            <td>
              Parses dot-notation strings into structured objects with
              namespace, action, and typed arguments. Supports strings, numbers,
              booleans. Handles pipe chains (cmd1 | cmd2).
            </td>
          </tr>
          <tr>
            <td>
              <strong>CommandRegistry</strong>
            </td>
            <td>
              <code>core/CommandRegistry.js</code>
            </td>
            <td>
              Singleton registry mapping command paths to handler functions.
              Supports register, unregister, execute, search, list. Every
              execution produces a tracked CommandRun with unique ID.
            </td>
          </tr>
          <tr>
            <td>
              <strong>CommandRunTracker</strong>
            </td>
            <td>
              <code>core/CommandRunTracker.js</code>
            </td>
            <td>
              Tracks every command execution with run ID, status
              (pending/running/resolved/rejected), output, error, duration,
              source tag, and pipe chain grouping.
            </td>
          </tr>
          <tr>
            <td>
              <strong>EventBus</strong>
            </td>
            <td>
              <code>core/EventBus.js</code>
            </td>
            <td>
              Pub/sub system. Used for workflow triggers, command execution
              events, scheduler notifications, and inter-widget communication.
            </td>
          </tr>
          <tr>
            <td>
              <strong>WidgetRegistry</strong>
            </td>
            <td>
              <code>core/widgetRegistry.js</code>
            </td>
            <td>
              Maps widget type strings to React components with metadata
              (default sizes, icons, singleton flag).
            </td>
          </tr>
          <tr>
            <td>
              <strong>ActiveWidgets</strong>
            </td>
            <td>
              <code>core/ActiveWidgets.js</code>
            </td>
            <td>
              Runtime layer providing getActiveContext(), getScreenSummary(),
              getWidgetCommands(), getFocusedWidget(), isWidgetOpen().
            </td>
          </tr>
          <tr>
            <td>
              <strong>WorkflowEngine</strong>
            </td>
            <td>
              <code>core/WorkflowEngine.js</code>
            </td>
            <td>
              Executes workflow pipelines node-by-node. Handles triggers,
              commands, conditions (with deep path), delays, outputs. Writes
              execution logs.
            </td>
          </tr>
          <tr>
            <td>
              <strong>SchedulerService</strong>
            </td>
            <td>
              <code>core/SchedulerService.js</code>
            </td>
            <td>
              15-second tick loop that fires scheduled jobs, checks overdue
              tasks, sends notifications.
            </td>
          </tr>
          <tr>
            <td>
              <strong>ContextEngine</strong>
            </td>
            <td>
              <code>core/ContextEngine.js</code>
            </td>
            <td>
              Aggregates full OS context: open windows, recent files, document
              index stats, active commands. For AI agent consumption.
            </td>
          </tr>
          <tr>
            <td>
              <strong>IndexService</strong>
            </td>
            <td>
              <code>core/IndexService.js</code>
            </td>
            <td>
              Client-side TF-IDF text indexing with exact phrase matching,
              snippet extraction, and relevance scoring.
            </td>
          </tr>
          <tr>
            <td>
              <strong>CommandOutputSchemas</strong>
            </td>
            <td>
              <code>core/CommandOutputSchemas.js</code>
            </td>
            <td>
              Defines expected output shapes for known commands. Used by
              workflow builder for field suggestions before a workflow has ever
              run.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>State Stores (Zustand)</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Store</th>
            <th>Persisted</th>
            <th>Contents</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>windowStore</code>
            </td>
            <td>No</td>
            <td>
              Open windows, positions, sizes, z-index stacking, focused window
            </td>
          </tr>
          <tr>
            <td>
              <code>commandStore</code>
            </td>
            <td>No</td>
            <td>Command history, activity log, command bar open/close state</td>
          </tr>
          <tr>
            <td>
              <code>notificationStore</code>
            </td>
            <td>No</td>
            <td>Active toast notifications with auto-dismiss timers</td>
          </tr>
          <tr>
            <td>
              <code>themeStore</code>
            </td>
            <td>Yes</td>
            <td>
              Theme (dark/light), wallpaper selection, custom wallpaper data
            </td>
          </tr>
          <tr>
            <td>
              <code>workflowStore</code>
            </td>
            <td>Yes</td>
            <td>
              Workflow definitions (nodes, connections, configs), active
              workflow ID, execution logs
            </td>
          </tr>
          <tr>
            <td>
              <code>taskStore</code>
            </td>
            <td>Yes</td>
            <td>Tasks, calendar events, scheduled jobs, completion state</td>
          </tr>
          <tr>
            <td>
              <code>passwordStore</code>
            </td>
            <td>Yes (encrypted)</td>
            <td>
              Password vault entries, master key hash, lock state, categories
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Backend Plugins</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Plugin</th>
            <th>File</th>
            <th>Endpoints</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>filesystemPlugin</strong>
            </td>
            <td>
              <code>plugins/filesystemPlugin.js</code>
            </td>
            <td>
              /api/fs/* -- list, read, write, mkdir, delete, rename, stat, media
              streaming
            </td>
          </tr>
          <tr>
            <td>
              <strong>terminalPlugin</strong>
            </td>
            <td>
              <code>plugins/terminalPlugin.js</code>
            </td>
            <td>/ws/terminal -- WebSocket PTY via node-pty</td>
          </tr>
          <tr>
            <td>
              <strong>documentPlugin</strong>
            </td>
            <td>
              <code>plugins/documentPlugin.js</code>
            </td>
            <td>
              /api/docs/* -- parse, read, search, create, info, index.
              Auto-indexes ~/Documents and ~/Desktop on startup.
            </td>
          </tr>
          <tr>
            <td>
              <strong>schedulerPlugin</strong>
            </td>
            <td>
              <code>plugins/schedulerPlugin.js</code>
            </td>
            <td>
              /api/state -- server-side state sync for tasks, events, jobs
            </td>
          </tr>
          <tr>
            <td>
              <strong>docsPlugin</strong>
            </td>
            <td>
              <code>plugins/docsPlugin.js</code>
            </td>
            <td>
              /docs -- standalone HTML docs. /swagger -- OpenAPI 3.1 spec +
              Swagger UI.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Command Syntax</h2>
      <div className="docs-code-block">
        {`namespace.action(arg1, arg2, ...)

Arguments can be:
  Strings:   browser.openUrl("https://github.com")
  Numbers:   task.upcoming(14)
  Booleans:  some.command(true)

Pipe chaining:
  cmd1 | cmd2 | cmd3
  Each command runs in sequence. The output of cmd1 is passed
  as the first argument to cmd2 if cmd2 has no explicit args.

Source tagging:
  commandRegistry.execute('cmd("arg")', 'human')  // human action
  commandRegistry.execute('cmd("arg")', 'ai')      // AI agent action
  commandRegistry.execute('cmd("arg")', 'workflow') // workflow engine`}
      </div>
    </div>
  );
}

/* ================================================================
   ALL WIDGETS
   ================================================================ */
function WidgetGuidePage() {
  return (
    <div className="docs-page">
      <h1>All Widgets</h1>
      <p>
        OniOS ships with 20 built-in widgets. Each is a self-contained React
        component registered in the widget registry. Widgets can be singleton
        (one instance only) or multi-instance (multiple windows allowed).
      </p>

      <h2>Widget Registry</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Type Key</th>
            <th>Title</th>
            <th>Singleton</th>
            <th>Default Size</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>file-explorer</code>
            </td>
            <td>File Explorer</td>
            <td>No</td>
            <td>800 x 500</td>
          </tr>
          <tr>
            <td>
              <code>terminal</code>
            </td>
            <td>Terminal</td>
            <td>No</td>
            <td>700 x 440</td>
          </tr>
          <tr>
            <td>
              <code>browser</code>
            </td>
            <td>Browser</td>
            <td>No</td>
            <td>800 x 520</td>
          </tr>
          <tr>
            <td>
              <code>code-editor</code>
            </td>
            <td>Code Editor</td>
            <td>No</td>
            <td>900 x 560</td>
          </tr>
          <tr>
            <td>
              <code>media-player</code>
            </td>
            <td>Media Player</td>
            <td>No</td>
            <td>640 x 420</td>
          </tr>
          <tr>
            <td>
              <code>file-viewer</code>
            </td>
            <td>File Viewer</td>
            <td>No</td>
            <td>680 x 480</td>
          </tr>
          <tr>
            <td>
              <code>document-viewer</code>
            </td>
            <td>Document Viewer</td>
            <td>No</td>
            <td>800 x 560</td>
          </tr>
          <tr>
            <td>
              <code>weather</code>
            </td>
            <td>Weather</td>
            <td>Yes</td>
            <td>560 x 520</td>
          </tr>
          <tr>
            <td>
              <code>web-search</code>
            </td>
            <td>Web Search</td>
            <td>Yes</td>
            <td>640 x 500</td>
          </tr>
          <tr>
            <td>
              <code>maps</code>
            </td>
            <td>Maps</td>
            <td>Yes</td>
            <td>700 x 520</td>
          </tr>
          <tr>
            <td>
              <code>notes</code>
            </td>
            <td>Notes</td>
            <td>Yes</td>
            <td>600 x 420</td>
          </tr>
          <tr>
            <td>
              <code>clock</code>
            </td>
            <td>Clock and System</td>
            <td>Yes</td>
            <td>380 x 480</td>
          </tr>
          <tr>
            <td>
              <code>calculator</code>
            </td>
            <td>Calculator</td>
            <td>Yes</td>
            <td>300 x 440</td>
          </tr>
          <tr>
            <td>
              <code>activity-log</code>
            </td>
            <td>Activity Log</td>
            <td>Yes</td>
            <td>480 x 420</td>
          </tr>
          <tr>
            <td>
              <code>docs</code>
            </td>
            <td>Documentation</td>
            <td>Yes</td>
            <td>780 x 520</td>
          </tr>
          <tr>
            <td>
              <code>settings</code>
            </td>
            <td>Settings</td>
            <td>Yes</td>
            <td>520 x 560</td>
          </tr>
          <tr>
            <td>
              <code>task-manager</code>
            </td>
            <td>Task Manager</td>
            <td>Yes</td>
            <td>700 x 520</td>
          </tr>
          <tr>
            <td>
              <code>calendar</code>
            </td>
            <td>Calendar</td>
            <td>Yes</td>
            <td>700 x 520</td>
          </tr>
          <tr>
            <td>
              <code>workflow-builder</code>
            </td>
            <td>Workflow Builder</td>
            <td>Yes</td>
            <td>900 x 600</td>
          </tr>
          <tr>
            <td>
              <code>password-manager</code>
            </td>
            <td>Password Manager</td>
            <td>Yes</td>
            <td>700 x 520</td>
          </tr>
        </tbody>
      </table>

      {/* ── FILE EXPLORER ── */}
      <h2>File Explorer</h2>
      <p>
        Browses the real machine filesystem via the /api/fs/list endpoint.
        Features sidebar favorites, breadcrumb navigation, grid and list views,
        file size display, and inline preview for text files. Directories open
        in-place. Files dispatch to the appropriate viewer based on extension:
        media files open in the media player, code files open in the code
        editor, documents open in the document viewer, and everything else opens
        in the file viewer.
      </p>
      <h3>Features</h3>
      <ul>
        <li>
          <strong>Sidebar favorites</strong> -- Home, Desktop, Documents,
          Downloads, Pictures, Music, Videos, Projects
        </li>
        <li>
          <strong>Breadcrumb navigation</strong> -- Click any segment to jump
          back up the path
        </li>
        <li>
          <strong>Grid and list views</strong> -- Toggle between icon grid and
          detailed list with sizes and dates
        </li>
        <li>
          <strong>File type icons</strong> -- Distinct icons for folders,
          images, videos, code files, documents, archives
        </li>
        <li>
          <strong>Context-aware open</strong> -- Double-click routes to the best
          widget for each file type
        </li>
        <li>
          <strong>Path bar</strong> -- Editable path input for direct navigation
        </li>
      </ul>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>system.files.openExplorer(path?)</code>
            </td>
            <td>path: string (optional, defaults to home)</td>
            <td>Window reference</td>
          </tr>
          <tr>
            <td>
              <code>system.files.navigate(path)</code>
            </td>
            <td>path: string</td>
            <td>Window reference</td>
          </tr>
          <tr>
            <td>
              <code>system.files.list()</code>
            </td>
            <td>none</td>
            <td>String: comma-separated root folders</td>
          </tr>
          <tr>
            <td>
              <code>system.files.openFile(filePath)</code>
            </td>
            <td>filePath: string</td>
            <td>Routes to appropriate widget based on extension</td>
          </tr>
          <tr>
            <td>
              <code>system.files.read(path)</code>
            </td>
            <td>path: string</td>
            <td>String: file contents</td>
          </tr>
          <tr>
            <td>
              <code>system.files.write(path, content)</code>
            </td>
            <td>path: string, content: string</td>
            <td>String: confirmation with path</td>
          </tr>
          <tr>
            <td>
              <code>system.files.createFile(path, content?)</code>
            </td>
            <td>path: string, content: string (optional)</td>
            <td>String: confirmation</td>
          </tr>
          <tr>
            <td>
              <code>system.files.createFolder(path)</code>
            </td>
            <td>path: string</td>
            <td>String: confirmation</td>
          </tr>
          <tr>
            <td>
              <code>system.files.delete(path)</code>
            </td>
            <td>path: string</td>
            <td>String: confirmation</td>
          </tr>
          <tr>
            <td>
              <code>system.files.rename(from, to)</code>
            </td>
            <td>from: string, to: string</td>
            <td>String: confirmation</td>
          </tr>
        </tbody>
      </table>

      {/* ── TERMINAL ── */}
      <h2>Terminal</h2>
      <p>
        Full interactive shell powered by xterm.js and node-pty over WebSocket
        at /ws/terminal. Supports ANSI 256-color rendering, auto-fit to window
        size on resize, and web link detection. Each terminal window gets its
        own PTY process. Supports sending raw input, executing commands, and
        sending control sequences like Ctrl+C.
      </p>
      <h3>Features</h3>
      <ul>
        <li>
          <strong>Full PTY</strong> -- Real shell (bash/zsh) with job control,
          tab completion, history
        </li>
        <li>
          <strong>ANSI colors</strong> -- 256-color and truecolor support via
          xterm.js
        </li>
        <li>
          <strong>Auto-resize</strong> -- Terminal dimensions adapt when the
          window is resized
        </li>
        <li>
          <strong>Web links</strong> -- Clickable URLs detected in terminal
          output
        </li>
        <li>
          <strong>Multiple instances</strong> -- Each window spawns an
          independent shell
        </li>
      </ul>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>terminal.open()</code>
            </td>
            <td>none</td>
            <td>String: "Terminal opened"</td>
          </tr>
          <tr>
            <td>
              <code>terminal.exec(command)</code>
            </td>
            <td>command: string</td>
            <td>
              String: confirmation. Opens terminal if needed, sends command +
              newline.
            </td>
          </tr>
          <tr>
            <td>
              <code>terminal.runCommand(cmd)</code>
            </td>
            <td>cmd: string</td>
            <td>Opens terminal and suggests the command</td>
          </tr>
          <tr>
            <td>
              <code>terminal.sendInput(data)</code>
            </td>
            <td>data: string (raw bytes)</td>
            <td>String: "Input sent" or error if no active terminal</td>
          </tr>
          <tr>
            <td>
              <code>terminal.sendCtrlC()</code>
            </td>
            <td>none</td>
            <td>Sends interrupt signal (0x03) to active terminal</td>
          </tr>
        </tbody>
      </table>

      {/* ── BROWSER ── */}
      <h2>Browser</h2>
      <p>
        Embedded web browser using an iframe. Supports URL bar navigation with
        Enter to go, back/forward buttons, and can be opened to a specific URL.
        Google search builds a URL and navigates to it. Quick links panel for
        common sites.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>browser.open()</code>
            </td>
            <td>none</td>
            <td>Window reference</td>
          </tr>
          <tr>
            <td>
              <code>browser.openUrl(url)</code>
            </td>
            <td>url: string</td>
            <td>Window reference</td>
          </tr>
          <tr>
            <td>
              <code>browser.searchGoogle(query)</code>
            </td>
            <td>query: string</td>
            <td>Window reference (navigates to Google search)</td>
          </tr>
        </tbody>
      </table>

      {/* ── CODE EDITOR ── */}
      <h2>Code Editor</h2>
      <p>
        Project-based code editor with a file tree sidebar, tabbed file editing,
        syntax-aware display, and save/saveAll support. Can open entire projects
        or individual files. Supports getting and setting file content
        programmatically. File tree shows nested directories with
        expand/collapse.
      </p>
      <h3>Features</h3>
      <ul>
        <li>
          <strong>Project tree</strong> -- Recursive directory listing with
          expand/collapse, file type icons
        </li>
        <li>
          <strong>Tabbed editing</strong> -- Multiple files open as tabs with
          modified-state indicator
        </li>
        <li>
          <strong>Syntax display</strong> -- Language-specific highlighting
          based on file extension
        </li>
        <li>
          <strong>Save support</strong> -- Save individual files or all modified
          files at once
        </li>
        <li>
          <strong>Programmatic access</strong> -- Get/set file content from
          commands for AI-driven editing
        </li>
      </ul>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>code.open(projectPath?)</code>
            </td>
            <td>projectPath: string (optional)</td>
            <td>Window reference</td>
          </tr>
          <tr>
            <td>
              <code>code.openProject(path)</code>
            </td>
            <td>path: string</td>
            <td>Window reference with project name in title</td>
          </tr>
          <tr>
            <td>
              <code>code.openFile(filePath)</code>
            </td>
            <td>filePath: string</td>
            <td>String: confirmation or opens in existing editor</td>
          </tr>
          <tr>
            <td>
              <code>code.saveFile()</code>
            </td>
            <td>none</td>
            <td>String: confirmation or "No changes"</td>
          </tr>
          <tr>
            <td>
              <code>code.saveAll()</code>
            </td>
            <td>none</td>
            <td>String: confirmation</td>
          </tr>
          <tr>
            <td>
              <code>code.getContent(filePath)</code>
            </td>
            <td>filePath: string</td>
            <td>String: file content from editor buffer</td>
          </tr>
          <tr>
            <td>
              <code>code.setContent(filePath, content)</code>
            </td>
            <td>filePath: string, content: string</td>
            <td>String: confirmation</td>
          </tr>
          <tr>
            <td>
              <code>code.getActiveFile()</code>
            </td>
            <td>none</td>
            <td>String: path of the active file tab</td>
          </tr>
          <tr>
            <td>
              <code>code.getOpenFiles()</code>
            </td>
            <td>none</td>
            <td>Array of string: all open file paths</td>
          </tr>
          <tr>
            <td>
              <code>code.closeFile(filePath)</code>
            </td>
            <td>filePath: string</td>
            <td>String: confirmation</td>
          </tr>
        </tbody>
      </table>

      {/* ── DOCUMENT VIEWER ── */}
      <h2>Document Viewer</h2>
      <p>
        Opens and displays PDF, Word (.docx), Excel (.xlsx/.xls), CSV, and plain
        text files. Extracts text content for display and indexing. Supports
        in-document text search with match count and navigation. Documents are
        parsed server-side via the /api/docs endpoints using pdf-parse, mammoth,
        and xlsx libraries.
      </p>
      <h3>Features</h3>
      <ul>
        <li>
          <strong>Multi-format support</strong> -- PDF, .docx, .xlsx, .xls,
          .csv, and all plain text formats
        </li>
        <li>
          <strong>Text extraction</strong> -- Full text extracted for display,
          search, and AI consumption
        </li>
        <li>
          <strong>In-document search</strong> -- Find text within the loaded
          document with match count
        </li>
        <li>
          <strong>Auto-indexing</strong> -- Opened documents are automatically
          added to the search index
        </li>
        <li>
          <strong>Excel rendering</strong> -- Spreadsheets displayed as
          formatted tables with sheet selection
        </li>
      </ul>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>document.open(filePath?)</code>
            </td>
            <td>filePath: string (optional)</td>
            <td>Opens document viewer, loads file if specified</td>
          </tr>
          <tr>
            <td>
              <code>document.create(path, content?)</code>
            </td>
            <td>path: string, content: string (optional)</td>
            <td>Creates file, opens in viewer</td>
          </tr>
          <tr>
            <td>
              <code>document.find(needle, filePath?)</code>
            </td>
            <td>needle: string, filePath: string (optional)</td>
            <td>String: match count in active viewer or specific file</td>
          </tr>
          <tr>
            <td>
              <code>document.search(query)</code>
            </td>
            <td>query: string</td>
            <td>String: ranked results with names, scores, snippets</td>
          </tr>
          <tr>
            <td>
              <code>document.index(path)</code>
            </td>
            <td>path: string (file or directory)</td>
            <td>String: indexed count and total</td>
          </tr>
          <tr>
            <td>
              <code>document.list()</code>
            </td>
            <td>none</td>
            <td>String: all indexed documents with word counts</td>
          </tr>
          <tr>
            <td>
              <code>document.getContent(filePath?)</code>
            </td>
            <td>filePath: string (optional)</td>
            <td>String: extracted text from active viewer or index</td>
          </tr>
          <tr>
            <td>
              <code>document.matchText(pattern)</code>
            </td>
            <td>pattern: string</td>
            <td>
              String: matches across indexed documents with scores and snippets
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Supported formats:</strong> .pdf, .docx, .xlsx, .xls, .csv,
        .txt, .md, .json, .xml, .html, .log, .yml, .yaml, .ini, .cfg, .conf
      </p>

      {/* ── MEDIA PLAYER ── */}
      <h2>Media Player</h2>
      <p>
        HTML5 video and audio player. Files are streamed via /api/fs/media with
        HTTP range request support for seeking. Supports play/pause, progress
        bar, volume control, and skip forward/back.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>system.media.open()</code>
            </td>
            <td>none</td>
            <td>Window reference</td>
          </tr>
          <tr>
            <td>
              <code>system.media.playVideo(src)</code>
            </td>
            <td>src: string (URL or file path)</td>
            <td>Window reference</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>Supported video:</strong> mp4, mov, webm, avi, mkv.{" "}
        <strong>Supported audio:</strong> mp3, wav, ogg, flac, aac.
      </p>

      {/* ── FILE VIEWER ── */}
      <h2>File Viewer</h2>
      <p>
        Read-only text file viewer. Opens files via /api/fs/read. Used as the
        default handler for text-based files from the file explorer when the
        code editor or document viewer are not appropriate.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>viewer.openFile(filePath)</code>
            </td>
            <td>filePath: string</td>
            <td>Window reference with file name as title</td>
          </tr>
        </tbody>
      </table>

      {/* ── WEATHER ── */}
      <h2>Weather</h2>
      <p>
        Displays current weather conditions and 7-day forecast with temperature,
        humidity, wind speed, visibility, and pressure. Supports "current" and
        "weekly" display modes. Location-based weather data.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>widgets.weather.getCurrent()</code>
            </td>
            <td>none</td>
            <td>Window reference (current mode)</td>
          </tr>
          <tr>
            <td>
              <code>widgets.weather.getWeekly()</code>
            </td>
            <td>none</td>
            <td>Window reference (weekly mode)</td>
          </tr>
        </tbody>
      </table>

      {/* ── WEB SEARCH ── */}
      <h2>Web Search</h2>
      <p>
        Searches the web using the Brave Search API. Queries are proxied through
        /api/brave-search to avoid CORS issues. Results display titles, URLs,
        and descriptions. Requires a Brave Search API key in environment
        variables (BRAVE_API_KEY).
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>web.search(query)</code>
            </td>
            <td>query: string</td>
            <td>Window reference with search results</td>
          </tr>
        </tbody>
      </table>

      {/* ── MAPS ── */}
      <h2>Maps</h2>
      <p>Embedded maps widget for location browsing and navigation.</p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>maps.open()</code>
            </td>
            <td>none</td>
            <td>Window reference</td>
          </tr>
        </tbody>
      </table>

      {/* ── NOTES ── */}
      <h2>Notes</h2>
      <p>
        Note-taking application with a sidebar list, title editor, and text
        body. Notes persist in localStorage across sessions. Supports creating
        new notes and listing existing ones.
      </p>
      <h3>Features</h3>
      <ul>
        <li>
          <strong>Sidebar list</strong> -- All notes listed with titles and
          timestamps
        </li>
        <li>
          <strong>Rich editing</strong> -- Title and body text fields with
          auto-save
        </li>
        <li>
          <strong>Persistence</strong> -- Saved to localStorage, survives page
          refresh
        </li>
        <li>
          <strong>Create and delete</strong> -- Add new notes, remove old ones
        </li>
      </ul>

      {/* ── CALCULATOR ── */}
      <h2>Calculator</h2>
      <p>
        Full calculator with arithmetic operations, expression display,
        backspace, percentage, and sign toggle. Can be opened with a pre-loaded
        expression for immediate evaluation.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>widgets.calculator.open()</code>
            </td>
            <td>none</td>
            <td>Window reference</td>
          </tr>
          <tr>
            <td>
              <code>widgets.calculator.calculate(expr)</code>
            </td>
            <td>expr: string (e.g. "2*21")</td>
            <td>Window reference with expression loaded</td>
          </tr>
        </tbody>
      </table>

      {/* ── CLOCK ── */}
      <h2>Clock and System Info</h2>
      <p>
        Analog and digital clock display with simulated system information
        including CPU usage, memory, and network status.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>system.info.clock()</code>
            </td>
            <td>none</td>
            <td>Window reference</td>
          </tr>
        </tbody>
      </table>

      {/* ── ACTIVITY LOG ── */}
      <h2>Activity Log</h2>
      <p>
        Displays the command execution history. Listens to the EventBus for
        command:executed and command:error events. Shows timestamps, command
        paths, source badges (Human vs AI vs Workflow vs Scheduler), arguments,
        and results. Supports filtering by source type.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>system.activity.open()</code>
            </td>
            <td>none</td>
            <td>Window reference</td>
          </tr>
        </tbody>
      </table>

      {/* ── SETTINGS ── */}
      <h2>Settings</h2>
      <p>
        Appearance configuration: theme toggle (dark/light), wallpaper selection
        from gradient presets (gradient-dusk, gradient-ocean, gradient-aurora,
        gradient-sunset, gradient-forest, and light variants), and custom
        wallpaper upload via image file.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>system.settings.open()</code>
            </td>
            <td>none</td>
            <td>Window reference</td>
          </tr>
          <tr>
            <td>
              <code>system.settings.toggleTheme()</code>
            </td>
            <td>none</td>
            <td>String: "Theme changed to dark/light"</td>
          </tr>
        </tbody>
      </table>

      {/* ── TASK MANAGER ── */}
      <h2>Task Manager</h2>
      <p>
        Visual task management widget with list view, priority badges
        (color-coded), due date display, status toggles (todo / in-progress /
        done), and inline task creation form. Displays overdue indicators. See
        the Scheduler and Tasks page for full command reference.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>taskManager.open()</code>
            </td>
            <td>none</td>
            <td>String: "Task Manager opened"</td>
          </tr>
        </tbody>
      </table>

      {/* ── CALENDAR ── */}
      <h2>Calendar</h2>
      <p>
        Calendar widget showing month view with task and event indicators on
        each date. Click a date to see all items for that day. Navigation
        between months.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>calendar.open()</code>
            </td>
            <td>none</td>
            <td>String: "Calendar opened"</td>
          </tr>
          <tr>
            <td>
              <code>calendar.today()</code>
            </td>
            <td>none</td>
            <td>String: today's events and tasks</td>
          </tr>
        </tbody>
      </table>

      {/* ── WORKFLOW BUILDER ── */}
      <h2>Workflow Builder</h2>
      <p>
        Visual node-based workflow automation tool. Build pipelines with
        triggers, commands, conditions, delays, and outputs. Canvas with zoom,
        node connections, execution visualization, and log panel. See the
        dedicated Workflow Builder page for comprehensive documentation.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>workflow.open()</code>
            </td>
            <td>none</td>
            <td>String: "Workflow Builder opened"</td>
          </tr>
          <tr>
            <td>
              <code>workflow.create(name?)</code>
            </td>
            <td>name: string (optional)</td>
            <td>String: confirmation with ID</td>
          </tr>
          <tr>
            <td>
              <code>workflow.run(idOrName)</code>
            </td>
            <td>idOrName: string</td>
            <td>String: completion status or error</td>
          </tr>
          <tr>
            <td>
              <code>workflow.list()</code>
            </td>
            <td>none</td>
            <td>String: all workflows with enabled status</td>
          </tr>
        </tbody>
      </table>

      {/* ── PASSWORD MANAGER ── */}
      <h2>Password Manager</h2>
      <p>
        Encrypted password vault with master key protection. See the dedicated
        Password Manager page for full documentation and all commands.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>password.open()</code>
            </td>
            <td>none</td>
            <td>String: "Password Manager opened"</td>
          </tr>
        </tbody>
      </table>

      {/* ── DOCUMENTATION ── */}
      <h2>Documentation (this widget)</h2>
      <p>
        In-app documentation browser. Contains all system docs organized by
        topic. Can be opened to a specific page via the page argument.
      </p>
      <h3>Commands</h3>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Args</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>system.docs.open(page?)</code>
            </td>
            <td>
              page: string (optional, e.g. "commands", "workflows", "api")
            </td>
            <td>Window reference</td>
          </tr>
          <tr>
            <td>
              <code>system.docs.commands()</code>
            </td>
            <td>none</td>
            <td>Opens docs at command reference page</td>
          </tr>
          <tr>
            <td>
              <code>system.docs.architecture()</code>
            </td>
            <td>none</td>
            <td>Opens docs at architecture page</td>
          </tr>
          <tr>
            <td>
              <code>help()</code>
            </td>
            <td>none</td>
            <td>Opens docs at command reference page</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
   COMMAND REFERENCE
   ================================================================ */
function CommandReferencePage() {
  const sections = [
    {
      ns: "system.files",
      title: "Filesystem",
      cmds: [
        {
          cmd: "system.files.openExplorer(path?)",
          desc: "Open file explorer at optional path",
        },
        {
          cmd: "system.files.navigate(path)",
          desc: "Navigate to path in explorer",
        },
        {
          cmd: "system.files.list()",
          desc: "List root folders (Documents, Downloads, etc.)",
        },
        {
          cmd: "system.files.openFile(filePath)",
          desc: "Open file in appropriate widget by extension",
        },
        {
          cmd: "system.files.read(path)",
          desc: "Read file contents as text string",
        },
        {
          cmd: "system.files.write(path, content)",
          desc: "Write string content to a file",
        },
        {
          cmd: "system.files.createFile(path, content?)",
          desc: "Create a new file with optional content",
        },
        {
          cmd: "system.files.createFolder(path)",
          desc: "Create a new directory",
        },
        {
          cmd: "system.files.delete(path)",
          desc: "Delete a file or directory",
        },
        {
          cmd: "system.files.rename(from, to)",
          desc: "Rename or move a file/directory",
        },
      ],
    },
    {
      ns: "terminal",
      title: "Terminal",
      cmds: [
        { cmd: "terminal.open()", desc: "Open a new terminal window" },
        {
          cmd: "terminal.exec(command)",
          desc: "Execute a shell command. Opens terminal if needed.",
        },
        {
          cmd: "terminal.runCommand(cmd)",
          desc: "Open terminal and suggest a command",
        },
        {
          cmd: "terminal.sendInput(data)",
          desc: "Send raw input bytes to active terminal",
        },
        {
          cmd: "terminal.sendCtrlC()",
          desc: "Send Ctrl+C interrupt to active terminal",
        },
      ],
    },
    {
      ns: "browser",
      title: "Browser",
      cmds: [
        { cmd: "browser.open()", desc: "Open a blank browser window" },
        { cmd: "browser.openUrl(url)", desc: "Open a specific URL" },
        {
          cmd: "browser.searchGoogle(query)",
          desc: "Search Google and display results",
        },
      ],
    },
    {
      ns: "code",
      title: "Code Editor",
      cmds: [
        {
          cmd: "code.open(projectPath?)",
          desc: "Open the code editor, optionally at a project",
        },
        {
          cmd: "code.openProject(path)",
          desc: "Open a project with path as window title",
        },
        {
          cmd: "code.openFile(filePath)",
          desc: "Open a file in the code editor",
        },
        { cmd: "code.saveFile()", desc: "Save the active file" },
        { cmd: "code.saveAll()", desc: "Save all modified files" },
        {
          cmd: "code.getContent(filePath)",
          desc: "Get content of a file from the editor buffer",
        },
        {
          cmd: "code.setContent(filePath, content)",
          desc: "Set content of a file in the editor",
        },
        {
          cmd: "code.getActiveFile()",
          desc: "Get the path of the currently active tab",
        },
        {
          cmd: "code.getOpenFiles()",
          desc: "List all open file paths as array",
        },
        { cmd: "code.closeFile(filePath)", desc: "Close a file tab" },
      ],
    },
    {
      ns: "document",
      title: "Documents",
      cmds: [
        {
          cmd: "document.open(filePath?)",
          desc: "Open document viewer, optionally load a file",
        },
        {
          cmd: "document.create(path, content?)",
          desc: "Create a document and open it",
        },
        {
          cmd: "document.find(needle, filePath?)",
          desc: "Find text in active viewer or specific file",
        },
        {
          cmd: "document.search(query)",
          desc: "Full-text search across all indexed documents",
        },
        {
          cmd: "document.index(path)",
          desc: "Index a file or directory for search",
        },
        {
          cmd: "document.list()",
          desc: "List all indexed documents with word counts",
        },
        {
          cmd: "document.getContent(filePath?)",
          desc: "Get text content from active viewer or index",
        },
        {
          cmd: "document.matchText(pattern)",
          desc: "Pattern match across all indexed documents",
        },
      ],
    },
    {
      ns: "search",
      title: "Universal Search",
      cmds: [
        {
          cmd: "search.all(query)",
          desc: "Search across commands, windows, files, and documents",
        },
        {
          cmd: "search.commands(query)",
          desc: "Search registered commands by path or description",
        },
        {
          cmd: "search.documents(query)",
          desc: "Search indexed document contents",
        },
      ],
    },
    {
      ns: "context",
      title: "Context Engine (for AI)",
      cmds: [
        {
          cmd: "context.summary()",
          desc: "Full text summary of OS state (windows, docs, files, index)",
        },
        { cmd: "context.full()", desc: "Full OS context as JSON object" },
        { cmd: "context.recentFiles()", desc: "List recently accessed files" },
        {
          cmd: "context.openDocuments()",
          desc: "List documents currently open in viewer",
        },
        {
          cmd: "context.indexStats()",
          desc: "Document index statistics (count, tokens)",
        },
      ],
    },
    {
      ns: "system.windows",
      title: "Window Management",
      cmds: [
        {
          cmd: "system.windows.list()",
          desc: "JSON of all open windows with IDs, types, commands",
        },
        {
          cmd: "system.windows.summary()",
          desc: "Human-readable summary of screen state",
        },
        {
          cmd: "system.windows.focus(windowId)",
          desc: "Focus a specific window",
        },
        {
          cmd: "system.windows.close(windowId)",
          desc: "Close a specific window",
        },
        { cmd: "system.windows.minimize(windowId)", desc: "Minimize a window" },
        {
          cmd: "system.windows.maximize(windowId)",
          desc: "Maximize or restore a window",
        },
        {
          cmd: "system.windows.getFocused()",
          desc: "Get info about the focused window (JSON)",
        },
        {
          cmd: "system.windows.getCommands(windowId)",
          desc: "Get commands for a specific window (JSON)",
        },
        {
          cmd: "system.windows.availableCommands()",
          desc: "List all commands from active widgets",
        },
        {
          cmd: "system.windows.isOpen(widgetType)",
          desc: "Check if a widget type is currently open",
        },
        { cmd: "system.windows.closeAll()", desc: "Close all open windows" },
      ],
    },
    {
      ns: "task",
      title: "Tasks",
      cmds: [
        {
          cmd: "task.add(title, dueDate?, dueTime?, priority?)",
          desc: "Create a task. Priority: low, medium, high.",
        },
        {
          cmd: "task.list(status?)",
          desc: "List tasks, filter by: todo, in-progress, done",
        },
        { cmd: "task.complete(id)", desc: "Mark task as done" },
        { cmd: "task.delete(id)", desc: "Delete a task" },
        { cmd: "task.overdue()", desc: "List all overdue tasks" },
        {
          cmd: "task.upcoming(days?)",
          desc: "Tasks due in next N days (default 7)",
        },
        {
          cmd: "task.stats()",
          desc: "Statistics: total, todo, in-progress, done, overdue",
        },
      ],
    },
    {
      ns: "event",
      title: "Calendar Events",
      cmds: [
        {
          cmd: "event.add(title, date, startTime?, endTime?)",
          desc: "Add calendar event",
        },
        {
          cmd: "event.list(date?)",
          desc: "List events, optionally filter by date",
        },
        { cmd: "event.delete(id)", desc: "Delete a calendar event" },
        { cmd: "calendar.open()", desc: "Open the calendar widget" },
        { cmd: "calendar.today()", desc: "Show today's events and tasks" },
      ],
    },
    {
      ns: "schedule",
      title: "Scheduled Jobs",
      cmds: [
        {
          cmd: "schedule.add(name, command, interval, unit, at?)",
          desc: "Create a cron-like job. Units: seconds, minutes, hours, days.",
        },
        {
          cmd: "schedule.list()",
          desc: "List all jobs with status, schedule, run count",
        },
        { cmd: "schedule.delete(id)", desc: "Delete a scheduled job" },
        { cmd: "schedule.toggle(id)", desc: "Enable or disable a job" },
        {
          cmd: "schedule.status()",
          desc: "Scheduler engine status: running, job counts, tick interval",
        },
      ],
    },
    {
      ns: "workflow",
      title: "Workflows",
      cmds: [
        { cmd: "workflow.open()", desc: "Open the workflow builder" },
        {
          cmd: "workflow.create(name?)",
          desc: "Create a new workflow and open builder",
        },
        {
          cmd: "workflow.run(idOrName)",
          desc: "Execute a workflow by ID or name",
        },
        {
          cmd: "workflow.list()",
          desc: "List all workflows with enabled status and triggers",
        },
        {
          cmd: "workflow.get(idOrName)",
          desc: "Get workflow details: nodes, connections, status",
        },
        {
          cmd: "workflow.enable(idOrName)",
          desc: "Activate -- registers event triggers",
        },
        {
          cmd: "workflow.disable(idOrName)",
          desc: "Deactivate -- unregisters triggers",
        },
        { cmd: "workflow.delete(id)", desc: "Delete a workflow permanently" },
        { cmd: "workflow.duplicate(id)", desc: "Clone a workflow" },
        { cmd: "workflow.abort(id)", desc: "Stop a running workflow" },
        { cmd: "workflow.test()", desc: "Run 10 built-in test workflows" },
      ],
    },
    {
      ns: "password",
      title: "Password Manager",
      cmds: [
        { cmd: "password.open()", desc: "Open the password manager" },
        {
          cmd: "password.add(title, username?, password?, url?, category?)",
          desc: "Add entry. Auto-generates password if omitted.",
        },
        {
          cmd: "password.get(titleOrId)",
          desc: "Get entry with decrypted password",
        },
        {
          cmd: "password.list(category?)",
          desc: "List entries, optionally by category",
        },
        {
          cmd: "password.search(query)",
          desc: "Search by title, username, or URL",
        },
        { cmd: "password.delete(id)", desc: "Delete an entry" },
        {
          cmd: "password.generate(length?)",
          desc: "Generate random password, copy to clipboard",
        },
        { cmd: "password.lock()", desc: "Lock the vault" },
        { cmd: "password.categories()", desc: "List all categories" },
      ],
    },
    {
      ns: "run",
      title: "Command Run Tracking",
      cmds: [
        {
          cmd: "run.get(runId)",
          desc: "Full details of a command run: status, output, timing, chain",
        },
        { cmd: "run.output(runId)", desc: "Get just the output of a run" },
        {
          cmd: "run.await(runId)",
          desc: "Wait for a run to complete, return result",
        },
        {
          cmd: "run.list(limit?)",
          desc: "List recent runs with status and output summary",
        },
        { cmd: "run.chain(chainId)", desc: "Inspect all runs in a pipe chain" },
        {
          cmd: "run.stats()",
          desc: "Execution statistics: total, resolved, rejected, running",
        },
        {
          cmd: "run.search(query)",
          desc: "Search runs by command path or output content",
        },
        { cmd: "run.running()", desc: "List commands currently in progress" },
        { cmd: "run.failed()", desc: "List recently failed runs with errors" },
      ],
    },
    {
      ns: "system",
      title: "System Utilities",
      cmds: [
        { cmd: "system.notify(message)", desc: "Send a toast notification" },
        { cmd: "system.screenshot()", desc: "Take a screenshot (simulated)" },
        {
          cmd: "system.setReminder(text)",
          desc: "Set a reminder notification",
        },
        { cmd: "system.info.clock()", desc: "Open clock and system info" },
        { cmd: "system.activity.open()", desc: "Open the activity log" },
        { cmd: "system.settings.open()", desc: "Open settings" },
        {
          cmd: "system.settings.toggleTheme()",
          desc: "Toggle dark/light theme",
        },
        {
          cmd: "system.docs.open(page?)",
          desc: "Open documentation at optional page",
        },
        {
          cmd: "system.docs.commands()",
          desc: "Open docs at command reference",
        },
        {
          cmd: "system.docs.architecture()",
          desc: "Open docs at architecture page",
        },
        { cmd: "system.media.open()", desc: "Open media player" },
        {
          cmd: "system.media.playVideo(src)",
          desc: "Play a video file or URL",
        },
        { cmd: "web.search(query)", desc: "Search the web (Brave Search)" },
        { cmd: "maps.open()", desc: "Open maps" },
        {
          cmd: "viewer.openFile(filePath)",
          desc: "Open file in read-only viewer",
        },
        { cmd: "taskManager.open()", desc: "Open task manager widget" },
        { cmd: "help()", desc: "Open command reference documentation" },
      ],
    },
  ];

  return (
    <div className="docs-page">
      <h1>Command Reference</h1>
      <p>
        Complete reference of every registered command in OniOS. All commands
        use dot-notation and can be executed from the command bar, by AI agents,
        by workflows, or by the scheduler. Arguments with <code>?</code> suffix
        are optional.
      </p>
      <div className="docs-callout tip">
        <span className="docs-callout-icon">TIP</span>
        <div>
          Every command execution is tracked with a unique run ID. Use{" "}
          <code>run.list()</code> to see recent executions, or{" "}
          <code>run.get("run_xxx")</code> to inspect a specific run's output,
          timing, and status.
        </div>
      </div>
      {sections.map((s, i) => (
        <div key={i}>
          <h2>
            {s.title} <span className="docs-badge namespace">{s.ns}.*</span>
          </h2>
          <table className="docs-cmd-table">
            <thead>
              <tr>
                <th>Command</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {s.cmds.map((c, j) => (
                <tr key={j}>
                  <td>
                    <code>{c.cmd}</code>
                  </td>
                  <td>{c.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/* ================================================================
   WORKFLOW BUILDER
   ================================================================ */
function WorkflowsPage() {
  return (
    <div className="docs-page">
      <h1>Workflow Builder</h1>
      <p>
        The Workflow Builder lets you create automated pipelines by connecting
        visual nodes on a canvas. Chain commands, add conditions, set delays,
        and produce outputs -- all without writing code.
      </p>

      <h2>Node Types</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Node</th>
            <th>Color</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>Trigger</code>
            </td>
            <td>Green</td>
            <td>
              Entry point -- manual run, event listener, or scheduled interval
            </td>
          </tr>
          <tr>
            <td>
              <code>Command</code>
            </td>
            <td>Blue</td>
            <td>
              Execute any OniOS command. Select from searchable dropdown with
              output type hints.
            </td>
          </tr>
          <tr>
            <td>
              <code>Condition</code>
            </td>
            <td>Yellow</td>
            <td>
              Branch TRUE or FALSE based on field comparison with deep path
              support.
            </td>
          </tr>
          <tr>
            <td>
              <code>Delay</code>
            </td>
            <td>Purple</td>
            <td>
              Wait N seconds before continuing. Data passes through unchanged.
            </td>
          </tr>
          <tr>
            <td>
              <code>Output</code>
            </td>
            <td>Pink</td>
            <td>Terminal node. Log the result or send a toast notification.</td>
          </tr>
        </tbody>
      </table>

      <h2>Building a Workflow</h2>
      <ol>
        <li>
          <strong>Create</strong> -- Click the + button in the sidebar to create
          a new workflow.
        </li>
        <li>
          <strong>Add nodes</strong> -- Double-click the canvas or click "Add
          Node" in the toolbar.
        </li>
        <li>
          <strong>Connect</strong> -- Click an output port (right circle), then
          click an input port (left circle).
        </li>
        <li>
          <strong>Configure</strong> -- Click a node to open its config panel on
          the right side.
        </li>
        <li>
          <strong>Run</strong> -- Click the green Run button. Nodes light up in
          sequence as they execute.
        </li>
      </ol>

      <h2>Trigger Types</h2>
      <h3>Manual</h3>
      <p>
        Click Run to execute. The trigger outputs a metadata object with a
        timestamp.
      </p>
      <h3>Event</h3>
      <p>
        Auto-fires when a system event occurs. Events are searchable and grouped
        by category (Tasks, Calendar, Scheduler, Commands, System). When an
        event fires, its payload becomes the trigger output.
      </p>
      <div className="docs-code-block">
        {`Known event categories:
  Tasks:     task:created, task:completed, task:deleted, task:updated
  Calendar:  calendar:event:created, calendar:event:deleted
  Scheduler: scheduler:job:executed, scheduler:notification
  Commands:  command:executed, command:error
  System:    window:opened, window:closed, theme:changed`}
      </div>
      <h3>Scheduled (Cron)</h3>
      <p>
        Run every N seconds/minutes/hours/days. Useful for periodic checks and
        reports.
      </p>

      <h2>Command Node</h2>
      <p>
        Select any registered OniOS command from the searchable dropdown. Each
        command shows its expected output type (string, object, array) based on
        the CommandOutputSchemas registry. After selecting, you see a hint box
        showing the expected output type, description, and example.
      </p>
      <div className="docs-callout info">
        <span className="docs-callout-icon">NOTE</span>
        <div>
          Use <code>{"{{input}}"}</code> in the command string to inject the
          previous node output as an argument. Example:{" "}
          <code>{'system.notify("{{input}}")'}</code>
        </div>
      </div>

      <h2>Condition Node -- Deep Path Access</h2>
      <p>
        Compare a field from the upstream output using operators: equals (=),
        not equals, contains, not contains, greater than, less than, exists, is
        empty.
      </p>
      <p>
        <strong>Deep paths:</strong> Use dot notation to drill into nested
        objects. Click the browse button to see all available paths with type
        icons and value previews.
      </p>
      <div className="docs-code-block">
        {`Field: priority          checks input.priority
Field: data.user.name   checks input.data.user.name
Field: items[0].status   checks input.items[0].status
Field: items.length      checks array length
Field: (empty)           checks the entire input value`}
      </div>
      <p>
        Path suggestions come from two sources: runtime data (after a workflow
        has been executed at least once, showing actual field values) and schema
        data (predicted output shapes from CommandOutputSchemas, shown with a
        "schema" badge even before the first run).
      </p>
      <p>
        The condition routes to TRUE or FALSE branches. The original input data
        passes through unchanged to both branches -- only the routing differs.
      </p>

      <h2>Output Node</h2>
      <p>Two actions available:</p>
      <ul>
        <li>
          <strong>Log</strong> -- Returns a structured result object with
          action, message, timestamp, and raw input.
        </li>
        <li>
          <strong>Notify</strong> -- Sends a toast notification to the UI and
          returns the same structured result.
        </li>
      </ul>
      <p>
        Use <code>{"{{input}}"}</code> in the message template to include
        upstream data in the notification text.
      </p>

      <h2>Enable and Disable Workflows</h2>
      <p>
        Each workflow has an Active / Paused toggle in the toolbar and sidebar.
        Only active workflows register their event triggers on the kernel.
      </p>
      <ul>
        <li>
          <strong>Active (green dot)</strong> -- Event triggers are listening,
          cron schedules are running.
        </li>
        <li>
          <strong>Paused (gray dot)</strong> -- Workflow exists but will not
          auto-fire.
        </li>
      </ul>

      <h2>Execution Logs</h2>
      <p>Click the Logs tab to see real-time execution details:</p>
      <ul>
        <li>
          Timestamped entries with color-coded levels (info, success, warn,
          error)
        </li>
        <li>Input and output data for each node</li>
        <li>Execution timing and error details</li>
        <li>Auto-scrolls to the latest entry</li>
      </ul>

      <h2>Canvas Controls</h2>
      <ul>
        <li>
          <strong>Zoom</strong> -- Ctrl/Cmd + scroll wheel, or +/- buttons in
          toolbar (30% to 200%)
        </li>
        <li>
          <strong>Pan</strong> -- Scroll normally on the canvas
        </li>
        <li>
          <strong>Delete connection</strong> -- Hover a connection line, click
          to remove
        </li>
      </ul>

      <h2>Data Flow</h2>
      <div className="docs-code-block">
        {`Trigger (produces event payload or manual metadata)
  -> Command (executes, returns command output)
    -> Condition (checks field, routes to TRUE or FALSE branch)
      -> TRUE:  Output (sends notification with result)
      -> FALSE: Delay -> Output (logs result after waiting)

Each node receives the previous node output as its input.
Condition nodes pass the ORIGINAL input through to both branches.
Delay nodes pass input through unchanged after waiting.`}
      </div>

      <h2>All Workflow Commands</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>workflow.open()</code>
            </td>
            <td>Open the workflow builder widget</td>
          </tr>
          <tr>
            <td>
              <code>workflow.create(name?)</code>
            </td>
            <td>Create a new workflow and open the builder</td>
          </tr>
          <tr>
            <td>
              <code>workflow.run(idOrName)</code>
            </td>
            <td>Execute a workflow by ID or name</td>
          </tr>
          <tr>
            <td>
              <code>workflow.list()</code>
            </td>
            <td>List all workflows with enabled status and event triggers</td>
          </tr>
          <tr>
            <td>
              <code>workflow.get(idOrName)</code>
            </td>
            <td>Get workflow details: nodes, connections, last run status</td>
          </tr>
          <tr>
            <td>
              <code>workflow.enable(idOrName)</code>
            </td>
            <td>Activate a workflow (registers event triggers)</td>
          </tr>
          <tr>
            <td>
              <code>workflow.disable(idOrName)</code>
            </td>
            <td>Deactivate a workflow (unregisters triggers)</td>
          </tr>
          <tr>
            <td>
              <code>workflow.delete(id)</code>
            </td>
            <td>Delete a workflow permanently</td>
          </tr>
          <tr>
            <td>
              <code>workflow.duplicate(id)</code>
            </td>
            <td>Clone a workflow</td>
          </tr>
          <tr>
            <td>
              <code>workflow.abort(id)</code>
            </td>
            <td>Stop a running workflow mid-execution</td>
          </tr>
          <tr>
            <td>
              <code>workflow.test()</code>
            </td>
            <td>Run 10 built-in test workflows covering all node types</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
   SCHEDULER & TASKS
   ================================================================ */
function SchedulerPage() {
  return (
    <div className="docs-page">
      <h1>Scheduler, Tasks, and Calendar</h1>
      <p>
        OniOS includes a task manager, calendar, and cron-like scheduler engine.
        Tasks and events are stored in taskStore (persisted to localStorage) and
        synced with the server via the schedulerPlugin.
      </p>

      <h2>Task Manager</h2>
      <p>
        Each task has: title, description, priority (low/medium/high), status
        (todo/in-progress/done), due date, due time, and completion state. Tasks
        emit events on the EventBus when created, completed, deleted, or
        updated.
      </p>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>task.add(title, dueDate?, dueTime?, priority?)</code>
            </td>
            <td>
              Create a task. Date format: "2025-03-01". Time: "14:00". Priority:
              "low", "medium", "high".
            </td>
          </tr>
          <tr>
            <td>
              <code>task.list(status?)</code>
            </td>
            <td>List tasks. Filter by: "todo", "in-progress", "done".</td>
          </tr>
          <tr>
            <td>
              <code>task.complete(id)</code>
            </td>
            <td>Mark task as done by its ID.</td>
          </tr>
          <tr>
            <td>
              <code>task.delete(id)</code>
            </td>
            <td>Delete a task by its ID.</td>
          </tr>
          <tr>
            <td>
              <code>task.overdue()</code>
            </td>
            <td>List all tasks past their due date.</td>
          </tr>
          <tr>
            <td>
              <code>task.upcoming(days?)</code>
            </td>
            <td>Tasks due in the next N days (default: 7).</td>
          </tr>
          <tr>
            <td>
              <code>task.stats()</code>
            </td>
            <td>Statistics: total, todo, in-progress, done, overdue counts.</td>
          </tr>
          <tr>
            <td>
              <code>taskManager.open()</code>
            </td>
            <td>Open the Task Manager widget.</td>
          </tr>
        </tbody>
      </table>

      <h2>Calendar Events</h2>
      <p>
        Date-based events with optional start and end times. Events appear on
        the calendar widget and can be listed by date.
      </p>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>event.add(title, date, startTime?, endTime?)</code>
            </td>
            <td>
              Add a calendar event. Date: "2025-03-01". Times: "14:00", "15:00".
            </td>
          </tr>
          <tr>
            <td>
              <code>event.list(date?)</code>
            </td>
            <td>List events, optionally filtered by date.</td>
          </tr>
          <tr>
            <td>
              <code>event.delete(id)</code>
            </td>
            <td>Delete an event by ID.</td>
          </tr>
          <tr>
            <td>
              <code>calendar.open()</code>
            </td>
            <td>Open the calendar widget.</td>
          </tr>
          <tr>
            <td>
              <code>calendar.today()</code>
            </td>
            <td>Show today's events and tasks.</td>
          </tr>
        </tbody>
      </table>

      <h2>Scheduled Jobs (Cron-like)</h2>
      <p>
        Create recurring jobs that automatically execute OniOS commands at
        intervals. Jobs have a name, command, schedule (interval + unit), and
        enabled state. The scheduler engine runs a 15-second tick loop that
        checks each enabled job and fires it when its interval has elapsed.
      </p>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>schedule.add(name, command, interval, unit, at?)</code>
            </td>
            <td>
              Create a job. Units: "seconds", "minutes", "hours", "days".
              Optional "at" for time-of-day.
            </td>
          </tr>
          <tr>
            <td>
              <code>schedule.list()</code>
            </td>
            <td>List all jobs: status, schedule, run count, ID.</td>
          </tr>
          <tr>
            <td>
              <code>schedule.delete(id)</code>
            </td>
            <td>Delete a scheduled job.</td>
          </tr>
          <tr>
            <td>
              <code>schedule.toggle(id)</code>
            </td>
            <td>Enable or disable a job.</td>
          </tr>
          <tr>
            <td>
              <code>schedule.status()</code>
            </td>
            <td>Engine status: running, enabled job count, tick interval.</td>
          </tr>
        </tbody>
      </table>
      <div className="docs-code-block">
        {`Example: Run a backup command every 6 hours
  schedule.add("Backup", "terminal.exec(\\"tar -czf ~/backup.tar.gz ~/Documents\\")", 6, "hours")

Example: Check overdue tasks every 30 minutes
  schedule.add("Overdue Check", "task.overdue()", 30, "minutes")`}
      </div>

      <h2>Event System</h2>
      <p>
        Tasks, calendar events, and the scheduler emit events on the EventBus.
        Workflows can listen to these events via event triggers.
      </p>
      <div className="docs-code-block">
        {`task:created       { id, title, priority, status, dueDate, dueTime }
task:completed     { id, title }
task:deleted       { id, title }
task:updated       { id, changes }
calendar:event:created   { id, title, date, startTime, endTime }
calendar:event:deleted   { id }
scheduler:job:executed   { jobId, name, command, result }
scheduler:notification   { message, type }`}
      </div>

      <h2>Server Sync</h2>
      <p>
        The schedulerPlugin exposes <code>/api/state</code> for bidirectional
        state sync. The client polls every 10 seconds to pull server-side state
        (tasks, events, jobs) and push local changes. The server also runs its
        own 15-second scheduler tick for jobs that should fire even when no
        browser tab is open.
      </p>
    </div>
  );
}

/* ================================================================
   AI INTEGRATION
   ================================================================ */
function AIIntegrationPage() {
  return (
    <div className="docs-page">
      <h1>AI Integration</h1>
      <p>
        OniOS is designed from the ground up to be AI-controllable. The same
        command API that humans use through the command bar can be called
        programmatically by any AI agent, LLM, or external service.
      </p>

      <h2>Programmatic Command Execution</h2>
      <div className="docs-code-block">
        {`import { commandRegistry } from './core/CommandRegistry';

// Execute a command as an AI agent (tagged for audit)
const handle = commandRegistry.execute('browser.openUrl("github.com")', 'ai');

// The handle provides:
handle.runId   // unique run ID (e.g. "run_abc123")
handle.status  // 'pending' | 'running' | 'resolved' | 'rejected'
handle.output  // synchronous output (null until resolved)

// Await the result
const run = await handle.await();
// run.output, run.status, run.error, run.duration`}
      </div>

      <h2>Context Engine</h2>
      <p>
        The ContextEngine aggregates the full OS state into a consumable format
        for AI agents. It combines open windows, recent files, document index,
        and active commands into a single queryable interface.
      </p>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>context.summary()</code>
            </td>
            <td>Human/AI-readable text summary of the full OS state</td>
          </tr>
          <tr>
            <td>
              <code>context.full()</code>
            </td>
            <td>JSON object with all windows, files, documents, index stats</td>
          </tr>
          <tr>
            <td>
              <code>context.recentFiles()</code>
            </td>
            <td>List of recently accessed file paths</td>
          </tr>
          <tr>
            <td>
              <code>context.openDocuments()</code>
            </td>
            <td>List of documents currently open in viewer</td>
          </tr>
          <tr>
            <td>
              <code>context.indexStats()</code>
            </td>
            <td>Document index: count, token count</td>
          </tr>
        </tbody>
      </table>

      <h2>Active Widgets Layer</h2>
      <p>
        The ActiveWidgets module provides real-time information about what is on
        screen. This is critical for AI agents that need to understand the
        current visual state before acting.
      </p>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Function</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>getActiveContext()</code>
            </td>
            <td>
              Full JSON snapshot: all windows with IDs, types, titles, props,
              state, and available commands
            </td>
          </tr>
          <tr>
            <td>
              <code>getScreenSummary()</code>
            </td>
            <td>Human-readable text description of screen state</td>
          </tr>
          <tr>
            <td>
              <code>getWidgetCommands(windowId)</code>
            </td>
            <td>Commands available for a specific window instance</td>
          </tr>
          <tr>
            <td>
              <code>getFocusedWidget()</code>
            </td>
            <td>Info about the currently focused window</td>
          </tr>
          <tr>
            <td>
              <code>getAvailableCommands()</code>
            </td>
            <td>Flat list of all commands from all active widgets</td>
          </tr>
          <tr>
            <td>
              <code>isWidgetOpen(type)</code>
            </td>
            <td>Boolean: whether a widget type is currently open</td>
          </tr>
          <tr>
            <td>
              <code>findWindow(idOrType)</code>
            </td>
            <td>Find a window by its ID or widget type</td>
          </tr>
          <tr>
            <td>
              <code>findWindowsByType(type)</code>
            </td>
            <td>Find all windows of a given widget type</td>
          </tr>
        </tbody>
      </table>
      <p>
        These are accessible via commands: <code>system.windows.list()</code>,{" "}
        <code>system.windows.summary()</code>,{" "}
        <code>system.windows.getFocused()</code>, etc.
      </p>

      <h2>Window-Targeted Commands</h2>
      <p>
        The CommandRegistry supports{" "}
        <code>executeOnWindow(windowId, rawCommand)</code> to target commands at
        specific widget instances. Use{" "}
        <code>system.windows.getCommands(windowId)</code> to discover what
        commands a specific window supports.
      </p>
      <div className="docs-code-block">
        {`// 1. Find all open terminals
const ctx = JSON.parse(commandRegistry.execute('system.windows.list()', 'ai'));
const terminals = ctx.filter(w => w.widgetType === 'terminal');

// 2. Send a command to a specific terminal
commandRegistry.executeOnWindow(terminals[0].id, 'ls -la');`}
      </div>

      <h2>Command Run Tracking</h2>
      <p>
        Every command execution produces a CommandRun object tracked by the
        CommandRunTracker. This enables AI agents to fire-and-forget commands
        and check results later.
      </p>
      <div className="docs-code-block">
        {`// Fire a command
const handle = commandRegistry.execute('task.list()', 'ai');
console.log(handle.runId); // "run_abc123"

// Check status later
run.get("run_abc123")       // Full details
run.output("run_abc123")    // Just the output
run.await("run_abc123")     // Wait for completion
run.list(20)                // Last 20 runs
run.running()               // Currently executing
run.failed()                // Recent failures
run.stats()                 // Aggregate statistics`}
      </div>

      <h2>Pipe Chaining</h2>
      <p>
        Commands can be chained with the pipe operator. Each command runs in
        sequence, and the output of the previous command is passed as the first
        argument to the next (if it has no explicit args).
      </p>
      <div className="docs-code-block">
        {`system.files.read("/tmp/data.txt") | system.notify()
// Reads the file, then sends its content as a notification

// Chain runs are grouped by chainId for inspection
run.chain("chain_xyz")  // See all steps in a chain`}
      </div>

      <h2>Source Tagging</h2>
      <p>
        Every command is tagged with its source: <code>"human"</code>,{" "}
        <code>"ai"</code>, <code>"workflow"</code>, or <code>"scheduler"</code>.
        The Activity Log shows these as colored badges for full transparency and
        auditability.
      </p>

      <h2>AI Agent Integration Pattern</h2>
      <div className="docs-code-block">
        {`// Recommended pattern for an AI agent interacting with OniOS:

// 1. Get current context
const summary = commandRegistry.execute('context.summary()', 'ai');

// 2. Understand what is on screen
const screen = commandRegistry.execute('system.windows.summary()', 'ai');

// 3. Search for relevant information
const results = commandRegistry.execute('search.all("budget report")', 'ai');

// 4. Take action based on findings
commandRegistry.execute('document.open("/Documents/budget.xlsx")', 'ai');

// 5. Extract content for analysis
const content = commandRegistry.execute('document.getContent()', 'ai');

// 6. Report back to user
commandRegistry.execute('system.notify("Analysis complete")', 'ai');`}
      </div>
    </div>
  );
}

/* ================================================================
   REST API
   ================================================================ */
function RestApiPage() {
  return (
    <div className="docs-page">
      <h1>REST API Reference</h1>
      <p>
        OniOS exposes a REST API via Vite plugins for filesystem access,
        document parsing, terminal, and state sync. All endpoints are available
        at the dev server URL (default: http://localhost:5173). Interactive
        documentation is available at <code>/swagger</code>.
      </p>

      <h2>Filesystem API</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GET</td>
            <td>
              <code>/api/fs/list?path=</code>
            </td>
            <td>
              List directory contents. Returns array of name, isDirectory, size,
              modified. Defaults to home. Supports ~ prefix.
            </td>
          </tr>
          <tr>
            <td>GET</td>
            <td>
              <code>/api/fs/read?path=</code>
            </td>
            <td>Read file contents as text. Returns content and path.</td>
          </tr>
          <tr>
            <td>POST</td>
            <td>
              <code>/api/fs/write</code>
            </td>
            <td>Write content to a file. Body: path, content.</td>
          </tr>
          <tr>
            <td>POST</td>
            <td>
              <code>/api/fs/mkdir</code>
            </td>
            <td>Create a directory. Body: path.</td>
          </tr>
          <tr>
            <td>DELETE</td>
            <td>
              <code>/api/fs/delete?path=</code>
            </td>
            <td>Delete a file or directory.</td>
          </tr>
          <tr>
            <td>POST</td>
            <td>
              <code>/api/fs/rename</code>
            </td>
            <td>Rename or move. Body: from, to (or oldPath, newPath).</td>
          </tr>
          <tr>
            <td>GET</td>
            <td>
              <code>/api/fs/media?path=</code>
            </td>
            <td>Stream media file with HTTP range support for seeking.</td>
          </tr>
          <tr>
            <td>GET</td>
            <td>
              <code>/api/fs/stat?path=</code>
            </td>
            <td>File stats: size, modified, isDirectory, permissions.</td>
          </tr>
        </tbody>
      </table>

      <h3>cURL Examples -- Filesystem</h3>
      <div className="docs-code-block">
        {`# List home directory
curl http://localhost:5173/api/fs/list?path=~

# Read a file
curl "http://localhost:5173/api/fs/read?path=/Users/you/notes.txt"

# Write a file
curl -X POST http://localhost:5173/api/fs/write \\
  -H "Content-Type: application/json" \\
  -d '{"path": "/tmp/test.txt", "content": "Hello world"}'

# Create a directory
curl -X POST http://localhost:5173/api/fs/mkdir \\
  -H "Content-Type: application/json" \\
  -d '{"path": "/tmp/new-folder"}'

# Delete a file
curl -X DELETE "http://localhost:5173/api/fs/delete?path=/tmp/test.txt"

# Rename / move
curl -X POST http://localhost:5173/api/fs/rename \\
  -H "Content-Type: application/json" \\
  -d '{"from": "/tmp/old.txt", "to": "/tmp/new.txt"}'`}
      </div>

      <h2>Document API</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GET</td>
            <td>
              <code>/api/docs/read?path=</code>
            </td>
            <td>
              Extract text from PDF, Word, Excel, CSV, or text file. Returns
              text and meta.
            </td>
          </tr>
          <tr>
            <td>GET</td>
            <td>
              <code>/api/docs/search?q=</code>
            </td>
            <td>
              Full-text search across indexed documents. Returns ranked results
              with snippets.
            </td>
          </tr>
          <tr>
            <td>POST</td>
            <td>
              <code>/api/docs/parse</code>
            </td>
            <td>
              Parse a document. Body: path. Returns extracted text and metadata.
            </td>
          </tr>
          <tr>
            <td>POST</td>
            <td>
              <code>/api/docs/create</code>
            </td>
            <td>
              Create a new document. Body: path, content, type (optional).
            </td>
          </tr>
          <tr>
            <td>GET</td>
            <td>
              <code>/api/docs/info?path=</code>
            </td>
            <td>Document metadata: pages, words, type, size.</td>
          </tr>
          <tr>
            <td>POST</td>
            <td>
              <code>/api/docs/index</code>
            </td>
            <td>
              Index a file or directory. Body: path, recursive (optional).
              Returns indexed count.
            </td>
          </tr>
          <tr>
            <td>POST</td>
            <td>
              <code>/api/docs/find</code>
            </td>
            <td>
              Find text in a specific file. Body: path, needle. Returns match
              count.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        The document plugin auto-indexes ~/Documents and ~/Desktop on server
        startup. Supported formats: PDF (.pdf), Word (.docx), Excel (.xlsx,
        .xls), CSV (.csv), and all plain text files.
      </p>

      <h3>cURL Examples -- Documents</h3>
      <div className="docs-code-block">
        {`# Read/parse a PDF
curl "http://localhost:5173/api/docs/read?path=/Users/you/report.pdf"

# Search indexed documents
curl "http://localhost:5173/api/docs/search?q=budget+forecast"

# Index a folder
curl -X POST http://localhost:5173/api/docs/index \\
  -H "Content-Type: application/json" \\
  -d '{"path": "/Users/you/Documents", "recursive": true}'

# Get document info
curl "http://localhost:5173/api/docs/info?path=/Users/you/report.pdf"`}
      </div>

      <h2>Terminal WebSocket</h2>
      <div className="docs-code-block">
        {`WebSocket: ws://localhost:5173/ws/terminal

Protocol:
  Client sends: raw terminal input as text frames
  Server sends: raw terminal output as text frames
  Client sends: JSON { type: "resize", cols: 80, rows: 24 }

Each WebSocket connection spawns a dedicated PTY process
(bash or zsh depending on the system).

Connection lifecycle:
  1. Client opens WebSocket to /ws/terminal
  2. Server spawns a PTY child process
  3. Bidirectional data flows as text frames
  4. Client can send resize events as JSON
  5. On disconnect, PTY process is terminated`}
      </div>

      <h2>Server Sync API</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GET</td>
            <td>
              <code>/api/state</code>
            </td>
            <td>
              Get server-side state: tasks, events, scheduled jobs. Client polls
              every 10 seconds.
            </td>
          </tr>
          <tr>
            <td>POST</td>
            <td>
              <code>/api/state</code>
            </td>
            <td>
              Push local state to server. Body: tasks, events, scheduledJobs
              arrays.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Web Search Proxy</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GET</td>
            <td>
              <code>/api/brave-search?q=</code>
            </td>
            <td>
              Proxy to Brave Search API. Requires BRAVE_API_KEY env var. Returns
              web results.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>External Documentation Endpoints</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>URL</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>/docs</code>
            </td>
            <td>
              Standalone HTML documentation page (dark theme, sidebar nav, all
              sections)
            </td>
          </tr>
          <tr>
            <td>
              <code>/swagger</code>
            </td>
            <td>Swagger UI with interactive API explorer</td>
          </tr>
          <tr>
            <td>
              <code>/swagger/spec.json</code>
            </td>
            <td>Raw OpenAPI 3.1 specification as JSON</td>
          </tr>
        </tbody>
      </table>

      <h2>Error Responses</h2>
      <p>
        All API endpoints return JSON errors in a consistent format. HTTP status
        codes are used: 200 for success, 400 for bad requests, 404 for not
        found, and 500 for server errors.
      </p>
      <div className="docs-code-block">
        {`// Error response format:
{ "error": "File not found: /path/to/file" }

// Success response formats:
{ "content": "...", "path": "/path/to/file" }              // fs/read
{ "items": [...], "path": "/path/to/dir" }                  // fs/list
{ "text": "...", "meta": { "pages": 5, "words": 1200 } }    // docs/read`}
      </div>
    </div>
  );
}

/* ================================================================
   PASSWORD MANAGER
   ================================================================ */
function PasswordManagerPage() {
  return (
    <div className="docs-page">
      <h1>Password Manager</h1>
      <p>
        OniOS includes an encrypted password vault with master key protection,
        password generation, strength scoring, category organization, and
        search. All data is encrypted and stored in localStorage.
      </p>

      <h2>Vault Security</h2>
      <ul>
        <li>
          <strong>Master password</strong> -- Required to unlock the vault.
          Hashed and stored, never in plaintext.
        </li>
        <li>
          <strong>Encryption</strong> -- All entries are encrypted at rest in
          localStorage.
        </li>
        <li>
          <strong>Auto-lock</strong> -- Vault can be manually locked via command
          or UI.
        </li>
        <li>
          <strong>No external transmission</strong> -- Passwords never leave the
          browser.
        </li>
      </ul>

      <h2>Features</h2>
      <ul>
        <li>
          <strong>Password generation</strong> -- Configurable length,
          auto-copies to clipboard, shows strength score.
        </li>
        <li>
          <strong>Strength scoring</strong> -- Evaluates password strength with
          visual indicator.
        </li>
        <li>
          <strong>Categories</strong> -- Organize entries by category (general,
          dev, social, finance, etc.).
        </li>
        <li>
          <strong>Search</strong> -- Search entries by title, username, or URL.
        </li>
        <li>
          <strong>Clipboard copy</strong> -- One-click copy of usernames and
          passwords.
        </li>
      </ul>

      <h2>All Commands</h2>
      <table className="docs-cmd-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>password.open()</code>
            </td>
            <td>Open the password manager widget.</td>
          </tr>
          <tr>
            <td>
              <code>
                password.add(title, username?, password?, url?, category?)
              </code>
            </td>
            <td>
              Add a new entry. If password is omitted, one is auto-generated (16
              chars). Category defaults to "general".
            </td>
          </tr>
          <tr>
            <td>
              <code>password.get(titleOrId)</code>
            </td>
            <td>
              Get an entry by title or ID. Returns title, username, decrypted
              password, URL, and category. Vault must be unlocked.
            </td>
          </tr>
          <tr>
            <td>
              <code>password.list(category?)</code>
            </td>
            <td>
              List all entries, optionally filtered by category. Shows title,
              username, category, and ID.
            </td>
          </tr>
          <tr>
            <td>
              <code>password.search(query)</code>
            </td>
            <td>Search entries by title, username, or URL substring.</td>
          </tr>
          <tr>
            <td>
              <code>password.delete(id)</code>
            </td>
            <td>Delete an entry by its ID.</td>
          </tr>
          <tr>
            <td>
              <code>password.generate(length?)</code>
            </td>
            <td>
              Generate a random password (default 16 chars). Shows strength
              score and copies to clipboard.
            </td>
          </tr>
          <tr>
            <td>
              <code>password.lock()</code>
            </td>
            <td>
              Lock the vault. All entries become inaccessible until unlocked.
            </td>
          </tr>
          <tr>
            <td>
              <code>password.categories()</code>
            </td>
            <td>List all categories that have at least one entry.</td>
          </tr>
        </tbody>
      </table>

      <h3>Usage Examples</h3>
      <div className="docs-code-block">
        {`# Add a password entry
password.add("GitHub", "user@email.com", "MyP@ss123", "github.com", "dev")

# Add with auto-generated password
password.add("Netflix", "user@email.com")

# Look up a password
password.get("GitHub")

# List all dev passwords
password.list("dev")

# Search across all entries
password.search("email")

# Generate a strong password
password.generate(24)

# Lock when done
password.lock()`}
      </div>
    </div>
  );
}

/* ================================================================
   EXTENDING ONIOS
   ================================================================ */
function ExtendingPage() {
  return (
    <div className="docs-page">
      <h1>Extending OniOS</h1>
      <p>
        OniOS is designed to be extensible. You can add new widgets, register
        new commands, create backend API plugins, define new workflow node
        types, and hook into the event system.
      </p>

      <h2>Creating a New Widget</h2>
      <ol>
        <li>
          <strong>Create the component</strong> -- Add a new directory under{" "}
          <code>src/widgets/YourWidget/</code> with a JSX file and CSS file.
        </li>
        <li>
          <strong>Register it</strong> -- Add an entry in{" "}
          <code>src/core/widgetRegistry.js</code> with the widget type key,
          component reference, default dimensions, icon, and singleton flag.
        </li>
        <li>
          <strong>Add commands</strong> -- Register command handlers in{" "}
          <code>App.jsx</code> that open/control your widget.
        </li>
        <li>
          <strong>Add events</strong> -- Emit events on the EventBus for
          inter-widget communication.
        </li>
      </ol>

      <h3>Widget Registration Example</h3>
      <div className="docs-code-block">
        {`// In src/core/widgetRegistry.js
import MyWidget from '../widgets/MyWidget/MyWidget';

registry.set('my-widget', {
  component: MyWidget,
  title: 'My Widget',
  icon: 'puzzle',        // Lucide icon name
  defaultWidth: 600,
  defaultHeight: 400,
  singleton: false,      // true = only one instance allowed
  commands: ['mywidget.doSomething', 'mywidget.getData'],
});`}
      </div>

      <h2>Registering Commands</h2>
      <div className="docs-code-block">
        {`// In App.jsx or any initialization code
commandRegistry.register(
  'mywidget.doSomething',
  (arg1, arg2) => {
    // Handler logic
    return "Result string or object";
  },
  {
    description: 'Description shown in help and search',
    args: ['arg1', 'arg2?'],  // ? marks optional
    widget: 'my-widget',      // Associated widget type
  }
);`}
      </div>

      <h2>Creating a Backend Plugin</h2>
      <p>
        Backend plugins are Vite plugins that add Express-like middleware to the
        dev server. They run in Node.js and have full filesystem and network
        access.
      </p>
      <div className="docs-code-block">
        {`// plugins/myPlugin.js
export default function myPlugin() {
  return {
    name: 'my-plugin',
    configureServer(server) {
      // Add middleware
      server.middlewares.use('/api/my-endpoint', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: 'hello' }));
        }
      });
    },
  };
}

// Register in vite.config.js
import myPlugin from './plugins/myPlugin.js';
export default defineConfig({
  plugins: [react(), myPlugin()],
});`}
      </div>

      <h2>Using the Event System</h2>
      <div className="docs-code-block">
        {`import { eventBus } from './core/EventBus';

// Subscribe to events
eventBus.on('task:created', (payload) => {
  console.log('New task:', payload.title);
});

// Emit events
eventBus.emit('mywidget:data:loaded', {
  source: 'my-widget',
  count: 42,
});

// One-time listener
eventBus.once('mywidget:ready', () => {
  console.log('Widget initialized');
});

// Remove listener
const unsub = eventBus.on('some:event', handler);
unsub(); // unsubscribe`}
      </div>

      <h2>Working with Zustand Stores</h2>
      <div className="docs-code-block">
        {`import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Create a persisted store
const useMyStore = create(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => set(state => ({
        items: [...state.items, { ...item, id: crypto.randomUUID() }]
      })),
      removeItem: (id) => set(state => ({
        items: state.items.filter(i => i.id !== id)
      })),
      getItem: (id) => get().items.find(i => i.id === id),
    }),
    { name: 'my-store' }  // localStorage key
  )
);`}
      </div>

      <h2>Adding Workflow Node Types</h2>
      <p>To add a new workflow node type, you need to:</p>
      <ol>
        <li>
          Add the type to <code>NODE_TYPES</code> in{" "}
          <code>WorkflowBuilder.jsx</code>
        </li>
        <li>Add a color and icon mapping for the new type</li>
        <li>
          Add configuration UI in the <code>NodeConfigPanel</code>
        </li>
        <li>
          Add execution logic in <code>WorkflowEngine.js</code>
        </li>
      </ol>

      <h2>Defining Command Output Schemas</h2>
      <p>
        To help the workflow builder suggest fields for condition nodes, add
        output schemas for your commands in{" "}
        <code>src/core/CommandOutputSchemas.js</code>.
      </p>
      <div className="docs-code-block">
        {`// In CommandOutputSchemas.js
'mywidget.getData': {
  type: 'object',
  description: 'Returns widget data',
  example: '{ items: [...], count: 5 }',
  properties: {
    items: { type: 'array', description: 'List of items' },
    count: { type: 'number', description: 'Total count' },
  },
},`}
      </div>

      <h2>Project Structure</h2>
      <div className="docs-code-block">
        {`onipal/
  src/
    core/                  # Core engine modules
      CommandParser.js     # Dot-notation parser
      CommandRegistry.js   # Command registration and execution
      CommandRunTracker.js # Execution tracking
      EventBus.js          # Pub/sub event system
      widgetRegistry.js    # Widget component registry
      ActiveWidgets.js     # Runtime widget context
      WorkflowEngine.js    # Workflow execution engine
      SchedulerService.js  # Cron-like job scheduler
      ContextEngine.js     # AI context aggregation
      IndexService.js      # TF-IDF document indexing
      CommandOutputSchemas.js  # Output shape definitions
    widgets/               # All widget components
      FileExplorer/
      Terminal/
      Browser/
      CodeEditor/
      Docs/
      WorkflowBuilder/
      ...
    stores/                # Zustand state stores
      windowStore.js
      commandStore.js
      notificationStore.js
      themeStore.js
      workflowStore.js
      taskStore.js
      passwordStore.js
    App.jsx                # Main app + command registration
  plugins/                 # Vite server plugins
    filesystemPlugin.js    # /api/fs/* endpoints
    terminalPlugin.js      # /ws/terminal WebSocket
    documentPlugin.js      # /api/docs/* endpoints
    schedulerPlugin.js     # /api/state sync
    docsPlugin.js          # /docs + /swagger
  docs/                    # Markdown documentation
  vite.config.js           # Vite configuration`}
      </div>
    </div>
  );
}
