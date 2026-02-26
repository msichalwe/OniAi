/**
 * OniOS Production Server
 *
 * Express server that runs inside Electron in production mode.
 * Serves the built static files from dist/ AND all backend API routes
 * (filesystem, terminal, scheduler, storage, oni gateway, macOS native, etc.)
 *
 * In dev mode, Vite handles all of this. In production, this server replaces it.
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { WebSocketServer } from "ws";
import os from "os";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

/**
 * Start the production server.
 * @returns {Promise<number>} The port the server is listening on.
 */
export async function startProductionServer() {
  const app = express();
  const server = http.createServer(app);

  // JSON body parsing
  app.use(express.json({ limit: "50mb" }));

  // ─── Load backend plugins as Express middleware ────────
  // Each plugin was originally a Vite plugin that registered routes via
  // server.middlewares.use(). We replicate that by passing a mock Vite
  // server object with an Express-compatible middlewares property.

  const mockViteServer = {
    middlewares: app,
    httpServer: server,
    ws: { send: () => {} },
    config: { server: { port: 0 } },
  };

  // Import and configure each plugin
  try {
    const plugins = await Promise.allSettled([
      import("../plugins/filesystemPlugin.js"),
      import("../plugins/terminalPlugin.js"),
      import("../plugins/documentPlugin.js"),
      import("../plugins/schedulerPlugin.js"),
      import("../plugins/docsPlugin.js"),
      import("../plugins/storagePlugin.js"),
      import("../plugins/mcpProxyPlugin.js"),
      import("../plugins/oniPlugin.js"),
      import("../plugins/macosPlugin.js"),
    ]);

    for (const result of plugins) {
      if (result.status === "fulfilled") {
        const pluginFactory = result.value.default;
        if (typeof pluginFactory === "function") {
          const plugin = pluginFactory();
          // Vite plugins use configureServer hook
          if (plugin && typeof plugin.configureServer === "function") {
            try {
              await plugin.configureServer(mockViteServer);
            } catch (err) {
              console.warn(`[Server] Plugin ${plugin.name || "?"} configure error:`, err.message);
            }
          }
        }
      } else {
        console.warn("[Server] Plugin import failed:", result.reason?.message);
      }
    }
  } catch (err) {
    console.warn("[Server] Plugin loading error:", err.message);
  }

  // ─── Serve static files from dist/ ─────────────────────
  app.use(express.static(DIST));

  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "Not found" });
    } else {
      res.sendFile(path.join(DIST, "index.html"));
    }
  });

  // ─── WebSocket for terminal ────────────────────────────
  // The terminal plugin may set up its own WebSocket handling
  // via the httpServer — that's already wired via mockViteServer.httpServer

  // ─── Start server ──────────────────────────────────────
  return new Promise((resolve, reject) => {
    // Find an available port starting from 5173
    let port = 5173;
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        port++;
        if (port > 5200) {
          reject(new Error("Could not find available port"));
          return;
        }
        server.listen(port, "127.0.0.1");
      } else {
        reject(err);
      }
    });

    server.on("listening", () => {
      console.log(`[Server] OniOS production server running at http://127.0.0.1:${port}`);
      resolve(port);
    });

    server.listen(port, "127.0.0.1");
  });
}
