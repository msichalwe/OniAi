/**
 * aiMemoryPlugin — Server-side AI storage layer for OniOS.
 *
 * Storage layout (~/.onios/ai/):
 *   personality.json     — AI personality config (name, tone, rules, expertise)
 *   memories.json        — Long-term memories with optional vector embeddings
 *   knowledge.json       — Extracted facts, patterns, user preferences
 *   config.json          — AI settings (embedding model, default LLM, etc.)
 *   conversations/
 *     index.json          — Conversation list (id, title, createdAt, messageCount)
 *     conv-{id}.json      — Individual conversation messages
 *
 * Endpoints:
 *   Memory (vector-searchable long-term memory):
 *     POST   /api/ai/memory/store       — store a memory (auto-embeds if API configured)
 *     GET    /api/ai/memory/search?q=   — semantic vector search (or keyword fallback)
 *     GET    /api/ai/memory/list        — list all memories
 *     DELETE /api/ai/memory/delete?id=  — forget a memory
 *     POST   /api/ai/memory/bulk        — store multiple memories at once
 *
 *   Personality:
 *     GET    /api/ai/personality        — get personality config
 *     POST   /api/ai/personality        — update personality config
 *
 *   Conversations:
 *     GET    /api/ai/conversations              — list conversations
 *     POST   /api/ai/conversations              — create conversation
 *     GET    /api/ai/conversations/get?id=      — get conversation with messages
 *     POST   /api/ai/conversations/message      — add message to conversation
 *     DELETE /api/ai/conversations/delete?id=   — delete conversation
 *
 *   Knowledge:
 *     GET    /api/ai/knowledge          — get knowledge base
 *     POST   /api/ai/knowledge          — add/update knowledge entry
 *     DELETE /api/ai/knowledge/delete?id= — remove knowledge entry
 *
 *   Context:
 *     GET    /api/ai/context            — get full AI context window
 *     POST   /api/ai/embed             — get embedding for text
 *
 *   Config:
 *     GET    /api/ai/config             — get AI config
 *     POST   /api/ai/config             — update AI config
 *
 *   Auth (OpenAI OAuth PKCE):
 *     POST   /api/ai/auth/start         — generate PKCE codes + auth URL
 *     POST   /api/ai/auth/exchange      — exchange callback URL code for tokens
 *     POST   /api/ai/auth/refresh       — refresh an expired access token
 *     GET    /api/ai/auth/models        — list available models from OpenAI
 *     GET    /api/ai/auth/status        — get current auth status
 *     DELETE /api/ai/auth               — clear stored auth tokens
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { AsyncQueue } from './utils/AsyncQueue.js';

const asyncQueue = new AsyncQueue();

const AI_DIR = path.join(os.homedir(), '.onios', 'ai');
const CONV_DIR = path.join(AI_DIR, 'conversations');
const OPENCLAW_WORKSPACE = path.join(os.homedir(), '.openclaw', 'workspace');
const ONIOS_WORKSPACE = path.join(AI_DIR, 'workspace');

// ─── OpenClaw Workspace Reader ───────────────────────────

const WORKSPACE_FILES = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md', 'TOOLS.md', 'AGENTS.md'];

// Resolve repo workspace path relative to this plugin file
const REPO_WORKSPACE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'ai', 'workspace');

function getWorkspaceDir() {
    // Prefer repo workspace first (self-contained), then external paths
    if (fs.existsSync(REPO_WORKSPACE) && fs.readdirSync(REPO_WORKSPACE).some(f => f.endsWith('.md'))) return REPO_WORKSPACE;
    if (fs.existsSync(OPENCLAW_WORKSPACE)) return OPENCLAW_WORKSPACE;
    if (fs.existsSync(ONIOS_WORKSPACE)) return ONIOS_WORKSPACE;
    return null;
}

function readWorkspaceFiles() {
    const dir = getWorkspaceDir();
    if (!dir) return {};
    const files = {};
    for (const name of WORKSPACE_FILES) {
        const filePath = path.join(dir, name);
        if (fs.existsSync(filePath)) {
            files[name] = fs.readFileSync(filePath, 'utf-8');
        }
    }
    return files;
}

function buildWorkspaceSystemPrompt(workspaceFiles, kernelState) {
    const parts = [];

    // Identity
    if (workspaceFiles['IDENTITY.md']) {
        const id = workspaceFiles['IDENTITY.md'];
        const nameMatch = id.match(/\*\*Name:\*\*\s*(.+)/);
        const agentName = nameMatch ? nameMatch[1].trim() : 'Hailey';
        parts.push(`You are ${agentName}, the AI assistant embedded inside OniOS — a web-based desktop operating system.`);
    } else {
        parts.push('You are Hailey, the AI assistant embedded inside OniOS — a web-based desktop operating system.');
    }

    // Soul (personality / core truths)
    if (workspaceFiles['SOUL.md']) {
        parts.push(workspaceFiles['SOUL.md']);
    }

    // User profile
    if (workspaceFiles['USER.md']) {
        parts.push('## User Profile\n' + workspaceFiles['USER.md']);
    }

    // Agent memory
    if (workspaceFiles['MEMORY.md']) {
        parts.push('## Agent Memory\n' + workspaceFiles['MEMORY.md']);
    }

    // Tool notes
    if (workspaceFiles['TOOLS.md']) {
        parts.push('## Tool Notes\n' + workspaceFiles['TOOLS.md']);
    }

    // Operating instructions
    if (workspaceFiles['AGENTS.md']) {
        parts.push('## Operating Instructions\n' + workspaceFiles['AGENTS.md']);
    }

    // OniOS integration rules + agentic behavior
    parts.push(`## How You Work Inside OniOS
You operate INSIDE the OS as an AGENTIC AI. You have SKILLS (tools) that perform REAL actions:
- When you call a skill, the action executes LIVE on the user's desktop
- Windows open, tasks are created, commands run, notes are saved — all in real-time
- You get the result back and can chain multiple actions
- You can run for as many turns as needed to accomplish the user's goal

## 🎯 VISUAL FEEDBACK — ALWAYS SHOW, NEVER JUST TELL (CRITICAL)
This is a VISUAL desktop OS. The user SEES widgets. ALWAYS give visual feedback:

**MANDATORY widget opening rules:**
- "List/show my tasks" → ALWAYS call open_task_manager FIRST, then list_tasks
- "What's on my calendar / schedule" → ALWAYS call open_calendar FIRST, then list_events or today_schedule
- "Run a command" or any terminal action → ensure terminal is visible (run_terminal_command auto-opens it)
- "Search for X" → call web_search (opens web search widget automatically)
- "Open URL / browse" → call open_url (opens browser widget)
- "Show my files / documents" → call open_file_explorer
- "Calculate X" → call calculate (opens calculator widget)
- "Show weather" → call show_weather (opens weather widget)
- "Create/edit a note" → use create_note or open_notes
- "Show workflows" → call open_workflow_builder

**The rule is simple: If there's a widget for it, OPEN IT. The user should SEE the result on screen, not just read your text.**

## 🔄 WIDGET REUSE — DON'T SPAM DUPLICATE WINDOWS
Before opening a widget, CHECK the Live Desktop State below to see what's already open:
- If a terminal is already open → use run_terminal_command directly, do NOT call open_terminal again
- If task manager is open → just call list_tasks, don't open another task manager
- If calendar is open → just query events, don't open another calendar
- If browser is open → use open_url to navigate it, don't open a second browser
- Use focus_window to bring an existing widget to the front instead of opening a duplicate
- Use get_screen_summary or list_windows to check what's on screen if unsure

## 🪟 WINDOW MANAGEMENT — KEEP THE DESKTOP CLEAN
You are responsible for managing the user's screen space:
- If there are already 4+ windows open and you need to open another → minimize_window or close_window on less relevant ones first
- When done with a multi-step task that opened temporary windows (e.g. file explorer just for browsing) → close them after
- If the user switches topics → close irrelevant widgets from the previous topic
- Use close_all_windows if the user asks to "clean up" or "clear the desktop"
- Always focus_window on the most relevant widget after completing an action

## ⚡ IMPLICIT ACTION CHAINING — BE SMART
The user should NEVER have to tell you to "open X widget." Infer it:
- "Create 3 tasks for my project" → create_task × 3, THEN open_task_manager to show them
- "What meetings do I have today?" → open_calendar + today_schedule
- "Check if my server is running" → run_terminal_command('curl ...') — terminal opens automatically
- "Write a Python script" → create_file + open_code_editor with the file
- "Remind me about the meeting" → set_reminder + send_notification
- "Research X topic" → web_search, then if user wants details, open_url on a result

When the user gives you a LIST of things to do, do ALL of them in sequence. Don't stop after the first one.

## Agentic Workflow
You are NOT a chatbot. You are an AGENT that plans, executes, verifies, and iterates.

1. **PLAN:** Break the request into steps. If multi-step, plan all steps upfront.
2. **EXECUTE:** Call tool(s). You can call multiple tools in parallel if independent.
3. **VERIFY:** Did it succeed? Is the goal fully achieved?
4. **CONTINUE or RESPOND:**
   - Goal NOT achieved → call more tools. Do NOT respond with text yet.
   - Tool FAILED → try alternative approach or different parameters.
   - Goal achieved → respond with a brief, personality-rich summary.

## Anti-patterns (NEVER do these)
- Do NOT just describe what you would do — ACTUALLY DO IT
- Do NOT stop after one tool call if more steps remain
- Do NOT respond with text while there are still steps to execute
- Do NOT give up after a single failure — try alternatives
- Do NOT open a widget that's already visible — reuse it
- Do NOT leave the screen cluttered — manage windows

## Critical Rules
1. ACT, don't describe. Call tools to do things.
2. ONLY use provided tools. Don't hallucinate capabilities.
3. If you lack a skill, say so honestly — don't fake it.
4. Chain multiple skills across turns until done.
5. Keep text brief during execution. Personality shines in final responses.
6. On failure: retry with alternatives before giving up.
7. Use correct parameter names and types.
8. Wait for tool output before using it in the next tool.
9. REUSE open widgets — check Live Desktop State.
10. ALWAYS give visual feedback — open the relevant widget.`);

    // Live desktop context
    if (kernelState) {
        const kParts = ['\n## Live Desktop State'];
        if (kernelState.windows) kParts.push(`Open windows: ${kernelState.windows}`);
        if (kernelState.desktops) kParts.push(`Desktops: ${kernelState.desktops}`);
        if (kernelState.tasks) kParts.push(`Tasks: ${kernelState.tasks}`);
        if (kernelState.workflows) kParts.push(`Workflows: ${kernelState.workflows}`);
        if (kernelState.theme) kParts.push(`Theme: ${kernelState.theme}`);
        if (kernelState.time) kParts.push(`Current time: ${kernelState.time}`);
        if (kernelState.focusedWindow) kParts.push(`Focused: ${kernelState.focusedWindow}`);
        if (kernelState.notifications) kParts.push(`Recent notifications: ${kernelState.notifications}`);
        if (kernelState.openWidgets) kParts.push(`\n${kernelState.openWidgets}`);
        // Live widget state — terminal output, browser URL, file explorer path, etc.
        if (kernelState.liveWidgetState) kParts.push(`\n${kernelState.liveWidgetState}`);
        parts.push(kParts.join('\n'));
    }

    return parts.join('\n\n');
}

const FILES = {
    personality: path.join(AI_DIR, 'personality.json'),
    memories: path.join(AI_DIR, 'memories.json'),
    knowledge: path.join(AI_DIR, 'knowledge.json'),
    config: path.join(AI_DIR, 'config.json'),
    auth: path.join(AI_DIR, 'auth.json'),
    convIndex: path.join(CONV_DIR, 'index.json'),
};

// ─── OpenAI OAuth Constants ─────────────────────────────

const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_AUTH_ENDPOINT = 'https://auth.openai.com/oauth/authorize';
const OPENAI_TOKEN_ENDPOINT = 'https://auth.openai.com/oauth/token';
const OPENAI_REDIRECT_URI = 'http://localhost:1455/auth/callback';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

// In-memory PKCE store (short-lived, only during auth flow)
let _pkceStore = null;

function generatePKCE() {
    const bytes = crypto.randomBytes(32);
    const codeVerifier = bytes.toString('base64url');
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = hash.toString('base64url');
    return { codeVerifier, codeChallenge };
}

function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

function parseJWT(token) {
    try {
        if (!token || token.split('.').length !== 3) return null;
        const [, payload] = token.split('.');
        const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        return JSON.parse(Buffer.from(padded, 'base64url').toString('utf-8'));
    } catch { return null; }
}

function extractAccountInfo(idToken) {
    const claims = parseJWT(idToken);
    if (!claims) return {};
    const auth = claims['https://api.openai.com/auth'] || {};
    return {
        accountId: auth.chatgpt_account_id || '',
        planType: auth.chatgpt_plan_type || '',
        email: claims.email || '',
        name: claims.name || '',
        organizations: auth.organizations || [],
    };
}

async function refreshOAuthTokens(refreshToken) {
    try {
        const resp = await fetch(OPENAI_TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: OPENAI_CLIENT_ID,
                refresh_token: refreshToken,
            }),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const claims = parseJWT(data.access_token);
        const expires = claims?.exp ? claims.exp * 1000 : Date.now() + 3600000;
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            idToken: data.id_token || '',
            expires,
        };
    } catch { return null; }
}

async function getValidAccessToken() {
    const auth = await readJSON(FILES.auth, null);
    if (!auth || auth.type !== 'oauth') return null;

    // Refresh if expiring within 5 minutes
    const fiveMin = 5 * 60 * 1000;
    if (Date.now() + fiveMin >= (auth.expires || 0)) {
        if (!auth.refreshToken) return null;
        const refreshed = await refreshOAuthTokens(auth.refreshToken);
        if (!refreshed) return null;
        const updated = { ...auth, ...refreshed };
        if (refreshed.idToken) {
            updated.account = extractAccountInfo(refreshed.idToken);
        }
        await writeJSON(FILES.auth, updated);
        return refreshed.accessToken;
    }
    return auth.accessToken;
}

// ─── File Helpers ────────────────────────────────────────

function ensureDirs() {
    if (!fs.existsSync(AI_DIR)) fs.mkdirSync(AI_DIR, { recursive: true });
    if (!fs.existsSync(CONV_DIR)) fs.mkdirSync(CONV_DIR, { recursive: true });
}

async function readJSON(filePath, fallback = {}) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = await asyncQueue.enqueue(filePath, () => fs.promises.readFile(filePath, 'utf-8'));
        return JSON.parse(raw);
    } catch { return fallback; }
}

async function writeJSON(filePath, data) {
    ensureDirs();
    await asyncQueue.enqueue(filePath, () =>
        fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    );
}

function parseBody(req) {
    // Support pre-parsed body from upstream middleware (e.g. OpenClaw proxy)
    if (req._parsedBody) return Promise.resolve(req._parsedBody);
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve({}); }
        });
    });
}

function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function nanoid(len = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

// ─── Vector Math (cosine similarity) ────────────────────

function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
}

/**
 * Simple keyword-based similarity fallback when no embedding API is configured.
 * Tokenizes text into words, computes Jaccard + TF overlap score.
 */
function keywordSimilarity(textA, textB) {
    const tokenize = (t) => (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const wordsA = new Set(tokenize(textA));
    const wordsB = new Set(tokenize(textB));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
    return intersection / Math.sqrt(wordsA.size * wordsB.size);
}

// ─── Embedding Proxy ────────────────────────────────────

async function getEmbedding(text, config) {
    const apiUrl = config.embeddingApiUrl || config.apiUrl || '';
    const apiKey = config.embeddingApiKey || config.apiKey || '';
    const model = config.embeddingModel || 'text-embedding-3-small';

    if (!apiUrl || !apiKey) return null; // No embedding API configured

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                input: text.substring(0, 8000), // Truncate to fit model limits
            }),
        });
        const data = await res.json();
        if (data.data?.[0]?.embedding) return data.data[0].embedding;
        return null;
    } catch {
        return null;
    }
}

// ─── Default Personality ────────────────────────────────

const DEFAULT_PERSONALITY = {
    name: 'Oni',
    tone: 'friendly and professional',
    style: 'concise but thorough',
    role: 'AI assistant integrated into OniOS desktop environment',
    rules: [
        'Be helpful and proactive',
        'Use context from open windows and recent activity when relevant',
        'Remember user preferences and past interactions',
        'Be honest about limitations',
        'Respect user privacy — never share stored data externally',
    ],
    expertise: [
        'task management',
        'workflow automation',
        'code assistance',
        'data analysis',
        'system navigation',
    ],
    customInstructions: '',
};

const DEFAULT_CONFIG = {
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    defaultModel: 'gpt-4o-mini',
    embeddingApiUrl: '',
    embeddingApiKey: '',
    embeddingModel: 'text-embedding-3-small',
    maxContextTokens: 4000,
    maxConversationMessages: 50,
    memorySearchTopK: 10,
    autoMemorize: true,
};

// ─── Plugin ─────────────────────────────────────────────

export default function aiMemoryPlugin() {
    return {
        name: 'ai-memory-api',
        async configureServer(server) {
            ensureDirs();

            // Initialize default files if they don't exist
            if (!fs.existsSync(FILES.personality)) await writeJSON(FILES.personality, DEFAULT_PERSONALITY);
            if (!fs.existsSync(FILES.memories)) await writeJSON(FILES.memories, { memories: [] });
            if (!fs.existsSync(FILES.knowledge)) await writeJSON(FILES.knowledge, { entries: [] });
            if (!fs.existsSync(FILES.config)) await writeJSON(FILES.config, DEFAULT_CONFIG);
            if (!fs.existsSync(FILES.convIndex)) await writeJSON(FILES.convIndex, { conversations: [] });

            // ═══════════════════════════════════════════════
            // MEMORY endpoints
            // ═══════════════════════════════════════════════

            // POST /api/ai/memory/store — store a memory
            server.middlewares.use('/api/ai/memory/store', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                const { content, category, metadata, tags } = body;
                if (!content) { json(res, { error: 'content required' }, 400); return; }

                const config = await readJSON(FILES.config, DEFAULT_CONFIG);
                const embedding = await getEmbedding(content, config);

                const memory = {
                    id: `mem_${nanoid(8)}`,
                    content,
                    category: category || 'general',
                    tags: tags || [],
                    metadata: metadata || {},
                    embedding,
                    createdAt: Date.now(),
                    accessCount: 0,
                    lastAccessedAt: null,
                };

                const store = await readJSON(FILES.memories, { memories: [] });
                store.memories.push(memory);
                await writeJSON(FILES.memories, store);

                json(res, { ok: true, id: memory.id, hasEmbedding: !!embedding });
            });

            // POST /api/ai/memory/bulk — store multiple memories
            server.middlewares.use('/api/ai/memory/bulk', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                const items = body.memories || [];
                if (!items.length) { json(res, { error: 'memories array required' }, 400); return; }

                const config = await readJSON(FILES.config, DEFAULT_CONFIG);
                const store = await readJSON(FILES.memories, { memories: [] });
                let stored = 0;

                for (const item of items) {
                    if (!item.content) continue;
                    const embedding = await getEmbedding(item.content, config);
                    store.memories.push({
                        id: `mem_${nanoid(8)}`,
                        content: item.content,
                        category: item.category || 'general',
                        tags: item.tags || [],
                        metadata: item.metadata || {},
                        embedding,
                        createdAt: Date.now(),
                        accessCount: 0,
                        lastAccessedAt: null,
                    });
                    stored++;
                }

                await writeJSON(FILES.memories, store);
                json(res, { ok: true, stored });
            });

            // GET /api/ai/memory/search?q=...&k=10&category=
            server.middlewares.use('/api/ai/memory/search', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const q = url.searchParams.get('q') || '';
                const k = parseInt(url.searchParams.get('k')) || 10;
                const category = url.searchParams.get('category') || '';
                if (!q) { json(res, { error: 'q required' }, 400); return; }

                const config = await readJSON(FILES.config, DEFAULT_CONFIG);
                const store = await readJSON(FILES.memories, { memories: [] });
                let memories = store.memories;

                // Filter by category if specified
                if (category) {
                    memories = memories.filter(m => m.category === category);
                }

                // Try vector search first
                const queryEmbedding = await getEmbedding(q, config);

                let scored;
                if (queryEmbedding) {
                    // Vector search: cosine similarity with query embedding
                    scored = memories
                        .filter(m => m.embedding)
                        .map(m => ({
                            ...m,
                            score: cosineSimilarity(queryEmbedding, m.embedding),
                        }))
                        .sort((a, b) => b.score - a.score);

                    // Also include memories without embeddings via keyword search
                    const noEmbed = memories
                        .filter(m => !m.embedding)
                        .map(m => ({
                            ...m,
                            score: keywordSimilarity(q, m.content) * 0.8, // Slight penalty
                        }))
                        .filter(m => m.score > 0.05);

                    scored = [...scored, ...noEmbed].sort((a, b) => b.score - a.score);
                } else {
                    // Keyword fallback
                    scored = memories
                        .map(m => ({
                            ...m,
                            score: keywordSimilarity(q, m.content + ' ' + (m.tags || []).join(' ')),
                        }))
                        .filter(m => m.score > 0.05)
                        .sort((a, b) => b.score - a.score);
                }

                const results = scored.slice(0, k).map(m => ({
                    id: m.id,
                    content: m.content,
                    category: m.category,
                    tags: m.tags,
                    metadata: m.metadata,
                    score: Math.round(m.score * 1000) / 1000,
                    createdAt: m.createdAt,
                }));

                // Update access counts
                const resultIds = new Set(results.map(r => r.id));
                store.memories = store.memories.map(m => {
                    if (resultIds.has(m.id)) {
                        return { ...m, accessCount: (m.accessCount || 0) + 1, lastAccessedAt: Date.now() };
                    }
                    return m;
                });
                await writeJSON(FILES.memories, store);

                json(res, {
                    query: q,
                    results,
                    count: results.length,
                    searchMethod: queryEmbedding ? 'vector' : 'keyword',
                });
            });

            // GET /api/ai/memory/list?category=&limit=50
            server.middlewares.use('/api/ai/memory/list', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const category = url.searchParams.get('category') || '';
                const limit = parseInt(url.searchParams.get('limit')) || 50;

                const store = await readJSON(FILES.memories, { memories: [] });
                let memories = store.memories;
                if (category) memories = memories.filter(m => m.category === category);

                const categories = {};
                store.memories.forEach(m => {
                    categories[m.category] = (categories[m.category] || 0) + 1;
                });

                json(res, {
                    memories: memories
                        .sort((a, b) => b.createdAt - a.createdAt)
                        .slice(0, limit)
                        .map(m => ({
                            id: m.id,
                            content: m.content,
                            category: m.category,
                            tags: m.tags,
                            metadata: m.metadata,
                            hasEmbedding: !!m.embedding,
                            createdAt: m.createdAt,
                            accessCount: m.accessCount || 0,
                        })),
                    total: memories.length,
                    categories,
                });
            });

            // DELETE /api/ai/memory/delete?id=
            server.middlewares.use('/api/ai/memory/delete', async (req, res) => {
                if (req.method !== 'DELETE') { json(res, { error: 'DELETE only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const id = url.searchParams.get('id');
                if (!id) { json(res, { error: 'id required' }, 400); return; }

                const store = await readJSON(FILES.memories, { memories: [] });
                const before = store.memories.length;
                store.memories = store.memories.filter(m => m.id !== id);
                await writeJSON(FILES.memories, store);

                json(res, { ok: true, deleted: before !== store.memories.length });
            });

            // ═══════════════════════════════════════════════
            // PERSONALITY endpoints
            // ═══════════════════════════════════════════════

            server.middlewares.use('/api/ai/personality', async (req, res) => {
                if (req.method === 'GET') {
                    const personality = await readJSON(FILES.personality, DEFAULT_PERSONALITY);
                    json(res, personality);
                } else if (req.method === 'POST') {
                    const body = await parseBody(req);
                    const current = await readJSON(FILES.personality, DEFAULT_PERSONALITY);
                    const updated = { ...current, ...body, updatedAt: Date.now() };
                    await writeJSON(FILES.personality, updated);
                    json(res, { ok: true, personality: updated });
                } else {
                    json(res, { error: 'GET or POST only' }, 405);
                }
            });

            // ═══════════════════════════════════════════════
            // CONVERSATION endpoints
            // ═══════════════════════════════════════════════

            // GET /api/ai/conversations — list all conversations
            // POST /api/ai/conversations — create new conversation
            server.middlewares.use('/api/ai/conversations/message', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                const { conversationId, role, content, metadata } = body;
                if (!conversationId || !role || !content) {
                    json(res, { error: 'conversationId, role, content required' }, 400);
                    return;
                }

                const convFile = path.join(CONV_DIR, `conv-${conversationId}.json`);
                const conv = await readJSON(convFile, { id: conversationId, messages: [] });

                const message = {
                    id: `msg_${nanoid(8)}`,
                    role, // 'user' | 'assistant' | 'system'
                    content,
                    metadata: metadata || {},
                    timestamp: Date.now(),
                };

                conv.messages.push(message);
                await writeJSON(convFile, conv);

                // Update index
                const index = await readJSON(FILES.convIndex, { conversations: [] });
                const entry = index.conversations.find(c => c.id === conversationId);
                if (entry) {
                    entry.lastMessageAt = Date.now();
                    entry.messageCount = conv.messages.length;
                    // Auto-title from first user message
                    if (!entry.title || entry.title === 'New Conversation') {
                        const firstUser = conv.messages.find(m => m.role === 'user');
                        if (firstUser) entry.title = firstUser.content.substring(0, 60);
                    }
                }
                await writeJSON(FILES.convIndex, index);

                json(res, { ok: true, message });
            });

            server.middlewares.use('/api/ai/conversations/get', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const id = url.searchParams.get('id');
                const limit = parseInt(url.searchParams.get('limit')) || 100;
                if (!id) { json(res, { error: 'id required' }, 400); return; }

                const convFile = path.join(CONV_DIR, `conv-${id}.json`);
                const conv = await readJSON(convFile, null);
                if (!conv) { json(res, { error: 'Conversation not found' }, 404); return; }

                // Return latest messages (within limit)
                const messages = conv.messages.slice(-limit);
                json(res, {
                    id: conv.id,
                    messages,
                    totalMessages: conv.messages.length,
                    truncated: conv.messages.length > limit,
                });
            });

            server.middlewares.use('/api/ai/conversations/delete', async (req, res) => {
                if (req.method !== 'DELETE') { json(res, { error: 'DELETE only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const id = url.searchParams.get('id');
                if (!id) { json(res, { error: 'id required' }, 400); return; }

                const convFile = path.join(CONV_DIR, `conv-${id}.json`);
                if (fs.existsSync(convFile)) fs.unlinkSync(convFile);

                const index = await readJSON(FILES.convIndex, { conversations: [] });
                index.conversations = index.conversations.filter(c => c.id !== id);
                await writeJSON(FILES.convIndex, index);

                json(res, { ok: true });
            });

            server.middlewares.use('/api/ai/conversations', async (req, res) => {
                if (req.method === 'GET') {
                    const index = await readJSON(FILES.convIndex, { conversations: [] });
                    json(res, {
                        conversations: index.conversations.sort((a, b) => (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt)),
                    });
                } else if (req.method === 'POST') {
                    const body = await parseBody(req);
                    const conv = {
                        id: `conv_${nanoid(8)}`,
                        title: body.title || 'New Conversation',
                        createdAt: Date.now(),
                        lastMessageAt: Date.now(),
                        messageCount: 0,
                        metadata: body.metadata || {},
                    };

                    const index = await readJSON(FILES.convIndex, { conversations: [] });
                    index.conversations.push(conv);
                    await writeJSON(FILES.convIndex, index);

                    // Create empty conversation file
                    await writeJSON(path.join(CONV_DIR, `conv-${conv.id}.json`), {
                        id: conv.id,
                        messages: [],
                    });

                    json(res, { ok: true, conversation: conv });
                } else {
                    json(res, { error: 'GET or POST only' }, 405);
                }
            });

            // ═══════════════════════════════════════════════
            // KNOWLEDGE endpoints
            // ═══════════════════════════════════════════════

            server.middlewares.use('/api/ai/knowledge/delete', async (req, res) => {
                if (req.method !== 'DELETE') { json(res, { error: 'DELETE only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const id = url.searchParams.get('id');
                if (!id) { json(res, { error: 'id required' }, 400); return; }

                const store = await readJSON(FILES.knowledge, { entries: [] });
                store.entries = store.entries.filter(e => e.id !== id);
                await writeJSON(FILES.knowledge, store);
                json(res, { ok: true });
            });

            server.middlewares.use('/api/ai/knowledge', async (req, res) => {
                if (req.method === 'GET') {
                    const store = await readJSON(FILES.knowledge, { entries: [] });
                    const url = new URL(req.url, 'http://localhost');
                    const category = url.searchParams.get('category') || '';
                    let entries = store.entries;
                    if (category) entries = entries.filter(e => e.category === category);

                    const categories = {};
                    store.entries.forEach(e => {
                        categories[e.category || 'general'] = (categories[e.category || 'general'] || 0) + 1;
                    });

                    json(res, { entries, total: entries.length, categories });
                } else if (req.method === 'POST') {
                    const body = await parseBody(req);
                    const { key, value, category, source } = body;
                    if (!key || value === undefined) {
                        json(res, { error: 'key and value required' }, 400);
                        return;
                    }

                    const store = await readJSON(FILES.knowledge, { entries: [] });

                    // Upsert: if key exists in same category, update it
                    const existing = store.entries.find(
                        e => e.key === key && (e.category || 'general') === (category || 'general')
                    );

                    if (existing) {
                        existing.value = value;
                        existing.source = source || existing.source;
                        existing.updatedAt = Date.now();
                    } else {
                        store.entries.push({
                            id: `know_${nanoid(8)}`,
                            key,
                            value,
                            category: category || 'general',
                            source: source || 'manual',
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                        });
                    }

                    await writeJSON(FILES.knowledge, store);
                    json(res, { ok: true, upserted: !!existing });
                } else {
                    json(res, { error: 'GET or POST only' }, 405);
                }
            });

            // ═══════════════════════════════════════════════
            // CONTEXT endpoint — full AI context window
            // ═══════════════════════════════════════════════

            server.middlewares.use('/api/ai/context', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const conversationId = url.searchParams.get('conversationId') || '';
                const query = url.searchParams.get('query') || '';

                const personality = await readJSON(FILES.personality, DEFAULT_PERSONALITY);
                const config = await readJSON(FILES.config, DEFAULT_CONFIG);
                const knowledge = await readJSON(FILES.knowledge, { entries: [] });

                // Build system prompt from personality
                const systemParts = [
                    `You are ${personality.name}, ${personality.role}.`,
                    `Tone: ${personality.tone}. Style: ${personality.style}.`,
                ];
                if (personality.rules?.length) {
                    systemParts.push('Rules:\n' + personality.rules.map(r => `- ${r}`).join('\n'));
                }
                if (personality.expertise?.length) {
                    systemParts.push('Expertise: ' + personality.expertise.join(', '));
                }
                if (personality.customInstructions) {
                    systemParts.push(personality.customInstructions);
                }

                // Relevant knowledge
                const knowledgeStr = knowledge.entries.slice(0, 30).map(e =>
                    `[${e.category}] ${e.key}: ${typeof e.value === 'string' ? e.value : JSON.stringify(e.value)}`
                ).join('\n');
                if (knowledgeStr) {
                    systemParts.push(`\nKnown facts:\n${knowledgeStr}`);
                }

                // Relevant memories (via search if query provided)
                let relevantMemories = [];
                if (query) {
                    const memStore = await readJSON(FILES.memories, { memories: [] });
                    const queryEmbed = await getEmbedding(query, config);

                    if (queryEmbed) {
                        relevantMemories = memStore.memories
                            .filter(m => m.embedding)
                            .map(m => ({ ...m, score: cosineSimilarity(queryEmbed, m.embedding) }))
                            .sort((a, b) => b.score - a.score)
                            .slice(0, config.memorySearchTopK || 10);
                    } else {
                        relevantMemories = memStore.memories
                            .map(m => ({ ...m, score: keywordSimilarity(query, m.content) }))
                            .filter(m => m.score > 0.05)
                            .sort((a, b) => b.score - a.score)
                            .slice(0, config.memorySearchTopK || 10);
                    }

                    if (relevantMemories.length) {
                        systemParts.push('\nRelevant memories:\n' + relevantMemories
                            .map(m => `- [${m.category}] ${m.content}`)
                            .join('\n'));
                    }
                }

                // Conversation history
                let conversationMessages = [];
                if (conversationId) {
                    const convFile = path.join(CONV_DIR, `conv-${conversationId}.json`);
                    const conv = await readJSON(convFile, null);
                    if (conv?.messages) {
                        const limit = config.maxConversationMessages || 50;
                        conversationMessages = conv.messages.slice(-limit);
                    }
                }

                json(res, {
                    systemPrompt: systemParts.join('\n\n'),
                    personality,
                    conversationMessages,
                    relevantMemories: relevantMemories.map(m => ({
                        id: m.id,
                        content: m.content,
                        category: m.category,
                        score: Math.round(m.score * 1000) / 1000,
                    })),
                    knowledgeCount: knowledge.entries.length,
                    config: {
                        defaultModel: config.defaultModel,
                        maxContextTokens: config.maxContextTokens,
                    },
                });
            });

            // ═══════════════════════════════════════════════
            // EMBED endpoint — get embedding for text
            // ═══════════════════════════════════════════════

            server.middlewares.use('/api/ai/embed', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                if (!body.text) { json(res, { error: 'text required' }, 400); return; }

                const config = await readJSON(FILES.config, DEFAULT_CONFIG);
                const embedding = await getEmbedding(body.text, config);

                json(res, {
                    text: body.text.substring(0, 100),
                    embedding,
                    dimensions: embedding?.length || 0,
                    model: config.embeddingModel,
                });
            });

            // ═══════════════════════════════════════════════
            // AUTH endpoints (OpenAI OAuth PKCE)
            // Single middleware handler to avoid Vite prefix-match
            // routing issues (e.g. /api/ai/auth catching /api/ai/auth/exchange)
            // ═══════════════════════════════════════════════

            server.middlewares.use('/api/ai/auth', async (req, res, next) => {
                // Vite's `use(path, fn)` strips the matched prefix from req.url,
                // so after matching '/api/ai/auth', req.url becomes the rest.
                // e.g. '/api/ai/auth/start' → req.url = '/start'
                //      '/api/ai/auth'       → req.url = '/'
                const sub = (req.url || '/').split('?')[0];
                console.log(`[Auth] ${req.method} /api/ai/auth${sub}`);

                // ─── POST /api/ai/auth/start ───
                if (sub === '/start' && req.method === 'POST') {
                    const pkce = generatePKCE();
                    const state = generateState();
                    _pkceStore = { codeVerifier: pkce.codeVerifier, state, createdAt: Date.now() };

                    const params = new URLSearchParams({
                        response_type: 'code',
                        client_id: OPENAI_CLIENT_ID,
                        redirect_uri: OPENAI_REDIRECT_URI,
                        scope: 'openid profile email offline_access',
                        code_challenge: pkce.codeChallenge,
                        code_challenge_method: 'S256',
                        state,
                        id_token_add_organizations: 'true',
                        codex_cli_simplified_flow: 'true',
                    });

                    json(res, {
                        authUrl: `${OPENAI_AUTH_ENDPOINT}?${params.toString()}`,
                        state,
                    });
                    return;
                }

                // ─── POST /api/ai/auth/exchange ───
                if (sub === '/exchange' && req.method === 'POST') {
                    const body = await parseBody(req);
                    const { callbackUrl } = body;

                    if (!callbackUrl) { json(res, { error: 'callbackUrl required' }, 400); return; }
                    if (!_pkceStore) { json(res, { error: 'No pending auth flow. Call /api/ai/auth/start first.' }, 400); return; }

                    let url;
                    try { url = new URL(callbackUrl); } catch {
                        json(res, { error: 'Invalid URL format' }, 400); return;
                    }

                    const code = url.searchParams.get('code');
                    const returnedState = url.searchParams.get('state');

                    if (!code) { json(res, { error: 'No authorization code found in URL' }, 400); return; }
                    if (returnedState && returnedState !== _pkceStore.state) {
                        json(res, { error: 'State mismatch — possible CSRF. Start a new flow.' }, 400); return;
                    }

                    try {
                        const tokenResp = await fetch(OPENAI_TOKEN_ENDPOINT, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({
                                grant_type: 'authorization_code',
                                code,
                                redirect_uri: OPENAI_REDIRECT_URI,
                                client_id: OPENAI_CLIENT_ID,
                                code_verifier: _pkceStore.codeVerifier,
                            }),
                        });

                        if (!tokenResp.ok) {
                            const errText = await tokenResp.text();
                            _pkceStore = null;
                            console.warn('[Auth] Token exchange failed:', tokenResp.status, errText);
                            json(res, { error: `Token exchange failed (${tokenResp.status}): ${errText}` }, 400);
                            return;
                        }

                        const tokenData = await tokenResp.json();
                        const claims = parseJWT(tokenData.access_token);
                        const expires = claims?.exp ? claims.exp * 1000 : Date.now() + 3600000;
                        const account = extractAccountInfo(tokenData.id_token || '');

                        const authData = {
                            type: 'oauth',
                            accessToken: tokenData.access_token,
                            refreshToken: tokenData.refresh_token || '',
                            idToken: tokenData.id_token || '',
                            expires,
                            account,
                            authenticatedAt: Date.now(),
                        };

                        await writeJSON(FILES.auth, authData);
                        _pkceStore = null;
                        console.log('[Auth] OAuth token exchange successful —', account.email || account.accountId || 'unknown');

                        json(res, {
                            ok: true,
                            account,
                            expiresAt: new Date(expires).toISOString(),
                        });
                    } catch (err) {
                        _pkceStore = null;
                        console.error('[Auth] Token exchange error:', err);
                        json(res, { error: `Token exchange error: ${err.message}` }, 500);
                    }
                    return;
                }

                // ─── POST /api/ai/auth/refresh ───
                if (sub === '/refresh' && req.method === 'POST') {
                    const auth = await readJSON(FILES.auth, null);
                    if (!auth || auth.type !== 'oauth' || !auth.refreshToken) {
                        json(res, { error: 'No OAuth session to refresh' }, 400); return;
                    }

                    const refreshed = await refreshOAuthTokens(auth.refreshToken);
                    if (!refreshed) {
                        json(res, { error: 'Token refresh failed. Re-authenticate.' }, 400); return;
                    }

                    const updated = { ...auth, ...refreshed };
                    if (refreshed.idToken) {
                        updated.account = extractAccountInfo(refreshed.idToken);
                    }
                    await writeJSON(FILES.auth, updated);
                    console.log('[Auth] Token refreshed successfully');
                    json(res, { ok: true, expiresAt: new Date(refreshed.expires).toISOString() });
                    return;
                }

                // ─── GET /api/ai/auth/models ───
                if (sub === '/models' && req.method === 'GET') {
                    // Full curated model list (Feb 2026) — chat-capable text models only
                    const PRESET_MODELS = [
                        // Flagship
                        { id: 'gpt-5.2', owned_by: 'openai', group: 'Flagship' },
                        { id: 'gpt-5.2-pro', owned_by: 'openai', group: 'Flagship' },
                        { id: 'gpt-5.1', owned_by: 'openai', group: 'Flagship' },
                        { id: 'gpt-5', owned_by: 'openai', group: 'Flagship' },
                        { id: 'gpt-5-pro', owned_by: 'openai', group: 'Flagship' },
                        { id: 'gpt-5-mini', owned_by: 'openai', group: 'Flagship' },
                        { id: 'gpt-5-nano', owned_by: 'openai', group: 'Flagship' },
                        // Codex (agentic coding)
                        { id: 'gpt-5.3-codex', owned_by: 'openai', group: 'Codex' },
                        { id: 'gpt-5.2-codex', owned_by: 'openai', group: 'Codex' },
                        { id: 'gpt-5.1-codex', owned_by: 'openai', group: 'Codex' },
                        { id: 'gpt-5.1-codex-max', owned_by: 'openai', group: 'Codex' },
                        { id: 'gpt-5.1-codex-mini', owned_by: 'openai', group: 'Codex' },
                        { id: 'gpt-5-codex', owned_by: 'openai', group: 'Codex' },
                        // Reasoning (o-series)
                        { id: 'o4-mini', owned_by: 'openai', group: 'Reasoning' },
                        { id: 'o3', owned_by: 'openai', group: 'Reasoning' },
                        { id: 'o3-pro', owned_by: 'openai', group: 'Reasoning' },
                        { id: 'o3-mini', owned_by: 'openai', group: 'Reasoning' },
                        { id: 'o1', owned_by: 'openai', group: 'Reasoning' },
                        { id: 'o1-pro', owned_by: 'openai', group: 'Reasoning' },
                        // GPT-4.1 series
                        { id: 'gpt-4.1', owned_by: 'openai', group: 'GPT-4.1' },
                        { id: 'gpt-4.1-mini', owned_by: 'openai', group: 'GPT-4.1' },
                        { id: 'gpt-4.1-nano', owned_by: 'openai', group: 'GPT-4.1' },
                        // GPT-4o series
                        { id: 'gpt-4o', owned_by: 'openai', group: 'GPT-4o' },
                        { id: 'gpt-4o-mini', owned_by: 'openai', group: 'GPT-4o' },
                    ];

                    const auth = await readJSON(FILES.auth, null);
                    const isOAuth = auth && auth.type === 'oauth';

                    // Try API key first (can list models), OAuth tokens can't (missing api.model.read scope)
                    const config = await readJSON(FILES.config, DEFAULT_CONFIG);
                    const apiKeyBearer = config.apiKey || '';

                    if (!isOAuth && !apiKeyBearer) {
                        json(res, { error: 'No authentication. Set up OAuth or an API key first.' }, 401); return;
                    }

                    // If we have an API key, try live fetch
                    if (apiKeyBearer && !isOAuth) {
                        try {
                            const modelsResp = await fetch(OPENAI_MODELS_URL, {
                                headers: { 'Authorization': `Bearer ${apiKeyBearer}` },
                            });
                            if (modelsResp.ok) {
                                const modelsData = await modelsResp.json();
                                const chatModels = (modelsData.data || [])
                                    .filter(m => m.id && (
                                        m.id.startsWith('gpt-') ||
                                        m.id.startsWith('o1') ||
                                        m.id.startsWith('o3') ||
                                        m.id.startsWith('o4') ||
                                        m.id.startsWith('chatgpt-')
                                    ))
                                    .map(m => ({ id: m.id, owned_by: m.owned_by, created: m.created }))
                                    .sort((a, b) => (b.created || 0) - (a.created || 0));

                                json(res, { models: chatModels, total: chatModels.length, source: 'live' });
                                return;
                            }
                            // If API key also fails, fall through to presets
                            console.warn('[Auth] Live model fetch failed, using presets');
                        } catch { /* fall through */ }
                    }

                    // OAuth or fallback: return preset list
                    json(res, { models: PRESET_MODELS, total: PRESET_MODELS.length, source: 'presets' });
                    return;
                }

                // ─── GET /api/ai/auth/status ───
                if (sub === '/status' && req.method === 'GET') {
                    const auth = await readJSON(FILES.auth, null);
                    const config = await readJSON(FILES.config, DEFAULT_CONFIG);

                    if (auth && auth.type === 'oauth') {
                        const expired = Date.now() >= (auth.expires || 0);
                        json(res, {
                            method: 'oauth',
                            authenticated: !expired,
                            expired,
                            account: auth.account || {},
                            expiresAt: auth.expires ? new Date(auth.expires).toISOString() : null,
                            authenticatedAt: auth.authenticatedAt ? new Date(auth.authenticatedAt).toISOString() : null,
                        });
                    } else if (config.apiKey) {
                        json(res, {
                            method: 'apikey',
                            authenticated: true,
                            keyHint: '***' + config.apiKey.slice(-4),
                        });
                    } else {
                        json(res, { method: 'none', authenticated: false });
                    }
                    return;
                }

                // ─── DELETE /api/ai/auth ───
                if ((sub === '/' || sub === '') && req.method === 'DELETE') {
                    if (fs.existsSync(FILES.auth)) fs.unlinkSync(FILES.auth);
                    _pkceStore = null;
                    console.log('[Auth] Auth cleared');
                    json(res, { ok: true, message: 'Auth cleared' });
                    return;
                }

                // Unknown sub-route
                json(res, { error: `Unknown auth endpoint: ${sub}` }, 404);
            });

            // ═══════════════════════════════════════════════
            // CHAT endpoint (server-side AI proxy)
            // OAuth → chatgpt.com/backend-api/codex/responses (Responses API)
            // API key → api.openai.com/v1/chat/completions (Chat Completions)
            // ═══════════════════════════════════════════════

            server.middlewares.use('/api/ai/chat', async (req, res, next) => {
                // Let sub-routes like /api/ai/chat/continue fall through
                const sub = req.originalUrl?.replace('/api/ai/chat', '') || req.url?.replace('/api/ai/chat', '') || '';
                if (sub && sub !== '/' && sub.startsWith('/')) { next(); return; }

                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }

                const body = await parseBody(req);
                console.log('[Chat] Body keys:', Object.keys(body), 'userMessage length:', (body.userMessage || '').length);
                const { userMessage, conversationId, tools, kernelState, aiMode } = body;
                if (!userMessage) {
                    console.warn('[Chat] Missing userMessage! Body:', JSON.stringify(body).slice(0, 200));
                    json(res, { error: 'userMessage required' }, 400); return;
                }

                const config = await readJSON(FILES.config, DEFAULT_CONFIG);
                const model = body.model || config.defaultModel || 'gpt-4o-mini';
                const isWorkspaceMode = aiMode === 'openclaw';

                // ─── Build full context server-side ───

                // 1. Knowledge base (shared between modes)
                const knowledge = await readJSON(FILES.knowledge, { entries: [] });
                const knowledgeStr = knowledge.entries.slice(0, 30).map(e =>
                    `[${e.category}] ${e.key}: ${typeof e.value === 'string' ? e.value : JSON.stringify(e.value)}`
                ).join('\n');

                // 2. Relevant memories (shared between modes)
                const memStore = await readJSON(FILES.memories, { memories: [] });
                let relevantMemories = memStore.memories
                    .map(m => ({ ...m, score: keywordSimilarity(userMessage, m.content) }))
                    .filter(m => m.score > 0.05)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, config.memorySearchTopK || 10);

                // Try vector search if embeddings available
                const queryEmbed = await getEmbedding(userMessage, config);
                if (queryEmbed) {
                    const vectorResults = memStore.memories
                        .filter(m => m.embedding)
                        .map(m => ({ ...m, score: cosineSimilarity(queryEmbed, m.embedding) }))
                        .sort((a, b) => b.score - a.score)
                        .slice(0, config.memorySearchTopK || 10);
                    if (vectorResults.length > relevantMemories.length) {
                        relevantMemories = vectorResults;
                    }
                }

                // 3. Conversation history
                let conversationMessages = [];
                if (conversationId) {
                    const convFile = path.join(CONV_DIR, `conv-${conversationId}.json`);
                    const conv = await readJSON(convFile, null);
                    if (conv?.messages) {
                        const limit = config.maxConversationMessages || 50;
                        conversationMessages = conv.messages.slice(-limit);
                    }
                }

                // 4. Build the full system prompt
                let systemPrompt;

                if (isWorkspaceMode) {
                    // ─── Workspace mode: personality from .md files ───
                    const workspaceFiles = readWorkspaceFiles();
                    systemPrompt = buildWorkspaceSystemPrompt(workspaceFiles, kernelState);

                    // Append knowledge + memories to workspace prompt
                    if (knowledgeStr) {
                        systemPrompt += `\n\n## Known Facts\n${knowledgeStr}`;
                    }
                    if (relevantMemories.length) {
                        systemPrompt += '\n\n## Relevant Memories\n' + relevantMemories
                            .map(m => `- [${m.category}] ${m.content}`)
                            .join('\n');
                    }

                    console.log(`[Chat] Workspace mode (Hailey) | ${Object.keys(workspaceFiles).length} workspace files, ${relevantMemories.length} memories`);
                } else {
                    // ─── Standard mode: personality from personality.json ───
                    const personality = await readJSON(FILES.personality, DEFAULT_PERSONALITY);
                    const systemParts = [];

                    systemParts.push(`You are ${personality.name || 'Oni'}, ${personality.role || 'the AI assistant for OniOS — a web-based desktop operating system'}.`);
                    systemParts.push(`Tone: ${personality.tone || 'friendly'}. Style: ${personality.style || 'concise'}.`);
                    systemParts.push(`\nYou operate INSIDE the OS. When users ask you to do things, execute commands directly. You are not a chatbot — you are an integrated AI agent with real system access.`);

                    systemParts.push(`\n## How You Work\nYou have SKILLS (tools) that perform REAL actions in the OS. When you call a skill:\n- The widget opens LIVE on screen (the user sees it)\n- The action executes for real (files created, commands run, tasks added)\n- You get the result back\n\nIMPORTANT RULES:\n1. When asked to DO something, call the appropriate skill tool — do NOT just describe what you would do\n2. ONLY use the tools/skills provided to you. Do NOT hallucinate capabilities you don't have\n3. If you don't have a skill for something, say so honestly\n4. For multi-step tasks, call multiple skills in sequence\n5. For tasks, always pass dueDate (YYYY-MM-DD), dueTime (HH:MM), and priority when the user provides them\n6. Keep text responses brief when executing skills — the lifecycle messages show the user what's happening\n7. If a skill fails, explain the error and suggest alternatives\n8. Use the correct parameter names and types for each skill`);

                    if (personality.rules?.length) {
                        systemParts.push('\n## Rules\n' + personality.rules.map(r => `- ${r}`).join('\n'));
                    }
                    if (personality.expertise?.length) {
                        systemParts.push('Expertise: ' + personality.expertise.join(', '));
                    }
                    if (personality.customInstructions) {
                        systemParts.push(personality.customInstructions);
                    }

                    if (knowledgeStr) {
                        systemParts.push(`\n## Known Facts\n${knowledgeStr}`);
                    }

                    if (relevantMemories.length) {
                        systemParts.push('\n## Relevant Memories\n' + relevantMemories
                            .map(m => `- [${m.category}] ${m.content}`)
                            .join('\n'));
                    }

                    if (kernelState) {
                        const kParts = ['\n## Live OS Context'];
                        if (kernelState.windows) kParts.push(`Open windows: ${kernelState.windows}`);
                        if (kernelState.desktops) kParts.push(`Desktops: ${kernelState.desktops}`);
                        if (kernelState.tasks) kParts.push(`Tasks: ${kernelState.tasks}`);
                        if (kernelState.workflows) kParts.push(`Workflows: ${kernelState.workflows}`);
                        if (kernelState.theme) kParts.push(`Theme: ${kernelState.theme}`);
                        if (kernelState.time) kParts.push(`Current time: ${kernelState.time}`);
                        if (kernelState.focusedWindow) kParts.push(`Focused: ${kernelState.focusedWindow}`);
                        if (kernelState.notifications) kParts.push(`Recent notifications: ${kernelState.notifications}`);
                        if (kernelState.openWidgets) kParts.push(`\n${kernelState.openWidgets}`);
                        if (kernelState.liveWidgetState) kParts.push(`\n${kernelState.liveWidgetState}`);
                        systemParts.push(kParts.join('\n'));
                    }

                    systemPrompt = systemParts.join('\n\n');
                }

                // Build messages array — TEXT only from history to avoid stale tool_call_id mismatches
                const messages = [{ role: 'system', content: systemPrompt }];
                for (const msg of conversationMessages) {
                    if (msg.role === 'tool') {
                        // Skip tool results from history — stale call_ids cause API errors
                        continue;
                    } else if (msg.role === 'assistant' && msg.tool_calls?.length) {
                        // Summarize tool calls as text to preserve context
                        const toolSummary = msg.tool_calls.map(tc => `[Called: ${tc.name}]`).join(' ');
                        messages.push({ role: 'assistant', content: ((msg.content || '') + ' ' + toolSummary).trim() });
                    } else {
                        // Regular user/assistant text message
                        messages.push({ role: msg.role, content: msg.content || '' });
                    }
                }
                messages.push({ role: 'user', content: userMessage });

                // ─── Auth + proxy ───

                let oauthToken = await getValidAccessToken();
                let apiKey = config.apiKey || '';

                if (!oauthToken && !apiKey) {
                    json(res, { error: 'No authentication configured. Go to Settings → AI Authentication.' }, 401);
                    return;
                }

                // Set up SSE response
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
                    if (oauthToken) {
                        // ─── OAuth: Codex backend (Responses API) ───
                        const CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses';

                        // Build Responses API input from structured messages
                        // IMPORTANT: Only include user/assistant TEXT messages from history.
                        // Skip tool_calls and tool results from saved history to avoid
                        // stale call_id mismatches (Codex requires every function_call_output
                        // to pair with a function_call in the same request).
                        const input = [];
                        for (const msg of messages) {
                            if (msg.role === 'system') continue; // handled by instructions
                            if (msg.role === 'user') {
                                input.push({ type: 'message', role: 'user', content: [{ type: 'input_text', text: msg.content }] });
                            } else if (msg.role === 'assistant' && msg.tool_calls?.length) {
                                // Summarize tool calls as assistant text instead of raw function_call items
                                const toolSummary = msg.tool_calls.map(tc => {
                                    const name = tc.function?.name || tc.name;
                                    return `[Called tool: ${name}]`;
                                }).join(' ');
                                const textContent = msg.content || '';
                                input.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: (textContent + ' ' + toolSummary).trim() }] });
                            } else if (msg.role === 'assistant') {
                                if (msg.content) {
                                    input.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: msg.content }] });
                                }
                            } else if (msg.role === 'tool') {
                                // Skip — tool results from history cause stale call_id errors
                                continue;
                            }
                        }

                        const responsesTools = (tools || []).map(t => ({
                            type: 'function',
                            name: t.function?.name || t.name,
                            description: t.function?.description || '',
                            parameters: t.function?.parameters || { type: 'object', properties: {} },
                        }));

                        const payload = {
                            model,
                            instructions: systemPrompt,
                            input,
                            tools: responsesTools,
                            tool_choice: responsesTools.length > 0 ? 'required' : undefined,
                            stream: true,
                            store: false,
                        };

                        console.log(`[Chat] OAuth → Codex backend (${model}) | ${relevantMemories.length} memories, ${knowledge.entries.length} knowledge`);
                        const upstream = await fetch(CODEX_URL, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${oauthToken}`,
                            },
                            body: JSON.stringify(payload),
                        });

                        if (!upstream.ok) {
                            const errText = await upstream.text();
                            console.warn('[Chat] Codex backend error:', upstream.status, errText);
                            sendSSE('error', { error: `Codex API error (${upstream.status}): ${errText}` });
                            res.end();
                            return;
                        }

                        const reader = upstream.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';
                        const toolNames = {}; // Track function names by output_index
                        const toolCallIds = {}; // Track call_ids by output_index
                        let fullResponseText = ''; // Accumulate for conversation persistence
                        const toolCallResults = []; // Track tool calls for conversation persistence
                        let responseId = null; // Capture for agent loop chaining

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    try {
                                        const evt = JSON.parse(line.slice(6));
                                        // Capture response ID for agent loop chaining
                                        if (evt.type === 'response.created' && evt.response?.id) {
                                            responseId = evt.response.id;
                                            sendSSE('response_id', { id: responseId });
                                        }
                                        if (evt.type === 'response.output_text.delta') {
                                            fullResponseText += evt.delta;
                                            sendSSE('text_delta', { delta: evt.delta });
                                        } else if (evt.type === 'response.output_text.done') {
                                            sendSSE('text_done', { text: evt.text });
                                        } else if (evt.type === 'response.output_item.added' && evt.item?.type === 'function_call') {
                                            // Capture the function name + call_id when the tool call starts
                                            toolNames[evt.output_index] = evt.item.name;
                                            toolCallIds[evt.output_index] = evt.item.call_id;
                                            sendSSE('tool_delta', { index: evt.output_index, name: evt.item.name, callId: evt.item.call_id, arguments_delta: '' });
                                        } else if (evt.type === 'response.function_call_arguments.delta') {
                                            sendSSE('tool_delta', { index: evt.output_index, name: toolNames[evt.output_index] || '', arguments_delta: evt.delta });
                                        } else if (evt.type === 'response.function_call_arguments.done') {
                                            // Arguments finalized — don't emit tool_done yet (wait for output_item.done)
                                        } else if (evt.type === 'response.output_item.done' && evt.item?.type === 'function_call') {
                                            // Authoritative final event — emit tool_done once
                                            toolCallResults.push({ name: evt.item.name, arguments: evt.item.arguments, callId: evt.item.call_id });
                                            sendSSE('tool_done', { index: evt.output_index, name: evt.item.name, arguments: evt.item.arguments, callId: evt.item.call_id });
                                        } else if (evt.type === 'response.completed') {
                                            sendSSE('done', { usage: evt.response?.usage, responseId: evt.response?.id || responseId });
                                        } else if (evt.type === 'response.failed') {
                                            sendSSE('error', { error: evt.response?.error?.message || 'Response failed' });
                                        }
                                    } catch { /* skip */ }
                                }
                            }
                        }

                        // ─── Persist conversation (structured) ───
                        if (conversationId) {
                            const convFile = path.join(CONV_DIR, `conv-${conversationId}.json`);
                            const conv = await readJSON(convFile, { id: conversationId, messages: [] });
                            const now = new Date().toISOString();

                            // Save user message
                            conv.messages.push({ role: 'user', content: userMessage, timestamp: now });

                            if (fullResponseText && toolCallResults.length === 0) {
                                // Pure text response — save as-is
                                conv.messages.push({ role: 'assistant', content: fullResponseText, timestamp: now });
                            } else if (toolCallResults.length > 0) {
                                // Check for respond_to_user escape-hatch
                                const respondCall = toolCallResults.find(t => t.name === 'respond_to_user');
                                if (respondCall && toolCallResults.length === 1) {
                                    // Extract clean message text from respond_to_user
                                    try {
                                        const parsed = JSON.parse(respondCall.arguments || '{}');
                                        conv.messages.push({ role: 'assistant', content: parsed.message || respondCall.arguments, timestamp: now });
                                    } catch {
                                        conv.messages.push({ role: 'assistant', content: respondCall.arguments, timestamp: now });
                                    }
                                } else {
                                    // Save structured tool_calls (the agent loop will add results + final response via /continue)
                                    conv.messages.push({
                                        role: 'assistant',
                                        content: fullResponseText || null,
                                        tool_calls: toolCallResults.map(t => ({
                                            id: t.callId || `call_${toolCallResults.indexOf(t)}`,
                                            name: t.name,
                                            arguments: t.arguments,
                                        })),
                                        timestamp: now,
                                    });
                                }
                            }

                            await writeJSON(convFile, conv);

                            // Update conversation index title if first message
                            const index = await readJSON(FILES.convIndex, { conversations: [] });
                            const entry = index.conversations.find(c => c.id === conversationId);
                            if (entry) {
                                entry.messageCount = conv.messages.length;
                                entry.updatedAt = new Date().toISOString();
                                if (!entry.title || entry.title === 'Oni Chat') {
                                    entry.title = userMessage.substring(0, 60);
                                }
                                await writeJSON(FILES.convIndex, index);
                            }
                        }
                    } else {
                        // ─── API key: Chat Completions ───
                        const apiUrl = config.apiUrl || DEFAULT_CONFIG.apiUrl;

                        const payload = {
                            model,
                            messages,
                            tools: tools && tools.length > 0 ? tools : undefined,
                            stream: true,
                        };

                        console.log(`[Chat] API key → ${apiUrl} (${model}) | ${relevantMemories.length} memories, ${knowledge.entries.length} knowledge`);
                        const upstream = await fetch(apiUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${apiKey}`,
                            },
                            body: JSON.stringify(payload),
                        });

                        if (!upstream.ok) {
                            const errText = await upstream.text();
                            console.warn('[Chat] API error:', upstream.status, errText);
                            sendSSE('error', { error: `API error (${upstream.status}): ${errText}` });
                            res.end();
                            return;
                        }

                        const reader = upstream.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';
                        let toolCallsAccum = [];
                        let fullResponseText = '';

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                if (!line.startsWith('data: ')) continue;
                                const data = line.slice(6);
                                if (data === '[DONE]') { sendSSE('done', {}); continue; }
                                try {
                                    const parsed = JSON.parse(data);
                                    const delta = parsed.choices?.[0]?.delta;
                                    if (delta?.content) {
                                        fullResponseText += delta.content;
                                        sendSSE('text_delta', { delta: delta.content });
                                    }
                                    if (delta?.tool_calls) {
                                        for (const tc of delta.tool_calls) {
                                            if (tc.index !== undefined) {
                                                if (!toolCallsAccum[tc.index]) toolCallsAccum[tc.index] = { name: '', arguments: '', id: '' };
                                                if (tc.id) toolCallsAccum[tc.index].id = tc.id;
                                                if (tc.function?.name) {
                                                    toolCallsAccum[tc.index].name = tc.function.name;
                                                    sendSSE('tool_delta', { index: tc.index, name: tc.function.name, callId: tc.id, arguments_delta: '' });
                                                }
                                                if (tc.function?.arguments) {
                                                    toolCallsAccum[tc.index].arguments += tc.function.arguments;
                                                    sendSSE('tool_delta', { index: tc.index, arguments_delta: tc.function.arguments });
                                                }
                                            }
                                        }
                                    }
                                    if (parsed.choices?.[0]?.finish_reason === 'tool_calls') {
                                        for (let i = 0; i < toolCallsAccum.length; i++) {
                                            if (toolCallsAccum[i]?.name) {
                                                sendSSE('tool_done', { index: i, name: toolCallsAccum[i].name, arguments: toolCallsAccum[i].arguments, callId: toolCallsAccum[i].id });
                                            }
                                        }
                                    }
                                } catch { /* skip */ }
                            }
                        }

                        // ─── Persist conversation (Chat Completions path — structured) ───
                        if (conversationId) {
                            const convFile = path.join(CONV_DIR, `conv-${conversationId}.json`);
                            const conv = await readJSON(convFile, { id: conversationId, messages: [] });
                            const now = new Date().toISOString();

                            conv.messages.push({ role: 'user', content: userMessage, timestamp: now });

                            const validTools = toolCallsAccum.filter(t => t?.name);
                            if (fullResponseText && validTools.length === 0) {
                                conv.messages.push({ role: 'assistant', content: fullResponseText, timestamp: now });
                            } else if (validTools.length > 0) {
                                const respondCall = validTools.find(t => t.name === 'respond_to_user');
                                if (respondCall && validTools.length === 1) {
                                    try {
                                        const parsed = JSON.parse(respondCall.arguments || '{}');
                                        conv.messages.push({ role: 'assistant', content: parsed.message || respondCall.arguments, timestamp: now });
                                    } catch {
                                        conv.messages.push({ role: 'assistant', content: respondCall.arguments, timestamp: now });
                                    }
                                } else {
                                    conv.messages.push({
                                        role: 'assistant',
                                        content: fullResponseText || null,
                                        tool_calls: validTools.map(t => ({
                                            id: t.id || `call_${validTools.indexOf(t)}`,
                                            name: t.name,
                                            arguments: t.arguments,
                                        })),
                                        timestamp: now,
                                    });
                                }
                            }

                            await writeJSON(convFile, conv);

                            const index = await readJSON(FILES.convIndex, { conversations: [] });
                            const entry = index.conversations.find(c => c.id === conversationId);
                            if (entry) {
                                entry.messageCount = conv.messages.length;
                                entry.updatedAt = new Date().toISOString();
                                if (!entry.title || entry.title === 'Oni Chat') {
                                    entry.title = userMessage.substring(0, 60);
                                }
                                await writeJSON(FILES.convIndex, index);
                            }
                        }
                    }
                } catch (err) {
                    console.error('[Chat] Proxy error:', err);
                    sendSSE('error', { error: err.message });
                }

                sendSSE('done', {});
                res.end();
            });

            // ═══════════════════════════════════════════════
            // AGENT LOOP: Continue after tool execution
            // Frontend executes tools, sends results here,
            // we forward to OpenAI → stream final response
            // (or more tool calls → frontend loops again)
            // ═══════════════════════════════════════════════

            server.middlewares.use('/api/ai/chat/continue', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }

                const body = await parseBody(req);
                const { conversationId, toolResults, tools, previousResponseId, aiMode, kernelState } = body;
                // toolResults: [{ callId, name, result }]

                if (!toolResults || !toolResults.length) {
                    json(res, { error: 'toolResults required' }, 400);
                    return;
                }

                const config = await readJSON(FILES.config, DEFAULT_CONFIG);
                const model = body.model || config.defaultModel || 'gpt-4o-mini';
                const isWorkspaceMode = aiMode === 'openclaw';

                const oauthToken = await getValidAccessToken();
                const apiKey = config.apiKey || '';

                if (!oauthToken && !apiKey) {
                    json(res, { error: 'No authentication configured.' }, 401);
                    return;
                }

                // SSE response
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
                    if (oauthToken) {
                        // ─── OAuth: Codex Responses API ───
                        const CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses';

                        let systemPrompt;
                        if (isWorkspaceMode) {
                            const workspaceFiles = readWorkspaceFiles();
                            systemPrompt = buildWorkspaceSystemPrompt(workspaceFiles, kernelState);
                        } else {
                            const personality = await readJSON(FILES.personality, DEFAULT_PERSONALITY);
                            systemPrompt = `You are ${personality.name || 'Oni'}, ${personality.role || 'the AI assistant for OniOS'}.`;
                        }
                        systemPrompt += `\n\n## Agent Loop — Tool Results Received
The tools you called have been executed. Their results are below.

NOW EVALUATE:
1. Did the tools succeed? Check each result for errors.
2. Is the user's ORIGINAL GOAL fully achieved?
3. If YES → respond with a brief, natural summary of what was accomplished. Use respond_to_user.
4. If NO → call more tools to continue working toward the goal. Do NOT respond with text yet.
5. If a tool FAILED → try an alternative approach or explain what went wrong.

IMPORTANT: You may call more tools here. Do NOT stop early if there are remaining steps.`;

                        // Rebuild conversation context from history (TEXT only)
                        // IMPORTANT: Only include user/assistant TEXT messages from history.
                        // Skip tool_calls and tool results to avoid stale call_id mismatches.
                        const input = [];

                        if (conversationId) {
                            const convFile = path.join(CONV_DIR, `conv-${conversationId}.json`);
                            const conv = await readJSON(convFile, null);
                            if (conv?.messages) {
                                const limit = await readJSON(FILES.config, DEFAULT_CONFIG).maxConversationMessages || 50;
                                const recent = conv.messages.slice(-limit);
                                for (const msg of recent) {
                                    if (msg.role === 'user') {
                                        input.push({ type: 'message', role: 'user', content: [{ type: 'input_text', text: msg.content }] });
                                    } else if (msg.role === 'assistant' && msg.tool_calls?.length) {
                                        // Summarize tool calls as text to preserve context without stale call_ids
                                        const toolSummary = msg.tool_calls.map(tc => `[Called tool: ${tc.name}]`).join(' ');
                                        const textContent = msg.content || '';
                                        input.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: (textContent + ' ' + toolSummary).trim() }] });
                                    } else if (msg.role === 'assistant') {
                                        if (msg.content) {
                                            input.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: msg.content }] });
                                        }
                                    }
                                    // Skip 'tool' role messages — they cause stale call_id errors
                                }
                            }
                        }

                        // Add current turn's function_call + function_call_output items (these are fresh, IDs match)
                        for (const tr of toolResults) {
                            input.push({
                                type: 'function_call',
                                call_id: tr.callId,
                                name: tr.name,
                                arguments: tr.arguments || '{}',
                            });
                        }
                        for (const tr of toolResults) {
                            input.push({
                                type: 'function_call_output',
                                call_id: tr.callId,
                                output: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
                            });
                        }

                        const responsesTools = (tools || []).map(t => ({
                            type: 'function',
                            name: t.function?.name || t.name,
                            description: t.function?.description || '',
                            parameters: t.function?.parameters || { type: 'object', properties: {} },
                        }));

                        const payload = {
                            model,
                            instructions: systemPrompt,
                            input,
                            tools: responsesTools.length > 0 ? responsesTools : undefined,
                            tool_choice: responsesTools.length > 0 ? 'auto' : undefined,
                            stream: true,
                            store: false,
                        };

                        console.log(`[Chat/Continue] OAuth → Codex (${model}) | ${toolResults.length} tool result(s), ${input.length} input items, ${responsesTools.length} tools`);
                        const upstream = await fetch(CODEX_URL, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${oauthToken}`,
                            },
                            body: JSON.stringify(payload),
                        });

                        if (!upstream.ok) {
                            const errText = await upstream.text();
                            console.warn('[Chat/Continue] Codex error:', upstream.status, errText);
                            sendSSE('error', { error: `Codex API error (${upstream.status}): ${errText}` });
                            res.end();
                            return;
                        }

                        const reader = upstream.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';
                        const toolNames = {};
                        let fullResponseText = '';
                        let responseId = null;
                        const streamToolCalls = [];

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    try {
                                        const evt = JSON.parse(line.slice(6));
                                        // Capture response ID for chaining
                                        if (evt.type === 'response.created' && evt.response?.id) {
                                            responseId = evt.response.id;
                                            sendSSE('response_id', { id: responseId });
                                        }
                                        if (evt.type === 'response.output_text.delta') {
                                            fullResponseText += evt.delta;
                                            sendSSE('text_delta', { delta: evt.delta });
                                        } else if (evt.type === 'response.output_text.done') {
                                            sendSSE('text_done', { text: evt.text });
                                        } else if (evt.type === 'response.output_item.added' && evt.item?.type === 'function_call') {
                                            toolNames[evt.output_index] = evt.item.name;
                                            sendSSE('tool_delta', { index: evt.output_index, name: evt.item.name, arguments_delta: '' });
                                        } else if (evt.type === 'response.function_call_arguments.delta') {
                                            sendSSE('tool_delta', { index: evt.output_index, name: toolNames[evt.output_index] || '', arguments_delta: evt.delta });
                                        } else if (evt.type === 'response.function_call_arguments.done') {
                                            // Arguments finalized — wait for output_item.done
                                        } else if (evt.type === 'response.output_item.done' && evt.item?.type === 'function_call') {
                                            streamToolCalls.push({ name: evt.item.name, arguments: evt.item.arguments, callId: evt.item.call_id });
                                            sendSSE('tool_done', { index: evt.output_index, name: evt.item.name, arguments: evt.item.arguments, callId: evt.item.call_id });
                                        } else if (evt.type === 'response.completed') {
                                            sendSSE('done', { usage: evt.response?.usage, responseId: evt.response?.id });
                                        } else if (evt.type === 'response.failed') {
                                            sendSSE('error', { error: evt.response?.error?.message || 'Response failed' });
                                        }
                                    } catch { /* skip */ }
                                }
                            }
                        }

                        // Persist tool results + final response to conversation
                        if (conversationId) {
                            const convFile = path.join(CONV_DIR, `conv-${conversationId}.json`);
                            const conv = await readJSON(convFile, { id: conversationId, messages: [] });
                            const now = new Date().toISOString();

                            // Save each tool result as a structured message
                            for (const tr of toolResults) {
                                conv.messages.push({
                                    role: 'tool',
                                    tool_call_id: tr.callId,
                                    name: tr.name,
                                    content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
                                    timestamp: now,
                                });
                            }

                            // Check for respond_to_user in stream tool calls (final text lives in its arguments)
                            const respondCall = streamToolCalls.find(t => t.name === 'respond_to_user');
                            if (respondCall) {
                                try {
                                    const parsed = JSON.parse(respondCall.arguments || '{}');
                                    conv.messages.push({ role: 'assistant', content: parsed.message || respondCall.arguments, timestamp: now });
                                } catch {
                                    conv.messages.push({ role: 'assistant', content: respondCall.arguments, timestamp: now });
                                }
                            } else if (fullResponseText) {
                                conv.messages.push({ role: 'assistant', content: fullResponseText, timestamp: now });
                            }

                            await writeJSON(convFile, conv);
                        }

                    } else {
                        // ─── API key: Chat Completions ───
                        const apiUrl = config.apiUrl || DEFAULT_CONFIG.apiUrl;

                        // Rebuild messages with tool results
                        let conversationMessages = [];
                        if (conversationId) {
                            const convFile = path.join(CONV_DIR, `conv-${conversationId}.json`);
                            const conv = await readJSON(convFile, null);
                            if (conv?.messages) {
                                conversationMessages = conv.messages.slice(-(config.maxConversationMessages || 50));
                            }
                        }

                        let apiSystemPrompt;
                        if (isWorkspaceMode) {
                            const workspaceFiles = readWorkspaceFiles();
                            apiSystemPrompt = buildWorkspaceSystemPrompt(workspaceFiles, kernelState);
                        } else {
                            const personality = await readJSON(FILES.personality, DEFAULT_PERSONALITY);
                            apiSystemPrompt = `You are ${personality.name || 'Oni'}, ${personality.role || 'the AI assistant for OniOS'}.`;
                        }
                        apiSystemPrompt += `\n\n## Agent Loop — Tool Results Received
The tools you called have been executed. Their results are below.

NOW EVALUATE:
1. Did the tools succeed? Check each result for errors.
2. Is the user's ORIGINAL GOAL fully achieved?
3. If YES → respond with a brief, natural summary of what was accomplished. Use respond_to_user.
4. If NO → call more tools to continue working toward the goal. Do NOT respond with text yet.
5. If a tool FAILED → try an alternative approach or explain what went wrong.

IMPORTANT: You may call more tools here. Do NOT stop early if there are remaining steps.`;

                        // Build messages — TEXT only from history to avoid stale tool_call_id mismatches
                        const messages = [{ role: 'system', content: apiSystemPrompt }];
                        for (const msg of conversationMessages) {
                            if (msg.role === 'tool') {
                                // Skip stale tool results from history
                                continue;
                            } else if (msg.role === 'assistant' && msg.tool_calls?.length) {
                                // Summarize tool calls as text to preserve context
                                const toolSummary = msg.tool_calls.map(tc => `[Called: ${tc.name}]`).join(' ');
                                messages.push({ role: 'assistant', content: ((msg.content || '') + ' ' + toolSummary).trim() });
                            } else {
                                messages.push({ role: msg.role, content: msg.content || '' });
                            }
                        }

                        // Add current turn's tool calls + results
                        const toolCallObjs = toolResults.map((tr, i) => ({
                            id: tr.callId || `call_${i}`,
                            type: 'function',
                            function: { name: tr.name, arguments: tr.arguments || '{}' },
                        }));
                        messages.push({ role: 'assistant', content: null, tool_calls: toolCallObjs });

                        for (const tr of toolResults) {
                            messages.push({
                                role: 'tool',
                                tool_call_id: tr.callId || `call_${toolResults.indexOf(tr)}`,
                                content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
                            });
                        }

                        // Include tools so AI can call more in subsequent turns
                        const chatTools = (tools || []).map(t => ({
                            type: 'function',
                            function: {
                                name: t.function?.name || t.name,
                                description: t.function?.description || '',
                                parameters: t.function?.parameters || { type: 'object', properties: {} },
                            },
                        }));

                        const payload = {
                            model,
                            messages,
                            stream: true,
                            ...(chatTools.length > 0 && { tools: chatTools, tool_choice: 'auto' }),
                        };

                        console.log(`[Chat/Continue] API key → ${apiUrl} (${model}) | ${toolResults.length} tool result(s), ${chatTools.length} tools`);
                        const upstream = await fetch(apiUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${apiKey}`,
                            },
                            body: JSON.stringify(payload),
                        });

                        if (!upstream.ok) {
                            const errText = await upstream.text();
                            sendSSE('error', { error: `API error (${upstream.status}): ${errText}` });
                            res.end();
                            return;
                        }

                        const reader = upstream.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';
                        let toolCallsAccum = [];
                        let fullResponseText = '';

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                if (!line.startsWith('data: ')) continue;
                                const data = line.slice(6);
                                if (data === '[DONE]') { sendSSE('done', {}); continue; }
                                try {
                                    const parsed = JSON.parse(data);
                                    const delta = parsed.choices?.[0]?.delta;
                                    if (delta?.content) {
                                        fullResponseText += delta.content;
                                        sendSSE('text_delta', { delta: delta.content });
                                    }
                                    if (delta?.tool_calls) {
                                        for (const tc of delta.tool_calls) {
                                            if (tc.index !== undefined) {
                                                if (!toolCallsAccum[tc.index]) toolCallsAccum[tc.index] = { name: '', arguments: '' };
                                                if (tc.function?.name) {
                                                    toolCallsAccum[tc.index].name = tc.function.name;
                                                    sendSSE('tool_delta', { index: tc.index, name: tc.function.name, arguments_delta: '' });
                                                }
                                                if (tc.function?.arguments) {
                                                    toolCallsAccum[tc.index].arguments += tc.function.arguments;
                                                    sendSSE('tool_delta', { index: tc.index, arguments_delta: tc.function.arguments });
                                                }
                                            }
                                        }
                                    }
                                    if (parsed.choices?.[0]?.finish_reason === 'tool_calls') {
                                        for (let i = 0; i < toolCallsAccum.length; i++) {
                                            if (toolCallsAccum[i]?.name) {
                                                sendSSE('tool_done', { index: i, name: toolCallsAccum[i].name, arguments: toolCallsAccum[i].arguments });
                                            }
                                        }
                                    }
                                } catch { /* skip */ }
                            }
                        }

                        // Persist tool results + final response
                        if (conversationId) {
                            const convFile = path.join(CONV_DIR, `conv-${conversationId}.json`);
                            const conv = await readJSON(convFile, { id: conversationId, messages: [] });
                            const now = new Date().toISOString();

                            for (const tr of toolResults) {
                                conv.messages.push({
                                    role: 'tool',
                                    tool_call_id: tr.callId,
                                    name: tr.name,
                                    content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
                                    timestamp: now,
                                });
                            }

                            // Check for respond_to_user in stream tool calls (final text lives in its arguments)
                            const validTools = toolCallsAccum.filter(t => t?.name);
                            const respondCall = validTools.find(t => t.name === 'respond_to_user');
                            if (respondCall) {
                                try {
                                    const parsed = JSON.parse(respondCall.arguments || '{}');
                                    conv.messages.push({ role: 'assistant', content: parsed.message || respondCall.arguments, timestamp: now });
                                } catch {
                                    conv.messages.push({ role: 'assistant', content: respondCall.arguments, timestamp: now });
                                }
                            } else if (fullResponseText) {
                                conv.messages.push({ role: 'assistant', content: fullResponseText, timestamp: now });
                            }

                            await writeJSON(convFile, conv);
                        }
                    }
                } catch (err) {
                    console.error('[Chat/Continue] Error:', err);
                    sendSSE('error', { error: err.message });
                }

                sendSSE('done', {});
                res.end();
            });

            // ═══════════════════════════════════════════════
            // CONFIG endpoints
            // ═══════════════════════════════════════════════

            // Returns auth method info for chat widget
            server.middlewares.use('/api/ai/config/key', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const config = await readJSON(FILES.config, DEFAULT_CONFIG);
                const auth = await readJSON(FILES.auth, null);
                const hasOAuth = auth && auth.type === 'oauth';

                json(res, {
                    apiKey: config.apiKey || '',
                    authMethod: config.apiKey ? 'apikey' : (hasOAuth ? 'oauth_only' : 'none'),
                    apiUrl: config.apiUrl || DEFAULT_CONFIG.apiUrl,
                    defaultModel: config.defaultModel || DEFAULT_CONFIG.defaultModel,
                    embeddingApiKey: config.embeddingApiKey || '',
                    embeddingApiUrl: config.embeddingApiUrl || '',
                });
            });

            server.middlewares.use('/api/ai/config', async (req, res) => {
                if (req.method === 'GET') {
                    const config = await readJSON(FILES.config, DEFAULT_CONFIG);
                    // Mask API keys for security
                    json(res, {
                        ...config,
                        apiKey: config.apiKey ? '***' + config.apiKey.slice(-4) : '',
                        embeddingApiKey: config.embeddingApiKey ? '***' + config.embeddingApiKey.slice(-4) : '',
                    });
                } else if (req.method === 'POST') {
                    const body = await parseBody(req);
                    const current = await readJSON(FILES.config, DEFAULT_CONFIG);
                    // Don't overwrite keys with masked values
                    if (body.apiKey === '***' + current.apiKey?.slice(-4)) delete body.apiKey;
                    if (body.embeddingApiKey === '***' + current.embeddingApiKey?.slice(-4)) delete body.embeddingApiKey;
                    const updated = { ...current, ...body };
                    await writeJSON(FILES.config, updated);
                    json(res, { ok: true });
                } else {
                    json(res, { error: 'GET or POST only' }, 405);
                }
            });

            console.log(`[AIMemory] AI storage ready at ${AI_DIR}`);
        },
    };
}
