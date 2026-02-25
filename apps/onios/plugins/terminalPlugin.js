/**
 * terminalPlugin — Vite plugin that creates WebSocket-based shell terminals.
 * Uses node-pty for proper PTY support (ANSI colors, resize, interactive shells).
 * Run `cd node_modules/node-pty && npx node-gyp rebuild` if you get posix_spawnp errors.
 */

import { WebSocketServer } from 'ws';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default function terminalPlugin() {
    return {
        name: 'vite-plugin-terminal',
        configureServer(server) {
            const wss = new WebSocketServer({ noServer: true });

            server.httpServer.on('upgrade', (request, socket, head) => {
                if (request.url === '/ws/terminal') {
                    wss.handleUpgrade(request, socket, head, (ws) => {
                        wss.emit('connection', ws, request);
                    });
                }
            });

            wss.on('connection', (ws) => {
                let pty;
                try {
                    pty = require('node-pty');
                } catch (err) {
                    console.error('node-pty load error:', err);
                    ws.send(JSON.stringify({
                        type: 'output',
                        data: `\r\n\x1b[31mnode-pty not available: ${err.message}\x1b[0m\r\n` +
                            `\r\nRun: cd node_modules/node-pty && npx node-gyp rebuild\r\n`
                    }));
                    ws.close();
                    return;
                }

                const shell = process.env.SHELL || '/bin/zsh';
                const homeDir = os.homedir();

                const env = { ...process.env };
                env.TERM = 'xterm-256color';
                env.COLORTERM = 'truecolor';
                // Clean up npm env vars that confuse shells
                delete env.npm_config_prefix;
                delete env.npm_lifecycle_event;
                delete env.npm_lifecycle_script;

                let ptyProcess;
                try {
                    ptyProcess = pty.spawn(shell, [], {
                        name: 'xterm-256color',
                        cols: 120,
                        rows: 40,
                        cwd: homeDir,
                        env: env,
                    });
                } catch (err) {
                    ws.send(JSON.stringify({
                        type: 'output',
                        data: `\r\nFailed to spawn shell (${shell}): ${err.message}\r\n`
                    }));
                    ws.close();
                    return;
                }

                // Shell output → WebSocket
                ptyProcess.onData((data) => {
                    if (ws.readyState === 1) {
                        ws.send(JSON.stringify({ type: 'output', data }));
                    }
                });

                ptyProcess.onExit(({ exitCode }) => {
                    if (ws.readyState === 1) {
                        ws.send(JSON.stringify({ type: 'exit', exitCode }));
                    }
                });

                // WebSocket → Shell input/resize
                ws.on('message', (msg) => {
                    try {
                        const message = JSON.parse(msg.toString());
                        if (message.type === 'input') {
                            ptyProcess.write(message.data);
                        } else if (message.type === 'resize') {
                            ptyProcess.resize(
                                Math.max(1, message.cols),
                                Math.max(1, message.rows)
                            );
                        }
                    } catch {
                        ptyProcess.write(msg.toString());
                    }
                });

                ws.on('close', () => {
                    try { ptyProcess.kill(); } catch { }
                });
            });

            console.log('🖥️  Terminal WebSocket ready at /ws/terminal (node-pty)');
        },
    };
}
