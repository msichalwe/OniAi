/**
 * Vite plugin that adds filesystem API routes.
 * This allows the File Explorer to browse the real machine filesystem.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export default function filesystemPlugin() {
    return {
        name: 'filesystem-api',
        configureServer(server) {
            // GET /api/fs/list?path=/some/path
            server.middlewares.use('/api/fs/list', (req, res) => {
                try {
                    const url = new URL(req.url, 'http://localhost');
                    let dirPath = url.searchParams.get('path') || os.homedir();

                    // Resolve ~ to home directory
                    if (dirPath.startsWith('~')) {
                        dirPath = path.join(os.homedir(), dirPath.slice(1));
                    }

                    // Security: prevent path traversal attacks
                    dirPath = path.resolve(dirPath);

                    if (!fs.existsSync(dirPath)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Path not found', path: dirPath }));
                        return;
                    }

                    const stat = fs.statSync(dirPath);
                    if (!stat.isDirectory()) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Not a directory', path: dirPath }));
                        return;
                    }

                    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                    const items = [];

                    for (const entry of entries) {
                        // Skip hidden files by default (can be toggled)
                        if (entry.name.startsWith('.')) continue;

                        try {
                            const fullPath = path.join(dirPath, entry.name);
                            const entryStat = fs.statSync(fullPath);

                            items.push({
                                name: entry.name,
                                path: fullPath,
                                isDirectory: entry.isDirectory(),
                                size: entry.isDirectory() ? null : entryStat.size,
                                modified: entryStat.mtime.toISOString(),
                                extension: entry.isDirectory() ? null : path.extname(entry.name).slice(1).toLowerCase(),
                            });
                        } catch {
                            // Skip files we can't stat (permission errors, etc.)
                            items.push({
                                name: entry.name,
                                path: path.join(dirPath, entry.name),
                                isDirectory: entry.isDirectory(),
                                size: null,
                                modified: null,
                                extension: entry.isDirectory() ? null : path.extname(entry.name).slice(1).toLowerCase(),
                                error: 'Permission denied',
                            });
                        }
                    }

                    // Sort: directories first, then by name
                    items.sort((a, b) => {
                        if (a.isDirectory && !b.isDirectory) return -1;
                        if (!a.isDirectory && b.isDirectory) return 1;
                        return a.name.localeCompare(b.name);
                    });

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        path: dirPath,
                        parent: path.dirname(dirPath),
                        items,
                        homedir: os.homedir(),
                    }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            // GET /api/fs/read?path=/some/file — read text file contents
            server.middlewares.use('/api/fs/read', (req, res) => {
                try {
                    const url = new URL(req.url, 'http://localhost');
                    let filePath = url.searchParams.get('path');

                    if (!filePath) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing path parameter' }));
                        return;
                    }

                    if (filePath.startsWith('~')) {
                        filePath = path.join(os.homedir(), filePath.slice(1));
                    }
                    filePath = path.resolve(filePath);

                    if (!fs.existsSync(filePath)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'File not found' }));
                        return;
                    }

                    const stat = fs.statSync(filePath);

                    // Limit to 1MB files for safety
                    if (stat.size > 1024 * 1024) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'File too large (>1MB)', size: stat.size }));
                        return;
                    }

                    const content = fs.readFileSync(filePath, 'utf-8');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        path: filePath,
                        content,
                        size: stat.size,
                        modified: stat.mtime.toISOString(),
                    }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            // GET /api/fs/home — get home directory info
            server.middlewares.use('/api/fs/home', (req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    homedir: os.homedir(),
                    username: os.userInfo().username,
                    platform: os.platform(),
                    hostname: os.hostname(),
                }));
            });

            // GET /api/fs/media?path=/some/file — serve binary files (images, videos, audio)
            server.middlewares.use('/api/fs/media', (req, res) => {
                try {
                    const url = new URL(req.url, 'http://localhost');
                    let filePath = url.searchParams.get('path');

                    if (!filePath) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing path parameter' }));
                        return;
                    }

                    if (filePath.startsWith('~')) {
                        filePath = path.join(os.homedir(), filePath.slice(1));
                    }
                    filePath = path.resolve(filePath);

                    if (!fs.existsSync(filePath)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'File not found' }));
                        return;
                    }

                    const ext = path.extname(filePath).slice(1).toLowerCase();
                    const mimeTypes = {
                        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
                        ico: 'image/x-icon', bmp: 'image/bmp',
                        mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
                        avi: 'video/x-msvideo', mkv: 'video/x-matroska',
                        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
                        flac: 'audio/flac', aac: 'audio/aac',
                        pdf: 'application/pdf',
                    };

                    const contentType = mimeTypes[ext] || 'application/octet-stream';
                    const stat = fs.statSync(filePath);

                    // Support range requests for video/audio seeking
                    const range = req.headers.range;
                    if (range && (contentType.startsWith('video/') || contentType.startsWith('audio/'))) {
                        const parts = range.replace(/bytes=/, '').split('-');
                        const start = parseInt(parts[0], 10);
                        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                        const chunkSize = end - start + 1;

                        res.writeHead(206, {
                            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': chunkSize,
                            'Content-Type': contentType,
                        });

                        const stream = fs.createReadStream(filePath, { start, end });
                        stream.pipe(res);
                    } else {
                        res.writeHead(200, {
                            'Content-Type': contentType,
                            'Content-Length': stat.size,
                            'Cache-Control': 'public, max-age=3600',
                        });

                        const stream = fs.createReadStream(filePath);
                        stream.pipe(res);
                    }
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            // POST /api/fs/write-binary — write binary file from base64 data
            server.middlewares.use('/api/fs/write-binary', (req, res) => {
                if (req.method !== 'POST') return res.writeHead(405).end();

                let body = '';
                req.on('data', chunk => body += chunk.toString());
                req.on('end', () => {
                    try {
                        const payload = JSON.parse(body);
                        let filePath = payload.path;
                        const base64Data = payload.data; // base64-encoded binary
                        if (!filePath || !base64Data) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            return res.end(JSON.stringify({ error: 'Missing path or data parameter' }));
                        }

                        if (filePath.startsWith('~')) {
                            filePath = path.join(os.homedir(), filePath.slice(1));
                        }
                        filePath = path.resolve(filePath);

                        // Ensure parent directory exists
                        const dir = path.dirname(filePath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }

                        // Strip data URL prefix if present (e.g. "data:image/png;base64,...")
                        const cleanData = base64Data.replace(/^data:[^;]+;base64,/, '');
                        fs.writeFileSync(filePath, Buffer.from(cleanData, 'base64'));

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, path: filePath, size: fs.statSync(filePath).size }));
                    } catch (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            // POST /api/fs/write — write text file contents
            server.middlewares.use('/api/fs/write', (req, res) => {
                if (req.method !== 'POST') return res.writeHead(405).end();

                let body = '';
                req.on('data', chunk => body += chunk.toString());
                req.on('end', () => {
                    try {
                        const payload = JSON.parse(body);
                        let filePath = payload.path;
                        if (!filePath) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            return res.end(JSON.stringify({ error: 'Missing path parameter' }));
                        }

                        if (filePath.startsWith('~')) {
                            filePath = path.join(os.homedir(), filePath.slice(1));
                        }
                        filePath = path.resolve(filePath);

                        fs.writeFileSync(filePath, payload.content || '', 'utf-8');

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, path: filePath }));
                    } catch (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            // DELETE /api/fs/delete?path=/some/file
            server.middlewares.use('/api/fs/delete', (req, res) => {
                if (req.method !== 'DELETE') return res.writeHead(405).end();
                try {
                    const url = new URL(req.url, 'http://localhost');
                    let targetPath = url.searchParams.get('path');

                    if (!targetPath) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'Missing path parameter' }));
                    }

                    if (targetPath.startsWith('~')) {
                        targetPath = path.join(os.homedir(), targetPath.slice(1));
                    }
                    targetPath = path.resolve(targetPath);

                    if (!fs.existsSync(targetPath)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'Path not found' }));
                    }

                    fs.rmSync(targetPath, { recursive: true, force: true });

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            // POST /api/fs/mkdir — create a directory
            server.middlewares.use('/api/fs/mkdir', (req, res) => {
                if (req.method !== 'POST') return res.writeHead(405).end();

                let body = '';
                req.on('data', chunk => body += chunk.toString());
                req.on('end', () => {
                    try {
                        const payload = JSON.parse(body);
                        let dirPath = payload.path;
                        if (!dirPath) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            return res.end(JSON.stringify({ error: 'Missing path parameter' }));
                        }

                        if (dirPath.startsWith('~')) {
                            dirPath = path.join(os.homedir(), dirPath.slice(1));
                        }
                        dirPath = path.resolve(dirPath);

                        if (!fs.existsSync(dirPath)) {
                            fs.mkdirSync(dirPath, { recursive: true });
                        }

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, path: dirPath }));
                    } catch (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            // POST /api/fs/move - move/rename a file or directory
            server.middlewares.use('/api/fs/move', (req, res) => {
                if (req.method !== 'POST') return res.writeHead(405).end();

                let body = '';
                req.on('data', chunk => body += chunk.toString());
                req.on('end', () => {
                    try {
                        const payload = JSON.parse(body);
                        let fromPath = payload.from;
                        let toPath = payload.to;

                        if (!fromPath || !toPath) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            return res.end(JSON.stringify({ error: 'Missing from or to parameters' }));
                        }

                        if (fromPath.startsWith('~')) fromPath = path.join(os.homedir(), fromPath.slice(1));
                        if (toPath.startsWith('~')) toPath = path.join(os.homedir(), toPath.slice(1));

                        fromPath = path.resolve(fromPath);
                        toPath = path.resolve(toPath);

                        if (!fs.existsSync(fromPath)) {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            return res.end(JSON.stringify({ error: 'Source missing' }));
                        }

                        fs.renameSync(fromPath, toPath);

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } catch (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            // GET /api/fs/os-open?path=/some/file
            server.middlewares.use('/api/fs/os-open', (req, res) => {
                try {
                    const url = new URL(req.url, 'http://localhost');
                    let targetPath = url.searchParams.get('path');

                    if (!targetPath) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'Missing path parameter' }));
                    }
                    if (targetPath.startsWith('~')) {
                        targetPath = path.join(os.homedir(), targetPath.slice(1));
                    }
                    targetPath = path.resolve(targetPath);

                    let openCommand = 'open'; // macOS default
                    if (os.platform() === 'win32') openCommand = 'start ""';
                    else if (os.platform() === 'linux') openCommand = 'xdg-open';

                    import('child_process').then(({ exec }) => {
                        exec(`${openCommand} "${targetPath}"`, (error) => {
                            if (error) {
                                console.error("OS Open Error:", error);
                            }
                        });
                    });

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            // GET /api/web-proxy?url=https://example.com — proxy web pages for browser widget
            server.middlewares.use('/api/web-proxy', async (req, res) => {
                try {
                    const url = new URL(req.url, 'http://localhost');
                    const targetUrl = url.searchParams.get('url');

                    if (!targetUrl) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing url parameter' }));
                        return;
                    }

                    // Handle file:// URLs by reading local files directly
                    if (targetUrl.startsWith('file://')) {
                        const filePath = decodeURIComponent(targetUrl.replace('file://', ''));
                        try {
                            const content = fs.readFileSync(filePath);
                            const ext = path.extname(filePath).toLowerCase();
                            const mimeTypes = {
                                '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
                                '.js': 'application/javascript', '.json': 'application/json',
                                '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                                '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
                                '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/plain',
                            };
                            const ct = mimeTypes[ext] || 'application/octet-stream';
                            res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
                            res.end(content);
                        } catch (err) {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: `File not found: ${filePath}` }));
                        }
                        return;
                    }

                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 10000);

                    const proxyRes = await fetch(targetUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                        },
                        signal: controller.signal,
                        redirect: 'follow',
                    });
                    clearTimeout(timeout);

                    const contentType = proxyRes.headers.get('content-type') || 'text/html';

                    // For HTML pages, inject a <base> tag so relative URLs resolve correctly
                    if (contentType.includes('text/html')) {
                        let html = await proxyRes.text();
                        const parsedUrl = new URL(targetUrl);
                        const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

                        // Inject <base> tag right after <head> if not already present
                        if (!/<base\s/i.test(html)) {
                            html = html.replace(
                                /(<head[^>]*>)/i,
                                `$1\n<base href="${baseUrl}/" target="_self">`
                            );
                        }

                        res.writeHead(200, {
                            'Content-Type': 'text/html; charset=utf-8',
                            'Access-Control-Allow-Origin': '*',
                        });
                        res.end(html);
                    } else {
                        // For non-HTML (CSS, JS, images), pipe through
                        const buffer = Buffer.from(await proxyRes.arrayBuffer());
                        res.writeHead(200, {
                            'Content-Type': contentType,
                            'Content-Length': buffer.length,
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'public, max-age=300',
                        });
                        res.end(buffer);
                    }
                } catch (err) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
                }
            });

            // GET /api/brave-search?q=query&key=apikey
            server.middlewares.use('/api/brave-search', async (req, res) => {
                try {
                    const url = new URL(req.url, 'http://localhost');
                    const query = url.searchParams.get('q');
                    const apiKey = url.searchParams.get('key');

                    if (!query) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing query parameter' }));
                        return;
                    }

                    if (!apiKey) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing API key' }));
                        return;
                    }

                    const braveRes = await fetch(
                        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
                        {
                            headers: {
                                'Accept': 'application/json',
                                'Accept-Encoding': 'gzip',
                                'X-Subscription-Token': apiKey,
                            },
                        }
                    );

                    if (!braveRes.ok) {
                        const text = await braveRes.text();
                        res.writeHead(braveRes.status, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `Brave API error: ${braveRes.status} ${text}` }));
                        return;
                    }

                    const data = await braveRes.json();
                    const results = (data.web?.results || []).map(r => ({
                        title: r.title,
                        url: r.url,
                        description: r.description,
                    }));

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ results }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        },
    };
}
