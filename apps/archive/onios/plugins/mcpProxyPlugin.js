/**
 * Vite plugin that provides a server-side proxy for MCP (Model Context Protocol) tool calls.
 * 
 * This allows the WorkflowBuilder's MCP node to:
 * - Discover available MCP servers
 * - List tools from a server
 * - Call MCP tools with arguments
 * - Search for MCP servers online
 *
 * Endpoints:
 *   GET  /api/mcp/servers          → list configured MCP servers
 *   GET  /api/mcp/tools?server=    → list tools from a server
 *   POST /api/mcp/call             → { server, tool, arguments } → call a tool
 *   GET  /api/mcp/search?q=        → search MCP registry online
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const CONFIG_DIR = path.join(os.homedir(), '.onios');
const MCP_CONFIG_FILE = path.join(CONFIG_DIR, 'mcp-servers.json');

function ensureDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

function loadMcpConfig() {
    ensureDir();
    if (!fs.existsSync(MCP_CONFIG_FILE)) {
        // Create default config with example
        const defaultConfig = {
            servers: {}
        };
        fs.writeFileSync(MCP_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf-8');
        return defaultConfig;
    }
    try {
        return JSON.parse(fs.readFileSync(MCP_CONFIG_FILE, 'utf-8'));
    } catch {
        return { servers: {} };
    }
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve({}); }
        });
        req.on('error', reject);
    });
}

function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

/**
 * Execute an MCP tool via stdio transport.
 * Spawns the server process, sends a JSON-RPC call, and returns the result.
 */
async function callMcpTool(serverConfig, toolName, args = {}) {
    return new Promise((resolve, reject) => {
        const timeout = 30000;
        const command = serverConfig.command;
        const cmdArgs = serverConfig.args || [];
        const env = { ...process.env, ...(serverConfig.env || {}) };

        let proc;
        try {
            proc = spawn(command, cmdArgs, {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false,
            });
        } catch (err) {
            reject(new Error(`Failed to spawn MCP server: ${err.message}`));
            return;
        }

        let stdout = '';
        let stderr = '';
        let resolved = false;
        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                proc.kill();
                reject(new Error(`MCP tool call timed out after ${timeout / 1000}s`));
            }
        }, timeout);

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                reject(new Error(`MCP server error: ${err.message}`));
            }
        });

        proc.on('close', (code) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);

                // Try to parse JSON-RPC response from stdout
                try {
                    // Find last complete JSON object in stdout
                    const lines = stdout.trim().split('\n');
                    for (let i = lines.length - 1; i >= 0; i--) {
                        try {
                            const parsed = JSON.parse(lines[i]);
                            if (parsed.result !== undefined) {
                                resolve(parsed.result);
                                return;
                            }
                            if (parsed.error) {
                                reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
                                return;
                            }
                        } catch { /* not valid JSON, try next line */ }
                    }
                    // If no JSON-RPC response found, return raw stdout
                    resolve({ rawOutput: stdout, exitCode: code });
                } catch {
                    if (code !== 0) {
                        reject(new Error(`MCP server exited with code ${code}: ${stderr || stdout}`));
                    } else {
                        resolve({ rawOutput: stdout });
                    }
                }
            }
        });

        // Send JSON-RPC initialize + tool call
        const initMsg = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'onios-workflow', version: '1.0.0' },
            },
        }) + '\n';

        const callMsg = JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args,
            },
        }) + '\n';

        proc.stdin.write(initMsg);
        // Small delay to let server initialize
        setTimeout(() => {
            proc.stdin.write(callMsg);
            proc.stdin.end();
        }, 500);
    });
}

/**
 * List tools from an MCP server via stdio transport.
 */
async function listMcpTools(serverConfig) {
    return new Promise((resolve, reject) => {
        const timeout = 15000;
        const command = serverConfig.command;
        const cmdArgs = serverConfig.args || [];
        const env = { ...process.env, ...(serverConfig.env || {}) };

        let proc;
        try {
            proc = spawn(command, cmdArgs, {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false,
            });
        } catch (err) {
            reject(new Error(`Failed to spawn MCP server: ${err.message}`));
            return;
        }

        let stdout = '';
        let resolved = false;
        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                proc.kill();
                reject(new Error('Tool listing timed out'));
            }
        }, timeout);

        proc.stdout.on('data', (data) => { stdout += data.toString(); });

        proc.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                reject(err);
            }
        });

        proc.on('close', () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                const lines = stdout.trim().split('\n');
                for (let i = lines.length - 1; i >= 0; i--) {
                    try {
                        const parsed = JSON.parse(lines[i]);
                        if (parsed.result?.tools) {
                            resolve(parsed.result.tools);
                            return;
                        }
                    } catch { /* try next */ }
                }
                resolve([]);
            }
        });

        // Initialize then list tools
        const initMsg = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'onios-workflow', version: '1.0.0' },
            },
        }) + '\n';

        const listMsg = JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
        }) + '\n';

        proc.stdin.write(initMsg);
        setTimeout(() => {
            proc.stdin.write(listMsg);
            proc.stdin.end();
        }, 500);
    });
}

export default function mcpProxyPlugin() {
    return {
        name: 'mcp-proxy-api',
        configureServer(server) {

            // GET /api/mcp/servers — list configured MCP servers
            server.middlewares.use('/api/mcp/servers', (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const config = loadMcpConfig();
                const servers = Object.entries(config.servers || {}).map(([name, cfg]) => ({
                    name,
                    command: cfg.command,
                    description: cfg.description || '',
                    hasArgs: (cfg.args || []).length > 0,
                }));
                json(res, { servers, configPath: MCP_CONFIG_FILE });
            });

            // GET /api/mcp/tools?server=name — list tools from a server
            server.middlewares.use('/api/mcp/tools', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const serverName = url.searchParams.get('server');
                if (!serverName) { json(res, { error: 'server parameter required' }, 400); return; }

                const config = loadMcpConfig();
                const serverConfig = config.servers?.[serverName];
                if (!serverConfig) {
                    json(res, { error: `Server "${serverName}" not found in config`, configPath: MCP_CONFIG_FILE }, 404);
                    return;
                }

                try {
                    const tools = await listMcpTools(serverConfig);
                    json(res, {
                        server: serverName,
                        tools: tools.map(t => ({
                            name: t.name,
                            description: t.description || '',
                            inputSchema: t.inputSchema || {},
                        })),
                    });
                } catch (err) {
                    json(res, { error: err.message, server: serverName }, 500);
                }
            });

            // POST /api/mcp/call — call an MCP tool
            server.middlewares.use('/api/mcp/call', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                const { server: serverName, tool, arguments: args } = body;

                if (!serverName) { json(res, { error: 'server required' }, 400); return; }
                if (!tool) { json(res, { error: 'tool required' }, 400); return; }

                const config = loadMcpConfig();
                const serverConfig = config.servers?.[serverName];
                if (!serverConfig) {
                    json(res, { error: `Server "${serverName}" not found` }, 404);
                    return;
                }

                try {
                    const result = await callMcpTool(serverConfig, tool, args || {});
                    json(res, { result, server: serverName, tool });
                } catch (err) {
                    json(res, { error: err.message, server: serverName, tool }, 500);
                }
            });

            // GET /api/mcp/search?q= — search online MCP registry
            server.middlewares.use('/api/mcp/search', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const q = url.searchParams.get('q') || '';
                if (!q) { json(res, { error: 'q parameter required' }, 400); return; }

                try {
                    // Search the MCP registry (mcpservers.org or similar)
                    const searchUrl = `https://registry.modelcontextprotocol.io/api/servers?q=${encodeURIComponent(q)}&limit=20`;
                    const response = await fetch(searchUrl);
                    if (response.ok) {
                        const data = await response.json();
                        json(res, { query: q, results: data.servers || data.results || data });
                    } else {
                        // Fallback: return a helpful message
                        json(res, {
                            query: q,
                            results: [],
                            message: 'Online MCP registry not available. Configure servers manually in ' + MCP_CONFIG_FILE,
                        });
                    }
                } catch {
                    json(res, {
                        query: q,
                        results: [],
                        message: 'Could not reach MCP registry. Configure servers in ' + MCP_CONFIG_FILE,
                    });
                }
            });

            console.log(`[McpProxy] MCP proxy ready. Config: ${MCP_CONFIG_FILE}`);
        },
    };
}
