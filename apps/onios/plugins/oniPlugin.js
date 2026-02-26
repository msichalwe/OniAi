/**
 * Oni Gateway Integration Plugin
 *
 * Bridges Oni AI Gateway ↔ OniOS by:
 * 1. Exposing OniOS actions as REST API endpoints (gateway calls these)
 * 2. Proxying chat messages to/from Oni gateway via CLI
 * 3. Managing gateway connection state and config
 * 4. Serving workspace files from ~/.oni/workspace/
 *
 * Endpoints:
 *   GET    /api/oni/status              → connection status + config
 *   GET/POST /api/oni/config            → get/update Oni settings
 *   GET    /api/oni/skills              → list installed OniOS skills
 *   POST   /api/oni/install-skills      → install OniOS skill into Oni workspace
 *   POST   /api/oni/sync-identity       → sync OniOS identity into workspace files
 *   POST   /api/oni/chat                → send message through Oni gateway via CLI
 *   GET    /api/oni/workspace           → read workspace files
 *
 *   -- OniOS Action API (called BY Oni gateway) --
 *   POST   /api/oni/actions/task        → create/list/complete tasks
 *   POST   /api/oni/actions/window      → open/close/list windows
 *   POST   /api/oni/actions/note        → create/read/list notes
 *   POST   /api/oni/actions/terminal    → open terminal / run command
 *   POST   /api/oni/actions/file        → read/write/list files
 *   POST   /api/oni/actions/notification → send notification
 *   POST   /api/oni/actions/search      → web search
 *   POST   /api/oni/actions/calendar    → calendar events
 *   POST   /api/oni/actions/storage     → get/set storage
 *   POST   /api/oni/actions/system      → system info
 *   POST   /api/oni/actions/scheduler   → scheduler operations
 *   POST   /api/oni/actions/workflow    → workflow operations
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execSync } from 'child_process';

const ONIOS_DIR = path.join(os.homedir(), '.onios');
const ONI_DIR = path.join(os.homedir(), '.oni');
const ONI_WORKSPACE = path.join(ONI_DIR, 'workspace');
const ONI_SKILLS_DIR = path.join(ONI_WORKSPACE, 'skills');
const ONI_CONFIG = path.join(ONI_DIR, 'oni.json');
const CONFIG_FILE = path.join(ONIOS_DIR, 'oni-config.json');

const DEFAULT_CONFIG = {
    enabled: true,
    gatewayUrl: 'ws://127.0.0.1:19100',
    agentId: 'main',
    autoInstallSkills: true,
    mode: 'oni',
};

// ─── Action Event Bus ────────────────────────────────
// When gateway AI triggers /api/oni/actions/*, we push events here.
// Frontend subscribes via /api/oni/events SSE to see live action updates
// and execute corresponding widget commands.

const ACTION_EVENT_BUS = {
    _clients: new Set(),
    _queue: [],     // buffered events for active chat sessions

    /** Push an action event to all SSE clients and buffer for chat */
    push(event) {
        const payload = { ...event, timestamp: Date.now() };
        this._queue.push(payload);
        // Keep only last 50 events
        if (this._queue.length > 50) this._queue.shift();
        // Send to all SSE clients
        for (const client of this._clients) {
            try {
                client.write(`event: action\ndata: ${JSON.stringify(payload)}\n\n`);
            } catch { /* client disconnected */ }
        }
    },

    /** Drain buffered events since a timestamp */
    drain(since = 0) {
        const events = this._queue.filter(e => e.timestamp > since);
        return events;
    },

    /** Register an SSE client */
    addClient(res) {
        this._clients.add(res);
        res.on('close', () => this._clients.delete(res));
    },
};

// ─── Helpers ──────────────────────────────────────────

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON(filePath, fallback) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { /* corrupt */ }
    return fallback;
}

function writeJSON(filePath, data) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            try { resolve(JSON.parse(body)); } catch { resolve({}); }
        });
    });
}

function getConfig() {
    return readJSON(CONFIG_FILE, { ...DEFAULT_CONFIG });
}

function saveConfig(config) {
    writeJSON(CONFIG_FILE, config);
}

// ─── Oni Gateway Helpers ─────────────────────────────

const EXTRA_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
const CLI_ENV = { ...process.env, PATH: `${EXTRA_PATH}:${process.env.PATH || ''}` };

function getOniConfig() {
    return readJSON(ONI_CONFIG, {});
}

function isGatewayRunning() {
    try {
        const result = execSync('oni health 2>&1', { timeout: 5000, encoding: 'utf-8', env: CLI_ENV });
        return result.includes('ok') || result.includes('Gateway');
    } catch { return false; }
}

/**
 * Run `oni agent` CLI command to send a message through the gateway.
 */
function runOniAgent(message, sessionId, timeoutSec = 120) {
    return new Promise((resolve, reject) => {
        const config = getConfig();
        const agentId = config.agentId || 'main';
        const args = ['agent', '--agent', agentId, '-m', message, '--json', '--timeout', String(timeoutSec)];
        if (sessionId) args.push('--session-id', sessionId);

        const child = spawn('oni', args, {
            env: CLI_ENV,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: (timeoutSec + 10) * 1000,
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });

        child.on('error', (err) => reject(new Error(`CLI spawn error: ${err.message}`)));
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`oni agent exited with code ${code}: ${stderr.slice(0, 500)}`));
                return;
            }
            try {
                const jsonStart = stdout.indexOf('{');
                if (jsonStart < 0) {
                    resolve({ text: stdout.trim() || '(no response)', model: null, durationMs: null });
                    return;
                }
                const data = JSON.parse(stdout.substring(jsonStart));
                const payloads = data?.result?.payloads || data?.payloads || [];
                const text = payloads.map(p => p.text).filter(Boolean).join('\n') || '(no response)';
                const meta = data?.result?.meta?.agentMeta || data?.meta?.agentMeta || {};
                resolve({
                    text,
                    model: meta.model || null,
                    provider: meta.provider || null,
                    durationMs: data?.result?.meta?.durationMs || null,
                    usage: meta.usage || null,
                });
            } catch {
                resolve({ text: stdout.trim() || '(no response)', model: null, durationMs: null });
            }
        });
    });
}

// ─── OniOS System Prompt ──────────────────────────────

function buildOniOSSystemPrompt(port = 5173) {
    const base = `http://localhost:${port}/api/oni/actions`;
    return `[ONIOS] You are the AI brain inside OniOS — a web desktop OS. You control it via exec tool with curl.

## How to execute actions
Use exec tool: curl -sS -X POST ${base}/{action} -H 'Content-Type: application/json' -d '{...}'
ALWAYS use exec curl. NEVER fake results. Report the actual API response.

## Available Actions (all POST with JSON body)

**window** — Full window management
- List: {"action":"list"} → returns all open windows with IDs, types, focused/minimized state
- Open: {"action":"open","widgetType":"terminal|browser|notes|calendar|settings|file-explorer|code-editor|weather|calculator|docs|activity-log|task-manager|password-manager|workflow-builder|maps|media-player|clock|storage|web-search|camera|oni-chat"}
- Close: {"action":"close","windowId":"<id>"}
- Close all: {"action":"close_all"}
- Focus: {"action":"focus","windowId":"<id>"}
- Minimize: {"action":"minimize","windowId":"<id>"}
- Maximize: {"action":"maximize","windowId":"<id>"}
IMPORTANT: When you need to run a terminal command but a terminal is busy (installing, building, etc.), open a NEW terminal window instead of waiting. Use window list to check which terminals exist.

**terminal** — Shell commands (opens terminal widget + runs command)
- Open: {"action":"open"}
- Run: {"action":"run","command":"ls -la"}

**display** — Dynamic rich content widget (weather, search results, data, media, etc.)
Post JSON with title + sections array. A new widget window opens with the rendered content.
You can spawn MULTIPLE display widgets at once (e.g. current weather + weekly forecast).
Section types: hero, stats, cards, table, list, text, image, video, gallery, embed, progress, quote, code, kv, timeline, alert, weather, chart, search_results, article, divider
NEVER use emojis in icons or headings. Use article section for detailed content. Use search_results for web search.
MEDIA ROUTING: Video section has immersive glass player with dynamic background blur. For YouTube/Vimeo, set {"type":"video","src":"https://youtube.com/...","title":"...","channel":"...","views":"...","date":"..."}. For local videos use media-player widget directly. Image section has immersive glass design with blurred bg. Gallery section has glass grid with hover expand overlays.
Example: {"title":"Weather","sections":[{"type":"stats","items":[{"label":"Humidity","value":"45%"},{"label":"Wind","value":"12 km/h"},{"label":"UV","value":"High","color":"#f87171"}]},{"type":"weather","title":"This Week","items":[{"day":"Mon","high":"29°C","low":"18°C"},{"day":"Tue","high":"26°C","low":"17°C"}]}]}
For search results use search_results section. For stock data use stats+chart+table. For articles use article section. For media always use display widget with video/image/gallery sections — they have immersive glass designs.

**drawing** → /actions/drawing — AI-driven whiteboard. Opens Drawing Board and streams draw commands.
Use for: architecture diagrams, flowcharts, workflows, brainstorming, data visualizations, explanations.
- Open board: \`{"action":"open"}\`
- Clear board: \`{"action":"clear"}\`
- Draw: \`{"action":"draw","commands":[...]}\` — send array of draw protocol commands
Draw command types:
- shape.add: \`{"type":"shape.add","payload":{"id":"api","shape":"rect|ellipse|diamond|text|sticky|note|container","x":100,"y":100,"w":200,"h":80,"text":"API Gateway","fill":"rgba(80,130,255,0.12)","stroke":"rgba(80,130,255,0.5)"}}\`
- shape.update: \`{"type":"shape.update","payload":{"id":"api","text":"Updated"}}\`
- shape.delete: \`{"type":"shape.delete","payload":{"id":"api"}}\`
- edge.add: \`{"type":"edge.add","payload":{"id":"e1","from":"api","to":"db","label":"queries","arrow":true}}\`
- chart.create: \`{"type":"chart.create","payload":{"id":"c1","chartType":"bar|line","x":50,"y":300,"w":400,"h":200,"title":"Revenue","data":[{"label":"Q1","value":100},{"label":"Q2","value":150}]}}\`
- layout.auto: \`{"type":"layout.auto","payload":{"algorithm":"grid|vertical|horizontal|force"}}\` — auto-arrange shapes
- sim.create: \`{"type":"sim.create","payload":{"id":"s1","simType":"projectile|orbit|travel","params":{...}}}\`
Commands animate sequentially (150ms between steps). Use container shapes to group nodes. Label assumptions as note shapes.

**project** → /actions/project — Create and manage coding projects with organized file structure.
- Create: \`{"action":"create","name":"my-website","type":"website","description":"A landing page","stack":"HTML/CSS/JS","files":{"index.html":"<!DOCTYPE html>...","style.css":"body{...}","script.js":"console.log('hello')"}}\`
  Creates folder at ~/OniOS-Projects/my-website/ with all files + auto-generated context.md
  Then opens the Code Editor with that project folder.
- Open: \`{"action":"open","path":"/path/to/project"}\`
- List: \`{"action":"list"}\` — lists all projects in ~/OniOS-Projects/
- Write file: \`{"action":"write_file","path":"/project/path","filePath":"src/app.js","content":"..."}\`
- Read context: \`{"action":"read_context","path":"/project/path"}\` — read context.md
- Update context: \`{"action":"update_context","path":"/project/path","content":"# Updated..."}\`
IMPORTANT: When user asks to code something (website, app, script), ALWAYS:
1. Create the project via /actions/project with ALL files in the files object
2. The code editor opens automatically with the project
3. context.md is auto-generated for AI context preservation

**spacelens** → /actions/spacelens — Storage cleanup tool ONLY. Shows folder sizes as bubbles. **ONLY use when user asks about disk space, cleanup, or freeing storage.**
- Scan: \`{"action":"scan"}\` or \`{"action":"scan","path":"/Users/me/Downloads"}\`
- Delete: \`{"action":"delete","path":"/path/to/file"}\` — move to Trash
- Categories: \`{"action":"categories"}\` — size by category
IMPORTANT: Do NOT use Space Lens for general file searching, listing, or information. It is SLOW. For file operations use terminal (\`ls\`, \`find\`, \`du\`) or the file action instead.

**note** → /actions/note — Notes widget (Markdown-based documents stored at ~/Documents/).
- Create: \`{"action":"create","title":"Meeting Notes","content":"# Meeting Notes\\n\\n- Point 1\\n- Point 2"}\` — creates a .md file and opens Notes widget
- Create with path: \`{"action":"create","path":"~/Documents/ideas.md","content":"# Ideas\\n..."}\`
- List: \`{"action":"list"}\` — lists all notes/documents
- Read: \`{"action":"read","title":"Meeting Notes"}\` or \`{"action":"read","path":"~/Documents/meeting.md"}\`
The Notes widget is a full Markdown editor. When user asks to take notes, create a note, write something down, or save information — ALWAYS use the note action.

**password** → /actions/password — Password Manager (encrypted local vault).
IMPORTANT: This is NOT a /actions/ endpoint — use the command registry instead via window action:
- Open: \`{"action":"open","widgetType":"password-manager"}\` via /actions/window
- The Password Manager widget lets users add, view, search, copy, and delete passwords.
- It stores credentials locally with encryption.
- When user asks about passwords, logins, credentials, or saving a password, open the Password Manager.

**device** → /actions/device — **MACHINE CONTROL.** Full access to the host machine. Screenshot + vision, running apps, automation, email, browser, documents.
Phase 1 — Context:
- Full context: \`{"action":"context"}\` → running apps, focused window, system info, clipboard
- Screenshot: \`{"action":"screenshot","analyze":true,"prompt":"what am I looking at?"}\` → captures screen as base64 for vision AI analysis
- Running apps: \`{"action":"apps"}\` → list all running applications
- Focused window: \`{"action":"focused"}\` → current app name + window title
- Installed apps: \`{"action":"installed"}\` → all apps on the machine
- Clipboard: \`{"action":"clipboard"}\` (read) or \`{"action":"clipboard","write":"text"}\` (write)
- System state: \`{"action":"system"}\` → OS, memory, CPU, battery, wifi, volume
Phase 2 — App Control:
- Open app: \`{"action":"open_app","app":"Microsoft Outlook"}\`
- Automation: \`{"action":"automate","script":"tell app \\\\"Finder\\\\" to get name of every file of desktop"}\` — runs AppleScript (macOS), PowerShell (Windows), or shell (Linux)
- Keystrokes: \`{"action":"keystroke","keys":"cmd+n"}\` or \`{"action":"keystroke","text":"Hello world"}\`
Phase 3 — App-Specific:
- Email (Mail/Outlook): \`{"action":"email","subaction":"inbox"}\` · \`{"action":"email","subaction":"send","to":"x@y.com","subject":"Hi","body":"..."}\` · \`{"action":"email","subaction":"outlook_inbox"}\`
- Browser (Safari/Chrome): \`{"action":"browser","subaction":"tabs"}\` · \`{"action":"browser","subaction":"url"}\` · \`{"action":"browser","subaction":"content"}\` · \`{"action":"browser","subaction":"navigate","url":"..."}\`
- Documents: \`{"action":"document","subaction":"create","name":"Report","content":"..."}\` · \`{"action":"document","subaction":"open","path":"..."}\`
USE DEVICE when: user asks "what am I looking at?", "reply to that email", "open Word", "check my emails", "what apps are running?", "what's on my screen?", "copy this", etc. Take a screenshot to understand context, then use automation to act.

**task** — {"action":"create|list|complete|delete","title":"...","priority":"high|medium|low","id":"..."}
**file** — {"action":"list|read|write","path":"...","content":"..."} — Use for file browsing, reading, writing. FAST. Prefer this + terminal over spacelens.
**notification** — {"title":"...","message":"..."}
**search** — {"query":"..."} (use display action to show results visually)
**calendar** — {"action":"add|list|delete","title":"...","date":"YYYY-MM-DD","startTime":"HH:MM"}
**storage** — {"action":"get|set|delete|list","namespace":"...","key":"...","value":"..."}
**system** — {"action":"info"}
**scheduler** — {"action":"status|list_tasks|list_events|list_jobs|create_job","name":"...","cron":"..."}
**workflow** — {"action":"list|get|sync_to_oni","id":"..."}

## Rules
- ALWAYS call the API via exec curl. NEVER hallucinate.
- Call actions sequentially (one exec per action).
- Check window list before opening duplicates.
- If a terminal is busy, open a new terminal.
- **ALWAYS SPAWN VISUAL WIDGETS.** For almost every response, create a display widget. Even for simple answers, render them visually with stats, cards, lists, or text sections. The user expects to SEE results, not just read chat text. If in doubt, use display action.
- You can spawn multiple display widgets at once for split views (e.g. 3 weather cards).
- Actions happen in REAL-TIME on the user's desktop.
- **USE NOTIFICATIONS.** When completing tasks, confirming actions, warning about issues, or providing quick status updates, use the notification action: \`{"title":"...","message":"..."}\` via /actions/notification. Examples: "Task created!", "File saved", "Weather alert: rain expected", "Reminder: meeting in 30 min".
- For file searching/listing: use terminal (ls, find, du) or file action. NEVER use spacelens for general file ops.
- For notes: use the note action. Opens the Notes widget with Markdown editing.
- For passwords: open password-manager via window action.

`;
}

// ─── Workspace Identity Sync ─────────────────────────

const ONIOS_SOUL_SECTION = `
## OniOS Integration

You are embedded inside **OniOS**, a web-based desktop operating system powered by OniAI. When the user talks to you through OniOS, you are the OS's AI brain — not just a chatbot.

**How you work inside OniOS:**
- You control the OS through its REST API at \`http://localhost:5173/api/oni/actions/{action}\`
- Available actions: task, window, note, terminal, file, notification, search, storage, system, scheduler, workflow, drawing, project, display
- NEVER run native system commands directly. ALWAYS use the OniOS action API.
- NEVER hallucinate or pretend to do something. Actually call the API endpoint.
- The user sees everything happen in real-time on their desktop.
- You can open apps, create tasks, write notes, run terminal commands, manage files, search the web, and more — all through the API.

**Your role in OniOS:** You're not just answering questions. You're the integrated AI brain with real system access. When asked to do something, DO it via the API.
`;

const ONIOS_IDENTITY_SECTION = `- **Platform:** OniOS (web-based desktop OS) — embedded AI brain powered by OniAI
- **Tools:** OniOS REST API at http://localhost:5173/api/oni/actions/*
`;

const ONIOS_TOOLS_SECTION = `
## OniOS Action API

When running inside OniOS, ALL tool execution goes through the REST API:
\`POST http://localhost:5173/api/oni/actions/{action}\`

Actions: task, window, note, terminal, file, notification, search, storage, system, scheduler, workflow, drawing, project, display

Examples:
- Open terminal: \`{"action":"open","widgetType":"terminal"}\` → /actions/window
- Create task: \`{"action":"create","title":"...","priority":"high"}\` → /actions/task
- Run command: \`{"action":"run","command":"ls -la"}\` → /actions/terminal
- Create note: \`{"action":"create","title":"...","content":"..."}\` → /actions/note
- Draw diagram: \`{"action":"draw","commands":[{"type":"shape.add","payload":{"id":"s1","shape":"rect","x":100,"y":100,"text":"Node"}}]}\` → /actions/drawing
- Create project: \`{"action":"create","name":"my-app","files":{"index.html":"<h1>Hi</h1>"}}\` → /actions/project

NEVER run native commands. ALWAYS use the action API.
`;

function syncWorkspaceIdentity() {
    const files = {
        'SOUL.md': { marker: '## OniOS Integration', content: ONIOS_SOUL_SECTION },
        'IDENTITY.md': { marker: '- **Platform:** OniOS', content: ONIOS_IDENTITY_SECTION },
        'TOOLS.md': { marker: '## OniOS Action API', content: ONIOS_TOOLS_SECTION },
    };

    const results = [];
    for (const [filename, { marker, content }] of Object.entries(files)) {
        const filePath = path.join(ONI_WORKSPACE, filename);
        if (!fs.existsSync(filePath)) {
            results.push({ file: filename, status: 'not_found' });
            continue;
        }

        let existing = fs.readFileSync(filePath, 'utf-8');
        if (existing.includes(marker)) {
            results.push({ file: filename, status: 'already_synced' });
            continue;
        }

        existing = existing.trimEnd() + '\n' + content;
        fs.writeFileSync(filePath, existing);
        results.push({ file: filename, status: 'updated' });
    }
    return results;
}

// ─── SKILL.md Generation ──────────────────────────────

function generateOniOSSkillMD(port = 5173) {
    return `---
name: onios
description: "OniOS desktop control. Use exec tool with curl to call http://localhost:${port}/api/oni/actions/{action}. Actions: task, window, note, terminal, file, notification, display, drawing, project, spacelens, search, storage, system, scheduler, workflow, screen. All POST with JSON. ALWAYS use exec curl."
metadata: { "oni": { "emoji": "🖥️", "homepage": "http://localhost:${port}", "always": true } }
---

# OniOS — Desktop Control via \`exec\` + \`curl\`

Base: \`POST http://localhost:${port}/api/oni/actions/{action}\` with JSON body.

## Window Management → /actions/window
\`{"action":"list"}\` → returns open windows with IDs, types, focused/minimized state
\`{"action":"open","widgetType":"terminal|notes|calendar|settings|file-explorer|code-editor|calculator|docs|activity-log|task-manager|password-manager|workflow-builder|maps|media-player|clock|storage|camera|screen-capture|oni-chat|display"}\`
\`{"action":"close","windowId":"<id>"}\` · \`{"action":"close_all"}\`
\`{"action":"focus|minimize|maximize","windowId":"<id>"}\`

## Terminal → /actions/terminal
\`{"action":"open"}\` · \`{"action":"run","command":"ls -la"}\`

## Display Widget → /actions/display (USE FOR ALL VISUAL CONTENT)
Posts JSON \`{"title":"...","sections":[...]}\` → opens a rich content widget. Multiple simultaneous widgets supported.
Section types: hero, stats, cards, table, list, text, image, video, gallery, embed, progress, quote, code, kv, timeline, alert, weather, chart, search_results, article, divider

**DESIGN RULES:**
- Hero section is OPTIONAL. Only use it when a prominent title/banner makes sense (e.g. weather, profiles). Skip it for image grids, search results, data tables.
- NEVER use emojis in hero icons, stat icons, list icons, card icons, or headings. Keep it clean and professional.
- Use \`article\` section for ALL news, informative content, deep dives, explainers, and when the user asks for details about a topic.
  Article fields: title, subtitle, category, author, date, source, read_time, image/banner (URL), content (rich markdown body), key_points (array of strings), items (array of sub-articles: {title, description, image, source, date, author}), tags, source_url/url.
  For NEWS: always use article with items[] for multiple stories. Each item is clickable and sends context to AI for follow-up.
  For SINGLE TOPIC: use article with content (markdown body) + key_points for highlights.
  ALWAYS include source_url when the information comes from a real source. If you searched the web, link to the actual source.
- Use \`search_results\` section for raw web search results. Fields: query, items[{title, description/snippet, url, source, date}].
- **NEVER HALLUCINATE**: Do not invent news articles, dates, authors, URLs, or statistics. If you don't have real data, say so clearly. Only present information you actually retrieved from search or that you are confident about. When presenting news, always cite the real source and date. If search returned no results, tell the user honestly.
- Cards with \`image\` field are clickable — user can tap to see detail overlay. Add \`description\`, \`details\` (object), \`price\`, \`link\` for the expanded view.
- List items with \`details\` (object) are also clickable for expanded view.
- Gallery images are clickable for full preview. Use \`gallery\` for image-heavy results (shoes, products, photos).
- For ordered instructions (recipes, directions), use \`list\` with \`"ordered":true\`.
- Prefer \`gallery\` (columns:2 or 3) for product/image searches over cards.
- Use \`embed\` with a URL to preview websites inside the widget.
- Use \`code\` section to show generated code/websites with \`language\` field.

**Examples:**
- Weather: \`{"title":"Lusaka Weather","sections":[{"type":"stats","items":[{"label":"Now","value":"28°C"},{"label":"Humidity","value":"45%"},{"label":"Wind","value":"12km/h"}]},{"type":"weather","title":"This Week","items":[{"day":"Mon","high":"29°C","low":"18°C"}]}]}\`
- Article (single): \`{"title":"AI Deep Dive","sections":[{"type":"article","title":"How LLMs Work","subtitle":"A comprehensive guide","category":"Technology","author":"OniAI","date":"2026-02-26","read_time":"5 min read","image":"https://...","content":"# Introduction\\nLarge language models...","key_points":["LLMs use transformer architecture","Training requires massive datasets"],"tags":["AI","LLM"],"source_url":"https://..."}]}\`
- News feed: \`{"title":"Chelsea News","sections":[{"type":"article","title":"Chelsea FC Latest","category":"Sports","source":"BBC Sport","items":[{"title":"Chelsea sign new striker","description":"Blues complete deal...","source":"BBC Sport","date":"Feb 26, 2026","image":"https://..."},{"title":"Match preview: Chelsea vs Arsenal","description":"Key talking points...","source":"Sky Sports","date":"Feb 25, 2026"}]}]}\`
- Search: \`{"title":"Search Results","sections":[{"type":"search_results","query":"best laptops 2026","items":[{"title":"Top 10 Laptops","description":"Our picks for...","url":"https://example.com","source":"TechReview","date":"Feb 2026"}]}]}\`
- Image search: \`{"title":"Nike Shoes","sections":[{"type":"gallery","columns":2,"images":[{"src":"url","caption":"Air Max 90","title":"Air Max 90","price":"$120","description":"Classic runner","link":"url"}]}]}\`
- Recipe: \`{"title":"Pasta Carbonara","sections":[{"type":"list","title":"Ingredients","items":[{"title":"Spaghetti","value":"400g"}]},{"type":"list","title":"Steps","ordered":true,"items":[{"title":"Boil pasta","description":"Cook until al dente"}]}]}\`
- Data: \`{"title":"Stock Overview","sections":[{"type":"stats","items":[{"label":"AAPL","value":"$178","change":"+2.3%"}]},{"type":"table","headers":["Stock","Price","Change"],"rows":[["AAPL","$178","+2.3%"]]}]}\`
- Website preview: \`{"title":"My Site","sections":[{"type":"code","title":"index.html","language":"html","code":"<h1>Hello</h1>"},{"type":"embed","url":"https://example.com","height":400}]}\`
**Spawn multiple:** Call display action multiple times for dashboards (e.g. separate widgets for current conditions + weekly forecast).

## Other Actions
**task** → /actions/task — \`{"action":"create|list|complete|delete","title":"...","priority":"high|medium|low"}\`
**note** → /actions/note — \`{"action":"create|list|read","title":"...","content":"..."}\`
**file** → /actions/file — \`{"action":"list|read|write","path":"...","content":"..."}\`
**notification** → /actions/notification — \`{"title":"...","message":"..."}\`
**search** → /actions/search — \`{"query":"..."}\`
**calendar** → /actions/calendar — \`{"action":"add|list|delete","title":"...","date":"YYYY-MM-DD"}\`
**storage** → /actions/storage — \`{"action":"get|set|delete|list","namespace":"...","key":"..."}\`
**system** → /actions/system — \`{"action":"info"}\`
**scheduler** → /actions/scheduler — \`{"action":"status|list_jobs|create_job","name":"...","cron":"..."}\`
**workflow** → /actions/workflow — \`{"action":"list|get|sync_to_oni","id":"..."}\`
**screen** → /actions/screen — \`{"action":"screenshot"}\` takes a screenshot, \`{"action":"record_start"}\` starts recording, \`{"action":"record_stop"}\` stops recording. User selects screen/window.

## Drawing Board → /actions/drawing
Opens an AI-driven whiteboard. Send draw commands to create diagrams, charts, and animations.
- Open: \`{"action":"open"}\`
- Clear: \`{"action":"clear"}\`
- Draw: \`{"action":"draw","commands":[{"type":"shape.add","payload":{"id":"s1","shape":"rect","x":100,"y":100,"w":200,"h":80,"text":"Node"}},{"type":"edge.add","payload":{"id":"e1","from":"s1","to":"s2","label":"flow"}}]}\`
- Auto-layout: include \`{"type":"layout.auto","payload":{"algorithm":"grid|vertical|horizontal|force"}}\` in commands
- Simulate: include \`{"type":"sim.create","payload":{"id":"sim1","simType":"projectile|travel","shapeId":"s1","params":{"startX":100,"startY":400,"vx":50,"vy":-80}}}\` then \`{"type":"sim.run","payload":{"id":"sim1"}}\`

## Project Management → /actions/project
Create and manage coding projects with organized file structure + context.md for AI memory.
- Create: \`{"action":"create","name":"my-website","type":"website","description":"Landing page","stack":"HTML/CSS/JS","files":{"index.html":"<!DOCTYPE html>...","style.css":"body{...}","script.js":"console.log('hello')"}}\`
- Open: \`{"action":"open","path":"/path/to/project"}\`
- List: \`{"action":"list"}\`
- Write file: \`{"action":"write_file","path":"/project/path","filePath":"src/app.js","content":"..."}\`
- Read context: \`{"action":"read_context","path":"/project/path"}\`
IMPORTANT: When user asks to code something, ALWAYS create a project via /actions/project with ALL files. Code editor opens automatically.

## Space Lens → /actions/spacelens (ONLY for disk cleanup)
**ONLY use when user asks about disk space, cleanup, or freeing storage.** It is SLOW — never for general file ops.
- Scan: \`{"action":"scan"}\` or \`{"action":"scan","path":"/Users/me/Downloads"}\`
- Delete: \`{"action":"delete","path":"/path/to/file"}\` — move to Trash
- Categories: \`{"action":"categories"}\` — size by category

## Notes → /actions/note
Markdown-based notes stored at ~/Documents/. Opens Notes widget editor.
- Create: \`{"action":"create","title":"Meeting Notes","content":"# Meeting\\n- Point 1"}\`
- List: \`{"action":"list"}\`
- Read: \`{"action":"read","title":"Meeting Notes"}\`
When user asks to take notes, save info, write something down → use note action.

## Password Manager
Open via: \`{"action":"open","widgetType":"password-manager"}\` → /actions/window
Encrypted local vault. Users can add, view, search, copy, delete passwords.
When user asks about passwords, logins, credentials → open password-manager.

## Device Bridge → /actions/device (MACHINE CONTROL)
Full access to the host machine. Screenshot + vision, app automation, email, browser, documents.
- Context: \`{"action":"context"}\` — running apps, focused window, system, clipboard
- Screenshot: \`{"action":"screenshot","analyze":true,"prompt":"what is on screen?"}\`
- Apps: \`{"action":"apps"}\` · \`{"action":"focused"}\` · \`{"action":"installed"}\`
- Clipboard: \`{"action":"clipboard"}\` (read) · \`{"action":"clipboard","write":"text"}\`
- Open app: \`{"action":"open_app","app":"Microsoft Outlook"}\`
- Automate: \`{"action":"automate","script":"tell app \\\\"Mail\\\\" to get subject of every message of inbox"}\`
- Keystrokes: \`{"action":"keystroke","keys":"cmd+n"}\` · \`{"action":"keystroke","text":"Hello"}\`
- Email: \`{"action":"email","subaction":"inbox|send|outlook_inbox"}\`
- Browser: \`{"action":"browser","subaction":"tabs|url|content|navigate"}\`
- Document: \`{"action":"document","subaction":"create|open","name":"Report","content":"..."}\`
When user asks about their screen, emails, apps, or wants to control the machine → use device.

## Rules
- ALWAYS use exec curl. NEVER hallucinate results.
- **ALWAYS SPAWN VISUAL WIDGETS.** For almost every response, create a display widget. Even simple answers should be rendered visually. The user expects to SEE results on screen, not just chat text.
- Use **display** action for ANY visual content instead of just describing it in text.
- Use **drawing** action for diagrams, architecture, flowcharts, brainstorming, simulations.
- Use **project** action when user asks to code/build something (website, app, script).
- Use **device** action to understand and control the real machine (screenshot, apps, email, browser, automation).
- Use **spacelens** ONLY for disk cleanup. For file search/list use terminal or file action.
- Use **note** action when user wants to write/save notes.
- Open **password-manager** via window action for credential management.
- **USE NOTIFICATIONS** for confirmations, warnings, and quick status updates via /actions/notification.
- Spawn multiple display widgets for rich dashboards.
- Check window list before opening duplicates.
- If a terminal is busy, open a new one.
`;
}

// ─── Vite Plugin ──────────────────────────────────────

export default function oniPlugin() {
    return {
        name: 'oni-plugin',
        configureServer(server) {
            console.log('[Oni] Gateway integration plugin loaded');

            // Auto-sync OniOS identity into Oni workspace files
            try {
                const config = getConfig();
                if (config.enabled && config.mode === 'oni') {
                    const syncResults = syncWorkspaceIdentity();
                    const updated = syncResults.filter(r => r.status === 'updated');
                    if (updated.length > 0) {
                        console.log(`[Oni] Synced OniOS identity to: ${updated.map(r => r.file).join(', ')}`);
                    }
                }
            } catch (err) {
                console.warn('[Oni] Identity sync failed:', err.message);
            }

            // ─── Sync Identity ────────────────────────────
            server.middlewares.use('/api/oni/sync-identity', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                try {
                    const results = syncWorkspaceIdentity();
                    const skillDir = path.join(ONI_SKILLS_DIR, 'onios');
                    ensureDir(skillDir);
                    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), generateOniOSSkillMD());
                    json(res, { success: true, identity: results, skillUpdated: true });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── Status ──────────────────────────────────
            server.middlewares.use('/api/oni/status', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const config = getConfig();
                const oniInstalled = fs.existsSync(ONI_DIR);
                const skillInstalled = fs.existsSync(path.join(ONI_SKILLS_DIR, 'onios', 'SKILL.md'));
                let gatewayRunning = false;
                try { gatewayRunning = isGatewayRunning(); } catch { /* skip */ }

                const oniCfg = getOniConfig();
                const agents = oniCfg?.agents?.list || [];
                const mainAgent = agents.find(a => a.default) || agents[0];

                json(res, {
                    mode: config.mode,
                    enabled: config.enabled,
                    gatewayUrl: config.gatewayUrl,
                    gatewayRunning,
                    oniInstalled,
                    skillInstalled,
                    agentId: config.agentId || 'main',
                    agentName: mainAgent?.name || 'OniAI',
                    agentModel: mainAgent?.model?.primary || 'unknown',
                });
            });

            // ─── Config ──────────────────────────────────
            server.middlewares.use('/api/oni/config', async (req, res) => {
                if (req.method === 'GET') {
                    json(res, getConfig());
                    return;
                }
                if (req.method !== 'POST') { json(res, { error: 'GET/POST only' }, 405); return; }
                const body = await parseBody(req);
                const config = getConfig();
                const updated = { ...config, ...body };
                saveConfig(updated);
                json(res, { success: true, config: updated });
            });

            // ─── Dynamic Display Data Store (disk-backed) ──
            // Persists JSON data so widgets survive server restarts.
            const _displayFile = path.join(ONIOS_DIR, 'display-store.json');
            let _displayStore = new Map();
            try {
                if (fs.existsSync(_displayFile)) {
                    const raw = JSON.parse(fs.readFileSync(_displayFile, 'utf8'));
                    _displayStore = new Map(Object.entries(raw));
                }
            } catch { /* start fresh */ }
            function _saveDisplayStore() {
                try {
                    const obj = Object.fromEntries(_displayStore);
                    fs.writeFileSync(_displayFile, JSON.stringify(obj), 'utf8');
                } catch { /* ignore write errors */ }
            }

            server.middlewares.use('/api/oni/display', async (req, res) => {
                const urlPath = req.originalUrl || req.url;

                if (req.method === 'GET') {
                    const id = urlPath.replace('/api/oni/display/', '').split('?')[0];
                    if (!id || id === '' || id === 'display') {
                        const ids = [..._displayStore.keys()];
                        json(res, { ids, count: ids.length });
                        return;
                    }
                    const data = _displayStore.get(id);
                    if (!data) { json(res, { error: 'Display not found' }, 404); return; }
                    json(res, data);
                    return;
                }

                if (req.method === 'POST') {
                    const body = await parseBody(req);
                    const title = (body.title || 'Display').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 30);
                    const id = `d_${title}_${Date.now().toString(36)}`;
                    _displayStore.set(id, body);
                    if (_displayStore.size > 50) {
                        const oldest = _displayStore.keys().next().value;
                        _displayStore.delete(oldest);
                    }
                    _saveDisplayStore();
                    json(res, { success: true, id, title: body.title });
                    return;
                }

                json(res, { error: 'GET/POST only' }, 405);
            });

            // ─── Widget Context (pushed by frontend) ─────
            // GatewayClient pushes widget context here periodically.
            // Stores both human-readable summary and structured window data.
            let _latestWidgetContext = '';
            let _latestWindowData = { windows: [], timestamp: 0 };
            server.middlewares.use('/api/oni/context', async (req, res) => {
                if (req.method === 'GET') {
                    json(res, { context: _latestWidgetContext, windows: _latestWindowData.windows, timestamp: Date.now() });
                    return;
                }
                if (req.method !== 'POST') { json(res, { error: 'GET/POST only' }, 405); return; }
                const body = await parseBody(req);
                if (body.widgetContext) _latestWidgetContext = body.widgetContext;
                if (body.windows) _latestWindowData = { windows: body.windows, timestamp: Date.now() };
                json(res, { success: true });
            });

            // ─── Live Action Events (SSE) ────────────────
            // Frontend subscribes to this to see gateway AI actions in real-time
            // and execute corresponding widget commands locally.
            server.middlewares.use('/api/oni/events', (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'X-Accel-Buffering': 'no',
                });
                res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
                ACTION_EVENT_BUS.addClient(res);
                // Keep alive
                const keepAlive = setInterval(() => {
                    try { res.write(': keepalive\n\n'); } catch { clearInterval(keepAlive); }
                }, 15000);
                res.on('close', () => clearInterval(keepAlive));
            });

            // ─── Install Skills ──────────────────────────
            server.middlewares.use('/api/oni/install-skills', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                try {
                    const skillDir = path.join(ONI_SKILLS_DIR, 'onios');
                    ensureDir(skillDir);
                    const skillContent = generateOniOSSkillMD();
                    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);
                    json(res, {
                        success: true,
                        path: path.join(skillDir, 'SKILL.md'),
                        message: 'OniOS skill installed for Oni gateway',
                    });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── List Skills ─────────────────────────────
            server.middlewares.use('/api/oni/skills', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const skillPath = path.join(ONI_SKILLS_DIR, 'onios', 'SKILL.md');
                const installed = fs.existsSync(skillPath);
                json(res, {
                    skills: [{
                        name: 'onios',
                        installed,
                        path: installed ? skillPath : null,
                        description: 'OniOS desktop control — tasks, windows, notes, terminal, files, etc.',
                    }],
                });
            });

            // ─── Workspace Files ─────────────────────────
            server.middlewares.use('/api/oni/workspace', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }

                const files = [];
                const workspaceFiles = ['SOUL.md', 'IDENTITY.md', 'MEMORY.md', 'USER.md', 'HEARTBEAT.md', 'TOOLS.md', 'BOOTSTRAP.md'];

                for (const filename of workspaceFiles) {
                    const filePath = path.join(ONI_WORKSPACE, filename);
                    if (fs.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        const stat = fs.statSync(filePath);
                        files.push({
                            name: filename,
                            path: filePath,
                            type: 'workspace',
                            size: content.length,
                            content,
                            modified: stat.mtimeMs,
                        });
                    }
                }

                // Read skills
                const skillsDir = path.join(ONI_WORKSPACE, 'skills');
                if (fs.existsSync(skillsDir)) {
                    const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
                    for (const sd of skillDirs) {
                        const skillFile = path.join(skillsDir, sd.name, 'SKILL.md');
                        if (fs.existsSync(skillFile)) {
                            const content = fs.readFileSync(skillFile, 'utf-8');
                            const stat = fs.statSync(skillFile);
                            files.push({
                                name: `skills/${sd.name}/SKILL.md`,
                                path: skillFile,
                                type: 'skill',
                                size: content.length,
                                content,
                                modified: stat.mtimeMs,
                            });
                        }
                    }
                }

                const oniCfg = getOniConfig();
                const agents = oniCfg?.agents?.list || [];
                const mainAgent = agents.find(a => a.default) || agents[0];

                json(res, {
                    files,
                    agent: {
                        name: mainAgent?.name || 'OniAI',
                        model: mainAgent?.model?.primary || 'unknown',
                    },
                    totalFiles: files.length,
                    totalSize: files.reduce((sum, f) => sum + f.size, 0),
                });
            });

            // ─── Chat via Oni Gateway (CLI) ──────────────
            server.middlewares.use('/api/oni/chat', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }

                const config = getConfig();
                if (!config.enabled) {
                    json(res, { error: 'Oni gateway not enabled' }, 400);
                    return;
                }

                const body = await parseBody(req);
                const { message, conversationId, context } = body;

                if (!message) {
                    json(res, { error: 'message required' }, 400);
                    return;
                }

                const systemPrompt = buildOniOSSystemPrompt();
                let enrichedMessage = systemPrompt;
                if (context) {
                    const ctxParts = [];
                    if (context.windows) ctxParts.push(`Open windows: ${context.windows}`);
                    if (context.desktops) ctxParts.push(`Desktops: ${context.desktops}`);
                    if (context.theme) ctxParts.push(`Theme: ${context.theme}`);
                    if (context.time) ctxParts.push(`Time: ${context.time}`);
                    if (context.focusedWindow) ctxParts.push(`Focused window: ${context.focusedWindow}`);
                    if (ctxParts.length > 0) {
                        enrichedMessage += `\n[Desktop State: ${ctxParts.join(' | ')}]\n`;
                    }
                    // Include live widget states — prefer frontend-provided, fallback to stored
                    const widgetState = context.liveWidgetState || _latestWidgetContext;
                    if (widgetState) {
                        enrichedMessage += `\n[Live Widget State]\n${widgetState}\n`;
                    }
                }
                enrichedMessage += `\n${message}`;

                // SSE headers
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'X-Accel-Buffering': 'no',
                });

                const sendSSE = (event, data) => {
                    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
                };

                try {
                    console.log(`[Oni] Chat: sending to gateway (session: ${conversationId || 'new'})`);
                    const result = await runOniAgent(enrichedMessage, conversationId);

                    const text = result.text || '';
                    const CHUNK_SIZE = 20;
                    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
                        sendSSE('text_delta', { delta: text.slice(i, i + CHUNK_SIZE) });
                    }

                    sendSSE('done', {
                        model: result.model,
                        provider: result.provider,
                        durationMs: result.durationMs,
                        usage: result.usage,
                    });
                    console.log(`[Oni] Chat: response OK (${text.length} chars, model: ${result.model})`);
                } catch (err) {
                    console.error('[Oni] Chat error:', err.message);
                    let userError = err.message;
                    if (err.message.includes('cooldown') || err.message.includes('unavailable')) {
                        userError = 'Model is temporarily rate-limited. Please wait and try again.';
                    }
                    sendSSE('error', { error: userError });
                }

                res.end();
            });

            // ─── OniOS Action API (called BY Oni gateway) ─
            // Each action pushes an event to the frontend so widgets can react.
            server.middlewares.use('/api/oni/actions', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }

                const urlPath = req.originalUrl || req.url;
                const actionType = urlPath.replace('/api/oni/actions/', '').split('?')[0];
                const body = await parseBody(req);

                // Push "starting" event to frontend
                ACTION_EVENT_BUS.push({
                    type: 'action_start',
                    actionType,
                    action: body.action || actionType,
                    params: body,
                });

                try {
                    let result;
                    switch (actionType) {
                        case 'task': result = await handleTaskAction(body); break;
                        case 'window': result = await handleWindowAction(body, _latestWindowData); break;
                        case 'note': result = await handleNoteAction(body); break;
                        case 'terminal': result = await handleTerminalAction(body); break;
                        case 'file': result = await handleFileAction(body); break;
                        case 'notification':
                            result = { success: true, message: 'Notification sent', title: body.title, body: body.message };
                            break;
                        case 'search': result = await handleSearchAction(body); break;
                        case 'storage': result = await handleStorageAction(body); break;
                        case 'system': result = handleSystemAction(body); break;
                        case 'scheduler': result = await handleSchedulerAction(body); break;
                        case 'workflow': result = await handleWorkflowAction(body); break;
                        case 'screen': {
                            const screenAction = body.action || 'screenshot';
                            if (screenAction === 'screenshot') {
                                result = { success: true, message: 'Screenshot triggered — user will select screen/window' };
                            } else if (screenAction === 'record_start') {
                                result = { success: true, message: 'Screen recording started — user will select screen/window' };
                            } else if (screenAction === 'record_stop') {
                                result = { success: true, message: 'Screen recording stopped and saved' };
                            } else {
                                result = { success: false, error: `Unknown screen action: ${screenAction}` };
                            }
                            break;
                        }
                        case 'display': {
                            const title = (body.title || 'Display').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 30);
                            const id = `d_${title}_${Date.now().toString(36)}`;
                            _displayStore.set(id, body);
                            if (_displayStore.size > 50) {
                                const oldest = _displayStore.keys().next().value;
                                _displayStore.delete(oldest);
                            }
                            _saveDisplayStore();
                            result = { success: true, id, title: body.title, message: `Display "${body.title}" created (${id})` };
                            break;
                        }
                        case 'drawing': {
                            // Drawing board: accepts draw commands array or single command
                            // body.commands = array of draw protocol commands
                            // body.action = 'open' | 'clear' | 'draw'
                            const drawAction = body.action || 'draw';
                            if (drawAction === 'open') {
                                result = { success: true, message: 'Drawing Board opened' };
                            } else if (drawAction === 'clear') {
                                result = { success: true, message: 'Board cleared' };
                            } else {
                                const cmds = body.commands || body.steps || [body];
                                result = { success: true, commandCount: Array.isArray(cmds) ? cmds.length : 1, message: `${Array.isArray(cmds) ? cmds.length : 1} draw commands sent to board` };
                            }
                            break;
                        }
                        case 'project': {
                            result = await handleProjectAction(body);
                            break;
                        }
                        case 'spacelens': {
                            result = await handleSpaceLensAction(body);
                            break;
                        }
                        case 'device': {
                            result = await handleDeviceAction(body);
                            break;
                        }
                        default: json(res, { error: `Unknown action: ${actionType}` }, 400); return;
                    }

                    // Push "completed" event with result + command hint for frontend
                    ACTION_EVENT_BUS.push({
                        type: 'action_done',
                        actionType,
                        action: body.action || actionType,
                        params: body,
                        result,
                        // Frontend command hints — tells the frontend what widget command to execute
                        command: mapActionToCommand(actionType, body, result),
                    });

                    json(res, result);
                } catch (err) {
                    ACTION_EVENT_BUS.push({
                        type: 'action_error',
                        actionType,
                        action: body.action || actionType,
                        error: err.message,
                    });
                    console.error(`[Oni] Action '${actionType}' error:`, err);
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── Backward compatibility: redirect /api/openclaw/* to /api/oni/* ─
            server.middlewares.use('/api/openclaw', (req, res) => {
                const newUrl = (req.originalUrl || req.url).replace('/api/openclaw', '/api/oni');
                res.writeHead(308, { Location: newUrl });
                res.end();
            });
        },
    };
}

// ─── Action → Frontend Command Mapping ───────────────
// Maps server-side action API calls to frontend commandRegistry commands.
// The frontend uses these hints to open widgets, create tasks, etc.

// Widget type → command path for opening widgets.
// These MUST match the actual commandRegistry.register() paths in App.jsx.
const WIDGET_OPEN_COMMANDS = {
    'terminal': 'terminal.open',
    'display': 'display.render',
    'notes': 'document.open',
    'calendar': 'calendar.open',
    'settings': 'system.settings.open',
    'file-explorer': 'system.files.openExplorer',
    'code-editor': 'code.open',
    'calculator': 'widgets.calculator.open',
    'docs': 'system.docs.open',
    'activity-log': 'system.activity.open',
    'oni-chat': 'oni.chat',
    'password-manager': 'password.open',
    'workflow-builder': 'workflow.open',
    'task-manager': 'taskManager.open',
    'maps': 'maps.open',
    'media-player': 'system.media.open',
    'clock': 'system.info.clock',
    'storage': 'storage.open',
    'camera': 'camera.open',
    'screen-capture': 'screen.open',
    'document-viewer': 'document.open',
    'tasks': 'taskManager.open',
    'drawing': 'board.open',
    'space-lens': 'spacelens.open',
};

function mapActionToCommand(actionType, body, result) {
    const action = body.action || actionType;
    const esc = (s) => (s || '').replace(/"/g, '\\"');
    switch (actionType) {
        case 'task':
            if (action === 'create') return `task.add("${esc(body.title)}", "${esc(body.dueDate)}", "${esc(body.dueTime)}", "${esc(body.priority || 'medium')}")`;
            if (action === 'list') return 'task.list()';
            if (action === 'complete') return `task.complete("${esc(body.id)}")`;
            return 'taskManager.open()';
        case 'window': {
            if (action === 'open' && body.widgetType) {
                const cmd = WIDGET_OPEN_COMMANDS[body.widgetType];
                return cmd ? `${cmd}()` : null;
            }
            if (action === 'close' && body.windowId) return `system.windows.close("${esc(body.windowId)}")`;
            if (action === 'close_all') return 'system.windows.closeAll()';
            if (action === 'focus' && body.windowId) return `system.windows.focus("${esc(body.windowId)}")`;
            if (action === 'minimize' && body.windowId) return `system.windows.minimize("${esc(body.windowId)}")`;
            if (action === 'maximize' && body.windowId) return `system.windows.maximize("${esc(body.windowId)}")`;
            if (action === 'list') return 'system.windows.list()';
            return null;
        }
        case 'note':
            if (action === 'create') return `document.create("${esc(body.path || `~/Documents/${(body.title || 'note').replace(/[^a-zA-Z0-9-_ ]/g, '')}.md`)}", ${JSON.stringify(body.content || `# ${body.title || 'Note'}\n`)})`;
            if (action === 'list') return 'document.list()';
            return 'document.open()';
        case 'terminal':
            if (action === 'open') return 'terminal.open()';
            if (action === 'run' && body.command) return `terminal.exec("${esc(body.command)}")`;
            return 'terminal.open()';
        case 'file':
            if (action === 'list') return `system.files.list("${esc(body.path || '~')}")`;
            if (action === 'read') return `system.files.read("${esc(body.path)}")`;
            if (action === 'write') return `system.files.write("${esc(body.path)}", ${JSON.stringify(body.content || '')})`;
            return 'system.files.openExplorer()';
        case 'notification':
            return `system.notify("${esc(body.message || body.title)}")`;
        case 'search':
            return `web.search("${esc(body.query)}")`;
        case 'calendar':
            if (action === 'add' || body.title) return `event.add("${esc(body.title)}", "${esc(body.date)}", "${esc(body.startTime)}", "${esc(body.endTime)}")`;
            return 'calendar.open()';
        case 'storage':
            return null;
        case 'system':
            return null;
        case 'scheduler':
            if (action === 'create_job') return `schedule.add("${esc(body.name)}", "${esc(body.jobAction)}")`;
            return null;
        case 'workflow':
            if (action === 'list') return 'workflow.list()';
            return 'workflow.open()';
        case 'screen':
            if (action === 'screenshot') return 'screen.screenshot()';
            if (action === 'record_start') return 'screen.record.start()';
            if (action === 'record_stop') return 'screen.record.stop()';
            return 'screen.open()';
        case 'display':
            // Special: use the result.id that was just created
            if (result?.id) return `display.render("${result.id}")`;
            return null;
        case 'drawing': {
            const da = body.action || 'draw';
            if (da === 'open') return 'board.open()';
            if (da === 'clear') return 'board.clear()';
            const cmds = body.commands || body.steps || [body];
            return `board.draw(${JSON.stringify(cmds)})`;
        }
        case 'spacelens': {
            const sa = body.action || 'scan';
            if (sa === 'open' || sa === 'scan') return body.path ? `spacelens.scan("${esc(body.path)}")` : 'spacelens.open()';
            if (sa === 'drill' && body.path) return `spacelens.scan("${esc(body.path)}")`;
            if (sa === 'delete' && body.path) return `spacelens.delete("${esc(body.path)}")`;
            return 'spacelens.open()';
        }
        case 'project': {
            const pa = body.action || 'create';
            if (pa === 'create' && result?.path) return `code.openProject("${esc(result.path)}")`;
            if (pa === 'open' && body.path) return `code.openProject("${esc(body.path)}")`;
            return null;
        }
        case 'device':
            return null; // Device actions are data-only, no frontend command needed
        default:
            return null;
    }
}

// ─── Action Handlers ──────────────────────────────────

async function handleTaskAction(body) {
    const { action = 'list' } = body;
    switch (action) {
        case 'create': {
            const id = Math.random().toString(36).substring(2, 12).toUpperCase();
            return {
                success: true,
                task: {
                    id,
                    title: body.title || 'Untitled',
                    priority: body.priority || 'medium',
                    dueDate: body.dueDate || null,
                    dueTime: body.dueTime || null,
                    completed: false,
                    createdAt: new Date().toISOString(),
                },
                message: `Created task "${body.title}" (${id})`,
            };
        }
        case 'list':
            return { success: true, tasks: [], message: 'Task list (client-side store — use OniOS UI)' };
        case 'complete':
            return { success: true, message: `Task ${body.id} marked complete` };
        default:
            return { error: `Unknown task action: ${action}` };
    }
}

async function handleWindowAction(body, windowData) {
    const { action = 'list' } = body;
    const windows = windowData?.windows || [];
    switch (action) {
        case 'list':
            return {
                success: true,
                windows: windows.map(w => ({
                    id: w.id,
                    type: w.type,
                    title: w.title,
                    focused: w.focused,
                    minimized: w.minimized,
                })),
                count: windows.length,
                message: `${windows.length} window(s) open`,
            };
        case 'open':
            return { success: true, widgetType: body.widgetType, message: `Opening ${body.widgetType}` };
        case 'close':
            return { success: true, windowId: body.windowId, message: `Closing window ${body.windowId}` };
        case 'close_all':
            return { success: true, count: windows.length, message: `Closing all ${windows.length} window(s)` };
        case 'focus':
            return { success: true, windowId: body.windowId, message: `Focusing window ${body.windowId}` };
        case 'minimize':
            return { success: true, windowId: body.windowId, message: `Minimizing window ${body.windowId}` };
        case 'maximize':
            return { success: true, windowId: body.windowId, message: `Maximizing window ${body.windowId}` };
        default:
            return { error: `Unknown window action: ${action}` };
    }
}

async function handleNoteAction(body) {
    const NOTES_DIR = path.join(os.homedir(), 'Notes');
    const { action = 'list' } = body;
    switch (action) {
        case 'create': {
            ensureDir(NOTES_DIR);
            const title = body.title || 'Untitled';
            const filename = title.replace(/[^a-zA-Z0-9-_ ]/g, '') + '.md';
            const filePath = path.join(NOTES_DIR, filename);
            fs.writeFileSync(filePath, body.content || `# ${title}\n`);
            return { success: true, path: filePath, title, message: `Created note "${title}"` };
        }
        case 'list': {
            ensureDir(NOTES_DIR);
            const files = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
            return { success: true, notes: files.map(f => ({ name: f, path: path.join(NOTES_DIR, f) })) };
        }
        case 'read': {
            const filePath = body.path || body.id;
            if (!filePath || !fs.existsSync(filePath)) return { error: 'Note not found' };
            return { success: true, content: fs.readFileSync(filePath, 'utf-8') };
        }
        default:
            return { error: `Unknown note action: ${action}` };
    }
}

async function handleTerminalAction(body) {
    const { action = 'open' } = body;
    switch (action) {
        case 'open':
            return { success: true, message: 'Terminal opened (dispatched to client)' };
        case 'run': {
            if (!body.command) return { error: 'command required' };
            try {
                const output = execSync(body.command, {
                    timeout: body.timeout || 30000,
                    maxBuffer: 1024 * 1024,
                    encoding: 'utf-8',
                    cwd: body.cwd || os.homedir(),
                });
                return { success: true, output: output.trim(), command: body.command };
            } catch (err) {
                return {
                    success: false,
                    error: err.message,
                    output: err.stdout?.trim() || '',
                    stderr: err.stderr?.trim() || '',
                    exitCode: err.status,
                };
            }
        }
        default:
            return { error: `Unknown terminal action: ${action}` };
    }
}

async function handleFileAction(body) {
    const { action = 'list' } = body;
    const resolvePath = (p) => p.replace(/^~/, os.homedir());
    switch (action) {
        case 'list': {
            const dirPath = resolvePath(body.path || '~');
            if (!fs.existsSync(dirPath)) return { error: `Path not found: ${dirPath}` };
            const entries = fs.readdirSync(dirPath, { withFileTypes: true }).slice(0, 100);
            return {
                success: true,
                path: dirPath,
                entries: entries.map(e => ({
                    name: e.name,
                    type: e.isDirectory() ? 'directory' : 'file',
                    path: path.join(dirPath, e.name),
                })),
            };
        }
        case 'read': {
            const filePath = resolvePath(body.path);
            if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };
            const stat = fs.statSync(filePath);
            if (stat.size > 1024 * 1024) return { error: 'File too large (>1MB)' };
            return { success: true, content: fs.readFileSync(filePath, 'utf-8'), path: filePath };
        }
        case 'write': {
            const filePath = resolvePath(body.path);
            ensureDir(path.dirname(filePath));
            fs.writeFileSync(filePath, body.content || '');
            return { success: true, path: filePath, message: `Written ${body.content?.length || 0} bytes` };
        }
        default:
            return { error: `Unknown file action: ${action}` };
    }
}

async function handleSearchAction(body) {
    if (!body.query) return { error: 'query required' };
    return { success: true, query: body.query, results: [], message: 'Web search (use Oni Chat for search results)' };
}

async function handleStorageAction(body) {
    const STORAGE_FILE = path.join(ONIOS_DIR, 'storage.json');
    const store = readJSON(STORAGE_FILE, {});
    const { action = 'get', namespace = 'default', key } = body;
    const fullKey = `${namespace}:${key}`;
    switch (action) {
        case 'get':
            return { success: true, value: store[fullKey]?.value ?? null };
        case 'set':
            store[fullKey] = { value: body.value, ns: namespace, key, meta: { updated: Date.now() } };
            writeJSON(STORAGE_FILE, store);
            return { success: true, message: `Stored ${fullKey}` };
        case 'delete':
            delete store[fullKey];
            writeJSON(STORAGE_FILE, store);
            return { success: true, message: `Deleted ${fullKey}` };
        case 'list': {
            const keys = Object.keys(store).filter(k => !namespace || k.startsWith(namespace + ':'));
            return { success: true, keys };
        }
        default:
            return { error: `Unknown storage action: ${action}` };
    }
}

function handleSystemAction() {
    return {
        success: true,
        system: {
            platform: process.platform,
            hostname: os.hostname(),
            uptime: os.uptime(),
            time: new Date().toISOString(),
            homeDir: os.homedir(),
            oniosVersion: '0.1.0',
            gateway: 'oni',
        },
    };
}

async function handleSchedulerAction(body) {
    const { action = 'status' } = body;
    const SCHEDULER_FILE = path.join(os.homedir(), '.onios', 'scheduler.json');
    const state = readJSON(SCHEDULER_FILE, { tasks: [], events: [], scheduledJobs: [] });
    switch (action) {
        case 'status':
            return { success: true, tasks: state.tasks?.length || 0, events: state.events?.length || 0, jobs: state.scheduledJobs?.length || 0 };
        case 'list_tasks':
            return { success: true, tasks: state.tasks || [] };
        case 'list_events':
            return { success: true, events: state.events || [] };
        case 'list_jobs':
            return { success: true, jobs: state.scheduledJobs || [] };
        case 'create_job': {
            const job = {
                id: Math.random().toString(36).substring(2, 12),
                name: body.name || 'Untitled Job',
                cron: body.cron || '0 * * * *',
                action: body.jobAction || 'notify',
                payload: body.payload || {},
                enabled: true,
                createdAt: new Date().toISOString(),
                nextRun: null,
            };
            state.scheduledJobs = [...(state.scheduledJobs || []), job];
            writeJSON(SCHEDULER_FILE, state);
            return { success: true, job };
        }
        default:
            return { error: `Unknown scheduler action: ${action}` };
    }
}

async function handleProjectAction(body) {
    const { action = 'create' } = body;
    const PROJECTS_DIR = path.join(os.homedir(), 'OniOS-Projects');

    switch (action) {
        case 'create': {
            const name = body.name || body.projectName || 'untitled-project';
            const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
            const projectDir = path.join(body.path || PROJECTS_DIR, safeName);

            // Create project directory
            if (!fs.existsSync(projectDir)) {
                fs.mkdirSync(projectDir, { recursive: true });
            }

            // Write files if provided
            const filesWritten = [];
            if (body.files && typeof body.files === 'object') {
                for (const [filePath, content] of Object.entries(body.files)) {
                    const fullPath = path.join(projectDir, filePath);
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(fullPath, content, 'utf-8');
                    filesWritten.push(filePath);
                }
            }

            // Create context.md for AI context preservation
            const contextPath = path.join(projectDir, 'context.md');
            if (!fs.existsSync(contextPath)) {
                const contextContent = `# ${name}\n\n## Project Info\n- Created: ${new Date().toISOString()}\n- Type: ${body.type || 'general'}\n\n## Description\n${body.description || 'No description provided.'}\n\n## Tech Stack\n${body.stack || 'Not specified'}\n\n## Notes\n- This file is auto-generated by OniOS to preserve project context.\n- The AI reads this file when working on this project.\n- Feel free to edit it to add more context.\n`;
                fs.writeFileSync(contextPath, contextContent, 'utf-8');
                filesWritten.push('context.md');
            }

            return {
                success: true,
                path: projectDir,
                name: safeName,
                filesWritten,
                message: `Project "${name}" created at ${projectDir} with ${filesWritten.length} files`,
            };
        }
        case 'open': {
            const projectPath = body.path;
            if (!projectPath) return { error: 'Project path required' };
            if (!fs.existsSync(projectPath)) return { error: `Path not found: ${projectPath}` };
            return { success: true, path: projectPath, message: `Opening project: ${projectPath}` };
        }
        case 'list': {
            const baseDir = body.path || PROJECTS_DIR;
            if (!fs.existsSync(baseDir)) return { success: true, projects: [] };
            const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
                .filter(d => d.isDirectory() && !d.name.startsWith('.'))
                .map(d => {
                    const pPath = path.join(baseDir, d.name);
                    const ctxPath = path.join(pPath, 'context.md');
                    let description = '';
                    if (fs.existsSync(ctxPath)) {
                        const ctx = fs.readFileSync(ctxPath, 'utf-8');
                        const descMatch = ctx.match(/## Description\n(.*?)(\n##|\n$)/s);
                        if (descMatch) description = descMatch[1].trim();
                    }
                    return { name: d.name, path: pPath, description };
                });
            return { success: true, projects: dirs };
        }
        case 'write_file': {
            const projectPath = body.path || body.projectPath;
            if (!projectPath) return { error: 'Project path required' };
            if (!body.filePath) return { error: 'filePath required' };
            if (body.content === undefined) return { error: 'content required' };
            const fullPath = path.join(projectPath, body.filePath);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, body.content, 'utf-8');
            return { success: true, path: fullPath, message: `Wrote ${body.filePath}` };
        }
        case 'read_context': {
            const projectPath = body.path;
            if (!projectPath) return { error: 'Project path required' };
            const ctxPath = path.join(projectPath, 'context.md');
            if (!fs.existsSync(ctxPath)) return { success: true, context: null, message: 'No context.md found' };
            return { success: true, context: fs.readFileSync(ctxPath, 'utf-8') };
        }
        case 'update_context': {
            const projectPath = body.path;
            if (!projectPath) return { error: 'Project path required' };
            const ctxPath = path.join(projectPath, 'context.md');
            if (!body.content) return { error: 'content required' };
            fs.writeFileSync(ctxPath, body.content, 'utf-8');
            return { success: true, message: 'context.md updated' };
        }
        default:
            return { error: `Unknown project action: ${action}` };
    }
}

async function handleWorkflowAction(body) {
    const { action = 'list' } = body;
    const WORKFLOWS_DIR = path.join(os.homedir(), '.onios', 'workflows');
    switch (action) {
        case 'list': {
            if (!fs.existsSync(WORKFLOWS_DIR)) return { success: true, workflows: [] };
            const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
            const workflows = files.map(f => {
                const data = readJSON(path.join(WORKFLOWS_DIR, f), {});
                return { id: data.id || f.replace('.json', ''), name: data.name, steps: data.steps?.length || 0 };
            });
            return { success: true, workflows };
        }
        case 'get': {
            if (!body.id) return { error: 'workflow id required' };
            const wfPath = path.join(WORKFLOWS_DIR, `${body.id}.json`);
            if (!fs.existsSync(wfPath)) return { error: 'Workflow not found' };
            return { success: true, workflow: readJSON(wfPath, {}) };
        }
        case 'sync_to_oni': {
            const SCHEDULER_FILE = path.join(os.homedir(), '.onios', 'scheduler.json');
            const state = readJSON(SCHEDULER_FILE, { scheduledJobs: [] });
            const jobs = state.scheduledJobs || [];
            return {
                success: true,
                message: `${jobs.length} jobs available for sync`,
                jobs: jobs.map(j => ({ id: j.id, name: j.name, cron: j.cron, action: j.action })),
            };
        }
        default:
            return { error: `Unknown workflow action: ${action}` };
    }
}

// ─── Space Lens Handler ──────────────────────────────

function getDiskUsage() {
    try {
        const raw = execSync('df -k / 2>/dev/null', { encoding: 'utf-8' });
        const lines = raw.trim().split('\n');
        if (lines.length < 2) return null;
        const parts = lines[1].split(/\s+/);
        const total = parseInt(parts[1]) * 1024;
        const used = parseInt(parts[2]) * 1024;
        const available = parseInt(parts[3]) * 1024;
        return { total, used, available, percent: Math.round((used / total) * 100) };
    } catch { return null; }
}

function scanDirectory(dirPath, depth = 1, maxItems = 80) {
    const results = [];
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.') && entry.name !== '.Trash') continue;
            const fullPath = path.join(dirPath, entry.name);
            try {
                const stats = fs.lstatSync(fullPath);
                const isDir = entry.isDirectory() && !stats.isSymbolicLink();
                let size = 0;
                let childCount = 0;
                if (isDir) {
                    try {
                        const raw = execSync(`du -sk "${fullPath}" 2>/dev/null | head -1`, { encoding: 'utf-8', timeout: 10000 });
                        size = parseInt(raw.split('\t')[0] || '0') * 1024;
                    } catch { size = 0; }
                    try { childCount = fs.readdirSync(fullPath).length; } catch { childCount = 0; }
                } else {
                    size = stats.size || 0;
                }
                const ext = isDir ? null : path.extname(entry.name).toLowerCase().slice(1) || null;
                results.push({
                    name: entry.name,
                    path: fullPath,
                    isDir,
                    size,
                    childCount,
                    ext,
                    modified: stats.mtime?.toISOString(),
                });
            } catch { /* skip inaccessible */ }
        }
    } catch (err) {
        return { error: `Cannot read directory: ${err.message}`, items: [] };
    }
    results.sort((a, b) => b.size - a.size);
    return { items: results.slice(0, maxItems), totalItems: results.length };
}

async function handleSpaceLensAction(body) {
    const { action = 'scan' } = body;
    switch (action) {
        case 'scan':
        case 'open': {
            const targetPath = body.path || os.homedir();
            const disk = getDiskUsage();
            const scan = scanDirectory(targetPath);
            return {
                success: true,
                disk,
                path: targetPath,
                items: scan.items || [],
                totalItems: scan.totalItems || 0,
                message: `Scanned ${targetPath}: ${scan.items?.length || 0} items`,
            };
        }
        case 'drill': {
            if (!body.path) return { error: 'path required' };
            const scan = scanDirectory(body.path);
            return {
                success: true,
                path: body.path,
                items: scan.items || [],
                totalItems: scan.totalItems || 0,
            };
        }
        case 'info': {
            if (!body.path) return { error: 'path required' };
            try {
                const stats = fs.statSync(body.path);
                const isDir = stats.isDirectory();
                let size = stats.size;
                if (isDir) {
                    try {
                        const raw = execSync(`du -sk "${body.path}" 2>/dev/null | head -1`, { encoding: 'utf-8', timeout: 15000 });
                        size = parseInt(raw.split('\t')[0] || '0') * 1024;
                    } catch { /* keep stats.size */ }
                }
                return {
                    success: true,
                    info: {
                        path: body.path,
                        name: path.basename(body.path),
                        isDir,
                        size,
                        created: stats.birthtime?.toISOString(),
                        modified: stats.mtime?.toISOString(),
                        accessed: stats.atime?.toISOString(),
                        permissions: stats.mode?.toString(8).slice(-3),
                    },
                };
            } catch (err) {
                return { error: `Cannot access: ${err.message}` };
            }
        }
        case 'delete': {
            if (!body.path) return { error: 'path required' };
            const target = body.path;
            // Safety: never delete critical system paths
            const blocked = ['/', '/System', '/Library', '/usr', '/bin', '/sbin', '/var', '/private', '/etc', '/tmp', '/cores', os.homedir()];
            if (blocked.includes(target) || blocked.some(b => target === b + '/')) {
                return { error: `Cannot delete protected path: ${target}` };
            }
            try {
                if (body.trash !== false) {
                    // Move to trash (macOS)
                    execSync(`osascript -e 'tell application "Finder" to delete POSIX file "${target}"' 2>/dev/null`, { timeout: 10000 });
                    return { success: true, message: `Moved to Trash: ${path.basename(target)}` };
                } else {
                    fs.rmSync(target, { recursive: true, force: true });
                    return { success: true, message: `Permanently deleted: ${path.basename(target)}` };
                }
            } catch (err) {
                return { error: `Delete failed: ${err.message}` };
            }
        }
        case 'reveal': {
            if (!body.path) return { error: 'path required' };
            try {
                execSync(`open -R "${body.path}" 2>/dev/null`, { timeout: 5000 });
                return { success: true, message: `Revealed in Finder: ${path.basename(body.path)}` };
            } catch (err) {
                return { error: `Reveal failed: ${err.message}` };
            }
        }
        case 'categories': {
            // Scan common directories and categorize
            const home = os.homedir();
            const cats = [
                { name: 'Applications', path: '/Applications', icon: 'app' },
                { name: 'Documents', path: path.join(home, 'Documents'), icon: 'doc' },
                { name: 'Downloads', path: path.join(home, 'Downloads'), icon: 'download' },
                { name: 'Desktop', path: path.join(home, 'Desktop'), icon: 'desktop' },
                { name: 'Pictures', path: path.join(home, 'Pictures'), icon: 'image' },
                { name: 'Music', path: path.join(home, 'Music'), icon: 'music' },
                { name: 'Movies', path: path.join(home, 'Movies'), icon: 'video' },
                { name: 'Library', path: path.join(home, 'Library'), icon: 'system' },
            ];
            const results = cats.map(cat => {
                let size = 0;
                try {
                    const raw = execSync(`du -sk "${cat.path}" 2>/dev/null | head -1`, { encoding: 'utf-8', timeout: 15000 });
                    size = parseInt(raw.split('\t')[0] || '0') * 1024;
                } catch { /* skip */ }
                return { ...cat, size };
            });
            return { success: true, categories: results.filter(c => c.size > 0) };
        }
        default:
            return { error: `Unknown spacelens action: ${action}` };
    }
}

// ─── Device Bridge Handler (All Phases) ─────────────

const SCREENSHOT_DIR = path.join(os.tmpdir(), 'onios-screenshots');
const platform = os.platform(); // 'darwin' | 'win32' | 'linux'

async function handleDeviceAction(body) {
    const { action = 'context' } = body;
    switch (action) {

        // ═══ PHASE 1: CONTEXT ═══════════════════════════

        case 'context': {
            const [apps, focused, sysInfo, clip] = await Promise.all([
                _getRunningApps(),
                _getFocusedWindow(),
                _getSystemState(),
                _getClipboard(),
            ]);
            return { success: true, platform, apps, focused, system: sysInfo, clipboard: clip };
        }

        case 'screenshot': {
            ensureDir(SCREENSHOT_DIR);
            const filePath = path.join(SCREENSHOT_DIR, `screen_${Date.now()}.png`);
            try {
                if (platform === 'darwin') {
                    execSync(`screencapture -x -C "${filePath}"`, { timeout: 10000 });
                } else if (platform === 'win32') {
                    execSync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bmp = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bmp.Save('${filePath}') }"`, { timeout: 10000 });
                } else {
                    execSync(`import -window root "${filePath}" 2>/dev/null || scrot "${filePath}" 2>/dev/null`, { timeout: 10000 });
                }
                // Read as base64 for vision analysis
                const base64 = fs.readFileSync(filePath).toString('base64');
                const sizeKB = Math.round(fs.statSync(filePath).size / 1024);
                // Auto-delete after 60s
                setTimeout(() => { try { fs.unlinkSync(filePath); } catch {} }, 60000);
                return {
                    success: true,
                    path: filePath,
                    base64: body.includeBase64 !== false ? base64 : undefined,
                    mimeType: 'image/png',
                    sizeKB,
                    message: `Screenshot captured (${sizeKB}KB)`,
                    prompt: body.prompt || body.analyze ? 'Describe what you see on this screen in detail.' : undefined,
                };
            } catch (err) {
                return { error: `Screenshot failed: ${err.message}` };
            }
        }

        case 'apps': {
            const apps = await _getRunningApps();
            return { success: true, apps, count: apps.length };
        }

        case 'focused': {
            const focused = await _getFocusedWindow();
            return { success: true, ...focused };
        }

        case 'installed': {
            const installed = _getInstalledApps();
            return { success: true, apps: installed, count: installed.length };
        }

        case 'clipboard': {
            if (body.write !== undefined) {
                _setClipboard(String(body.write));
                return { success: true, message: 'Clipboard updated' };
            }
            const content = _getClipboard();
            return { success: true, content };
        }

        case 'system': {
            const sysInfo = _getSystemState();
            return { success: true, ...sysInfo };
        }

        // ═══ PHASE 2: APP CONTROL ═══════════════════════

        case 'open_app': {
            if (!body.app) return { error: 'app name required' };
            try {
                if (platform === 'darwin') {
                    execSync(`open -a "${body.app}" 2>/dev/null`, { timeout: 10000 });
                } else if (platform === 'win32') {
                    execSync(`start "" "${body.app}"`, { timeout: 10000, shell: true });
                } else {
                    execSync(`${body.app} &`, { timeout: 5000, shell: true });
                }
                return { success: true, message: `Opened ${body.app}` };
            } catch (err) {
                return { error: `Failed to open ${body.app}: ${err.message}` };
            }
        }

        case 'automate': {
            if (!body.script) return { error: 'script required' };
            try {
                let output;
                if (platform === 'darwin') {
                    output = execSync(`osascript -e '${body.script.replace(/'/g, "'\\''")}'`, { encoding: 'utf-8', timeout: 30000 });
                } else if (platform === 'win32') {
                    output = execSync(`powershell -Command "${body.script.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', timeout: 30000 });
                } else {
                    output = execSync(body.script, { encoding: 'utf-8', timeout: 30000 });
                }
                return { success: true, output: output.trim(), message: 'Script executed' };
            } catch (err) {
                return { error: `Automation failed: ${err.message}`, output: err.stdout?.toString().trim() || '' };
            }
        }

        case 'keystroke': {
            try {
                if (platform === 'darwin') {
                    if (body.text) {
                        execSync(`osascript -e 'tell application "System Events" to keystroke "${body.text.replace(/"/g, '\\"')}"'`, { timeout: 5000 });
                    }
                    if (body.keys) {
                        // Convert "cmd+n" → 'keystroke "n" using {command down}'
                        const script = _buildKeystrokeScript(body.keys);
                        execSync(`osascript -e '${script}'`, { timeout: 5000 });
                    }
                } else if (platform === 'win32') {
                    if (body.text) {
                        execSync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${body.text}')"`, { timeout: 5000 });
                    }
                } else {
                    if (body.text) execSync(`xdotool type -- "${body.text}"`, { timeout: 5000 });
                    if (body.keys) execSync(`xdotool key ${body.keys.replace(/\+/g, '+')}`, { timeout: 5000 });
                }
                return { success: true, message: `Keystrokes sent` };
            } catch (err) {
                return { error: `Keystroke failed: ${err.message}` };
            }
        }

        // ═══ PHASE 3: APP-SPECIFIC INTEGRATIONS ═════════

        case 'email': {
            return await _handleEmail(body);
        }

        case 'browser': {
            return await _handleBrowser(body);
        }

        case 'document': {
            return await _handleDocument(body);
        }

        default:
            return { error: `Unknown device action: ${action}` };
    }
}

// ─── Device Helpers ─────────────────────────────────

function _getRunningApps() {
    try {
        if (platform === 'darwin') {
            const raw = execSync(`osascript -e 'tell application "System Events" to get name of every application process whose background only is false'`, { encoding: 'utf-8', timeout: 5000 });
            return raw.trim().split(', ').filter(Boolean).map(name => ({ name }));
        } else if (platform === 'win32') {
            const raw = execSync('tasklist /FO CSV /NH', { encoding: 'utf-8', timeout: 5000 });
            const seen = new Set();
            return raw.trim().split('\n').map(line => {
                const name = line.split(',')[0]?.replace(/"/g, '').trim();
                if (!name || seen.has(name)) return null;
                seen.add(name);
                return { name };
            }).filter(Boolean).slice(0, 50);
        } else {
            const raw = execSync("wmctrl -l 2>/dev/null || xdotool search --name '' getwindowname 2>/dev/null", { encoding: 'utf-8', timeout: 5000 });
            return raw.trim().split('\n').filter(Boolean).map(name => ({ name: name.trim() }));
        }
    } catch { return []; }
}

function _getFocusedWindow() {
    try {
        if (platform === 'darwin') {
            const app = execSync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`, { encoding: 'utf-8', timeout: 3000 }).trim();
            let title = '';
            try {
                title = execSync(`osascript -e 'tell application "System Events" to get title of front window of first application process whose frontmost is true'`, { encoding: 'utf-8', timeout: 3000 }).trim();
            } catch { /* some apps don't expose window title */ }
            return { app, title, platform: 'macOS' };
        } else if (platform === 'win32') {
            const title = execSync('powershell -Command "(Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object -First 1).MainWindowTitle"', { encoding: 'utf-8', timeout: 3000 }).trim();
            return { app: title.split(' - ').pop() || title, title, platform: 'Windows' };
        } else {
            const title = execSync("xdotool getactivewindow getwindowname 2>/dev/null", { encoding: 'utf-8', timeout: 3000 }).trim();
            return { app: title, title, platform: 'Linux' };
        }
    } catch { return { app: 'unknown', title: '', platform }; }
}

function _getInstalledApps() {
    try {
        if (platform === 'darwin') {
            const raw = execSync('ls /Applications/ 2>/dev/null | grep ".app$"', { encoding: 'utf-8', timeout: 5000 });
            return raw.trim().split('\n').filter(Boolean).map(name => ({ name: name.replace('.app', '') }));
        } else if (platform === 'win32') {
            const raw = execSync('powershell -Command "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Select-Object DisplayName | Format-Table -HideTableHeaders"', { encoding: 'utf-8', timeout: 10000 });
            return raw.trim().split('\n').filter(Boolean).map(name => ({ name: name.trim() })).filter(a => a.name);
        } else {
            const raw = execSync('ls /usr/share/applications/ 2>/dev/null | grep ".desktop$"', { encoding: 'utf-8', timeout: 5000 });
            return raw.trim().split('\n').filter(Boolean).map(name => ({ name: name.replace('.desktop', '') }));
        }
    } catch { return []; }
}

function _getClipboard() {
    try {
        if (platform === 'darwin') return execSync('pbpaste 2>/dev/null', { encoding: 'utf-8', timeout: 3000, maxBuffer: 1024 * 100 }).substring(0, 5000);
        if (platform === 'win32') return execSync('powershell -Command "Get-Clipboard"', { encoding: 'utf-8', timeout: 3000 }).substring(0, 5000);
        return execSync('xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null', { encoding: 'utf-8', timeout: 3000 }).substring(0, 5000);
    } catch { return ''; }
}

function _setClipboard(text) {
    try {
        if (platform === 'darwin') execSync(`echo "${text.replace(/"/g, '\\"')}" | pbcopy`, { timeout: 3000 });
        else if (platform === 'win32') execSync(`powershell -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`  , { timeout: 3000 });
        else execSync(`echo "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard`, { timeout: 3000 });
    } catch { /* ignore */ }
}

function _getSystemState() {
    const info = { platform: os.platform(), arch: os.arch(), hostname: os.hostname(), uptime: Math.round(os.uptime()), cpus: os.cpus().length, totalMemory: os.totalmem(), freeMemory: os.freemem() };
    try {
        if (platform === 'darwin') {
            try { info.battery = JSON.parse(execSync('pmset -g batt 2>/dev/null | grep -o "[0-9]*%" | head -1', { encoding: 'utf-8', timeout: 3000 }).trim() || '""'); } catch { /* no battery */ }
            try { info.volume = execSync('osascript -e "output volume of (get volume settings)"', { encoding: 'utf-8', timeout: 3000 }).trim(); } catch {}
            try { info.wifi = execSync('/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I 2>/dev/null | grep " SSID" | awk \'{print $2}\'', { encoding: 'utf-8', timeout: 3000 }).trim(); } catch {}
            try { info.displays = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep Resolution', { encoding: 'utf-8', timeout: 5000 }).trim(); } catch {}
        }
    } catch {}
    return info;
}

function _buildKeystrokeScript(keys) {
    const parts = keys.toLowerCase().split('+').map(k => k.trim());
    const key = parts.pop();
    const modifiers = [];
    if (parts.includes('cmd') || parts.includes('command')) modifiers.push('command down');
    if (parts.includes('shift')) modifiers.push('shift down');
    if (parts.includes('alt') || parts.includes('option')) modifiers.push('option down');
    if (parts.includes('ctrl') || parts.includes('control')) modifiers.push('control down');
    const using = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';
    return `tell application "System Events" to keystroke "${key}"${using}`;
}

// ─── Phase 3: App-Specific Helpers ──────────────────

async function _handleEmail(body) {
    const emailAction = body.subaction || 'inbox';
    if (platform !== 'darwin') return { error: 'Email automation currently macOS only (AppleScript)' };
    try {
        switch (emailAction) {
            case 'inbox': {
                const script = `
                    tell application "Mail"
                        set msgList to {}
                        repeat with msg in (messages of inbox)
                            set end of msgList to {subject:subject of msg, sender:sender of msg, dateReceived:date received of msg as string, readStatus:read status of msg}
                            if (count of msgList) >= ${body.limit || 10} then exit repeat
                        end repeat
                        return msgList
                    end tell`;
                const output = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { encoding: 'utf-8', timeout: 15000 });
                return { success: true, emails: output.trim(), message: 'Inbox retrieved' };
            }
            case 'send': {
                if (!body.to || !body.subject || !body.body) return { error: 'to, subject, body required' };
                const script = `
                    tell application "Mail"
                        set newMsg to make new outgoing message with properties {subject:"${body.subject}", content:"${body.body}", visible:true}
                        tell newMsg to make new to recipient at end of to recipients with properties {address:"${body.to}"}
                        ${body.sendNow ? 'send newMsg' : ''}
                    end tell`;
                execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 10000 });
                return { success: true, message: body.sendNow ? `Email sent to ${body.to}` : `Email draft created for ${body.to}` };
            }
            case 'outlook_inbox': {
                const script = `tell application "Microsoft Outlook" to get {subject, sender} of first ${body.limit || 10} messages of inbox`;
                const output = execSync(`osascript -e '${script}'`, { encoding: 'utf-8', timeout: 15000 });
                return { success: true, emails: output.trim(), message: 'Outlook inbox retrieved' };
            }
            default:
                return { error: `Unknown email action: ${emailAction}` };
        }
    } catch (err) {
        return { error: `Email automation failed: ${err.message}` };
    }
}

async function _handleBrowser(body) {
    const browserAction = body.subaction || 'tabs';
    if (platform !== 'darwin') return { error: 'Browser automation currently macOS only (AppleScript)' };
    try {
        const app = body.browser || 'Safari';
        switch (browserAction) {
            case 'tabs': {
                const script = app === 'Safari'
                    ? 'tell application "Safari" to get {name, URL} of every tab of every window'
                    : 'tell application "Google Chrome" to get {title, URL} of every tab of every window';
                const output = execSync(`osascript -e '${script}'`, { encoding: 'utf-8', timeout: 10000 });
                return { success: true, tabs: output.trim(), message: `${app} tabs retrieved` };
            }
            case 'url': {
                const script = app === 'Safari'
                    ? 'tell application "Safari" to get URL of front document'
                    : 'tell application "Google Chrome" to get URL of active tab of front window';
                const output = execSync(`osascript -e '${script}'`, { encoding: 'utf-8', timeout: 5000 });
                return { success: true, url: output.trim() };
            }
            case 'navigate': {
                if (!body.url) return { error: 'url required' };
                const script = app === 'Safari'
                    ? `tell application "Safari" to set URL of front document to "${body.url}"`
                    : `tell application "Google Chrome" to set URL of active tab of front window to "${body.url}"`;
                execSync(`osascript -e '${script}'`, { timeout: 5000 });
                return { success: true, message: `Navigated to ${body.url}` };
            }
            case 'content': {
                const script = app === 'Safari'
                    ? 'tell application "Safari" to do JavaScript "document.body.innerText.substring(0,3000)" in front document'
                    : 'tell application "Google Chrome" to execute front window\'s active tab javascript "document.body.innerText.substring(0,3000)"';
                const output = execSync(`osascript -e '${script}'`, { encoding: 'utf-8', timeout: 10000 });
                return { success: true, content: output.trim().substring(0, 3000) };
            }
            default:
                return { error: `Unknown browser action: ${browserAction}` };
        }
    } catch (err) {
        return { error: `Browser automation failed: ${err.message}` };
    }
}

async function _handleDocument(body) {
    const docAction = body.subaction || 'create';
    if (platform !== 'darwin') return { error: 'Document automation currently macOS only (AppleScript)' };
    try {
        switch (docAction) {
            case 'create': {
                const app = body.app || 'TextEdit';
                const content = body.content || '';
                const filePath = body.path || path.join(os.homedir(), 'Documents', `${body.name || 'Untitled'}.${body.ext || 'txt'}`);
                fs.writeFileSync(filePath, content, 'utf-8');
                execSync(`open "${filePath}"`, { timeout: 5000 });
                return { success: true, path: filePath, message: `Document created and opened: ${path.basename(filePath)}` };
            }
            case 'open': {
                if (!body.path) return { error: 'path required' };
                execSync(`open "${body.path}"`, { timeout: 5000 });
                return { success: true, message: `Opened ${path.basename(body.path)}` };
            }
            case 'pages_create': {
                const script = `
                    tell application "Pages"
                        activate
                        set newDoc to make new document
                        tell newDoc
                            set body text to "${(body.content || '').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
                        end tell
                    end tell`;
                execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 10000 });
                return { success: true, message: 'Pages document created' };
            }
            default:
                return { error: `Unknown document action: ${docAction}` };
        }
    } catch (err) {
        return { error: `Document automation failed: ${err.message}` };
    }
}
