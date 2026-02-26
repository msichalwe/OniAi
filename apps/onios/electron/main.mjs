/**
 * OniOS Electron Main Process
 *
 * Dev mode:  Starts Vite dev server → loads http://localhost:5173
 * Prod mode: Starts Express server with all plugin routes → loads from local server
 *
 * The Vite dev server already bundles all backend plugins (filesystem, terminal,
 * scheduler, storage, oni gateway, macOS native, etc.) so in dev mode we just
 * point the BrowserWindow at it. In production, we'd bundle an Express server.
 */

import { app, BrowserWindow, shell, Menu, nativeImage } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

const isDev = !app.isPackaged;
let vitePort = 5173;
let mainWindow = null;
let viteProcess = null;

// ─── Create the main window ──────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "OniOS",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 14 },
    vibrancy: "under-window",
    visualEffectState: "active",
    backgroundColor: "#111114",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,
    },
  });

  // Show window when ready (avoids white flash)
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL(`http://localhost:${vitePort}`);
  } else {
    // Production: load from built files via local server
    // For now, load the built index.html directly
    mainWindow.loadFile(path.join(ROOT, "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── macOS App Menu ──────────────────────────────────

function createMenu() {
  const template = [
    {
      label: "OniOS",
      submenu: [
        { label: "About OniOS", role: "about" },
        { type: "separator" },
        { label: "Preferences…", accelerator: "Cmd+,", click: () => mainWindow?.webContents.send("open-settings") },
        { type: "separator" },
        { label: "Hide OniOS", role: "hide" },
        { label: "Hide Others", role: "hideOthers" },
        { label: "Show All", role: "unhide" },
        { type: "separator" },
        { label: "Quit OniOS", role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { type: "separator" },
        { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Start Vite Dev Server ───────────────────────────

function startViteDev() {
  return new Promise((resolve, reject) => {
    console.log("[Electron] Starting Vite dev server...");

    viteProcess = spawn("npx", ["vite", "--port", "5173"], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      env: { ...process.env, FORCE_COLOR: "1" },
    });

    let resolved = false;

    viteProcess.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(`[Vite] ${text}`);
      // Detect actual port from Vite output
      const portMatch = text.match(/localhost:(\d+)/);
      if (portMatch) vitePort = parseInt(portMatch[1], 10);
      if (!resolved && (text.includes("localhost") || text.includes("ready in") || text.includes("Local:"))) {
        resolved = true;
        setTimeout(resolve, 1500);
      }
    });

    viteProcess.stderr.on("data", (data) => {
      process.stderr.write(`[Vite:err] ${data}`);
    });

    viteProcess.on("error", (err) => {
      console.error("[Electron] Failed to start Vite:", err);
      if (!resolved) reject(err);
    });

    viteProcess.on("exit", (code) => {
      console.log(`[Vite] Process exited with code ${code}`);
      if (!resolved) reject(new Error(`Vite exited with code ${code}`));
    });

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    }, 10000);
  });
}

// ─── App Lifecycle ───────────────────────────────────

app.whenReady().then(async () => {
  createMenu();

  if (isDev) {
    try {
      await startViteDev();
    } catch (err) {
      console.error("[Electron] Vite failed to start, trying to connect anyway...", err.message);
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (viteProcess) {
    console.log("[Electron] Stopping Vite dev server...");
    viteProcess.kill("SIGTERM");
    viteProcess = null;
  }
});

// Set app name
app.setName("OniOS");
