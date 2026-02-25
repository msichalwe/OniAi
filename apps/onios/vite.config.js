import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import filesystemPlugin from './plugins/filesystemPlugin.js';
import terminalPlugin from './plugins/terminalPlugin.js';
import documentPlugin from './plugins/documentPlugin.js';
import schedulerPlugin from './plugins/schedulerPlugin.js';
import docsPlugin from './plugins/docsPlugin.js';
import storagePlugin from './plugins/storagePlugin.js';
import mcpProxyPlugin from './plugins/mcpProxyPlugin.js';
import aiMemoryPlugin from './plugins/aiMemoryPlugin.js';
import oniPlugin from './plugins/oniPlugin.js';
import macosPlugin from './plugins/macosPlugin.js';

export default defineConfig({
  plugins: [react(), filesystemPlugin(), terminalPlugin(), documentPlugin(), schedulerPlugin(), docsPlugin(), storagePlugin(), mcpProxyPlugin(), oniPlugin(), macosPlugin(), aiMemoryPlugin()],
  server: {
    port: 5173,
    open: true,
  },
});
