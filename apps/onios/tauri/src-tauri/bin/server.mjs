/**
 * Tauri Sidecar Server — Thin wrapper that imports and starts the
 * production Express server from electron/server.mjs.
 *
 * This file is bundled into the Tauri app resources.
 * It resolves the main server module relative to the app bundle.
 */

import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In the Tauri bundle, server.mjs sits in bin/ — the main server is at ../../electron/server.mjs
// relative to the onios root. We need to resolve the actual server module.
const serverPath = path.resolve(__dirname, '..', '..', '..', 'electron', 'server.mjs');

console.log(`[Tauri Sidecar] Loading server from: ${serverPath}`);

try {
  const { startProductionServer } = await import(serverPath);
  const port = await startProductionServer();
  console.log(`[Tauri Sidecar] Server running on port ${port}`);
} catch (err) {
  console.error(`[Tauri Sidecar] Failed to start server: ${err.message}`);
  process.exit(1);
}
