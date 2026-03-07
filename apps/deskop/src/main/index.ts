import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  screen,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
} from "electron";
import { join, dirname } from "path";
import { execSync, spawn } from "child_process";
import * as os from "os";
import * as fs from "fs";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import Store from "electron-store";
import { GatewayBridge } from "./gateway-bridge";

let gatewayBridge: GatewayBridge | null = null;

const store = new Store();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Track toggle states for tray menu
let ambientListeningEnabled = false;
let screenCaptureEnabled = false;
let cameraEnabled = false;

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    x: Math.round((width - 1200) / 2),
    y: Math.round((height - 800) / 2),
    show: false,
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    resizable: true,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 14 },
    backgroundColor: '#0F0F12',
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function createTray(): void {
  // Create a simple 16x16 template icon for macOS status bar
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAfElEQVQ4T2NkoBAwUqifgWoGnDl7' +
      'gf3/f4Z/DP8ZGBiZGIwM9RkYGBgZKDaAkRFqACMjEwPDfwYGRkZGBgYmJkYGYwM9sg1gQjKA' +
      'CWoAE9QAJqgBTMgGkOwCJuiYIPuACeoFTPBABuoFzNAAhgcy0GMUDD9gwgUAr8UcEZTJmQcA' +
      'AAAASUVORK5CYII=',
      'base64'
    )
  );
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("Oni AI");

  updateTrayMenu();

  tray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

function updateTrayMenu(): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Oni",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: "Ambient Listening",
      type: "checkbox",
      checked: ambientListeningEnabled,
      click: (menuItem) => {
        ambientListeningEnabled = menuItem.checked;
        mainWindow?.webContents.send("tray-toggle", "ambient-listening", ambientListeningEnabled);
        updateTrayMenu();
      },
    },
    {
      label: "Screen Capture",
      type: "checkbox",
      checked: screenCaptureEnabled,
      click: (menuItem) => {
        screenCaptureEnabled = menuItem.checked;
        mainWindow?.webContents.send("tray-toggle", "screen-capture", screenCaptureEnabled);
        updateTrayMenu();
      },
    },
    {
      label: "Camera",
      type: "checkbox",
      checked: cameraEnabled,
      click: (menuItem) => {
        cameraEnabled = menuItem.checked;
        mainWindow?.webContents.send("tray-toggle", "camera", cameraEnabled);
        updateTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Always on Top",
      type: "checkbox",
      checked: false,
      click: (menuItem) => {
        mainWindow?.setAlwaysOnTop(menuItem.checked, "floating");
      },
    },
    { type: "separator" },
    {
      label: "Quit Oni",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// IPC: Tray state sync from renderer
ipcMain.handle("tray-sync", (_event, feature: string, enabled: boolean) => {
  if (feature === "ambient-listening") ambientListeningEnabled = enabled;
  else if (feature === "screen-capture") screenCaptureEnabled = enabled;
  else if (feature === "camera") cameraEnabled = enabled;
  updateTrayMenu();
});

// IPC: Screen capture
ipcMain.handle("capture-screen", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (sources.length > 0) {
      return sources[0].thumbnail.toDataURL();
    }
    return null;
  } catch (e) {
    console.error("Screen capture failed:", e);
    return null;
  }
});

// IPC: Store
import * as keytar from "keytar";
const SERVICE_NAME = "OniAI";

ipcMain.handle("store-get", async (_event, key: string) => {
  if (key === "oni_api_key") {
    return await keytar.getPassword(SERVICE_NAME, "api_key");
  }
  return store.get(key);
});

ipcMain.handle("store-set", async (_event, key: string, value: unknown) => {
  if (key === "oni_api_key" && typeof value === "string") {
    await keytar.setPassword(SERVICE_NAME, "api_key", value);
  } else {
    store.set(key, value);
  }
});

ipcMain.handle("store-delete", async (_event, key: string) => {
  if (key === "oni_api_key") {
    await keytar.deletePassword(SERVICE_NAME, "api_key");
  } else {
    store.delete(key);
  }
});

// IPC: SQLite Database (Memory Graph)
import Database from 'better-sqlite3';

const dbPath = join(app.getPath('userData'), 'oni_memory.db');
let db: InstanceType<typeof Database>;

try {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS bubbles (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      entities TEXT NOT NULL DEFAULT '[]',
      links TEXT NOT NULL DEFAULT '[]',
      timestamp INTEGER NOT NULL,
      importance REAL NOT NULL DEFAULT 0.5,
      accessCount INTEGER NOT NULL DEFAULT 0,
      lastAccessed INTEGER NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      color TEXT
    );
  `);
} catch (e) {
  console.error('Failed to initialize database:', e);
}

ipcMain.handle('db-get-bubbles', () => {
  try {
    const rows = db.prepare('SELECT * FROM bubbles ORDER BY lastAccessed DESC').all() as any[];
    return rows.map((row: any) => ({
      ...row,
      entities: JSON.parse(row.entities || '[]'),
      links: JSON.parse(row.links || '[]'),
      tags: JSON.parse(row.tags || '[]')
    }));
  } catch (e) {
    console.error('Failed to get bubbles:', e);
    return [];
  }
});

ipcMain.handle('db-insert-bubble', (_event, bubble: any) => {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO bubbles (id, category, title, content, entities, links, timestamp, importance, accessCount, lastAccessed, tags, color)
      VALUES (@id, @category, @title, @content, @entities, @links, @timestamp, @importance, @accessCount, @lastAccessed, @tags, @color)
    `);
    stmt.run({
      ...bubble,
      entities: JSON.stringify(bubble.entities || []),
      links: JSON.stringify(bubble.links || []),
      tags: JSON.stringify(bubble.tags || []),
      color: bubble.color || null
    });
  } catch (e) {
    console.error('Failed to insert bubble:', e);
  }
});

ipcMain.handle('db-update-bubble-access', (_event, id: string, accessCount: number, lastAccessed: number) => {
  try {
    const stmt = db.prepare('UPDATE bubbles SET accessCount = ?, lastAccessed = ? WHERE id = ?');
    stmt.run(accessCount, lastAccessed, id);
  } catch (e) {
    console.error('Failed to update bubble access:', e);
  }
});

ipcMain.handle('db-delete-bubble', (_event, id: string) => {
  try {
    db.prepare('DELETE FROM bubbles WHERE id = ?').run(id);
  } catch (e) {
    console.error('Failed to delete bubble:', e);
  }
});

// IPC: Window controls
ipcMain.handle("window-minimize", () => mainWindow?.minimize());
ipcMain.handle("window-hide", () => mainWindow?.hide());
ipcMain.handle("window-drag", (_event, x: number, y: number) => {
  const [winX, winY] = mainWindow?.getPosition() || [0, 0];
  mainWindow?.setPosition(winX + x, winY + y);
});

// IPC: Always on top toggle
ipcMain.handle("set-always-on-top", (_event, value: boolean) => {
  mainWindow?.setAlwaysOnTop(value, "floating");
});

// IPC: Resize window
ipcMain.handle("window-resize", (_event, width: number, height: number) => {
  mainWindow?.setSize(width, height, true);
});

// IPC: System info
ipcMain.handle("get-system-info", () => {
  const display = screen.getPrimaryDisplay();
  return {
    platform: process.platform,
    os: os.type(),
    osRelease: os.release(),
    hostname: os.hostname(),
    username: os.userInfo().username,
    homedir: os.homedir(),
    arch: os.arch(),
    cpuModel: os.cpus()[0]?.model || "Unknown",
    cpuCores: os.cpus().length,
    totalMemGb: (os.totalmem() / 1024 ** 3).toFixed(1),
    freeMemGb: (os.freemem() / 1024 ** 3).toFixed(1),
    screenWidth: display.size.width,
    screenHeight: display.size.height,
    scaleFactor: display.scaleFactor,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
});

// IPC: Active window / frontmost app (macOS)
ipcMain.handle("get-active-window", () => {
  if (process.platform !== "darwin") return null;
  try {
    const result = execSync(
      `osascript -e 'tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        try
          tell application appName to set winTitle to name of front window
        on error
          set winTitle to ""
        end try
        return appName & "|" & winTitle
      end tell'`,
      { timeout: 2000 },
    )
      .toString()
      .trim();

    const [appName, windowTitle = ""] = result.split("|");
    return { appName: appName || "", windowTitle };
  } catch {
    return null;
  }
});

// IPC: Running applications (macOS - visible apps only)
ipcMain.handle("get-running-apps", () => {
  if (process.platform !== "darwin") return [];
  try {
    const raw = execSync(
      `osascript -e 'tell application "System Events" to get name of every application process where background only is false'`,
      { timeout: 2000 },
    )
      .toString()
      .trim();
    return raw.split(", ").filter(Boolean).slice(0, 20);
  } catch {
    return [];
  }
});

// ── IPC: Agentic capabilities ───────────────────────────────────────

// Run terminal command
ipcMain.handle("agent-run-command", async (_event, command: string, cwd?: string, timeout?: number) => {
  return new Promise<string>((resolve) => {
    const workDir = cwd || os.homedir();
    const timeoutMs = timeout || 30000;

    try {
      const result = execSync(command, {
        cwd: workDir,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 5, // 5MB
        encoding: 'utf-8',
        shell: '/bin/zsh',
        env: { ...process.env, PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin' }
      });
      resolve(result || '(no output)');
    } catch (e: any) {
      // Return stderr/stdout even on non-zero exit
      const output = (e.stdout || '') + (e.stderr ? '\nSTDERR: ' + e.stderr : '');
      resolve(output || `Command failed: ${e.message}`);
    }
  });
});

// Read file
ipcMain.handle("agent-read-file", async (_event, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  } catch (e: any) {
    return `Error reading file: ${e.message}`;
  }
});

// Write file
ipcMain.handle("agent-write-file", async (_event, filePath: string, content: string) => {
  try {
    // Create parent directories if needed
    const dir = dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return 'ok';
  } catch (e: any) {
    throw new Error(`Error writing file: ${e.message}`);
  }
});

// List directory
ipcMain.handle("agent-list-directory", async (_event, dirPath: string) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const lines = entries.map(e => {
      const type = e.isDirectory() ? '[dir]' : e.isSymbolicLink() ? '[link]' : '[file]';
      return `${type} ${e.name}`;
    });
    return lines.join('\n') || '(empty directory)';
  } catch (e: any) {
    return `Error listing directory: ${e.message}`;
  }
});

// Open application or URL
ipcMain.handle("agent-open-app", async (_event, target: string) => {
  try {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      await shell.openExternal(target);
    } else {
      // macOS: open -a "AppName"
      execSync(`open -a "${target.replace(/"/g, '\\"')}"`, { timeout: 5000 });
    }
    return 'ok';
  } catch (e: any) {
    throw new Error(`Failed to open: ${e.message}`);
  }
});

// Web search (uses macOS open to search, returns a note)
ipcMain.handle("agent-search-web", async (_event, query: string) => {
  try {
    // Use curl to fetch a simple search
    const encoded = encodeURIComponent(query);
    const result = execSync(
      `curl -sL "https://lite.duckduckgo.com/lite/?q=${encoded}" | sed 's/<[^>]*>//g' | head -100`,
      { timeout: 10000, encoding: 'utf-8', maxBuffer: 1024 * 512 }
    );
    return result.trim() || 'No results found.';
  } catch {
    // Fallback: open in browser
    shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    return `Opened search for "${query}" in browser.`;
  }
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.oni.assistant");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();
  createTray();

  // Global shortcut to toggle window
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  gatewayBridge?.stop();
  gatewayBridge = null;
});

// ── IPC: Gateway Bridge ──────────────────────────────────────────────

ipcMain.handle("gateway-connect", async (_event, url: string, token?: string) => {
  if (gatewayBridge) {
    gatewayBridge.stop();
    gatewayBridge = null;
  }
  if (!mainWindow) return { ok: false, error: "No window" };
  gatewayBridge = new GatewayBridge({ url, token, window: mainWindow });
  gatewayBridge.start();
  return { ok: true };
});

ipcMain.handle("gateway-disconnect", async () => {
  gatewayBridge?.stop();
  gatewayBridge = null;
  return { ok: true };
});

ipcMain.handle("gateway-send", async (
  _event,
  message: string,
  opts?: {
    sessionKey?: string;
    thinking?: string;
    attachments?: Array<{
      type?: string;
      mimeType?: string;
      fileName?: string;
      content?: unknown;
    }>;
  }
) => {
  if (!gatewayBridge?.isConnected) {
    return { ok: false, error: "Gateway not connected" };
  }
  try {
    const result = await gatewayBridge.chatSend(message, opts);
    return { ok: true, ...result };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("gateway-history", async (_event, sessionKey?: string, limit?: number) => {
  if (!gatewayBridge?.isConnected) {
    return { ok: false, error: "Gateway not connected" };
  }
  try {
    const result = await gatewayBridge.chatHistory(sessionKey, limit);
    return { ok: true, data: result };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("gateway-abort", async (_event, sessionKey?: string, runId?: string) => {
  if (!gatewayBridge?.isConnected) {
    return { ok: false, error: "Gateway not connected" };
  }
  try {
    const result = await gatewayBridge.chatAbort(sessionKey, runId);
    return { ok: true, data: result };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
});

ipcMain.handle("gateway-status", async () => {
  return { connected: gatewayBridge?.isConnected ?? false };
});

ipcMain.handle("gateway-set-session", async (_event, sessionKey: string) => {
  gatewayBridge?.setSessionKey(sessionKey);
  return { ok: true };
});
