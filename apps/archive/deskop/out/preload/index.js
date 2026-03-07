"use strict";
const electron = require("electron");
const electronAPI = {
  ipcRenderer: {
    send(channel, ...args) {
      electron.ipcRenderer.send(channel, ...args);
    },
    sendTo(webContentsId, channel, ...args) {
      const electronVer = process.versions.electron;
      const electronMajorVer = electronVer ? parseInt(electronVer.split(".")[0]) : 0;
      if (electronMajorVer >= 28) {
        throw new Error('"sendTo" method has been removed since Electron 28.');
      } else {
        electron.ipcRenderer.sendTo(webContentsId, channel, ...args);
      }
    },
    sendSync(channel, ...args) {
      return electron.ipcRenderer.sendSync(channel, ...args);
    },
    sendToHost(channel, ...args) {
      electron.ipcRenderer.sendToHost(channel, ...args);
    },
    postMessage(channel, message, transfer) {
      electron.ipcRenderer.postMessage(channel, message, transfer);
    },
    invoke(channel, ...args) {
      return electron.ipcRenderer.invoke(channel, ...args);
    },
    on(channel, listener) {
      electron.ipcRenderer.on(channel, listener);
      return () => {
        electron.ipcRenderer.removeListener(channel, listener);
      };
    },
    once(channel, listener) {
      electron.ipcRenderer.once(channel, listener);
      return () => {
        electron.ipcRenderer.removeListener(channel, listener);
      };
    },
    removeListener(channel, listener) {
      electron.ipcRenderer.removeListener(channel, listener);
      return this;
    },
    removeAllListeners(channel) {
      electron.ipcRenderer.removeAllListeners(channel);
    }
  },
  webFrame: {
    insertCSS(css) {
      return electron.webFrame.insertCSS(css);
    },
    setZoomFactor(factor) {
      if (typeof factor === "number" && factor > 0) {
        electron.webFrame.setZoomFactor(factor);
      }
    },
    setZoomLevel(level) {
      if (typeof level === "number") {
        electron.webFrame.setZoomLevel(level);
      }
    }
  },
  webUtils: {
    getPathForFile(file) {
      return electron.webUtils.getPathForFile(file);
    }
  },
  process: {
    get platform() {
      return process.platform;
    },
    get versions() {
      return process.versions;
    },
    get env() {
      return { ...process.env };
    }
  }
};
const api = {
  // Screen capture
  captureScreen: () => electron.ipcRenderer.invoke("capture-screen"),
  // Persistent store
  store: {
    get: (key) => electron.ipcRenderer.invoke("store-get", key),
    set: (key, value) => electron.ipcRenderer.invoke("store-set", key, value),
    delete: (key) => electron.ipcRenderer.invoke("store-delete", key)
  },
  // SQLite Database (Memory Graph)
  db: {
    getBubbles: () => electron.ipcRenderer.invoke("db-get-bubbles"),
    insertBubble: (bubble) => electron.ipcRenderer.invoke("db-insert-bubble", bubble),
    updateBubbleAccess: (id, accessCount, lastAccessed) => electron.ipcRenderer.invoke("db-update-bubble-access", id, accessCount, lastAccessed),
    deleteBubble: (id) => electron.ipcRenderer.invoke("db-delete-bubble", id)
  },
  // Window controls
  window: {
    minimize: () => electron.ipcRenderer.invoke("window-minimize"),
    hide: () => electron.ipcRenderer.invoke("window-hide"),
    drag: (x, y) => electron.ipcRenderer.invoke("window-drag", x, y),
    setAlwaysOnTop: (value) => electron.ipcRenderer.invoke("set-always-on-top", value),
    resize: (width, height) => electron.ipcRenderer.invoke("window-resize", width, height)
  },
  // System context
  system: {
    getInfo: () => electron.ipcRenderer.invoke("get-system-info"),
    getActiveWindow: () => electron.ipcRenderer.invoke("get-active-window"),
    getRunningApps: () => electron.ipcRenderer.invoke("get-running-apps")
  },
  // Tray sync
  tray: {
    sync: (feature, enabled) => electron.ipcRenderer.invoke("tray-sync", feature, enabled),
    onToggle: (callback) => {
      const handler = (_event, feature, enabled) => callback(feature, enabled);
      electron.ipcRenderer.on("tray-toggle", handler);
      return () => electron.ipcRenderer.removeListener("tray-toggle", handler);
    }
  },
  // Gateway bridge
  gateway: {
    connect: (url, token) => electron.ipcRenderer.invoke("gateway-connect", url, token),
    disconnect: () => electron.ipcRenderer.invoke("gateway-disconnect"),
    send: (message, opts) => electron.ipcRenderer.invoke("gateway-send", message, opts),
    history: (sessionKey, limit) => electron.ipcRenderer.invoke("gateway-history", sessionKey, limit),
    abort: (sessionKey, runId) => electron.ipcRenderer.invoke("gateway-abort", sessionKey, runId),
    status: () => electron.ipcRenderer.invoke("gateway-status"),
    setSession: (sessionKey) => electron.ipcRenderer.invoke("gateway-set-session", sessionKey),
    onChat: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("gateway-chat", handler);
      return () => electron.ipcRenderer.removeListener("gateway-chat", handler);
    },
    onStatus: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("gateway-status", handler);
      return () => electron.ipcRenderer.removeListener("gateway-status", handler);
    },
    onHello: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("gateway-hello", handler);
      return () => electron.ipcRenderer.removeListener("gateway-hello", handler);
    },
    onAgentEvent: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("gateway-agent-event", handler);
      return () => electron.ipcRenderer.removeListener("gateway-agent-event", handler);
    }
  },
  // Agentic capabilities
  agent: {
    runCommand: (command, cwd, timeout) => electron.ipcRenderer.invoke("agent-run-command", command, cwd, timeout),
    readFile: (path) => electron.ipcRenderer.invoke("agent-read-file", path),
    writeFile: (path, content) => electron.ipcRenderer.invoke("agent-write-file", path, content),
    listDirectory: (path) => electron.ipcRenderer.invoke("agent-list-directory", path),
    openApp: (target) => electron.ipcRenderer.invoke("agent-open-app", target),
    searchWeb: (query) => electron.ipcRenderer.invoke("agent-search-web", query)
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;
  window.api = api;
}
