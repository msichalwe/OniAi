/**
 * Vite plugin that adds server-side key-value storage API routes.
 * Persists data to a JSON file on the server filesystem so storage
 * is shared across browsers/tabs and survives restarts.
 *
 * Endpoints:
 *   GET    /api/storage/get?ns=&key=         → get a value
 *   POST   /api/storage/set                  → { ns, key, value }
 *   DELETE /api/storage/delete?ns=&key=       → delete a key
 *   GET    /api/storage/list?ns=              → list keys in namespace
 *   GET    /api/storage/namespaces            → list all namespaces
 *   GET    /api/storage/all                   → dump everything
 *   POST   /api/storage/import               → bulk import
 *   GET    /api/storage/stats                 → usage stats
 *   GET    /api/storage/search?q=             → search keys/values
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const STORAGE_DIR = path.join(os.homedir(), '.onios');
const STORAGE_FILE = path.join(STORAGE_DIR, 'storage.json');

function ensureDir() {
    if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
}

function readStore() {
    ensureDir();
    if (!fs.existsSync(STORAGE_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function writeStore(data) {
    ensureDir();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
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

export default function storagePlugin() {
    return {
        name: 'storage-api',
        configureServer(server) {

            // GET /api/storage/get?ns=myapp&key=theme
            server.middlewares.use('/api/storage/get', (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const ns = url.searchParams.get('ns');
                const key = url.searchParams.get('key');
                if (!ns || !key) { json(res, { error: 'ns and key required' }, 400); return; }

                const store = readStore();
                const nsData = store[ns];
                if (!nsData || !(key in nsData)) {
                    json(res, { found: false, ns, key, value: null });
                    return;
                }
                json(res, { found: true, ns, key, value: nsData[key].value, meta: nsData[key].meta });
            });

            // POST /api/storage/set  body: { ns, key, value }
            server.middlewares.use('/api/storage/set', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                const { ns, key, value } = body;
                if (!ns || !key) { json(res, { error: 'ns and key required' }, 400); return; }

                const store = readStore();
                if (!store[ns]) store[ns] = {};
                const now = Date.now();
                const existing = store[ns][key];
                store[ns][key] = {
                    value,
                    meta: {
                        created: existing?.meta?.created || now,
                        updated: now,
                        size: JSON.stringify(value).length,
                    },
                };
                writeStore(store);
                json(res, { ok: true, ns, key });
            });

            // DELETE /api/storage/delete?ns=&key=
            server.middlewares.use('/api/storage/delete', (req, res) => {
                if (req.method !== 'DELETE') { json(res, { error: 'DELETE only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const ns = url.searchParams.get('ns');
                const key = url.searchParams.get('key');
                if (!ns || !key) { json(res, { error: 'ns and key required' }, 400); return; }

                const store = readStore();
                if (store[ns]) {
                    delete store[ns][key];
                    if (Object.keys(store[ns]).length === 0) delete store[ns];
                    writeStore(store);
                }
                json(res, { ok: true, ns, key });
            });

            // GET /api/storage/list?ns=myapp
            server.middlewares.use('/api/storage/list', (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const ns = url.searchParams.get('ns');
                if (!ns) { json(res, { error: 'ns required' }, 400); return; }

                const store = readStore();
                const nsData = store[ns] || {};
                const keys = Object.keys(nsData).map(k => ({
                    key: k,
                    meta: nsData[k].meta,
                }));
                json(res, { ns, keys });
            });

            // GET /api/storage/namespaces
            server.middlewares.use('/api/storage/namespaces', (req, res) => {
                const store = readStore();
                const namespaces = Object.keys(store).map(ns => ({
                    namespace: ns,
                    keyCount: Object.keys(store[ns]).length,
                }));
                json(res, { namespaces });
            });

            // GET /api/storage/all
            server.middlewares.use('/api/storage/all', (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const store = readStore();
                const entries = [];
                for (const [ns, nsData] of Object.entries(store)) {
                    for (const [key, entry] of Object.entries(nsData)) {
                        entries.push({
                            ns,
                            key,
                            value: entry.value,
                            meta: entry.meta,
                        });
                    }
                }
                json(res, { entries, count: entries.length });
            });

            // POST /api/storage/import  body: { entries: [{ ns, key, value }] }
            server.middlewares.use('/api/storage/import', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                const entries = body.entries || [];

                const store = readStore();
                const now = Date.now();
                let count = 0;
                for (const entry of entries) {
                    if (!entry.ns || !entry.key) continue;
                    if (!store[entry.ns]) store[entry.ns] = {};
                    store[entry.ns][entry.key] = {
                        value: entry.value,
                        meta: {
                            created: entry.meta?.created || now,
                            updated: now,
                            size: JSON.stringify(entry.value).length,
                        },
                    };
                    count++;
                }
                writeStore(store);
                json(res, { ok: true, imported: count });
            });

            // GET /api/storage/stats
            server.middlewares.use('/api/storage/stats', (req, res) => {
                const store = readStore();
                let totalKeys = 0;
                let totalSize = 0;
                const namespaces = Object.keys(store);
                for (const nsData of Object.values(store)) {
                    for (const entry of Object.values(nsData)) {
                        totalKeys++;
                        totalSize += entry.meta?.size || 0;
                    }
                }

                json(res, {
                    totalKeys,
                    totalSize,
                    totalSizeFormatted: formatBytes(totalSize),
                    namespaceCount: namespaces.length,
                    namespaces,
                    storagePath: STORAGE_FILE,
                });
            });

            // GET /api/storage/search?q=theme
            server.middlewares.use('/api/storage/search', (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const url = new URL(req.url, 'http://localhost');
                const q = (url.searchParams.get('q') || '').toLowerCase();
                if (!q) { json(res, { error: 'q required' }, 400); return; }

                const store = readStore();
                const results = [];
                for (const [ns, nsData] of Object.entries(store)) {
                    for (const [key, entry] of Object.entries(nsData)) {
                        const valStr = JSON.stringify(entry.value).toLowerCase();
                        if (ns.includes(q) || key.includes(q) || valStr.includes(q)) {
                            results.push({ ns, key, value: entry.value, meta: entry.meta });
                        }
                    }
                }
                json(res, { query: q, results, count: results.length });
            });

            console.log('[StoragePlugin] Server-side storage ready at ~/.onios/storage.json');
        },
    };
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
