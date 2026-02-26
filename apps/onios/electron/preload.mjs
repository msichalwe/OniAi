/**
 * OniOS Electron Preload Script
 *
 * Exposes a safe API to the renderer process via contextBridge.
 * The renderer can call window.onios.* methods.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("onios", {
  platform: process.platform,
  isElectron: true,

  // IPC helpers for future use
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, callback) => {
    const sub = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, sub);
    return () => ipcRenderer.removeListener(channel, sub);
  },
});
