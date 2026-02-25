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
    return `[ONIOS] You are inside OniOS (web desktop OS powered by Oni AI). To control it, use your exec tool to run curl commands against http://localhost:${port}/api/oni/actions/{action}.
Actions: task, window, note, terminal, file, notification, search, storage, system, scheduler, workflow. All POST with JSON.
IMPORTANT: Use exec tool with curl for EVERY action. Example: exec curl -sS -X POST http://localhost:${port}/api/oni/actions/task -H 'Content-Type: application/json' -d '{"action":"create","title":"My Task","priority":"high"}'
NEVER fake or hallucinate results. ALWAYS actually call the API and report the real response.

`;
}

// ─── Workspace Identity Sync ─────────────────────────

const ONIOS_SOUL_SECTION = `
## OniOS Integration

You are embedded inside **OniOS**, a web-based desktop operating system powered by OniAI. When the user talks to you through OniOS, you are the OS's AI brain — not just a chatbot.

**How you work inside OniOS:**
- You control the OS through its REST API at \`http://localhost:5173/api/oni/actions/{action}\`
- Available actions: task, window, note, terminal, file, notification, search, storage, system, scheduler, workflow
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

Actions: task, window, note, terminal, file, notification, search, storage, system, scheduler, workflow

Examples:
- Open terminal: \`{"action":"open","widgetType":"terminal"}\` → /actions/window
- Create task: \`{"action":"create","title":"...","priority":"high"}\` → /actions/task
- Run command: \`{"action":"run","command":"ls -la"}\` → /actions/terminal
- Create note: \`{"action":"create","title":"...","content":"..."}\` → /actions/note

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
description: "OniOS desktop control. Use exec tool with curl to call http://localhost:${port}/api/oni/actions/{action}. Actions: task, window, note, terminal, file, notification, search, storage, system, scheduler, workflow. All POST with JSON body. ALWAYS use exec curl — never hallucinate results."
metadata: { "oni": { "emoji": "🖥️", "homepage": "http://localhost:${port}", "always": true } }
---

# OniOS — Use \`exec\` with \`curl\` to control the desktop

Base URL: \`http://localhost:${port}/api/oni/actions/{action}\`
Method: POST, Content-Type: application/json. Use the \`exec\` tool to run curl commands.

## Actions Quick Ref

**task** — \`{"action":"create|list|complete|delete","title":"...","priority":"high|medium|low","id":"..."}\`
**window** — \`{"action":"open|list|close","widgetType":"terminal|browser|notes|tasks|calendar|settings|storage|weather|calculator|file-explorer|code-editor|docs|activity-log|oni-chat|password-manager|workflow-builder","windowId":"..."}\`
**note** — \`{"action":"create|list|read","title":"...","content":"...","id":"..."}\`
**terminal** — \`{"action":"open|run","command":"..."}\`
**file** — \`{"action":"list|read|write","path":"...","content":"..."}\`
**notification** — \`{"title":"...","message":"...","type":"info|warning|error"}\`
**search** — \`{"query":"..."}\`
**storage** — \`{"action":"get|set|delete|list","namespace":"...","key":"...","value":"..."}\`
**system** — \`{"action":"info"}\`
**scheduler** — \`{"action":"status|list_tasks|list_events|list_jobs|create_job","name":"...","cron":"...","jobAction":"notify","payload":{}}\`
**workflow** — \`{"action":"list|get|sync_to_oni","id":"..."}\`

## Examples (use exec tool)

Create task:
\`exec: curl -sS -X POST http://localhost:${port}/api/oni/actions/task -H 'Content-Type: application/json' -d '{"action":"create","title":"Buy groceries","priority":"high"}'\`

Open terminal app:
\`exec: curl -sS -X POST http://localhost:${port}/api/oni/actions/window -H 'Content-Type: application/json' -d '{"action":"open","widgetType":"terminal"}'\`

Run shell command:
\`exec: curl -sS -X POST http://localhost:${port}/api/oni/actions/terminal -H 'Content-Type: application/json' -d '{"action":"run","command":"ls -la"}'\`

Create note:
\`exec: curl -sS -X POST http://localhost:${port}/api/oni/actions/note -H 'Content-Type: application/json' -d '{"action":"create","title":"Meeting","content":"# Notes"}'\`

## Rules
- ALWAYS use exec tool with curl to call the API. NEVER hallucinate or fake results.
- ALWAYS report the actual JSON response from the API.
- The user sees results in real-time on their OniOS desktop.
- IDs are returned by create/list actions — use them for follow-up calls.
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
                    // Include live widget states if available (terminal output, browser URL, file path, etc.)
                    if (context.liveWidgetState) {
                        enrichedMessage += `\n[Live Widget State]\n${context.liveWidgetState}\n`;
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
                        case 'window': result = await handleWindowAction(body); break;
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
    'browser': 'browser.open',
    'notes': 'document.open',
    'calendar': 'calendar.open',
    'settings': 'system.settings.open',
    'file-explorer': 'system.files.openExplorer',
    'code-editor': 'code.open',
    'weather': 'widgets.weather.getCurrent',
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
    'web-search': 'web.search',
    'camera': 'camera.open',
    'document-viewer': 'document.open',
    'tasks': 'taskManager.open',
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

async function handleWindowAction(body) {
    const { action = 'list' } = body;
    switch (action) {
        case 'list':
            return { success: true, windows: [], message: 'Window list (client-side — use OniOS UI or Oni Chat)' };
        case 'open':
            return { success: true, widgetType: body.widgetType, message: `Open ${body.widgetType} (dispatched to client)` };
        case 'close':
            return { success: true, windowId: body.windowId, message: `Close window ${body.windowId} (dispatched to client)` };
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
