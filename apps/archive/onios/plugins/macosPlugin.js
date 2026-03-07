/**
 * macOS Native Integration Plugin
 *
 * Provides kernel-level macOS integrations for OniOS:
 * 1. Native notifications via osascript
 * 2. Spotlight metadata indexing for OniOS files
 * 3. System info (battery, display, audio, network)
 * 4. Open URLs in default browser
 * 5. Clipboard access
 * 6. macOS app management (open/quit apps)
 *
 * Endpoints:
 *   POST   /api/macos/notify           → Send native macOS notification
 *   GET    /api/macos/system           → System info (battery, display, audio)
 *   POST   /api/macos/clipboard/write  → Write to clipboard
 *   GET    /api/macos/clipboard/read   → Read from clipboard
 *   POST   /api/macos/open-url         → Open URL in default browser
 *   POST   /api/macos/open-app         → Open a macOS application
 *   GET    /api/macos/running-apps     → List running applications
 *   POST   /api/macos/spotlight/index  → Index OniOS files for Spotlight
 *   GET    /api/macos/network          → Network info (WiFi, IP, etc.)
 *   POST   /api/macos/say              → Text-to-speech via `say`
 *   GET    /api/macos/displays         → Display configuration
 *   POST   /api/macos/screenshot       → Take a screenshot
 */

import { execSync, exec } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

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

function runCmd(cmd, timeout = 10000) {
    try {
        return execSync(cmd, { timeout, encoding: 'utf-8', maxBuffer: 1024 * 1024 }).trim();
    } catch (err) {
        return err.stdout?.trim() || '';
    }
}

function isMacOS() {
    return process.platform === 'darwin';
}

export default function macosPlugin() {
    return {
        name: 'macos-plugin',
        configureServer(server) {
            if (!isMacOS()) {
                console.log('[macOS] Skipping macOS plugin (not on macOS)');
                return;
            }
            console.log('[macOS] Native integration plugin loaded');

            // ─── Native Notifications ────────────────────
            server.middlewares.use('/api/macos/notify', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                const { title = 'OniOS', message, subtitle, sound = true } = body;
                if (!message) { json(res, { error: 'message required' }, 400); return; }

                try {
                    let script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
                    if (subtitle) script += ` subtitle "${subtitle.replace(/"/g, '\\"')}"`;
                    if (sound) script += ' sound name "Glass"';

                    execSync(`osascript -e '${script}'`, { timeout: 5000 });
                    json(res, { success: true, title, message });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── System Info ─────────────────────────────
            server.middlewares.use('/api/macos/system', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }

                const info = {
                    platform: 'macOS',
                    version: runCmd('sw_vers -productVersion'),
                    build: runCmd('sw_vers -buildVersion'),
                    arch: process.arch,
                    hostname: os.hostname(),
                    uptime: os.uptime(),
                    totalMemory: os.totalmem(),
                    freeMemory: os.freemem(),
                    cpus: os.cpus().length,
                    model: runCmd('sysctl -n hw.model') || 'Unknown',
                    chip: runCmd('sysctl -n machdep.cpu.brand_string') || 'Unknown',
                };

                // Battery
                try {
                    const battery = runCmd('pmset -g batt');
                    const match = battery.match(/(\d+)%/);
                    const charging = battery.includes('charging') || battery.includes('AC Power');
                    info.battery = {
                        level: match ? parseInt(match[1]) : null,
                        charging,
                        source: charging ? 'AC' : 'Battery',
                    };
                } catch { info.battery = null; }

                // Disk space
                try {
                    const df = runCmd('df -h / | tail -1');
                    const parts = df.split(/\s+/);
                    info.disk = {
                        total: parts[1],
                        used: parts[2],
                        available: parts[3],
                        usedPercent: parts[4],
                    };
                } catch { info.disk = null; }

                json(res, info);
            });

            // ─── Clipboard ───────────────────────────────
            server.middlewares.use('/api/macos/clipboard/read', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                try {
                    const content = runCmd('pbpaste');
                    json(res, { success: true, content });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            server.middlewares.use('/api/macos/clipboard/write', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                if (!body.content) { json(res, { error: 'content required' }, 400); return; }
                try {
                    execSync(`echo ${JSON.stringify(body.content)} | pbcopy`, { timeout: 5000 });
                    json(res, { success: true, length: body.content.length });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── Open URL in Default Browser ─────────────
            server.middlewares.use('/api/macos/open-url', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                if (!body.url) { json(res, { error: 'url required' }, 400); return; }
                try {
                    exec(`open "${body.url}"`);
                    json(res, { success: true, url: body.url });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── Open macOS App ──────────────────────────
            server.middlewares.use('/api/macos/open-app', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                if (!body.app) { json(res, { error: 'app required' }, 400); return; }
                try {
                    exec(`open -a "${body.app}"`);
                    json(res, { success: true, app: body.app });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── Running Applications ────────────────────
            server.middlewares.use('/api/macos/running-apps', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                try {
                    const raw = runCmd('osascript -e \'tell application "System Events" to get name of every process whose background only is false\'');
                    const apps = raw.split(', ').filter(Boolean);
                    json(res, { success: true, apps, count: apps.length });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── Network Info ────────────────────────────
            server.middlewares.use('/api/macos/network', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                const info = {};
                try {
                    info.wifi = runCmd('/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I | grep " SSID" | awk -F: \'{print $2}\'').trim() || null;
                } catch { info.wifi = null; }
                try {
                    const ifaces = os.networkInterfaces();
                    info.interfaces = {};
                    for (const [name, addrs] of Object.entries(ifaces)) {
                        const ipv4 = addrs?.find(a => a.family === 'IPv4' && !a.internal);
                        if (ipv4) info.interfaces[name] = ipv4.address;
                    }
                } catch { info.interfaces = {}; }
                json(res, info);
            });

            // ─── Text-to-Speech ──────────────────────────
            server.middlewares.use('/api/macos/say', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                if (!body.text) { json(res, { error: 'text required' }, 400); return; }
                const voice = body.voice || 'Samantha';
                const rate = body.rate || 200;
                try {
                    exec(`say -v "${voice}" -r ${rate} "${body.text.replace(/"/g, '\\"')}"`);
                    json(res, { success: true, text: body.text, voice, rate });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── Display Configuration ───────────────────
            server.middlewares.use('/api/macos/displays', async (req, res) => {
                if (req.method !== 'GET') { json(res, { error: 'GET only' }, 405); return; }
                try {
                    const raw = runCmd('system_profiler SPDisplaysDataType -json');
                    const data = JSON.parse(raw);
                    const displays = data?.SPDisplaysDataType?.[0]?.spdisplays_ndrvs || [];
                    json(res, {
                        success: true,
                        displays: displays.map(d => ({
                            name: d._name,
                            resolution: d._spdisplays_resolution,
                            pixels: d._spdisplays_pixels,
                        })),
                    });
                } catch (err) {
                    json(res, { displays: [], error: err.message });
                }
            });

            // ─── Screenshot ──────────────────────────────
            server.middlewares.use('/api/macos/screenshot', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                const body = await parseBody(req);
                const filename = body.filename || `screenshot-${Date.now()}.png`;
                const dest = path.join(os.homedir(), '.onios', 'screenshots', filename);
                try {
                    const dir = path.dirname(dest);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    execSync(`screencapture -x "${dest}"`, { timeout: 10000 });
                    json(res, { success: true, path: dest, filename });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });

            // ─── Spotlight Indexing ──────────────────────
            server.middlewares.use('/api/macos/spotlight/index', async (req, res) => {
                if (req.method !== 'POST') { json(res, { error: 'POST only' }, 405); return; }
                try {
                    // Touch ~/.onios files to trigger Spotlight re-indexing
                    const oniosDir = path.join(os.homedir(), '.onios');
                    if (fs.existsSync(oniosDir)) {
                        execSync(`mdimport "${oniosDir}"`, { timeout: 30000 });
                    }
                    json(res, { success: true, message: 'Spotlight indexing triggered for ~/.onios' });
                } catch (err) {
                    json(res, { error: err.message }, 500);
                }
            });
        },
    };
}
