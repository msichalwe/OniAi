/**
 * Vite plugin that serves external documentation pages.
 *
 * Endpoints:
 *   GET /docs     → Modern HTML documentation page (standalone, no React)
 *   GET /swagger  → OpenAPI 3.1 spec (JSON) + Swagger UI
 */

export default function docsPlugin() {
    return {
        name: 'docs-api',
        configureServer(server) {
            // ─── /swagger — OpenAPI spec + Swagger UI ─────────
            server.middlewares.use('/swagger', (req, res) => {
                if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

                const url = new URL(req.url, 'http://localhost');
                if (url.pathname === '/swagger/spec.json' || url.pathname === '/spec.json') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(OPENAPI_SPEC, null, 2));
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(SWAGGER_HTML);
            });

            // ─── /docs — Standalone HTML docs ─────────────────
            server.middlewares.use('/docs', (req, res) => {
                if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(DOCS_HTML);
            });
        },
    };
}

// ═══════════════════════════════════════════════════════
// OpenAPI 3.1 Specification
// ═══════════════════════════════════════════════════════

const OPENAPI_SPEC = {
    openapi: '3.1.0',
    info: {
        title: 'OniOS API',
        version: '1.0.0',
        description: 'REST API for OniOS — a command-driven visual operating system for AI-human collaboration.',
        contact: { name: 'OniOS', url: 'http://localhost:5173' },
    },
    servers: [{ url: 'http://localhost:5173', description: 'Development' }],
    paths: {
        '/api/fs/list': {
            get: {
                tags: ['Filesystem'],
                summary: 'List directory contents',
                parameters: [{ name: 'path', in: 'query', schema: { type: 'string' }, description: 'Directory path (defaults to home)' }],
                responses: { 200: { description: 'Array of file/directory entries', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, isDirectory: { type: 'boolean' }, size: { type: 'number' }, modified: { type: 'string' } } } } } } } },
            },
        },
        '/api/fs/read': {
            get: {
                tags: ['Filesystem'],
                summary: 'Read file contents',
                parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'File content', content: { 'application/json': { schema: { type: 'object', properties: { content: { type: 'string' }, path: { type: 'string' } } } } } } },
            },
        },
        '/api/fs/write': {
            post: {
                tags: ['Filesystem'],
                summary: 'Write content to a file',
                requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' } } } } } },
                responses: { 200: { description: 'Success confirmation' } },
            },
        },
        '/api/fs/mkdir': {
            post: {
                tags: ['Filesystem'],
                summary: 'Create a directory',
                requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } } } },
                responses: { 200: { description: 'Directory created' } },
            },
        },
        '/api/fs/delete': {
            delete: {
                tags: ['Filesystem'],
                summary: 'Delete a file or directory',
                requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } } } },
                responses: { 200: { description: 'Deleted' } },
            },
        },
        '/api/fs/rename': {
            post: {
                tags: ['Filesystem'],
                summary: 'Rename or move a file',
                requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['oldPath', 'newPath'], properties: { oldPath: { type: 'string' }, newPath: { type: 'string' } } } } } },
                responses: { 200: { description: 'Renamed' } },
            },
        },
        '/api/fs/media': {
            get: {
                tags: ['Filesystem'],
                summary: 'Stream media file with range support',
                parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Media stream' }, 206: { description: 'Partial content (range)' } },
            },
        },
        '/api/fs/stat': {
            get: {
                tags: ['Filesystem'],
                summary: 'Get file or directory stats',
                parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'File stats (size, modified, isDirectory, etc.)' } },
            },
        },
        '/api/docs/read': {
            get: {
                tags: ['Documents'],
                summary: 'Read and extract text from a document',
                description: 'Supports PDF, Word (.docx), Excel (.xlsx/.xls), CSV, and text files.',
                parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Extracted text and metadata' } },
            },
        },
        '/api/docs/search': {
            get: {
                tags: ['Documents'],
                summary: 'Full-text search across indexed documents',
                parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Search results with snippets and scores' } },
            },
        },
        '/api/docs/parse': {
            post: {
                tags: ['Documents'],
                summary: 'Parse a document and extract text',
                requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } } } },
                responses: { 200: { description: 'Parsed document with text and metadata' } },
            },
        },
        '/api/docs/create': {
            post: {
                tags: ['Documents'],
                summary: 'Create a new document',
                requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' }, type: { type: 'string' } } } } } },
                responses: { 200: { description: 'Document created' } },
            },
        },
        '/api/docs/info': {
            get: {
                tags: ['Documents'],
                summary: 'Get document metadata',
                parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Document info (pages, words, type, size)' } },
            },
        },
        '/api/state': {
            get: {
                tags: ['Server Sync'],
                summary: 'Get server state',
                responses: { 200: { description: 'Tasks, events, and jobs state' } },
            },
            post: {
                tags: ['Server Sync'],
                summary: 'Push state updates',
                requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
                responses: { 200: { description: 'State synced' } },
            },
        },
        '/api/brave-search': {
            get: {
                tags: ['Search'],
                summary: 'Web search via Brave Search API',
                parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Search results from Brave' } },
            },
        },
    },
    tags: [
        { name: 'Filesystem', description: 'File and directory operations' },
        { name: 'Documents', description: 'Document parsing, search, and management' },
        { name: 'Server Sync', description: 'Task and state synchronization' },
        { name: 'Search', description: 'Web search integration' },
    ],
};

// ═══════════════════════════════════════════════════════
// Swagger UI HTML
// ═══════════════════════════════════════════════════════

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OniOS API — Swagger</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
<style>
  body { margin: 0; background: #0a0a0f; }
  .swagger-ui .topbar { display: none; }
  .swagger-ui { max-width: 1100px; margin: 0 auto; padding: 20px; }
</style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
SwaggerUIBundle({ url: '/swagger/spec.json', dom_id: '#swagger-ui', deepLinking: true, presets: [SwaggerUIBundle.presets.apis], layout: 'BaseLayout' });
</script>
</body>
</html>`;

// ═══════════════════════════════════════════════════════
// Standalone HTML Documentation
// ═══════════════════════════════════════════════════════

const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OniOS Documentation</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0a12;--surface:#12121e;--surface2:#1a1a2e;--border:#1e1e3a;--text:#e4e4ed;--text2:#8888a0;--accent:#3b82f6;--green:#22c55e;--yellow:#f59e0b;--pink:#ec4899;--purple:#a78bfa;--mono:'SF Mono',Menlo,Consolas,monospace;--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
body{font-family:var(--sans);background:var(--bg);color:var(--text);line-height:1.6;font-size:15px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.layout{display:flex;min-height:100vh}
.sidebar{width:260px;background:var(--surface);border-right:1px solid var(--border);padding:20px 0;flex-shrink:0;position:sticky;top:0;height:100vh;overflow-y:auto}
.sidebar h2{padding:0 20px;font-size:13px;color:var(--accent);margin-bottom:16px;letter-spacing:1px;text-transform:uppercase}
.sidebar a{display:block;padding:8px 20px;font-size:13px;color:var(--text2);transition:all .15s}
.sidebar a:hover{color:var(--text);background:rgba(255,255,255,.04);text-decoration:none}
.sidebar a.active{color:var(--accent);background:rgba(59,130,246,.08);border-right:2px solid var(--accent)}
.sidebar .sep{height:1px;background:var(--border);margin:12px 20px}
.main{flex:1;max-width:900px;padding:40px 60px 80px}
h1{font-size:32px;font-weight:800;margin-bottom:8px;background:linear-gradient(135deg,var(--accent),var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
h2{font-size:22px;font-weight:700;margin-top:40px;margin-bottom:12px;color:var(--text);padding-bottom:6px;border-bottom:1px solid var(--border)}
h3{font-size:16px;font-weight:600;margin-top:24px;margin-bottom:8px;color:var(--text)}
p{margin-bottom:12px;color:var(--text2)}
ul,ol{margin:0 0 16px 20px;color:var(--text2)}
li{margin-bottom:6px}
li strong{color:var(--text)}
code{font-family:var(--mono);font-size:13px;background:rgba(59,130,246,.1);color:var(--accent);padding:2px 6px;border-radius:4px}
pre{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:16px;margin:12px 0 20px;overflow-x:auto;font-size:13px;line-height:1.5;color:var(--text2);font-family:var(--mono)}
pre code{background:none;padding:0;color:inherit}
table{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:13px}
th{text-align:left;padding:8px 12px;background:var(--surface2);color:var(--text);font-weight:600;border-bottom:2px solid var(--border)}
td{padding:8px 12px;border-bottom:1px solid var(--border);color:var(--text2)}
td code{font-size:12px}
.callout{display:flex;gap:12px;padding:14px 16px;border-radius:8px;margin:16px 0;border:1px solid}
.callout.info{background:rgba(59,130,246,.06);border-color:rgba(59,130,246,.2)}
.callout.tip{background:rgba(34,197,94,.06);border-color:rgba(34,197,94,.2)}
.callout .icon{font-size:14px;flex-shrink:0;font-weight:700;color:var(--accent)}
.callout p{margin:0;color:var(--text2)}
.callout strong{color:var(--text)}
.badge{display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(139,92,246,.15);color:var(--purple);margin-left:6px;vertical-align:middle}
.badge.method{background:rgba(34,197,94,.15);color:var(--green)}
.badge.post{background:rgba(245,158,11,.15);color:var(--yellow)}
.badge.delete{background:rgba(239,68,68,.15);color:#ef4444}
.hero{padding:40px 0 20px}
.hero p{font-size:17px;color:var(--text2);max-width:700px}
@media(max-width:768px){.sidebar{display:none}.main{padding:20px}}
</style>
</head>
<body>
<div class="layout">
<nav class="sidebar">
<h2>OniOS Docs</h2>
<a href="#overview" class="active" onclick="showSection('overview')">Overview</a>
<a href="#architecture" onclick="showSection('architecture')">Architecture</a>
<div class="sep"></div>
<a href="#widgets" onclick="showSection('widgets')">All Widgets (20)</a>
<a href="#commands" onclick="showSection('commands')">Command Reference</a>
<div class="sep"></div>
<a href="#workflows" onclick="showSection('workflows')">Workflow Builder</a>
<a href="#scheduler" onclick="showSection('scheduler')">Scheduler & Tasks</a>
<a href="#passwords" onclick="showSection('passwords')">Password Manager</a>
<div class="sep"></div>
<a href="#api-fs" onclick="showSection('api-fs')">Filesystem API</a>
<a href="#api-docs" onclick="showSection('api-docs')">Document API</a>
<a href="#api-terminal" onclick="showSection('api-terminal')">Terminal WebSocket</a>
<a href="#api-sync" onclick="showSection('api-sync')">Server Sync API</a>
<div class="sep"></div>
<a href="#ai" onclick="showSection('ai')">AI Integration</a>
<a href="#extending" onclick="showSection('extending')">Extending OniOS</a>
<div class="sep"></div>
<a href="/swagger" target="_blank">Swagger UI &rarr;</a>
</nav>
<main class="main">

<!-- ═══ OVERVIEW ═══ -->
<section id="overview" class="section">
<div class="hero"><h1>OniOS Documentation</h1>
<p>OniOS is a command-driven, widget-based visual operating system built for AI-human collaboration. Every action in the system is a callable command using dot-notation. Any AI agent or LLM that can emit command strings can control the entire OS.</p></div>
<div class="callout info"><span class="icon">i</span><div><strong>Quick Start:</strong> Press <code>Cmd+K</code> (or <code>Ctrl+K</code>) to open the command palette. Type any command like <code>terminal.open()</code> and press Enter.</div></div>

<h2>System Capabilities</h2>
<table><thead><tr><th>Capability</th><th>Description</th></tr></thead><tbody>
<tr><td><strong>Multi-window management</strong></td><td>Drag, resize, minimize, maximize, z-index stacking, taskbar integration</td></tr>
<tr><td><strong>Real filesystem access</strong></td><td>Browse, read, write, delete, rename files on the actual machine via REST API</td></tr>
<tr><td><strong>Terminal emulator</strong></td><td>Full PTY shell via node-pty over WebSocket with ANSI 256-color support</td></tr>
<tr><td><strong>Built-in browser</strong></td><td>Embedded iframe with URL navigation, Google search, quick links</td></tr>
<tr><td><strong>Code editor</strong></td><td>Project browser with syntax-aware file viewing, multi-file open, save support</td></tr>
<tr><td><strong>Document viewer</strong></td><td>PDF, Word (.docx), Excel (.xlsx/.xls), CSV, and plain text with in-document search</td></tr>
<tr><td><strong>Full-text search</strong></td><td>TF-IDF indexed search across all indexed documents with snippet extraction</td></tr>
<tr><td><strong>Workflow automation</strong></td><td>Visual node-based workflow builder with triggers, commands, conditions, delays, outputs</td></tr>
<tr><td><strong>Task management</strong></td><td>Tasks with priorities, due dates, statuses, and automatic overdue notifications</td></tr>
<tr><td><strong>Calendar events</strong></td><td>Date-based events with start/end times</td></tr>
<tr><td><strong>Scheduled jobs</strong></td><td>Cron-like job scheduler that auto-fires commands at intervals</td></tr>
<tr><td><strong>Password manager</strong></td><td>Encrypted vault with password generation, strength scoring, categories, search</td></tr>
<tr><td><strong>Universal search</strong></td><td>Search across commands, windows, files, and document contents simultaneously</td></tr>
<tr><td><strong>Command run tracking</strong></td><td>Every execution tracked with run ID, status, output, timing, pipe chains</td></tr>
<tr><td><strong>Context engine</strong></td><td>Full OS context snapshot for AI agents -- open windows, recent files, document index</td></tr>
<tr><td><strong>Event bus</strong></td><td>Pub/sub system for inter-widget communication and workflow triggers</td></tr>
<tr><td><strong>AI source tagging</strong></td><td>Every command tagged as "human" or "ai" for full audit trail transparency</td></tr>
<tr><td><strong>Theme system</strong></td><td>Dark and light themes with gradient wallpaper presets and custom uploads</td></tr>
</tbody></table>

<h2>Tech Stack</h2>
<ul>
<li><strong>Frontend</strong> -- React 19, Vite 6, Zustand 5</li>
<li><strong>Backend</strong> -- Vite dev server plugins (Express-like middleware)</li>
<li><strong>Terminal</strong> -- xterm.js + node-pty over WebSocket</li>
<li><strong>Styling</strong> -- Pure CSS with Apple-inspired frosted glass aesthetic</li>
<li><strong>State</strong> -- Zustand stores with localStorage persistence</li>
<li><strong>Document parsing</strong> -- pdf-parse, mammoth, xlsx libraries</li>
</ul>

<h2>Getting Started</h2>
<pre><code># Install dependencies
npm install

# Start development server
npm run dev

# Server starts at http://localhost:5173
# External docs at /docs, Swagger at /swagger</code></pre>

<h2>Key Commands to Try</h2>
<pre><code>terminal.open()                    Open a terminal
system.files.openExplorer()        Browse the filesystem
browser.openUrl("github.com")      Open a website
code.open("/path/to/project")      Open code editor
document.open("/path/to/file.pdf") Open a document
task.add("Fix login bug")          Create a task
workflow.open()                    Open the workflow builder
password.open()                    Open password manager
search.all("query")                Universal search
context.summary()                  Full OS context for AI</code></pre>
</section>

<!-- ═══ ARCHITECTURE ═══ -->
<section id="architecture" class="section" style="display:none">
<h1>System Architecture</h1>
<p>OniOS is built on a layered architecture where commands flow through a central registry to produce visual widgets managed by a window system.</p>

<h2>Tech Stack</h2>
<ul>
<li><strong>Frontend</strong> -- React 19 + Vite 6 + Zustand 5</li>
<li><strong>Backend</strong> -- Vite plugins (Express-like middleware)</li>
<li><strong>Terminal</strong> -- xterm.js + node-pty over WebSocket</li>
<li><strong>Styling</strong> -- Pure CSS with Apple-inspired frosted glass aesthetic</li>
</ul>

<h2>Core Modules</h2>
<table><thead><tr><th>Module</th><th>File</th><th>Purpose</th></tr></thead><tbody>
<tr><td><strong>CommandParser</strong></td><td><code>core/CommandParser.js</code></td><td>Parse dot-notation strings into structured commands. Supports strings, numbers, booleans. Handles pipe chains (cmd1 | cmd2).</td></tr>
<tr><td><strong>CommandRegistry</strong></td><td><code>core/CommandRegistry.js</code></td><td>Singleton registry mapping command paths to handler functions. Register, unregister, execute, search, list. Every execution produces a tracked CommandRun.</td></tr>
<tr><td><strong>CommandRunTracker</strong></td><td><code>core/CommandRunTracker.js</code></td><td>Tracks every execution with run ID, status, output, error, duration, source tag, and pipe chain grouping.</td></tr>
<tr><td><strong>EventBus</strong></td><td><code>core/EventBus.js</code></td><td>Pub/sub for workflow triggers, command events, scheduler notifications, inter-widget communication.</td></tr>
<tr><td><strong>WidgetRegistry</strong></td><td><code>core/widgetRegistry.js</code></td><td>Map widget types to React components with metadata (sizes, icons, singleton flag).</td></tr>
<tr><td><strong>ActiveWidgets</strong></td><td><code>core/ActiveWidgets.js</code></td><td>Runtime layer: getActiveContext(), getScreenSummary(), getWidgetCommands(), getFocusedWidget().</td></tr>
<tr><td><strong>WorkflowEngine</strong></td><td><code>core/WorkflowEngine.js</code></td><td>Execute workflow pipelines node-by-node with deep path condition evaluation.</td></tr>
<tr><td><strong>SchedulerService</strong></td><td><code>core/SchedulerService.js</code></td><td>15-second tick loop that fires scheduled jobs, checks overdue tasks.</td></tr>
<tr><td><strong>ContextEngine</strong></td><td><code>core/ContextEngine.js</code></td><td>Aggregates full OS context for AI agents: windows, files, docs, index.</td></tr>
<tr><td><strong>IndexService</strong></td><td><code>core/IndexService.js</code></td><td>Client-side TF-IDF text indexing with phrase matching and snippet extraction.</td></tr>
<tr><td><strong>CommandOutputSchemas</strong></td><td><code>core/CommandOutputSchemas.js</code></td><td>Expected output shapes for known commands, used by workflow builder for field suggestions.</td></tr>
</tbody></table>

<h2>State Stores (Zustand)</h2>
<table><thead><tr><th>Store</th><th>Persisted</th><th>Contents</th></tr></thead><tbody>
<tr><td><code>windowStore</code></td><td>No</td><td>Open windows, positions, sizes, z-index stacking, focused window</td></tr>
<tr><td><code>commandStore</code></td><td>No</td><td>Command history, activity log, command bar state</td></tr>
<tr><td><code>notificationStore</code></td><td>No</td><td>Active toast notifications with auto-dismiss timers</td></tr>
<tr><td><code>themeStore</code></td><td>Yes</td><td>Theme (dark/light), wallpaper selection, custom wallpaper data</td></tr>
<tr><td><code>workflowStore</code></td><td>Yes</td><td>Workflow definitions (nodes, connections, configs), active workflow ID</td></tr>
<tr><td><code>taskStore</code></td><td>Yes</td><td>Tasks, calendar events, scheduled jobs, completion state</td></tr>
<tr><td><code>passwordStore</code></td><td>Yes (encrypted)</td><td>Password vault entries, master key hash, lock state, categories</td></tr>
</tbody></table>

<h2>Backend Plugins</h2>
<table><thead><tr><th>Plugin</th><th>File</th><th>Endpoints</th></tr></thead><tbody>
<tr><td><strong>filesystemPlugin</strong></td><td><code>plugins/filesystemPlugin.js</code></td><td>/api/fs/* -- list, read, write, mkdir, delete, rename, stat, media streaming</td></tr>
<tr><td><strong>terminalPlugin</strong></td><td><code>plugins/terminalPlugin.js</code></td><td>/ws/terminal -- WebSocket PTY via node-pty</td></tr>
<tr><td><strong>documentPlugin</strong></td><td><code>plugins/documentPlugin.js</code></td><td>/api/docs/* -- parse, read, search, create, info, index. Auto-indexes ~/Documents and ~/Desktop.</td></tr>
<tr><td><strong>schedulerPlugin</strong></td><td><code>plugins/schedulerPlugin.js</code></td><td>/api/state -- server-side state sync for tasks, events, jobs</td></tr>
<tr><td><strong>docsPlugin</strong></td><td><code>plugins/docsPlugin.js</code></td><td>/docs -- this page. /swagger -- OpenAPI 3.1 spec + Swagger UI.</td></tr>
</tbody></table>

<h2>Command Syntax</h2>
<pre><code>namespace.action(arg1, arg2, ...)

Arguments: strings, numbers, booleans
  browser.openUrl("https://github.com")
  task.upcoming(14)

Pipe chaining:
  cmd1 | cmd2 | cmd3
  Output of cmd1 passed as first arg to cmd2.

Source tagging:
  commandRegistry.execute('cmd("arg")', 'human')
  commandRegistry.execute('cmd("arg")', 'ai')
  commandRegistry.execute('cmd("arg")', 'workflow')</code></pre>
</section>

<!-- ═══ ALL WIDGETS ═══ -->
<section id="widgets" class="section" style="display:none">
<h1>All Widgets (20)</h1>
<p>Every widget is a self-contained React component. Singleton widgets allow only one instance; multi-instance widgets can have many open windows.</p>

<table><thead><tr><th>Type Key</th><th>Title</th><th>Singleton</th><th>Commands</th></tr></thead><tbody>
<tr><td><code>file-explorer</code></td><td>File Explorer</td><td>No</td><td><code>system.files.*</code> (10 commands)</td></tr>
<tr><td><code>terminal</code></td><td>Terminal</td><td>No</td><td><code>terminal.*</code> (5 commands)</td></tr>
<tr><td><code>browser</code></td><td>Browser</td><td>No</td><td><code>browser.*</code> (3 commands)</td></tr>
<tr><td><code>code-editor</code></td><td>Code Editor</td><td>No</td><td><code>code.*</code> (10 commands)</td></tr>
<tr><td><code>document-viewer</code></td><td>Document Viewer</td><td>No</td><td><code>document.*</code> (8 commands)</td></tr>
<tr><td><code>media-player</code></td><td>Media Player</td><td>No</td><td><code>system.media.*</code> (2 commands)</td></tr>
<tr><td><code>file-viewer</code></td><td>File Viewer</td><td>No</td><td><code>viewer.*</code> (1 command)</td></tr>
<tr><td><code>weather</code></td><td>Weather</td><td>Yes</td><td><code>widgets.weather.*</code> (2 commands)</td></tr>
<tr><td><code>web-search</code></td><td>Web Search</td><td>Yes</td><td><code>web.*</code> (1 command)</td></tr>
<tr><td><code>maps</code></td><td>Maps</td><td>Yes</td><td><code>maps.*</code> (1 command)</td></tr>
<tr><td><code>notes</code></td><td>Notes</td><td>Yes</td><td>Via document.* commands</td></tr>
<tr><td><code>clock</code></td><td>Clock & System</td><td>Yes</td><td><code>system.info.*</code> (1 command)</td></tr>
<tr><td><code>calculator</code></td><td>Calculator</td><td>Yes</td><td><code>widgets.calculator.*</code> (2 commands)</td></tr>
<tr><td><code>activity-log</code></td><td>Activity Log</td><td>Yes</td><td><code>system.activity.*</code> (1 command)</td></tr>
<tr><td><code>docs</code></td><td>Documentation</td><td>Yes</td><td><code>system.docs.*</code> (3 commands)</td></tr>
<tr><td><code>settings</code></td><td>Settings</td><td>Yes</td><td><code>system.settings.*</code> (2 commands)</td></tr>
<tr><td><code>task-manager</code></td><td>Task Manager</td><td>Yes</td><td><code>task.*</code> (7 commands)</td></tr>
<tr><td><code>calendar</code></td><td>Calendar</td><td>Yes</td><td><code>calendar.*</code> (2), <code>event.*</code> (3)</td></tr>
<tr><td><code>workflow-builder</code></td><td>Workflow Builder</td><td>Yes</td><td><code>workflow.*</code> (11 commands)</td></tr>
<tr><td><code>password-manager</code></td><td>Password Manager</td><td>Yes</td><td><code>password.*</code> (9 commands)</td></tr>
</tbody></table>

<h2>File Explorer</h2>
<p>Browses the real machine filesystem via /api/fs/list. Sidebar favorites (Home, Desktop, Documents, Downloads, Pictures, Music, Videos, Projects), breadcrumb navigation, grid and list views, file type icons. Routes files to appropriate viewer by extension.</p>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>system.files.openExplorer(path?)</code></td><td>Open file explorer at optional path</td></tr>
<tr><td><code>system.files.navigate(path)</code></td><td>Navigate to path in explorer</td></tr>
<tr><td><code>system.files.list()</code></td><td>List root folders</td></tr>
<tr><td><code>system.files.openFile(filePath)</code></td><td>Open file in appropriate widget by extension</td></tr>
<tr><td><code>system.files.read(path)</code></td><td>Read file contents as text</td></tr>
<tr><td><code>system.files.write(path, content)</code></td><td>Write content to a file</td></tr>
<tr><td><code>system.files.createFile(path, content?)</code></td><td>Create new file</td></tr>
<tr><td><code>system.files.createFolder(path)</code></td><td>Create new directory</td></tr>
<tr><td><code>system.files.delete(path)</code></td><td>Delete file or directory</td></tr>
<tr><td><code>system.files.rename(from, to)</code></td><td>Rename or move</td></tr>
</tbody></table>

<h2>Terminal</h2>
<p>Full interactive shell via xterm.js + node-pty over WebSocket. ANSI 256-color, auto-resize, web link detection. Each window gets its own PTY process.</p>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>terminal.open()</code></td><td>Open a new terminal window</td></tr>
<tr><td><code>terminal.exec(command)</code></td><td>Execute a shell command (opens terminal if needed)</td></tr>
<tr><td><code>terminal.runCommand(cmd)</code></td><td>Open terminal and suggest command</td></tr>
<tr><td><code>terminal.sendInput(data)</code></td><td>Send raw input to active terminal</td></tr>
<tr><td><code>terminal.sendCtrlC()</code></td><td>Send Ctrl+C interrupt</td></tr>
</tbody></table>

<h2>Browser</h2>
<p>Embedded iframe with URL bar, back/forward, Google search.</p>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>browser.open()</code></td><td>Open blank browser</td></tr>
<tr><td><code>browser.openUrl(url)</code></td><td>Open specific URL</td></tr>
<tr><td><code>browser.searchGoogle(query)</code></td><td>Google search</td></tr>
</tbody></table>

<h2>Code Editor</h2>
<p>Project tree, tabbed editing, syntax display, save/saveAll. Get and set file content programmatically.</p>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>code.open(projectPath?)</code></td><td>Open code editor</td></tr>
<tr><td><code>code.openProject(path)</code></td><td>Open project with name in title</td></tr>
<tr><td><code>code.openFile(filePath)</code></td><td>Open file in editor</td></tr>
<tr><td><code>code.saveFile()</code></td><td>Save active file</td></tr>
<tr><td><code>code.saveAll()</code></td><td>Save all modified files</td></tr>
<tr><td><code>code.getContent(filePath)</code></td><td>Get file content from buffer</td></tr>
<tr><td><code>code.setContent(filePath, content)</code></td><td>Set file content</td></tr>
<tr><td><code>code.getActiveFile()</code></td><td>Path of active tab</td></tr>
<tr><td><code>code.getOpenFiles()</code></td><td>All open file paths</td></tr>
<tr><td><code>code.closeFile(filePath)</code></td><td>Close a file tab</td></tr>
</tbody></table>

<h2>Document Viewer</h2>
<p>PDF, Word (.docx), Excel (.xlsx/.xls), CSV, plain text. Text extraction, in-document search, auto-indexing. Server-side parsing via pdf-parse, mammoth, xlsx.</p>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>document.open(filePath?)</code></td><td>Open viewer, optionally load file</td></tr>
<tr><td><code>document.create(path, content?)</code></td><td>Create document and open</td></tr>
<tr><td><code>document.find(needle, path?)</code></td><td>Find text in viewer or file</td></tr>
<tr><td><code>document.search(query)</code></td><td>Full-text search across indexed docs</td></tr>
<tr><td><code>document.index(path)</code></td><td>Index file/directory for search</td></tr>
<tr><td><code>document.list()</code></td><td>List indexed documents</td></tr>
<tr><td><code>document.getContent(path?)</code></td><td>Get extracted text</td></tr>
<tr><td><code>document.matchText(pattern)</code></td><td>Pattern match across index</td></tr>
</tbody></table>

<h2>Media Player</h2>
<p>HTML5 video/audio. Files streamed via /api/fs/media with HTTP range support. Formats: mp4, mov, webm, avi, mkv, mp3, wav, ogg, flac, aac.</p>

<h2>Other Widgets</h2>
<table><thead><tr><th>Widget</th><th>Key Commands</th><th>Features</th></tr></thead><tbody>
<tr><td><strong>Weather</strong></td><td><code>widgets.weather.getCurrent()</code>, <code>getWeekly()</code></td><td>Current conditions + 7-day forecast</td></tr>
<tr><td><strong>Web Search</strong></td><td><code>web.search(query)</code></td><td>Brave Search API (requires BRAVE_API_KEY)</td></tr>
<tr><td><strong>Maps</strong></td><td><code>maps.open()</code></td><td>Embedded maps</td></tr>
<tr><td><strong>Notes</strong></td><td>Via document commands</td><td>Sidebar list, auto-save to localStorage</td></tr>
<tr><td><strong>Calculator</strong></td><td><code>widgets.calculator.open()</code>, <code>calculate(expr)</code></td><td>Arithmetic with expression display</td></tr>
<tr><td><strong>Clock</strong></td><td><code>system.info.clock()</code></td><td>Analog/digital clock + system info</td></tr>
<tr><td><strong>Activity Log</strong></td><td><code>system.activity.open()</code></td><td>Command history with source badges (Human/AI/Workflow/Scheduler)</td></tr>
<tr><td><strong>Settings</strong></td><td><code>system.settings.open()</code>, <code>toggleTheme()</code></td><td>Dark/light theme, wallpaper presets, custom upload</td></tr>
<tr><td><strong>File Viewer</strong></td><td><code>viewer.openFile(path)</code></td><td>Read-only text viewer</td></tr>
</tbody></table>
</section>

<!-- ═══ COMMAND REFERENCE ═══ -->
<section id="commands" class="section" style="display:none">
<h1>Command Reference</h1>
<p>Complete reference of every registered command. All commands use dot-notation. Arguments with <code>?</code> are optional.</p>
<div class="callout tip"><span class="icon">TIP</span><div>Every command execution is tracked with a unique run ID. Use <code>run.list()</code> to see recent executions.</div></div>

<h2>Filesystem <span class="badge">system.files.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>system.files.openExplorer(path?)</code></td><td>Open file explorer at optional path</td></tr>
<tr><td><code>system.files.navigate(path)</code></td><td>Navigate to path</td></tr>
<tr><td><code>system.files.list()</code></td><td>List root folders</td></tr>
<tr><td><code>system.files.openFile(filePath)</code></td><td>Open file in appropriate widget</td></tr>
<tr><td><code>system.files.read(path)</code></td><td>Read file contents</td></tr>
<tr><td><code>system.files.write(path, content)</code></td><td>Write to file</td></tr>
<tr><td><code>system.files.createFile(path, content?)</code></td><td>Create file</td></tr>
<tr><td><code>system.files.createFolder(path)</code></td><td>Create directory</td></tr>
<tr><td><code>system.files.delete(path)</code></td><td>Delete file/dir</td></tr>
<tr><td><code>system.files.rename(from, to)</code></td><td>Rename/move</td></tr>
</tbody></table>

<h2>Terminal <span class="badge">terminal.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>terminal.open()</code></td><td>Open terminal</td></tr>
<tr><td><code>terminal.exec(command)</code></td><td>Execute shell command</td></tr>
<tr><td><code>terminal.runCommand(cmd)</code></td><td>Open terminal and suggest command</td></tr>
<tr><td><code>terminal.sendInput(data)</code></td><td>Send raw input</td></tr>
<tr><td><code>terminal.sendCtrlC()</code></td><td>Send Ctrl+C</td></tr>
</tbody></table>

<h2>Browser <span class="badge">browser.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>browser.open()</code></td><td>Open blank browser</td></tr>
<tr><td><code>browser.openUrl(url)</code></td><td>Open URL</td></tr>
<tr><td><code>browser.searchGoogle(query)</code></td><td>Google search</td></tr>
</tbody></table>

<h2>Code Editor <span class="badge">code.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>code.open(projectPath?)</code></td><td>Open editor</td></tr>
<tr><td><code>code.openProject(path)</code></td><td>Open project</td></tr>
<tr><td><code>code.openFile(filePath)</code></td><td>Open file</td></tr>
<tr><td><code>code.saveFile()</code></td><td>Save active</td></tr>
<tr><td><code>code.saveAll()</code></td><td>Save all</td></tr>
<tr><td><code>code.getContent(filePath)</code></td><td>Get content</td></tr>
<tr><td><code>code.setContent(filePath, content)</code></td><td>Set content</td></tr>
<tr><td><code>code.getActiveFile()</code></td><td>Active tab path</td></tr>
<tr><td><code>code.getOpenFiles()</code></td><td>All open paths</td></tr>
<tr><td><code>code.closeFile(filePath)</code></td><td>Close tab</td></tr>
</tbody></table>

<h2>Documents <span class="badge">document.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>document.open(filePath?)</code></td><td>Open viewer</td></tr>
<tr><td><code>document.create(path, content?)</code></td><td>Create and open</td></tr>
<tr><td><code>document.find(needle, path?)</code></td><td>Find text</td></tr>
<tr><td><code>document.search(query)</code></td><td>Full-text search</td></tr>
<tr><td><code>document.index(path)</code></td><td>Index for search</td></tr>
<tr><td><code>document.list()</code></td><td>List indexed docs</td></tr>
<tr><td><code>document.getContent(path?)</code></td><td>Get text</td></tr>
<tr><td><code>document.matchText(pattern)</code></td><td>Pattern match</td></tr>
</tbody></table>

<h2>Search <span class="badge">search.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>search.all(query)</code></td><td>Universal search: commands, windows, files, documents</td></tr>
<tr><td><code>search.commands(query)</code></td><td>Search registered commands</td></tr>
<tr><td><code>search.documents(query)</code></td><td>Search indexed document contents</td></tr>
</tbody></table>

<h2>Context Engine <span class="badge">context.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>context.summary()</code></td><td>Full OS state summary for AI</td></tr>
<tr><td><code>context.full()</code></td><td>Full context as JSON</td></tr>
<tr><td><code>context.recentFiles()</code></td><td>Recent file paths</td></tr>
<tr><td><code>context.openDocuments()</code></td><td>Open documents list</td></tr>
<tr><td><code>context.indexStats()</code></td><td>Index statistics</td></tr>
</tbody></table>

<h2>Window Management <span class="badge">system.windows.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>system.windows.list()</code></td><td>JSON of all windows with IDs, types, commands</td></tr>
<tr><td><code>system.windows.summary()</code></td><td>Human-readable screen summary</td></tr>
<tr><td><code>system.windows.focus(windowId)</code></td><td>Focus window</td></tr>
<tr><td><code>system.windows.close(windowId)</code></td><td>Close window</td></tr>
<tr><td><code>system.windows.minimize(windowId)</code></td><td>Minimize</td></tr>
<tr><td><code>system.windows.maximize(windowId)</code></td><td>Maximize/restore</td></tr>
<tr><td><code>system.windows.getFocused()</code></td><td>Focused window info</td></tr>
<tr><td><code>system.windows.getCommands(windowId)</code></td><td>Commands for window</td></tr>
<tr><td><code>system.windows.availableCommands()</code></td><td>All active widget commands</td></tr>
<tr><td><code>system.windows.isOpen(widgetType)</code></td><td>Check if open</td></tr>
<tr><td><code>system.windows.closeAll()</code></td><td>Close all</td></tr>
</tbody></table>

<h2>Tasks <span class="badge">task.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>task.add(title, dueDate?, dueTime?, priority?)</code></td><td>Create task (priority: low/medium/high)</td></tr>
<tr><td><code>task.list(status?)</code></td><td>List tasks (todo/in-progress/done)</td></tr>
<tr><td><code>task.complete(id)</code></td><td>Mark done</td></tr>
<tr><td><code>task.delete(id)</code></td><td>Delete</td></tr>
<tr><td><code>task.overdue()</code></td><td>Overdue tasks</td></tr>
<tr><td><code>task.upcoming(days?)</code></td><td>Next N days (default 7)</td></tr>
<tr><td><code>task.stats()</code></td><td>Statistics</td></tr>
</tbody></table>

<h2>Calendar <span class="badge">event.* / calendar.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>event.add(title, date, startTime?, endTime?)</code></td><td>Add event</td></tr>
<tr><td><code>event.list(date?)</code></td><td>List events</td></tr>
<tr><td><code>event.delete(id)</code></td><td>Delete event</td></tr>
<tr><td><code>calendar.open()</code></td><td>Open calendar</td></tr>
<tr><td><code>calendar.today()</code></td><td>Today's items</td></tr>
</tbody></table>

<h2>Scheduled Jobs <span class="badge">schedule.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>schedule.add(name, command, interval, unit, at?)</code></td><td>Create job (seconds/minutes/hours/days)</td></tr>
<tr><td><code>schedule.list()</code></td><td>List jobs</td></tr>
<tr><td><code>schedule.delete(id)</code></td><td>Delete job</td></tr>
<tr><td><code>schedule.toggle(id)</code></td><td>Enable/disable</td></tr>
<tr><td><code>schedule.status()</code></td><td>Engine status</td></tr>
</tbody></table>

<h2>Workflows <span class="badge">workflow.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>workflow.open()</code></td><td>Open builder</td></tr>
<tr><td><code>workflow.create(name?)</code></td><td>Create workflow</td></tr>
<tr><td><code>workflow.run(idOrName)</code></td><td>Execute</td></tr>
<tr><td><code>workflow.list()</code></td><td>List all</td></tr>
<tr><td><code>workflow.get(idOrName)</code></td><td>Get details</td></tr>
<tr><td><code>workflow.enable(idOrName)</code></td><td>Activate triggers</td></tr>
<tr><td><code>workflow.disable(idOrName)</code></td><td>Deactivate</td></tr>
<tr><td><code>workflow.delete(id)</code></td><td>Delete</td></tr>
<tr><td><code>workflow.duplicate(id)</code></td><td>Clone</td></tr>
<tr><td><code>workflow.abort(id)</code></td><td>Stop running</td></tr>
<tr><td><code>workflow.test()</code></td><td>Run 10 test workflows</td></tr>
</tbody></table>

<h2>Password Manager <span class="badge">password.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>password.open()</code></td><td>Open vault</td></tr>
<tr><td><code>password.add(title, user?, pass?, url?, cat?)</code></td><td>Add entry (auto-generates if no password)</td></tr>
<tr><td><code>password.get(titleOrId)</code></td><td>Get with decrypted password</td></tr>
<tr><td><code>password.list(category?)</code></td><td>List entries</td></tr>
<tr><td><code>password.search(query)</code></td><td>Search</td></tr>
<tr><td><code>password.delete(id)</code></td><td>Delete entry</td></tr>
<tr><td><code>password.generate(length?)</code></td><td>Generate + clipboard</td></tr>
<tr><td><code>password.lock()</code></td><td>Lock vault</td></tr>
<tr><td><code>password.categories()</code></td><td>List categories</td></tr>
</tbody></table>

<h2>Run Tracking <span class="badge">run.*</span></h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>run.get(runId)</code></td><td>Full run details</td></tr>
<tr><td><code>run.output(runId)</code></td><td>Just the output</td></tr>
<tr><td><code>run.await(runId)</code></td><td>Wait for completion</td></tr>
<tr><td><code>run.list(limit?)</code></td><td>Recent runs</td></tr>
<tr><td><code>run.chain(chainId)</code></td><td>Pipe chain steps</td></tr>
<tr><td><code>run.stats()</code></td><td>Statistics</td></tr>
<tr><td><code>run.search(query)</code></td><td>Search runs</td></tr>
<tr><td><code>run.running()</code></td><td>Currently executing</td></tr>
<tr><td><code>run.failed()</code></td><td>Recent failures</td></tr>
</tbody></table>

<h2>System Utilities</h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>system.notify(message)</code></td><td>Toast notification</td></tr>
<tr><td><code>system.screenshot()</code></td><td>Screenshot</td></tr>
<tr><td><code>system.setReminder(text)</code></td><td>Set reminder</td></tr>
<tr><td><code>system.settings.toggleTheme()</code></td><td>Toggle dark/light</td></tr>
<tr><td><code>system.docs.open(page?)</code></td><td>Open docs</td></tr>
<tr><td><code>help()</code></td><td>Command reference</td></tr>
</tbody></table>
</section>

<!-- ═══ WORKFLOWS ═══ -->
<section id="workflows" class="section" style="display:none">
<h1>Workflow Builder</h1>
<p>Create automated pipelines by connecting visual nodes on a canvas. Chain commands, add conditions, set delays, and produce outputs -- all without writing code.</p>

<h2>Node Types</h2>
<table><thead><tr><th>Node</th><th>Color</th><th>Purpose</th></tr></thead><tbody>
<tr><td><code>Trigger</code></td><td>Green</td><td>Entry point -- manual, event listener, or scheduled interval</td></tr>
<tr><td><code>Command</code></td><td>Blue</td><td>Execute any OniOS command with searchable dropdown and output type hints</td></tr>
<tr><td><code>Condition</code></td><td>Yellow</td><td>Branch TRUE/FALSE with deep path field comparison (dot notation)</td></tr>
<tr><td><code>Delay</code></td><td>Purple</td><td>Wait N seconds (data passes through unchanged)</td></tr>
<tr><td><code>Output</code></td><td>Pink</td><td>Log result or send toast notification</td></tr>
</tbody></table>

<h2>Building a Workflow</h2>
<ol>
<li><strong>Create</strong> -- Click + in sidebar</li>
<li><strong>Add nodes</strong> -- Double-click canvas or toolbar button</li>
<li><strong>Connect</strong> -- Click output port, then input port</li>
<li><strong>Configure</strong> -- Click node to open config panel</li>
<li><strong>Run</strong> -- Click green Run button</li>
</ol>

<h2>Trigger Types</h2>
<ul>
<li><strong>Manual</strong> -- Click Run to execute</li>
<li><strong>Event</strong> -- Auto-fires on system events (task:created, command:executed, etc.)</li>
<li><strong>Scheduled (Cron)</strong> -- Run every N seconds/minutes/hours/days</li>
</ul>

<h3>Known Events</h3>
<pre><code>task:created, task:completed, task:deleted, task:updated
calendar:event:created, calendar:event:deleted
scheduler:job:executed, scheduler:notification
command:executed, command:error
window:opened, window:closed, theme:changed</code></pre>

<h2>Deep Path Access (Conditions)</h2>
<p>Use dot notation to drill into nested objects:</p>
<pre><code>priority          checks input.priority
data.user.name    checks input.data.user.name
items[0].status   checks input.items[0].status
items.length      checks array length
(empty)           checks entire input</code></pre>
<p>Path suggestions come from runtime data (actual values after first run) and schema data (predicted shapes before first run).</p>

<h2>Data Flow</h2>
<pre><code>Trigger (event payload or manual metadata)
  -> Command (executes, returns output)
    -> Condition (checks field, routes TRUE/FALSE)
      -> TRUE:  Output (notification)
      -> FALSE: Delay -> Output (log)

Each node receives previous node's output as input.
Condition passes ORIGINAL input to both branches.
Delay passes input through unchanged.</code></pre>

<h2>Canvas Controls</h2>
<ul>
<li><strong>Zoom</strong> -- Ctrl/Cmd + scroll wheel, or +/- toolbar buttons (30%-200%)</li>
<li><strong>Pan</strong> -- Scroll normally</li>
<li><strong>Delete connection</strong> -- Hover line, click to remove</li>
</ul>

<h2>Enable / Disable</h2>
<p>Toggle Active/Paused per workflow. Only active workflows register event triggers and cron schedules.</p>
</section>

<!-- ═══ SCHEDULER ═══ -->
<section id="scheduler" class="section" style="display:none">
<h1>Scheduler, Tasks & Calendar</h1>
<p>Task manager, calendar, and cron-like scheduler engine. Persisted to localStorage, synced with server.</p>

<h2>Task Manager</h2>
<p>Tasks have: title, priority (low/medium/high), status (todo/in-progress/done), due date, due time. Emit events on EventBus.</p>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>task.add(title, dueDate?, dueTime?, priority?)</code></td><td>Create task. Date: "2025-03-01". Time: "14:00". Priority: "low"/"medium"/"high".</td></tr>
<tr><td><code>task.list(status?)</code></td><td>Filter by "todo", "in-progress", "done"</td></tr>
<tr><td><code>task.complete(id)</code></td><td>Mark done</td></tr>
<tr><td><code>task.delete(id)</code></td><td>Delete</td></tr>
<tr><td><code>task.overdue()</code></td><td>Overdue tasks</td></tr>
<tr><td><code>task.upcoming(days?)</code></td><td>Next N days (default 7)</td></tr>
<tr><td><code>task.stats()</code></td><td>total, todo, in-progress, done, overdue</td></tr>
</tbody></table>

<h2>Calendar Events</h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>event.add(title, date, startTime?, endTime?)</code></td><td>Add event</td></tr>
<tr><td><code>event.list(date?)</code></td><td>List by date</td></tr>
<tr><td><code>event.delete(id)</code></td><td>Delete</td></tr>
<tr><td><code>calendar.open()</code></td><td>Open calendar widget</td></tr>
<tr><td><code>calendar.today()</code></td><td>Today's items</td></tr>
</tbody></table>

<h2>Scheduled Jobs</h2>
<p>Cron-like jobs that auto-fire commands. 15-second tick loop.</p>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>schedule.add(name, command, interval, unit, at?)</code></td><td>Units: seconds/minutes/hours/days</td></tr>
<tr><td><code>schedule.list()</code></td><td>All jobs with status and run count</td></tr>
<tr><td><code>schedule.delete(id)</code></td><td>Delete job</td></tr>
<tr><td><code>schedule.toggle(id)</code></td><td>Enable/disable</td></tr>
<tr><td><code>schedule.status()</code></td><td>Engine status</td></tr>
</tbody></table>

<h3>Examples</h3>
<pre><code>schedule.add("Backup", "terminal.exec(\\"tar -czf ~/backup.tar.gz ~/Documents\\")", 6, "hours")
schedule.add("Overdue Check", "task.overdue()", 30, "minutes")</code></pre>

<h2>Event System</h2>
<pre><code>task:created       { id, title, priority, status, dueDate, dueTime }
task:completed     { id, title }
task:deleted       { id, title }
task:updated       { id, changes }
calendar:event:created   { id, title, date, startTime, endTime }
calendar:event:deleted   { id }
scheduler:job:executed   { jobId, name, command, result }
scheduler:notification   { message, type }</code></pre>

<h2>Server Sync</h2>
<p>/api/state for bidirectional sync. Client polls every 10 seconds. Server runs its own 15-second scheduler tick.</p>
</section>

<!-- ═══ PASSWORD MANAGER ═══ -->
<section id="passwords" class="section" style="display:none">
<h1>Password Manager</h1>
<p>Encrypted vault with master key protection, password generation, strength scoring, categories, and search. All data encrypted in localStorage.</p>

<h2>Security</h2>
<ul>
<li><strong>Master password</strong> -- Required to unlock. Hashed, never stored in plaintext.</li>
<li><strong>Encryption</strong> -- All entries encrypted at rest.</li>
<li><strong>No external transmission</strong> -- Passwords never leave the browser.</li>
</ul>

<h2>Features</h2>
<ul>
<li><strong>Password generation</strong> -- Configurable length, auto-copies to clipboard</li>
<li><strong>Strength scoring</strong> -- Visual strength indicator</li>
<li><strong>Categories</strong> -- Organize by general, dev, social, finance, etc.</li>
<li><strong>Search</strong> -- By title, username, or URL</li>
</ul>

<h2>All Commands</h2>
<table><thead><tr><th>Command</th><th>Description</th></tr></thead><tbody>
<tr><td><code>password.open()</code></td><td>Open vault</td></tr>
<tr><td><code>password.add(title, user?, pass?, url?, cat?)</code></td><td>Add entry (auto-generates password if omitted)</td></tr>
<tr><td><code>password.get(titleOrId)</code></td><td>Get with decrypted password</td></tr>
<tr><td><code>password.list(category?)</code></td><td>List entries</td></tr>
<tr><td><code>password.search(query)</code></td><td>Search</td></tr>
<tr><td><code>password.delete(id)</code></td><td>Delete</td></tr>
<tr><td><code>password.generate(length?)</code></td><td>Generate + clipboard copy</td></tr>
<tr><td><code>password.lock()</code></td><td>Lock vault</td></tr>
<tr><td><code>password.categories()</code></td><td>List categories</td></tr>
</tbody></table>

<h3>Examples</h3>
<pre><code>password.add("GitHub", "user@email.com", "MyP@ss123", "github.com", "dev")
password.add("Netflix", "user@email.com")   # auto-generates password
password.get("GitHub")
password.list("dev")
password.generate(24)
password.lock()</code></pre>
</section>

<!-- ═══ FILESYSTEM API ═══ -->
<section id="api-fs" class="section" style="display:none">
<h1>Filesystem API</h1>
<table><thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead><tbody>
<tr><td><span class="badge method">GET</span></td><td><code>/api/fs/list?path=</code></td><td>List directory. Returns array of {name, isDirectory, size, modified}. Supports ~ prefix.</td></tr>
<tr><td><span class="badge method">GET</span></td><td><code>/api/fs/read?path=</code></td><td>Read file as text. Returns {content, path}.</td></tr>
<tr><td><span class="badge post">POST</span></td><td><code>/api/fs/write</code></td><td>Write file. Body: {path, content}.</td></tr>
<tr><td><span class="badge post">POST</span></td><td><code>/api/fs/mkdir</code></td><td>Create directory. Body: {path}.</td></tr>
<tr><td><span class="badge delete">DELETE</span></td><td><code>/api/fs/delete?path=</code></td><td>Delete file or directory.</td></tr>
<tr><td><span class="badge post">POST</span></td><td><code>/api/fs/rename</code></td><td>Move/rename. Body: {from, to}.</td></tr>
<tr><td><span class="badge method">GET</span></td><td><code>/api/fs/media?path=</code></td><td>Stream media with HTTP range support.</td></tr>
<tr><td><span class="badge method">GET</span></td><td><code>/api/fs/stat?path=</code></td><td>File stats: size, modified, isDirectory.</td></tr>
</tbody></table>

<h2>cURL Examples</h2>
<pre><code># List home directory
curl http://localhost:5173/api/fs/list?path=~

# Read a file
curl "http://localhost:5173/api/fs/read?path=/Users/you/notes.txt"

# Write a file
curl -X POST http://localhost:5173/api/fs/write \\
  -H "Content-Type: application/json" \\
  -d '{"path": "/tmp/test.txt", "content": "Hello world"}'

# Create directory
curl -X POST http://localhost:5173/api/fs/mkdir \\
  -H "Content-Type: application/json" \\
  -d '{"path": "/tmp/new-folder"}'

# Delete
curl -X DELETE "http://localhost:5173/api/fs/delete?path=/tmp/test.txt"

# Rename
curl -X POST http://localhost:5173/api/fs/rename \\
  -H "Content-Type: application/json" \\
  -d '{"from": "/tmp/old.txt", "to": "/tmp/new.txt"}'</code></pre>
</section>

<!-- ═══ DOCUMENT API ═══ -->
<section id="api-docs" class="section" style="display:none">
<h1>Document API</h1>
<p>Parse and search PDF, Word, Excel, CSV, and text documents. Auto-indexes ~/Documents and ~/Desktop on startup.</p>
<table><thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead><tbody>
<tr><td><span class="badge method">GET</span></td><td><code>/api/docs/read?path=</code></td><td>Extract text. Returns {text, meta}.</td></tr>
<tr><td><span class="badge method">GET</span></td><td><code>/api/docs/search?q=</code></td><td>Full-text search. Ranked results with snippets.</td></tr>
<tr><td><span class="badge post">POST</span></td><td><code>/api/docs/parse</code></td><td>Parse document. Body: {path}.</td></tr>
<tr><td><span class="badge post">POST</span></td><td><code>/api/docs/create</code></td><td>Create document. Body: {path, content}.</td></tr>
<tr><td><span class="badge method">GET</span></td><td><code>/api/docs/info?path=</code></td><td>Metadata: pages, words, type, size.</td></tr>
<tr><td><span class="badge post">POST</span></td><td><code>/api/docs/index</code></td><td>Index file/dir. Body: {path, recursive?}.</td></tr>
<tr><td><span class="badge post">POST</span></td><td><code>/api/docs/find</code></td><td>Find in file. Body: {path, needle}.</td></tr>
</tbody></table>

<h2>cURL Examples</h2>
<pre><code># Parse a PDF
curl "http://localhost:5173/api/docs/read?path=/Users/you/report.pdf"

# Search documents
curl "http://localhost:5173/api/docs/search?q=budget+forecast"

# Index a folder
curl -X POST http://localhost:5173/api/docs/index \\
  -H "Content-Type: application/json" \\
  -d '{"path": "/Users/you/Documents", "recursive": true}'</code></pre>
</section>

<!-- ═══ TERMINAL WS ═══ -->
<section id="api-terminal" class="section" style="display:none">
<h1>Terminal WebSocket</h1>
<pre><code>WebSocket: ws://localhost:5173/ws/terminal

Protocol:
  Client sends: raw terminal input as text frames
  Server sends: raw terminal output as text frames
  Client sends: JSON { type: "resize", cols: 80, rows: 24 }

Each connection spawns a dedicated PTY process (bash/zsh).

Lifecycle:
  1. Client opens WebSocket to /ws/terminal
  2. Server spawns PTY child process
  3. Bidirectional data as text frames
  4. Client sends resize events as JSON
  5. On disconnect, PTY is terminated</code></pre>
</section>

<!-- ═══ SERVER SYNC ═══ -->
<section id="api-sync" class="section" style="display:none">
<h1>Server Sync & Search API</h1>
<table><thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead><tbody>
<tr><td><span class="badge method">GET</span></td><td><code>/api/state</code></td><td>Get server state (tasks, events, jobs). Client polls every 10s.</td></tr>
<tr><td><span class="badge post">POST</span></td><td><code>/api/state</code></td><td>Push local state. Body: {tasks, events, scheduledJobs}.</td></tr>
<tr><td><span class="badge method">GET</span></td><td><code>/api/brave-search?q=</code></td><td>Web search proxy (requires BRAVE_API_KEY env).</td></tr>
</tbody></table>

<h2>External Documentation</h2>
<table><thead><tr><th>URL</th><th>Description</th></tr></thead><tbody>
<tr><td><code>/docs</code></td><td>This page -- standalone HTML documentation</td></tr>
<tr><td><code>/swagger</code></td><td>Swagger UI with interactive API explorer</td></tr>
<tr><td><code>/swagger/spec.json</code></td><td>Raw OpenAPI 3.1 spec as JSON</td></tr>
</tbody></table>

<h2>Error Format</h2>
<pre><code>// All errors:
{ "error": "File not found: /path/to/file" }

// Success varies by endpoint:
{ "content": "...", "path": "..." }                  // fs/read
{ "items": [...], "path": "..." }                    // fs/list
{ "text": "...", "meta": { "pages": 5, "words": 1200 } }  // docs/read</code></pre>
</section>

<!-- ═══ AI INTEGRATION ═══ -->
<section id="ai" class="section" style="display:none">
<h1>AI Integration</h1>
<p>OniOS is designed from the ground up to be AI-controllable. The same command API that humans use can be called by any AI agent or LLM.</p>

<h2>Programmatic Execution</h2>
<pre><code>import { commandRegistry } from './core/CommandRegistry';

// Execute as AI (tagged for audit)
const handle = commandRegistry.execute('browser.openUrl("github.com")', 'ai');

handle.runId   // "run_abc123"
handle.status  // 'pending' | 'running' | 'resolved' | 'rejected'

// Await result
const run = await handle.await();
// run.output, run.status, run.error, run.duration</code></pre>

<h2>Context Engine</h2>
<table><thead><tr><th>Command</th><th>Returns</th></tr></thead><tbody>
<tr><td><code>context.summary()</code></td><td>Human/AI-readable text summary of full OS state</td></tr>
<tr><td><code>context.full()</code></td><td>JSON: all windows, files, documents, index stats</td></tr>
<tr><td><code>context.recentFiles()</code></td><td>Recently accessed file paths</td></tr>
<tr><td><code>context.openDocuments()</code></td><td>Documents in viewer</td></tr>
<tr><td><code>context.indexStats()</code></td><td>Document index: count, tokens</td></tr>
</tbody></table>

<h2>Active Widgets Layer</h2>
<table><thead><tr><th>Function</th><th>Returns</th></tr></thead><tbody>
<tr><td><code>getActiveContext()</code></td><td>Full JSON: all windows with IDs, types, props, commands</td></tr>
<tr><td><code>getScreenSummary()</code></td><td>Human-readable screen description</td></tr>
<tr><td><code>getWidgetCommands(windowId)</code></td><td>Commands for specific window</td></tr>
<tr><td><code>getFocusedWidget()</code></td><td>Currently focused window info</td></tr>
<tr><td><code>getAvailableCommands()</code></td><td>All commands from active widgets</td></tr>
<tr><td><code>isWidgetOpen(type)</code></td><td>Boolean check</td></tr>
<tr><td><code>findWindow(idOrType)</code></td><td>Find by ID or type</td></tr>
<tr><td><code>findWindowsByType(type)</code></td><td>All windows of type</td></tr>
</tbody></table>

<h2>Source Tagging</h2>
<p>Every command tagged: <code>"human"</code>, <code>"ai"</code>, <code>"workflow"</code>, or <code>"scheduler"</code>. Activity Log shows colored badges.</p>

<h2>Recommended AI Agent Pattern</h2>
<pre><code>// 1. Get context
context.summary()

// 2. Understand screen
system.windows.summary()

// 3. Search for info
search.all("budget report")

// 4. Take action
document.open("/Documents/budget.xlsx")

// 5. Extract content
document.getContent()

// 6. Report back
system.notify("Analysis complete")</code></pre>

<h2>Pipe Chaining</h2>
<pre><code>system.files.read("/tmp/data.txt") | system.notify()
// Reads file, sends content as notification

run.chain("chain_xyz")  // Inspect chain steps</code></pre>
</section>

<!-- ═══ EXTENDING ═══ -->
<section id="extending" class="section" style="display:none">
<h1>Extending OniOS</h1>
<p>Add new widgets, commands, backend plugins, workflow node types, and event hooks.</p>

<h2>Creating a Widget</h2>
<ol>
<li>Add directory under <code>src/widgets/YourWidget/</code></li>
<li>Register in <code>src/core/widgetRegistry.js</code></li>
<li>Register commands in <code>App.jsx</code></li>
<li>Emit events via EventBus</li>
</ol>
<pre><code>// widgetRegistry.js
registry.set('my-widget', {
  component: MyWidget,
  title: 'My Widget',
  icon: 'puzzle',
  defaultWidth: 600,
  defaultHeight: 400,
  singleton: false,
  commands: ['mywidget.doSomething'],
});</code></pre>

<h2>Registering Commands</h2>
<pre><code>commandRegistry.register(
  'mywidget.doSomething',
  (arg1, arg2) => {
    return "Result string or object";
  },
  {
    description: 'Shown in help and search',
    args: ['arg1', 'arg2?'],
    widget: 'my-widget',
  }
);</code></pre>

<h2>Backend Plugin</h2>
<pre><code>// plugins/myPlugin.js
export default function myPlugin() {
  return {
    name: 'my-plugin',
    configureServer(server) {
      server.middlewares.use('/api/my-endpoint', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: 'hello' }));
      });
    },
  };
}
// Register in vite.config.js plugins array</code></pre>

<h2>Event System</h2>
<pre><code>import { eventBus } from './core/EventBus';

eventBus.on('task:created', (payload) => { ... });
eventBus.emit('mywidget:ready', { source: 'my-widget' });
eventBus.once('mywidget:init', () => { ... });
const unsub = eventBus.on('event', handler); unsub();</code></pre>

<h2>Project Structure</h2>
<pre><code>onipal/
  src/
    core/           CommandParser, CommandRegistry, EventBus, etc.
    widgets/        All widget components
    stores/         Zustand state stores
    App.jsx         Main app + command registration
  plugins/          Vite server plugins
  docs/             Markdown documentation
  vite.config.js</code></pre>
</section>

</main>
</div>
<script>
function showSection(id){
  document.querySelectorAll('.section').forEach(s=>s.style.display='none');
  document.getElementById(id).style.display='block';
  document.querySelectorAll('.sidebar a').forEach(a=>a.classList.remove('active'));
  const link=document.querySelector('.sidebar a[href="#'+id+'"]');
  if(link)link.classList.add('active');
}
if(location.hash){const id=location.hash.slice(1);if(document.getElementById(id))showSection(id);}
</script>
</body>
</html>`;
