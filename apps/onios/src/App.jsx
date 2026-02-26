/**
 * App.jsx — Root component for OniOS.
 * Initializes the command registry and registers all built-in widget commands.
 */

import React, { useEffect, useState } from "react";
import Desktop from "./components/Desktop/Desktop";
import CommandBar from "./components/CommandBar/CommandBar";
import Taskbar from "./components/Taskbar/Taskbar";
import Notifications from "./components/Notifications/Notifications";
import useWindowStore from "./stores/windowStore";
import useCommandStore from "./stores/commandStore";
import useNotificationStore from "./stores/notificationStore";
import useThemeStore from "./stores/themeStore";
import { commandRegistry } from "./core/CommandRegistry";
import { WIDGET_REGISTRY } from "./core/widgetRegistry";
import {
  sendTerminalInput,
  waitForTerminalReady,
} from "./widgets/Terminal/Terminal";
import { getEditorInstance } from "./widgets/CodeEditor/CodeEditor";
import { getDocViewerInstance } from "./widgets/DocumentViewer/DocumentViewer";
import {
  getActiveContext,
  getScreenSummary,
  getWidgetCommands,
  getAvailableCommands,
  getFocusedWidget,
  isWidgetOpen,
} from "./core/ActiveWidgets";
import { contextEngine } from "./core/ContextEngine";
import { indexService } from "./core/IndexService";
import { schedulerService } from "./core/SchedulerService";
import { commandRunTracker } from "./core/CommandRunTracker";
import { workflowEngine } from "./core/WorkflowEngine";
// serverSync removed — gateway handles state
import useWorkflowStore from "./stores/workflowStore";
import useTaskStore from "./stores/taskStore";
import usePasswordStore, {
  generatePassword,
  calculateStrength,
  strengthLabel,
} from "./stores/passwordStore";
import { runAllTests, runTest } from "./core/testScenarios";
import { storageService } from "./core/StorageService";
import { widgetContext } from "./core/WidgetContextProvider";
import { eventBus } from "./core/EventBus";
import { agentManager } from "./core/AgentManager";
import OniWidget from "./widgets/OniAssistant/OniWidget";

function registerAllCommands() {
  const { openWindow } = useWindowStore.getState();
  const { addNotification } = useNotificationStore.getState();

  const openWidget = (type, props = {}, titleOverride) => {
    const reg = WIDGET_REGISTRY[type];
    if (!reg) return `Unknown widget: ${type}`;
    const id = openWindow(type, props, {
      title: titleOverride || reg.title,
      icon: reg.icon,
      defaultWidth: reg.defaultWidth,
      defaultHeight: reg.defaultHeight,
      minWidth: reg.minWidth,
      minHeight: reg.minHeight,
    });
    return `Opened ${titleOverride || reg.title} (${id})`;
  };

  // === system.files ===
  commandRegistry.register(
    "system.files.openExplorer",
    (path) => openWidget("file-explorer", { initialPath: path }),
    {
      description: "Open the file explorer",
      widget: "file-explorer",
    },
  );
  commandRegistry.register(
    "system.files.list",
    () => {
      return "Documents, Downloads, Pictures, Music, Videos, Projects";
    },
    { description: "List root folders" },
  );
  commandRegistry.register(
    "system.files.navigate",
    (path) => openWidget("file-explorer", { initialPath: path }),
    {
      description: "Open file explorer at a specific path",
    },
  );

  // === system.files.open — opens files in viewer ===
  commandRegistry.register(
    "system.files.openFile",
    (filePath) => {
      if (!filePath) return "No file path provided";
      const ext = filePath.split(".").pop().toLowerCase();
      const videoExts = ["mp4", "mov", "webm", "avi", "mkv", "wmv", "flv"];
      const audioExts = ["mp3", "wav", "ogg", "flac", "aac"];
      const fileName = filePath.split("/").pop();

      if (videoExts.includes(ext)) {
        const mediaUrl = `/api/fs/media?path=${encodeURIComponent(filePath)}`;
        return openWidget("media-player", { src: mediaUrl }, fileName);
      }
      if (audioExts.includes(ext)) {
        const mediaUrl = `/api/fs/media?path=${encodeURIComponent(filePath)}`;
        return openWidget("media-player", { src: mediaUrl }, fileName);
      }
      return openWidget("file-viewer", { filePath }, fileName);
    },
    { description: "Open a file in the appropriate viewer" },
  );

  // === terminal ===
  commandRegistry.register("terminal.open", () => openWidget("terminal"), {
    description: "Open a terminal window",
    widget: "terminal",
  });
  commandRegistry.register(
    "terminal.runCommand",
    (cmd) => {
      openWidget("terminal");
      return `Terminal opened. Run: ${cmd}`;
    },
    { description: "Open terminal and suggest a command" },
  );

  // === display (Dynamic Display Widget) ===
  commandRegistry.register(
    "display.render",
    async (displayId) => {
      if (!displayId) return "No display ID provided";
      // Fetch actual title from stored data
      let title = "Display";
      try {
        const res = await fetch(`/api/oni/display/${displayId}`);
        if (res.ok) {
          const data = await res.json();
          title = data.title || "Display";
        }
      } catch {
        /* use default */
      }
      return openWidget("display", { displayId }, title);
    },
    {
      description: "Open a dynamic display widget with structured JSON content",
      widget: "display",
    },
  );

  // === system.media ===
  // Smart media routing — local files go to media-player widget, online URLs
  // (YouTube, Vimeo, etc.) open as display widgets with the immersive video section
  commandRegistry.register(
    "system.media.playVideo",
    (src) => {
      if (!src) return openWidget("media-player");
      const isOnline = /^https?:\/\//i.test(src);
      const isYoutube = /youtu\.?be/i.test(src);
      const isVimeo = /vimeo\.com/i.test(src);

      if (isYoutube || isVimeo) {
        // Online video — open as immersive display widget
        const title = isYoutube ? "YouTube" : "Vimeo";
        openWidget("display", {}, { title: `${title} Player` });
        // Post display data via API
        setTimeout(async () => {
          try {
            const wins = useWindowStore.getState().windows || [];
            const displayWin = [...wins]
              .reverse()
              .find((w) => w.widgetType === "display");
            if (displayWin) {
              await fetch(
                `/api/oni/display/${displayWin.props?.displayId || displayWin.id}`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: `${title} Player`,
                    sections: [
                      {
                        type: "video",
                        src,
                        youtube: isYoutube ? src : undefined,
                      },
                    ],
                  }),
                },
              );
            }
          } catch {
            /* best effort */
          }
        }, 500);
        return `Opening ${title} video`;
      }

      // Local or direct video file — use media player widget
      openWidget("media-player", { src });
      return `Playing: ${src}`;
    },
    {
      description:
        "Play a video — routes YouTube/Vimeo to display widget, local files to media player",
      widget: "media-player",
    },
  );
  commandRegistry.register(
    "system.media.open",
    () => openWidget("media-player"),
    {
      description: "Open media player",
      widget: "media-player",
    },
  );
  commandRegistry.register(
    "system.media.openImage",
    (src, caption) => {
      if (!src) return "Usage: system.media.openImage(url, caption?)";
      openWidget("display", {}, { title: caption || "Image Viewer" });
      setTimeout(async () => {
        try {
          const wins = useWindowStore.getState().windows || [];
          const displayWin = [...wins]
            .reverse()
            .find((w) => w.widgetType === "display");
          if (displayWin) {
            await fetch(
              `/api/oni/display/${displayWin.props?.displayId || displayWin.id}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: caption || "Image",
                  sections: [{ type: "image", src, caption }],
                }),
              },
            );
          }
        } catch {
          /* best effort */
        }
      }, 500);
      return `Opening image: ${caption || src}`;
    },
    { description: "Open an image in the immersive viewer" },
  );

  // === document ===
  commandRegistry.register("document.open", () => openWidget("notes"), {
    description: "Open Notes",
    widget: "notes",
  });
  commandRegistry.register(
    "document.create",
    (title) => {
      openWidget("notes");
      return `Notes opened. Create: ${title || "New note"}`;
    },
    { description: "Create a new note" },
  );
  commandRegistry.register(
    "document.list",
    () => {
      return "Notes opened with list of documents";
    },
    { description: "List all documents" },
  );

  // === system.info ===
  commandRegistry.register("system.info.clock", () => openWidget("clock"), {
    description: "Show clock and system info",
    widget: "clock",
  });

  // === widgets.calculator ===
  commandRegistry.register(
    "widgets.calculator.open",
    () => openWidget("calculator"),
    {
      description: "Open the calculator",
      widget: "calculator",
    },
  );
  commandRegistry.register(
    "widgets.calculator.calculate",
    (expr) => openWidget("calculator", { expression: expr }),
    {
      description: "Calculate an expression",
      widget: "calculator",
    },
  );

  // === system.activity ===
  commandRegistry.register(
    "system.activity.open",
    () => openWidget("activity-log"),
    {
      description: "Open the activity log",
      widget: "activity-log",
    },
  );

  // === system.docs ===
  commandRegistry.register(
    "system.docs.open",
    (page) => openWidget("docs", { page }),
    {
      description: "Open the documentation",
      widget: "docs",
    },
  );
  commandRegistry.register(
    "system.docs.commands",
    () => openWidget("docs", { page: "commands" }),
    {
      description: "Open command reference",
      widget: "docs",
    },
  );
  commandRegistry.register(
    "system.docs.architecture",
    () => openWidget("docs", { page: "architecture" }),
    {
      description: "View system architecture",
      widget: "docs",
    },
  );

  // === maps ===
  commandRegistry.register("maps.open", () => openWidget("maps"), {
    description: "Open Maps",
    widget: "maps",
  });

  // === system.settings ===
  commandRegistry.register(
    "system.settings.open",
    () => openWidget("settings"),
    {
      description: "Open appearance settings",
      widget: "settings",
    },
  );
  commandRegistry.register(
    "system.settings.toggleTheme",
    () => {
      useThemeStore.getState().toggleTheme();
      const theme = useThemeStore.getState().theme;
      addNotification(`Switched to ${theme} mode`, "info");
      return `Theme: ${theme}`;
    },
    { description: "Toggle dark/light mode" },
  );

  // === oni chat ===
  commandRegistry.register("oni.chat", () => openWidget("oni-chat"), {
    description: "Open Oni AI chat",
    widget: "oni-chat",
  });

  // === code editor ===
  commandRegistry.register(
    "code.open",
    (projectPath) => openWidget("code-editor", { projectPath }),
    {
      description: "Open code editor (optionally at a project path)",
      widget: "code-editor",
    },
  );
  commandRegistry.register(
    "code.openProject",
    (path) =>
      openWidget("code-editor", { projectPath: path }, path?.split("/").pop()),
    {
      description: "Open a project folder in the code editor",
      widget: "code-editor",
    },
  );
  commandRegistry.register(
    "code.openFile",
    (filePath) => {
      if (!filePath) return "No file path provided";
      // If editor is already open, use its instance API
      const editor = getEditorInstance();
      if (editor) {
        editor.openFile(filePath);
        return `Opened ${filePath} in editor`;
      }
      // Otherwise open a new editor with this file
      const name = filePath.split("/").pop();
      return openWidget("code-editor", { filePath }, name);
    },
    { description: "Open a file in the code editor", widget: "code-editor" },
  );
  commandRegistry.register(
    "code.saveFile",
    async () => {
      const editor = getEditorInstance();
      if (!editor) return "No code editor open";
      await editor.saveFile();
      return `Saved ${editor.getActiveFile() || "file"}`;
    },
    { description: "Save the active file in the code editor" },
  );
  commandRegistry.register(
    "code.saveAll",
    async () => {
      const editor = getEditorInstance();
      if (!editor) return "No code editor open";
      await editor.saveAll();
      return "All files saved";
    },
    { description: "Save all modified files in the code editor" },
  );
  commandRegistry.register(
    "code.getContent",
    (filePath) => {
      const editor = getEditorInstance();
      if (!editor) return "No code editor open";
      const content = editor.getContent(filePath);
      return content !== null ? content : "File not open or empty";
    },
    { description: "Get the content of a file open in the editor" },
  );
  commandRegistry.register(
    "code.setContent",
    (filePath, content) => {
      const editor = getEditorInstance();
      if (!editor) return "No code editor open";
      if (!content && filePath) {
        // Single arg = set content of active file
        editor.setContent(null, filePath);
        return "Content updated";
      }
      editor.setContent(filePath, content);
      return `Updated content of ${filePath}`;
    },
    { description: "Set the content of a file in the editor" },
  );
  commandRegistry.register(
    "code.getActiveFile",
    () => {
      const editor = getEditorInstance();
      if (!editor) return "No code editor open";
      return editor.getActiveFile() || "No file active";
    },
    { description: "Get the path of the active file in the editor" },
  );
  commandRegistry.register(
    "code.getOpenFiles",
    () => {
      const editor = getEditorInstance();
      if (!editor) return "No code editor open";
      const files = editor.getOpenFiles();
      return files.length > 0 ? files.join(", ") : "No files open";
    },
    { description: "List all files open in the editor" },
  );
  commandRegistry.register(
    "code.closeFile",
    (filePath) => {
      const editor = getEditorInstance();
      if (!editor) return "No code editor open";
      editor.closeFile(filePath);
      return `Closed ${filePath || "active file"}`;
    },
    { description: "Close a file tab in the editor" },
  );

  // === file viewer ===
  commandRegistry.register(
    "viewer.openFile",
    (filePath) => {
      const name = filePath ? filePath.split("/").pop() : "File";
      return openWidget("file-viewer", { filePath }, name);
    },
    {
      description: "Open a file in the viewer",
      widget: "file-viewer",
    },
  );

  // === system commands ===
  commandRegistry.register(
    "system.notify",
    (message) => {
      addNotification(message, "info");
      return `Notification: ${message}`;
    },
    { description: "Send a system notification" },
  );

  commandRegistry.register(
    "system.screenshot",
    () => {
      addNotification("Screenshot captured!", "success");
      return "Screenshot taken";
    },
    { description: "Take a screenshot" },
  );

  commandRegistry.register(
    "system.setReminder",
    (text) => {
      addNotification(`Reminder set: ${text}`, "info");
      return `Reminder: ${text}`;
    },
    { description: "Set a reminder" },
  );

  commandRegistry.register(
    "help",
    () => {
      openWidget("docs", { page: "commands" });
      return "Documentation opened";
    },
    { description: "Show all available commands" },
  );

  // === system.files CRUD ===
  commandRegistry.register(
    "system.files.createFolder",
    async (path) => {
      if (!path) return "No path provided";
      const res = await fetch("/api/fs/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (data.error) return `Error: ${data.error}`;
      addNotification(`Folder created: ${path.split("/").pop()}`, "success");
      return `Created folder: ${data.path}`;
    },
    { description: "Create a new folder" },
  );

  commandRegistry.register(
    "system.files.createFile",
    async (path, content) => {
      if (!path) return "No path provided";
      const res = await fetch("/api/fs/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: content || "" }),
      });
      const data = await res.json();
      if (data.error) return `Error: ${data.error}`;
      addNotification(`File created: ${path.split("/").pop()}`, "success");
      return `Created file: ${data.path}`;
    },
    { description: "Create a new file with optional content" },
  );

  commandRegistry.register(
    "system.files.delete",
    async (path) => {
      if (!path) return "No path provided";
      const res = await fetch(
        `/api/fs/delete?path=${encodeURIComponent(path)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.error) return `Error: ${data.error}`;
      addNotification(`Deleted: ${path.split("/").pop()}`, "info");
      return `Deleted: ${path}`;
    },
    { description: "Delete a file or folder" },
  );

  commandRegistry.register(
    "system.files.rename",
    async (from, to) => {
      if (!from || !to) return "Missing from/to paths";
      const res = await fetch("/api/fs/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = await res.json();
      if (data.error) return `Error: ${data.error}`;
      return `Renamed: ${from} → ${to}`;
    },
    { description: "Rename or move a file/folder" },
  );

  commandRegistry.register(
    "system.files.read",
    async (path) => {
      if (!path) return "No path provided";
      const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.error) return `Error: ${data.error}`;
      return data.content;
    },
    { description: "Read the contents of a text file" },
  );

  commandRegistry.register(
    "system.files.write",
    async (path, content) => {
      if (!path) return "No path provided";
      const res = await fetch("/api/fs/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: content || "" }),
      });
      const data = await res.json();
      if (data.error) return `Error: ${data.error}`;
      return `Written to: ${data.path}`;
    },
    { description: "Write content to a file" },
  );

  // === terminal commands ===
  commandRegistry.register(
    "terminal.open",
    () => {
      openWidget("terminal");
      return "Terminal opened";
    },
    { description: "Open a new terminal window" },
  );

  // Terminal command queue — serializes concurrent exec calls
  const _termQueue = [];
  let _termQueueRunning = false;
  async function _drainTermQueue() {
    if (_termQueueRunning) return;
    _termQueueRunning = true;
    while (_termQueue.length > 0) {
      const { command, resolve } = _termQueue.shift();
      try {
        const sent = sendTerminalInput(command + "\n");
        if (sent) {
          resolve(`Sent to terminal: ${command}`);
        } else {
          openWidget("terminal");
          const ready = await waitForTerminalReady(8000);
          if (ready) {
            await new Promise((r) => setTimeout(r, 300));
            sendTerminalInput(command + "\n");
            resolve(`Opened terminal and executing: ${command}`);
          } else {
            resolve(
              `Terminal opened but command may not have been sent (timeout). Command: ${command}`,
            );
          }
        }
        // Small delay between queued commands so terminal can process each one
        if (_termQueue.length > 0) {
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch (err) {
        resolve(`Error executing command: ${err.message}`);
      }
    }
    _termQueueRunning = false;
  }

  commandRegistry.register(
    "terminal.exec",
    (command) => {
      if (!command) return Promise.resolve("No command provided");
      return new Promise((resolve) => {
        _termQueue.push({ command, resolve });
        _drainTermQueue();
      });
    },
    { description: "Execute a command in the terminal" },
  );

  commandRegistry.register(
    "terminal.sendInput",
    (data) => {
      if (!data) return "No input provided";
      const sent = sendTerminalInput(data);
      if (!sent) return "No active terminal connection";
      return "Input sent";
    },
    { description: "Send raw input to the active terminal" },
  );

  commandRegistry.register(
    "terminal.sendCtrlC",
    () => {
      const sent = sendTerminalInput("\x03");
      if (!sent) return "No active terminal connection";
      return "Ctrl+C sent";
    },
    { description: "Send Ctrl+C (interrupt) to the terminal" },
  );

  // === system.windows — Active Widgets Layer ===
  const { closeWindow, focusWindow, minimizeWindow, maximizeWindow } =
    useWindowStore.getState();

  commandRegistry.register(
    "system.windows.list",
    () => {
      const ctx = getActiveContext();
      return JSON.stringify(ctx, null, 2);
    },
    {
      description:
        "List all open windows with IDs, types, and available commands (JSON)",
    },
  );

  commandRegistry.register("system.windows.summary", () => getScreenSummary(), {
    description: "Get a human-readable summary of what's on screen",
  });

  commandRegistry.register(
    "system.windows.focus",
    (windowId) => {
      if (!windowId) return "No window ID provided";
      focusWindow(windowId);
      return `Focused window: ${windowId}`;
    },
    { description: "Focus a window by its ID" },
  );

  commandRegistry.register(
    "system.windows.close",
    (windowId) => {
      if (!windowId) return "No window ID provided";
      closeWindow(windowId);
      return `Closed window: ${windowId}`;
    },
    { description: "Close a window by its ID" },
  );

  commandRegistry.register(
    "system.windows.minimize",
    (windowId) => {
      if (!windowId) return "No window ID provided";
      minimizeWindow(windowId);
      return `Minimized window: ${windowId}`;
    },
    { description: "Minimize a window by its ID" },
  );

  commandRegistry.register(
    "system.windows.maximize",
    (windowId) => {
      if (!windowId) return "No window ID provided";
      maximizeWindow(windowId);
      return `Maximized window: ${windowId}`;
    },
    { description: "Maximize/restore a window by its ID" },
  );

  commandRegistry.register(
    "system.windows.getFocused",
    () => {
      const focused = getFocusedWidget();
      if (!focused) return "No window is focused";
      return JSON.stringify(focused, null, 2);
    },
    { description: "Get info about the currently focused window" },
  );

  commandRegistry.register(
    "system.windows.getCommands",
    (windowId) => {
      if (!windowId) return "No window ID provided";
      const info = getWidgetCommands(windowId);
      if (!info) return `Window not found: ${windowId}`;
      return JSON.stringify(info, null, 2);
    },
    { description: "Get available commands for a specific window instance" },
  );

  commandRegistry.register(
    "system.windows.availableCommands",
    () => {
      const cmds = getAvailableCommands();
      return cmds.length > 0
        ? `Active widget commands: ${cmds.join(", ")}`
        : "No active widgets";
    },
    {
      description: "List all commands available from currently active widgets",
    },
  );

  commandRegistry.register(
    "system.windows.isOpen",
    (widgetType) => {
      if (!widgetType) return "No widget type provided";
      return isWidgetOpen(widgetType)
        ? `${widgetType} is open`
        : `${widgetType} is not open`;
    },
    { description: "Check if a widget type is currently open" },
  );

  commandRegistry.register(
    "system.windows.closeAll",
    () => {
      const wins = useWindowStore.getState().windows;
      wins.forEach((w) => closeWindow(w.id));
      return `Closed ${wins.length} window(s)`;
    },
    { description: "Close all open windows" },
  );

  // === document commands ===
  commandRegistry.register(
    "document.open",
    (filePath) => {
      if (!filePath) {
        return openWidget("document-viewer");
      }
      const name = filePath.split("/").pop();
      // If viewer is already open, use its instance
      const viewer = getDocViewerInstance();
      if (viewer) {
        viewer.openFile(filePath);
        return `Opened ${name} in document viewer`;
      }
      return openWidget("document-viewer", { filePath }, name);
    },
    {
      description: "Open a document (PDF, Word, Excel, text)",
      widget: "document-viewer",
    },
  );

  commandRegistry.register(
    "document.find",
    async (needle, filePath) => {
      if (!needle) return 'Usage: document.find("text", "/optional/path")';
      // Try the active viewer first
      const viewer = getDocViewerInstance();
      if (viewer && !filePath) {
        const result = viewer.find(needle);
        return result.total > 0
          ? `Found ${result.total} match(es) in ${viewer.getFilePath()}`
          : `No matches for "${needle}"`;
      }
      // Search via backend
      if (filePath) {
        const res = await fetch("/api/docs/find", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath, needle }),
        });
        const data = await res.json();
        return data.total > 0
          ? `Found ${data.total} match(es) in ${filePath}`
          : `No matches for "${needle}" in ${filePath}`;
      }
      // Search across all indexed docs (client-side)
      const results = indexService.findAll(needle);
      if (results.length === 0)
        return `No matches for "${needle}" in any indexed document`;
      return results.map((r) => `${r.name}: ${r.total} match(es)`).join("\n");
    },
    { description: "Find text in a document or all indexed documents" },
  );

  commandRegistry.register(
    "document.search",
    async (query) => {
      if (!query) return 'Usage: document.search("query")';
      const results = await contextEngine.search(query, { backend: true });
      const docs = results.documents || [];
      if (docs.length === 0) return `No results for "${query}"`;
      return docs
        .map(
          (d) =>
            `${d.name} (score: ${d.score})${d.snippet ? ` — ${d.snippet}` : ""}`,
        )
        .join("\n");
    },
    { description: "Search across all indexed documents by content" },
  );

  commandRegistry.register(
    "document.index",
    async (path) => {
      if (!path) return 'Usage: document.index("/path/to/folder")';
      const res = await fetch("/api/docs/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, recursive: true }),
      });
      const data = await res.json();
      if (data.error) return `Error: ${data.error}`;
      addNotification(`Indexed ${data.indexed} file(s)`, "success");
      return `Indexed ${data.indexed} files. Total in index: ${data.totalIndexed}`;
    },
    { description: "Index a file or directory for full-text search" },
  );

  commandRegistry.register(
    "document.create",
    async (path, content) => {
      if (!path) return 'Usage: document.create("/path/to/file.md", "content")';
      const res = await fetch("/api/docs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: content || "" }),
      });
      const data = await res.json();
      if (data.error) return `Error: ${data.error}`;
      addNotification(`Created: ${path.split("/").pop()}`, "success");
      // Open it in the document viewer
      openWidget("document-viewer", { filePath: path }, path.split("/").pop());
      return `Created and opened: ${path}`;
    },
    { description: "Create a new document and open it" },
  );

  commandRegistry.register(
    "document.getContent",
    (filePath) => {
      // Try active viewer
      const viewer = getDocViewerInstance();
      if (viewer && !filePath) {
        return viewer.getText() || "No content loaded";
      }
      // Try index
      if (filePath) {
        const text = indexService.getText(filePath);
        return text || "Document not indexed. Use document.index() first.";
      }
      return "No document specified";
    },
    { description: "Get the text content of the active or specified document" },
  );

  commandRegistry.register(
    "document.list",
    () => {
      const docs = indexService.list();
      if (docs.length === 0)
        return 'No documents indexed. Use document.index("/path") to index files.';
      return docs.map((d) => `${d.name} (${d.wordCount} words)`).join("\n");
    },
    { description: "List all indexed documents" },
  );

  commandRegistry.register(
    "document.matchText",
    async (pattern) => {
      if (!pattern) return 'Usage: document.matchText("regex or text")';
      // Search client-side index
      const results = indexService.search(pattern, 15);
      if (results.length === 0) return `No matches for "${pattern}"`;
      return results
        .map(
          (r) =>
            `${r.meta?.name || r.id} (score: ${r.score})${r.snippet ? `\n  → ${r.snippet}` : ""}`,
        )
        .join("\n");
    },
    { description: "Match text pattern across all indexed documents" },
  );

  // === search commands (universal) ===
  commandRegistry.register(
    "search.all",
    async (query) => {
      if (!query) return 'Usage: search.all("query")';
      const results = await contextEngine.search(query);
      const lines = [];
      if (results.commands.length > 0) {
        lines.push(`Commands (${results.commands.length}):`);
        results.commands.forEach((c) =>
          lines.push(`  ${c.path} — ${c.description}`),
        );
      }
      if (results.windows.length > 0) {
        lines.push(`Windows (${results.windows.length}):`);
        results.windows.forEach((w) =>
          lines.push(`  ${w.title} (${w.widgetType})`),
        );
      }
      if (results.files.length > 0) {
        lines.push(`Files (${results.files.length}):`);
        results.files.forEach((f) => lines.push(`  ${f.path}`));
      }
      if (results.documents.length > 0) {
        lines.push(`Documents (${results.documents.length}):`);
        results.documents.forEach((d) =>
          lines.push(`  ${d.name} (score: ${d.score})`),
        );
      }
      return lines.length > 0 ? lines.join("\n") : `No results for "${query}"`;
    },
    {
      description:
        "Universal search across commands, windows, files, and documents",
    },
  );

  commandRegistry.register(
    "search.commands",
    (query) => {
      if (!query) return 'Usage: search.commands("query")';
      const cmds = commandRegistry.search(query);
      if (cmds.length === 0) return `No commands matching "${query}"`;
      return cmds.map((c) => `${c.path} — ${c.description}`).join("\n");
    },
    { description: "Search registered commands" },
  );

  commandRegistry.register(
    "search.documents",
    async (query) => {
      if (!query) return 'Usage: search.documents("query")';
      const results = indexService.search(query, 15);
      if (results.length === 0) return `No document matches for "${query}"`;
      return results
        .map(
          (r) =>
            `${r.meta?.name || r.id} (score: ${r.score})${r.snippet ? `\n  → ${r.snippet}` : ""}`,
        )
        .join("\n");
    },
    { description: "Search indexed document contents" },
  );

  // === context commands ===
  commandRegistry.register(
    "context.summary",
    () => contextEngine.getSummary(),
    {
      description:
        "Get a full summary of the OS context (windows, docs, files, index)",
    },
  );

  commandRegistry.register(
    "context.full",
    () => JSON.stringify(contextEngine.getFullContext(), null, 2),
    { description: "Get the full OS context as JSON" },
  );

  commandRegistry.register(
    "context.recentFiles",
    () => {
      const files = contextEngine.getRecentFiles();
      if (files.length === 0) return "No recent files";
      return files.map((f) => f.path).join("\n");
    },
    { description: "List recently accessed files" },
  );

  commandRegistry.register(
    "context.openDocuments",
    () => {
      const docs = contextEngine.getOpenDocuments();
      if (docs.length === 0) return "No documents currently open";
      return docs.map((d) => d.path).join("\n");
    },
    { description: "List all documents currently open in viewer" },
  );

  commandRegistry.register(
    "context.indexStats",
    () => {
      const stats = indexService.getStats();
      return `Index: ${stats.documentCount} documents, ${stats.totalTokens} tokens`;
    },
    { description: "Get document index statistics" },
  );

  // === task commands ===
  commandRegistry.register(
    "task.add",
    (title, dueDate, dueTime, priority) => {
      if (!title)
        return 'Usage: task.add("title", "2025-03-01", "14:00", "high")';
      const task = useTaskStore.getState().addTask({
        title,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        priority: priority || "medium",
      });
      addNotification(`Task created: ${title}`, "success");
      return `Created task "${title}" (${task.id})`;
    },
    {
      description: "Create a new task with optional due date/time and priority",
    },
  );

  commandRegistry.register(
    "task.list",
    (status) => {
      const store = useTaskStore.getState();
      let list = store.tasks;
      if (status) list = list.filter((t) => t.status === status);
      if (list.length === 0) return status ? `No ${status} tasks` : "No tasks";
      return list
        .map((t) => {
          const due = t.dueDate
            ? ` [${t.dueDate}${t.dueTime ? " " + t.dueTime : ""}]`
            : "";
          return `[${t.status}] ${t.title}${due} (${t.priority}) id=${t.id}`;
        })
        .join("\n");
    },
    {
      description:
        "List tasks, optionally filtered by status (todo, in-progress, done)",
    },
  );

  commandRegistry.register(
    "task.complete",
    (id) => {
      if (!id) return 'Usage: task.complete("taskId")';
      const task = useTaskStore.getState().tasks.find((t) => t.id === id);
      if (!task) return `Task not found: ${id}`;
      useTaskStore.getState().completeTask(id);
      addNotification(`Completed: ${task.title}`, "success");
      return `Completed "${task.title}"`;
    },
    { description: "Mark a task as done by its ID" },
  );

  commandRegistry.register(
    "task.delete",
    (id) => {
      if (!id) return 'Usage: task.delete("taskId")';
      const task = useTaskStore.getState().tasks.find((t) => t.id === id);
      if (!task) return `Task not found: ${id}`;
      useTaskStore.getState().deleteTask(id);
      return `Deleted "${task.title}"`;
    },
    { description: "Delete a task by its ID" },
  );

  commandRegistry.register(
    "task.overdue",
    () => {
      const overdue = useTaskStore.getState().getOverdueTasks();
      if (overdue.length === 0) return "No overdue tasks 🎉";
      return overdue
        .map((t) => `⚠️ ${t.title} (due ${t.dueDate}) id=${t.id}`)
        .join("\n");
    },
    { description: "List all overdue tasks" },
  );

  commandRegistry.register(
    "task.upcoming",
    (days) => {
      const upcoming = useTaskStore
        .getState()
        .getUpcomingTasks(Number(days) || 7);
      if (upcoming.length === 0)
        return "No upcoming tasks in the next " + (days || 7) + " days";
      return upcoming
        .map((t) => {
          const time = t.dueTime ? ` ${t.dueTime}` : "";
          return `${t.dueDate}${time} — ${t.title} (${t.priority})`;
        })
        .join("\n");
    },
    { description: "List upcoming tasks (default: next 7 days)" },
  );

  commandRegistry.register(
    "task.stats",
    () => {
      const s = useTaskStore.getState().getStats();
      return `Tasks: ${s.total} total, ${s.todo} to-do, ${s.inProgress} active, ${s.done} done, ${s.overdue} overdue`;
    },
    { description: "Get task statistics" },
  );

  // === event commands ===
  commandRegistry.register(
    "event.add",
    (title, date, startTime, endTime) => {
      if (!title || !date)
        return 'Usage: event.add("Meeting", "2025-03-01", "14:00", "15:00")';
      const ev = useTaskStore.getState().addEvent({
        title,
        date,
        startTime: startTime || null,
        endTime: endTime || null,
      });
      addNotification(`Event added: ${title}`, "success");
      return `Created event "${title}" on ${date} (${ev.id})`;
    },
    { description: "Add a calendar event with date and optional time" },
  );

  commandRegistry.register(
    "event.list",
    (date) => {
      const store = useTaskStore.getState();
      let list = store.events;
      if (date) list = list.filter((e) => e.date === date);
      if (list.length === 0) return date ? `No events on ${date}` : "No events";
      return list
        .map((e) => {
          const time = e.startTime
            ? ` ${e.startTime}${e.endTime ? "-" + e.endTime : ""}`
            : "";
          return `${e.date}${time} — ${e.title} id=${e.id}`;
        })
        .join("\n");
    },
    { description: "List events, optionally filtered by date" },
  );

  commandRegistry.register(
    "event.delete",
    (id) => {
      if (!id) return 'Usage: event.delete("eventId")';
      useTaskStore.getState().deleteEvent(id);
      return `Deleted event ${id}`;
    },
    { description: "Delete a calendar event by ID" },
  );

  // === calendar commands ===
  commandRegistry.register(
    "calendar.open",
    () => {
      openWidget("calendar");
      return "Calendar opened";
    },
    { description: "Open the calendar widget", widget: "calendar" },
  );

  commandRegistry.register(
    "calendar.today",
    () => {
      const today = new Date().toISOString().split("T")[0];
      const items = useTaskStore.getState().getItemsForDate(today);
      const lines = [`Today (${today}):`];
      if (items.events.length > 0) {
        lines.push(`  Events: ${items.events.map((e) => e.title).join(", ")}`);
      }
      if (items.tasks.length > 0) {
        lines.push(
          `  Tasks: ${items.tasks.map((t) => `${t.title} [${t.status}]`).join(", ")}`,
        );
      }
      if (items.events.length === 0 && items.tasks.length === 0) {
        lines.push("  Nothing scheduled today");
      }
      return lines.join("\n");
    },
    { description: "Show today's tasks and events" },
  );

  // === schedule commands (cron-like jobs) ===
  commandRegistry.register(
    "schedule.add",
    (name, command, interval, unit, at) => {
      if (!name || !command)
        return 'Usage: schedule.add("Backup", "terminal.exec(ls)", 1, "hours")';
      const job = useTaskStore.getState().addScheduledJob({
        name,
        command,
        schedule: {
          interval: Number(interval) || 1,
          unit: unit || "hours",
          at: at || undefined,
        },
      });
      addNotification(`Scheduled: ${name}`, "success");
      return `Created job "${name}" — runs every ${interval || 1} ${unit || "hours"} (${job.id})`;
    },
    {
      description: "Add a scheduled job (cron-like) that auto-fires a command",
    },
  );

  commandRegistry.register(
    "schedule.list",
    () => {
      const jobs = useTaskStore.getState().scheduledJobs;
      if (jobs.length === 0) return "No scheduled jobs";
      return jobs
        .map((j) => {
          const status = j.enabled ? "ON" : "OFF";
          const sched = `every ${j.schedule?.interval} ${j.schedule?.unit}${j.schedule?.at ? " at " + j.schedule.at : ""}`;
          return `[${status}] ${j.name} → ${j.command} (${sched}) runs=${j.runCount} id=${j.id}`;
        })
        .join("\n");
    },
    { description: "List all scheduled jobs" },
  );

  commandRegistry.register(
    "schedule.delete",
    (id) => {
      if (!id) return 'Usage: schedule.delete("jobId")';
      useTaskStore.getState().deleteJob(id);
      return `Deleted job ${id}`;
    },
    { description: "Delete a scheduled job by ID" },
  );

  commandRegistry.register(
    "schedule.toggle",
    (id) => {
      if (!id) return 'Usage: schedule.toggle("jobId")';
      const job = useTaskStore
        .getState()
        .scheduledJobs.find((j) => j.id === id);
      if (!job) return `Job not found: ${id}`;
      useTaskStore.getState().updateJob(id, { enabled: !job.enabled });
      return `Job "${job.name}" is now ${!job.enabled ? "enabled" : "disabled"}`;
    },
    { description: "Enable/disable a scheduled job" },
  );

  commandRegistry.register(
    "schedule.status",
    () => {
      const s = schedulerService.getStatus();
      return `Scheduler: ${s.running ? "running" : "stopped"}, ${s.enabledJobs}/${s.jobs} jobs enabled, tick=${s.tickMs}ms`;
    },
    { description: "Get scheduler engine status" },
  );

  // === task-manager/calendar widget openers ===
  commandRegistry.register(
    "taskManager.open",
    () => {
      openWidget("task-manager");
      return "Task Manager opened";
    },
    { description: "Open the task manager widget", widget: "task-manager" },
  );

  // === password commands ===
  commandRegistry.register(
    "password.open",
    () => {
      openWidget("password-manager");
      return "Password Manager opened";
    },
    { description: "Open the password manager", widget: "password-manager" },
  );

  commandRegistry.register(
    "password.add",
    (title, username, password, url, category) => {
      if (!title)
        return 'Usage: password.add("GitHub", "user@email.com", "mypass", "github.com", "dev")';
      const store = usePasswordStore.getState();
      if (store.vaultLocked)
        return "Vault is locked. Open the Password Manager and unlock first.";
      const entry = store.addEntry({
        title,
        username: username || "",
        password: password || generatePassword(16),
        url: url || "",
        category: category || "general",
      });
      addNotification(`Password saved: ${title}`, "success");
      return `Saved "${title}" (${entry.id})${!password ? " — auto-generated password" : ""}`;
    },
    { description: "Add a password entry to the vault" },
  );

  commandRegistry.register(
    "password.get",
    (titleOrId) => {
      if (!titleOrId)
        return 'Usage: password.get("GitHub") or password.get("id")';
      const store = usePasswordStore.getState();
      if (store.vaultLocked) return "Vault is locked.";
      // Try by ID
      let entry = store.getEntry(titleOrId);
      if (!entry) {
        // Try by title
        const match = store.entries.find(
          (e) => e.title.toLowerCase() === titleOrId.toLowerCase(),
        );
        if (match) entry = store.getEntry(match.id);
      }
      if (!entry) return `Not found: ${titleOrId}`;
      return `${entry.title}\n  User: ${entry.username}\n  Pass: ${entry.password}\n  URL: ${entry.url || "—"}\n  Category: ${entry.category}`;
    },
    {
      description:
        "Get a password entry by title or ID (shows decrypted password)",
    },
  );

  commandRegistry.register(
    "password.list",
    (category) => {
      const store = usePasswordStore.getState();
      if (store.vaultLocked) return "Vault is locked.";
      let list = store.entries;
      if (category) list = list.filter((e) => e.category === category);
      if (list.length === 0)
        return category ? `No entries in "${category}"` : "Vault is empty";
      return list
        .map(
          (e) =>
            `${e.title} — ${e.username || "no user"} [${e.category}] id=${e.id}`,
        )
        .join("\n");
    },
    { description: "List password entries, optionally filtered by category" },
  );

  commandRegistry.register(
    "password.delete",
    (id) => {
      if (!id) return 'Usage: password.delete("entryId")';
      const store = usePasswordStore.getState();
      if (store.vaultLocked) return "Vault is locked.";
      const entry = store.entries.find((e) => e.id === id);
      if (!entry) return `Not found: ${id}`;
      store.deleteEntry(id);
      addNotification(`Deleted: ${entry.title}`, "info");
      return `Deleted "${entry.title}"`;
    },
    { description: "Delete a password entry by ID" },
  );

  commandRegistry.register(
    "password.generate",
    (length, options) => {
      const len = Number(length) || 16;
      const pw = generatePassword(len);
      const score = calculateStrength(pw);
      // Copy to clipboard
      navigator.clipboard?.writeText(pw);
      return `Generated (${len} chars, ${strengthLabel(score)}):\n${pw}\n(Copied to clipboard)`;
    },
    { description: "Generate a random password and copy to clipboard" },
  );

  commandRegistry.register(
    "password.search",
    (query) => {
      if (!query) return 'Usage: password.search("github")';
      const store = usePasswordStore.getState();
      if (store.vaultLocked) return "Vault is locked.";
      const results = store.search(query);
      if (results.length === 0) return `No matches for "${query}"`;
      return results
        .map((e) => `${e.title} — ${e.username} [${e.category}] id=${e.id}`)
        .join("\n");
    },
    { description: "Search password entries by title, username, or URL" },
  );

  commandRegistry.register(
    "password.lock",
    () => {
      usePasswordStore.getState().lock();
      return "Vault locked";
    },
    { description: "Lock the password vault" },
  );

  commandRegistry.register(
    "password.categories",
    () => {
      const store = usePasswordStore.getState();
      if (store.vaultLocked) return "Vault is locked.";
      const cats = store.getCategories();
      if (cats.length === 0) return "No categories (vault empty)";
      return cats.join(", ");
    },
    { description: "List all password categories" },
  );

  // === storage commands ===
  commandRegistry.register(
    "storage.open",
    () => {
      openWidget("storage");
      return "Storage Manager opened";
    },
    { description: "Open the storage manager widget", widget: "storage" },
  );

  commandRegistry.register(
    "storage.set",
    (namespace, key, value) => {
      if (!namespace || !key)
        return 'Usage: storage.set("namespace", "key", "value")';
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
      const result = storageService.set(namespace, key, parsed);
      return `Stored ${namespace}:${key} (${result.size} bytes)`;
    },
    {
      description: "Set a value in namespaced storage",
      args: ["namespace", "key", "value"],
    },
  );

  commandRegistry.register(
    "storage.get",
    (namespace, key) => {
      if (!namespace || !key) return 'Usage: storage.get("namespace", "key")';
      const value = storageService.get(namespace, key);
      if (value === null) return `Not found: ${namespace}:${key}`;
      return typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value);
    },
    {
      description: "Get a value from namespaced storage",
      args: ["namespace", "key"],
    },
  );

  commandRegistry.register(
    "storage.delete",
    (namespace, key) => {
      if (!namespace)
        return 'Usage: storage.delete("namespace", "key") or storage.delete("namespace") to clear all';
      if (!key) {
        const count = storageService.clearNamespace(namespace);
        return `Cleared namespace "${namespace}" (${count} keys)`;
      }
      const existed = storageService.delete(namespace, key);
      return existed
        ? `Deleted ${namespace}:${key}`
        : `Not found: ${namespace}:${key}`;
    },
    {
      description: "Delete a key or entire namespace from storage",
      args: ["namespace", "key?"],
    },
  );

  commandRegistry.register(
    "storage.list",
    (namespace) => {
      if (namespace) {
        const keys = storageService.getNamespaceKeys(namespace);
        if (keys.length === 0) return `No keys in "${namespace}"`;
        return keys
          .map((k) => `${k.key} (${storageService._formatBytes(k.size)})`)
          .join("\n");
      }
      const namespaces = storageService.getNamespaces();
      if (namespaces.length === 0) return "No app storage namespaces";
      return namespaces
        .map((ns) => {
          const keys = storageService.getNamespaceKeys(ns);
          return `${ns} (${keys.length} keys)`;
        })
        .join("\n");
    },
    {
      description: "List namespaces or keys within a namespace",
      args: ["namespace?"],
    },
  );

  commandRegistry.register(
    "storage.stats",
    () => {
      const stats = storageService.getStats();
      return [
        `Total keys: ${stats.totalKeys}`,
        `Total size: ${stats.totalSizeFormatted}`,
        `Usage: ${stats.usagePercent}% of ${stats.quotaFormatted}`,
        `System stores: ${stats.systemKeys}`,
        `App storage: ${stats.storageKeys}`,
        `Widget states: ${stats.widgetStateKeys}`,
        `Other: ${stats.otherKeys}`,
      ].join("\n");
    },
    { description: "Show storage usage statistics" },
  );

  commandRegistry.register(
    "storage.export",
    () => {
      const data = storageService.exportAll();
      return `Export ready: ${data.keyCount} keys, exported at ${data.exportedAt}. Use the Storage widget to download as JSON.`;
    },
    { description: "Export all OniOS storage data" },
  );

  commandRegistry.register(
    "storage.search",
    (query) => {
      if (!query) return 'Usage: storage.search("query")';
      const results = storageService.search(query);
      if (results.length === 0) return `No keys matching "${query}"`;
      return results
        .map(
          (r) =>
            `${r.namespace}:${r.key} (${storageService._formatBytes(r.size)})`,
        )
        .join("\n");
    },
    { description: "Search storage keys", args: ["query"] },
  );

  commandRegistry.register(
    "storage.has",
    (namespace, key) => {
      if (!namespace || !key) return 'Usage: storage.has("namespace", "key")';
      return storageService.has(namespace, key) ? "true" : "false";
    },
    {
      description: "Check if a key exists in storage",
      args: ["namespace", "key"],
    },
  );

  // === camera commands ===
  commandRegistry.register(
    "camera.open",
    () => {
      openWidget("camera");
      return "Camera opened";
    },
    { description: "Open the camera widget", widget: "camera" },
  );

  commandRegistry.register(
    "camera.capture",
    async () => {
      // Ensure camera is open first
      const wins = useWindowStore.getState().windows || [];
      const cameraWin = wins.find((w) => w.widgetType === "camera");
      if (!cameraWin) {
        openWidget("camera");
        await new Promise((r) => setTimeout(r, 1500));
      }
      // Trigger capture via event bus
      eventBus.emit("camera:capture");
      return "Photo capture triggered";
    },
    { description: "Take a photo with the camera" },
  );

  commandRegistry.register(
    "camera.listPhotos",
    async () => {
      try {
        const res = await fetch(
          `/api/fs/list?path=${encodeURIComponent("/Pictures/OniOS")}`,
        );
        if (!res.ok) return "No photos found. Take one first!";
        const data = await res.json();
        const photos = (data.items || [])
          .filter(
            (f) => !f.isDirectory && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name),
          )
          .sort((a, b) => (b.modified || 0) - (a.modified || 0));
        if (photos.length === 0) return "No photos found. Take one first!";
        return photos.map((p) => `${p.name} (${p.size} bytes)`).join("\n");
      } catch {
        return "No photos found. Take one first!";
      }
    },
    { description: "List captured photos" },
  );

  // === screen capture commands ===
  commandRegistry.register(
    "screen.open",
    () => {
      openWidget("screen-capture");
      return "Screen Capture opened";
    },
    { description: "Open the screen capture widget", widget: "screen-capture" },
  );

  commandRegistry.register(
    "screen.screenshot",
    async () => {
      const wins = useWindowStore.getState().windows || [];
      const scWin = wins.find((w) => w.widgetType === "screen-capture");
      if (!scWin) {
        openWidget("screen-capture");
        await new Promise((r) => setTimeout(r, 1000));
      }
      eventBus.emit("screen:screenshot");
      return "Screenshot triggered — select screen or window to capture";
    },
    { description: "Take a screenshot of the screen or a specific window" },
  );

  commandRegistry.register(
    "screen.record.start",
    async () => {
      const wins = useWindowStore.getState().windows || [];
      const scWin = wins.find((w) => w.widgetType === "screen-capture");
      if (!scWin) {
        openWidget("screen-capture");
        await new Promise((r) => setTimeout(r, 1000));
      }
      eventBus.emit("screen:record:start");
      return "Screen recording started — select screen or window to record";
    },
    { description: "Start screen recording" },
  );

  commandRegistry.register(
    "screen.record.stop",
    () => {
      eventBus.emit("screen:record:stop");
      return "Screen recording stopped and saved";
    },
    { description: "Stop screen recording and save the file" },
  );

  // === drawing board commands ===
  commandRegistry.register(
    "board.open",
    () => {
      openWidget("drawing");
      return "Drawing Board opened";
    },
    { description: "Open the drawing whiteboard", widget: "drawing" },
  );

  commandRegistry.register(
    "board.draw",
    (...args) => {
      // Ensure drawing widget is open
      const wins = useWindowStore.getState().windows || [];
      if (!wins.find((w) => w.widgetType === "drawing")) {
        openWidget("drawing");
      }
      // Accept either a single command or array of commands
      let commands;
      try {
        commands = typeof args[0] === "string" ? JSON.parse(args[0]) : args[0];
      } catch {
        commands = args;
      }
      // Queue commands — widget may not be mounted yet
      // Store on eventBus so Drawing widget can pick up queued commands on mount
      if (!eventBus._drawingQueue) eventBus._drawingQueue = [];
      eventBus._drawingQueue.push(commands);
      setTimeout(() => {
        eventBus.emit("drawing:command", commands);
      }, 800);
      return "Drawing commands sent to board";
    },
    {
      description: "Send draw commands to the whiteboard (JSON draw protocol)",
    },
  );

  commandRegistry.register(
    "board.clear",
    () => {
      eventBus.emit("drawing:command", { type: "board.clear" });
      return "Board cleared";
    },
    { description: "Clear the drawing board" },
  );

  // === browser commands ===
  commandRegistry.register(
    "browser.open",
    (url) => {
      openWidget("browser", url ? { initialUrl: url } : {}, {
        title: url ? `Browser: ${url}` : "Browser",
      });
      return url ? `Browser opened: ${url}` : "Browser opened";
    },
    { description: "Open the headless browser widget", widget: "browser" },
  );

  commandRegistry.register(
    "browser.navigate",
    (url) => {
      if (!url) return "Usage: browser.navigate(url)";
      const wins = useWindowStore.getState().windows || [];
      const browserWin = wins.find((w) => w.widgetType === "browser");
      if (!browserWin) {
        openWidget(
          "browser",
          { initialUrl: url },
          { title: `Browser: ${url}` },
        );
      } else {
        eventBus.emit("browser:navigate", { url });
      }
      return `Navigating to: ${url}`;
    },
    { description: "Navigate the browser to a URL" },
  );

  // === sub-agent commands ===
  commandRegistry.register(
    "agent.spawn",
    (name, task) => {
      if (!task) return "Usage: agent.spawn(name, task)";
      const agent = agentManager.spawn({ name: name || "Sub-Agent", task });
      // Open an AgentViewer widget for this agent
      openWidget(
        "agent-viewer",
        { agentId: agent.id },
        {
          title: `Agent: ${agent.name}`,
        },
      );
      return `Spawned agent "${agent.name}" (${agent.id}). AgentViewer opened.`;
    },
    {
      description: "Spawn a sub-agent for a task. Opens an AgentViewer widget.",
      args: ["name", "task"],
    },
  );

  commandRegistry.register(
    "agent.list",
    () => {
      const agents = agentManager.getAll();
      if (agents.length === 0) return "No sub-agents running.";
      return agents
        .map(
          (a) =>
            `[${a.id}] "${a.name}" — ${a.status} | Task: ${a.task.substring(0, 60)}`,
        )
        .join("\n");
    },
    { description: "List all sub-agents and their statuses" },
  );

  commandRegistry.register(
    "agent.get",
    (agentId) => {
      if (!agentId) return "Usage: agent.get(agentId)";
      const agent = agentManager.get(agentId);
      if (!agent) return `Agent ${agentId} not found`;
      return JSON.stringify(
        {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          task: agent.task,
          toolCalls: agent.toolCalls?.length || 0,
          result: agent.result,
          error: agent.error,
          duration: agent.completedAt
            ? `${Math.round((agent.completedAt - agent.createdAt) / 1000)}s`
            : `${Math.round((Date.now() - agent.createdAt) / 1000)}s running`,
        },
        null,
        2,
      );
    },
    { description: "Get details of a specific sub-agent", args: ["agentId"] },
  );

  commandRegistry.register(
    "agent.cancel",
    (agentId) => {
      if (!agentId) return "Usage: agent.cancel(agentId)";
      const agent = agentManager.cancel(agentId);
      if (!agent) return `Agent ${agentId} not found`;
      return `Agent "${agent.name}" cancelled.`;
    },
    { description: "Cancel a running sub-agent", args: ["agentId"] },
  );

  commandRegistry.register(
    "agent.message",
    (agentId, message) => {
      if (!agentId || !message) return "Usage: agent.message(agentId, message)";
      const msg = agentManager.sendMessage(null, agentId, message);
      if (msg.error) return msg.error;
      return `Message sent to agent ${agentId}: "${message.substring(0, 60)}"`;
    },
    {
      description: "Send a message to a sub-agent",
      args: ["agentId", "message"],
    },
  );

  commandRegistry.register(
    "agent.view",
    (agentId) => {
      if (!agentId) return "Usage: agent.view(agentId)";
      const agent = agentManager.get(agentId);
      if (!agent) return `Agent ${agentId} not found`;
      openWidget(
        "agent-viewer",
        { agentId },
        {
          title: `Agent: ${agent.name}`,
        },
      );
      return `Opened AgentViewer for "${agent.name}"`;
    },
    {
      description: "Open the AgentViewer widget for a sub-agent",
      args: ["agentId"],
    },
  );

  commandRegistry.register(
    "agent.updateStatus",
    (agentId, status) => {
      if (!agentId || !status)
        return "Usage: agent.updateStatus(agentId, status)";
      const agent = agentManager.updateStatus(agentId, status);
      if (!agent) return `Agent ${agentId} not found`;
      return `Agent "${agent.name}" status → ${status}`;
    },
    {
      description:
        "Update agent status (working, waiting, paused, completed, failed)",
      args: ["agentId", "status"],
    },
  );

  commandRegistry.register(
    "agent.log",
    (agentId, type, content) => {
      if (!agentId || !content)
        return "Usage: agent.log(agentId, type, content)";
      agentManager.addLog(agentId, type || "system", content);
      return `Logged to agent ${agentId}`;
    },
    {
      description: "Add a log entry to a sub-agent",
      args: ["agentId", "type", "content"],
    },
  );

  commandRegistry.register(
    "agent.setResult",
    (agentId, result) => {
      if (!agentId || !result) return "Usage: agent.setResult(agentId, result)";
      agentManager.setResult(agentId, result);
      return `Agent ${agentId} marked as completed with result.`;
    },
    {
      description: "Set a sub-agent's final result and mark as completed",
      args: ["agentId", "result"],
    },
  );

  // === context awareness commands (for AI agents) ===
  commandRegistry.register(
    "context.get",
    () => {
      return JSON.stringify(contextEngine.getFullContext(), null, 2);
    },
    {
      description:
        "Get full OS context snapshot (windows, widget states, docs, files)",
    },
  );

  commandRegistry.register(
    "context.summary",
    () => {
      return contextEngine.getSummary();
    },
    {
      description:
        "Get human-readable summary of all open widgets and their live states",
    },
  );

  commandRegistry.register(
    "context.widget",
    (widgetType) => {
      if (!widgetType) {
        const types = widgetContext.getActiveTypes();
        if (types.length === 0) return "No widgets reporting context.";
        return `Active widget types: ${types.join(", ")}\n\nUsage: context.widget("file-explorer")`;
      }
      const state = widgetContext.getWidgetState(widgetType);
      if (!state) return `No context for widget type: ${widgetType}`;
      return JSON.stringify(state, null, 2);
    },
    {
      description:
        "Get live state of a specific widget type (file-explorer, terminal, calendar, etc.)",
      args: ["widgetType?"],
    },
  );

  commandRegistry.register(
    "context.widgets",
    () => {
      return widgetContext.getSummary();
    },
    { description: "Get readable summary of all widget live states" },
  );

  commandRegistry.register(
    "context.snapshot",
    () => {
      return JSON.stringify(widgetContext.getSnapshot(), null, 2);
    },
    {
      description:
        "Get structured JSON snapshot of all widget states (for programmatic use)",
    },
  );

  commandRegistry.register(
    "context.focused",
    () => {
      const focused = contextEngine.getFocusedWindow();
      if (!focused) return "No window is focused.";
      const ctx = widgetContext.get(focused.id);
      return JSON.stringify(
        {
          windowId: focused.id,
          widgetType: focused.widgetType,
          title: focused.title,
          state: ctx?.state || null,
        },
        null,
        2,
      );
    },
    { description: "Get the focused window and its live widget state" },
  );

  // === window management commands ===
  commandRegistry.register(
    "window.context",
    () => {
      const ctx = useWindowStore.getState().getActiveContext();
      return JSON.stringify(ctx, null, 2);
    },
    {
      description:
        "Get full window context (all open windows, max limit, focus state)",
    },
  );

  commandRegistry.register(
    "window.autoCloseOldest",
    () => {
      const closed = useWindowStore.getState().autoCloseOldest();
      if (closed) return `Auto-closed: ${closed.title} (${closed.widgetType})`;
      return "No windows to close.";
    },
    {
      description: "Auto-close the oldest non-focused window to free up space",
    },
  );

  // === run commands (command execution tracking) ===
  commandRegistry.register(
    "run.get",
    (runId) => {
      if (!runId) return 'Usage: run.get("run_xxx")';
      const run = commandRunTracker.getRun(runId);
      if (!run) return `Run not found: ${runId}`;
      const dur = run.duration != null ? `${run.duration}ms` : "pending";
      return [
        `Run: ${run.id}`,
        `  Command: ${run.command}`,
        `  Path: ${run.path}`,
        `  Status: ${run.status}`,
        `  Output Type: ${run.outputType || "—"}`,
        `  Output: ${typeof run.output === "object" ? JSON.stringify(run.output) : (run.output ?? "—")}`,
        `  Error: ${run.error || "—"}`,
        `  Source: ${run.source}`,
        `  Duration: ${dur}`,
        run.chainId
          ? `  Chain: ${run.chainId} [${run.chainIndex + 1}/${run.chainTotal}]`
          : null,
        run.parentRunId ? `  Parent Run: ${run.parentRunId}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    },
    { description: "Get full details of a command run by its run ID" },
  );

  commandRegistry.register(
    "run.output",
    (runId) => {
      if (!runId) return 'Usage: run.output("run_xxx")';
      const output = commandRunTracker.getOutput(runId);
      if (output === null) {
        const run = commandRunTracker.getRun(runId);
        if (!run) return `Run not found: ${runId}`;
        if (run.status === "running" || run.status === "pending")
          return `Run ${runId} is still ${run.status}...`;
        return `Run ${runId} has no output (${run.status})`;
      }
      return typeof output === "object"
        ? JSON.stringify(output, null, 2)
        : output;
    },
    { description: "Get just the output of a command run" },
  );

  commandRegistry.register(
    "run.await",
    async (runId) => {
      if (!runId) return 'Usage: run.await("run_xxx")';
      const run = await commandRunTracker.awaitRun(runId);
      if (!run) return `Run not found: ${runId}`;
      return `[${run.status}] ${run.path} → ${typeof run.output === "object" ? JSON.stringify(run.output) : (run.output ?? run.error)}`;
    },
    { description: "Await a command run's completion and return its result" },
  );

  commandRegistry.register(
    "run.list",
    (limit) => {
      const runs = commandRunTracker.getHistory(Number(limit) || 20);
      if (runs.length === 0) return "No command runs recorded";
      return runs
        .map((r) => {
          const dur = r.duration != null ? `${r.duration}ms` : "...";
          const out =
            r.outputType === "error"
              ? `ERR: ${r.error}`
              : r.outputType === "void"
                ? "void"
                : r.outputType === "list"
                  ? `[${r.output?.length} items]`
                  : r.outputType === "object"
                    ? "{...}"
                    : typeof r.output === "string"
                      ? r.output.substring(0, 60)
                      : String(r.output ?? "");
          return `[${r.status}] ${r.id} ${r.path} (${dur}) → ${out}`;
        })
        .join("\n");
    },
    { description: "List recent command runs with status and output summary" },
  );

  commandRegistry.register(
    "run.chain",
    (chainId) => {
      if (!chainId) return 'Usage: run.chain("chain_xxx")';
      const runs = commandRunTracker.getChain(chainId);
      if (runs.length === 0) return `Chain not found: ${chainId}`;
      return runs
        .map((r, i) => {
          const out =
            r.status === "rejected"
              ? `ERR: ${r.error}`
              : typeof r.output === "string"
                ? r.output.substring(0, 60)
                : String(r.output ?? "");
          return `  ${i + 1}. [${r.status}] ${r.path} → ${out}`;
        })
        .join("\n");
    },
    { description: "Inspect all runs in a pipe chain by chain ID" },
  );

  commandRegistry.register(
    "run.stats",
    () => {
      const s = commandRunTracker.getStats();
      return `Runs: ${s.total} total, ${s.resolved} resolved, ${s.rejected} rejected, ${s.running} running, ${s.pending} pending`;
    },
    { description: "Get command execution statistics" },
  );

  commandRegistry.register(
    "run.search",
    (query) => {
      if (!query) return 'Usage: run.search("query")';
      const runs = commandRunTracker.search(query);
      if (runs.length === 0) return `No runs matching "${query}"`;
      return runs
        .slice(0, 20)
        .map(
          (r) => `[${r.status}] ${r.id} ${r.path} (${r.duration ?? "..."}ms)`,
        )
        .join("\n");
    },
    { description: "Search command runs by command path or output content" },
  );

  commandRegistry.register(
    "run.running",
    () => {
      const runs = commandRunTracker.getByStatus("running");
      if (runs.length === 0) return "No commands currently running";
      return runs
        .map(
          (r) =>
            `${r.id} ${r.path} (started ${Date.now() - r.startedAt}ms ago)`,
        )
        .join("\n");
    },
    { description: "List commands currently in progress" },
  );

  commandRegistry.register(
    "run.failed",
    () => {
      const runs = commandRunTracker.getByStatus("rejected").slice(-20);
      if (runs.length === 0) return "No failed runs";
      return runs.map((r) => `${r.id} ${r.path} → ${r.error}`).join("\n");
    },
    { description: "List recently failed command runs" },
  );

  // === workflow commands ===
  commandRegistry.register(
    "workflow.open",
    () => {
      openWidget("workflow-builder");
      return "Workflow Builder opened";
    },
    { description: "Open the workflow builder", widget: "workflow-builder" },
  );

  commandRegistry.register(
    "workflow.create",
    (name) => {
      const wf = useWorkflowStore
        .getState()
        .createWorkflow({ name: name || "New Workflow" });
      openWidget("workflow-builder");
      return `Created workflow "${wf.name}" (${wf.id})`;
    },
    { description: "Create a new workflow and open the builder" },
  );

  commandRegistry.register(
    "workflow.run",
    async (idOrName) => {
      if (!idOrName)
        return 'Usage: workflow.run("workflowId") or workflow.run("name")';
      const store = useWorkflowStore.getState();
      let wf = store.getWorkflow(idOrName);
      if (!wf) {
        wf = store.workflows.find(
          (w) => w.name.toLowerCase() === idOrName.toLowerCase(),
        );
      }
      if (!wf) return `Workflow not found: ${idOrName}`;
      addNotification(`Running workflow: ${wf.name}`, "info");
      const result = await workflowEngine.execute(wf.id);
      if (result.success) {
        addNotification(`Workflow "${wf.name}" completed`, "success");
        return `Workflow "${wf.name}" completed (${result.status})`;
      } else {
        addNotification(
          `Workflow "${wf.name}" failed: ${result.error}`,
          "error",
        );
        return `Workflow "${wf.name}" failed: ${result.error}`;
      }
    },
    { description: "Execute a workflow by ID or name" },
  );

  commandRegistry.register(
    "workflow.list",
    () => {
      const wfs = useWorkflowStore.getState().workflows;
      if (wfs.length === 0) return "No workflows";
      return wfs
        .map((w) => {
          const status = w.lastRunStatus ? ` [${w.lastRunStatus}]` : "";
          const enabled = w.enabled ? "✅ ON" : "⏸ OFF";
          const triggers = w.nodes
            .filter(
              (n) => n.type === "trigger" && n.config?.triggerType === "event",
            )
            .map((n) => n.config.eventName)
            .join(", ");
          const trigStr = triggers ? ` listening: ${triggers}` : "";
          return `${enabled} ${w.name}${status} — ${w.nodes.length} nodes${trigStr}  id=${w.id}`;
        })
        .join("\n");
    },
    { description: "List all workflows with enabled/disabled status" },
  );

  commandRegistry.register(
    "workflow.enable",
    (idOrName) => {
      if (!idOrName) return 'Usage: workflow.enable("id or name")';
      const store = useWorkflowStore.getState();
      let wf = store.getWorkflow(idOrName);
      if (!wf)
        wf = store.workflows.find(
          (w) => w.name.toLowerCase() === idOrName.toLowerCase(),
        );
      if (!wf) return `Not found: ${idOrName}`;
      store.updateWorkflow(wf.id, { enabled: true });
      workflowEngine.initListeners();
      return `✅ Enabled workflow "${wf.name}" — event triggers are now active`;
    },
    { description: "Enable/activate a workflow (registers event triggers)" },
  );

  commandRegistry.register(
    "workflow.disable",
    (idOrName) => {
      if (!idOrName) return 'Usage: workflow.disable("id or name")';
      const store = useWorkflowStore.getState();
      let wf = store.getWorkflow(idOrName);
      if (!wf)
        wf = store.workflows.find(
          (w) => w.name.toLowerCase() === idOrName.toLowerCase(),
        );
      if (!wf) return `Not found: ${idOrName}`;
      store.updateWorkflow(wf.id, { enabled: false });
      workflowEngine.initListeners();
      return `⏸ Disabled workflow "${wf.name}" — event triggers are now inactive`;
    },
    {
      description: "Disable/deactivate a workflow (unregisters event triggers)",
    },
  );

  commandRegistry.register(
    "workflow.get",
    (idOrName) => {
      if (!idOrName) return 'Usage: workflow.get("id")';
      const store = useWorkflowStore.getState();
      let wf = store.getWorkflow(idOrName);
      if (!wf)
        wf = store.workflows.find(
          (w) => w.name.toLowerCase() === idOrName.toLowerCase(),
        );
      if (!wf) return `Not found: ${idOrName}`;
      const lines = [
        `Workflow: ${wf.name} (${wf.id})`,
        `  Nodes: ${wf.nodes.length}`,
        `  Connections: ${wf.connections.length}`,
        `  Last Run: ${wf.lastRunStatus || "never"}`,
        `  Nodes:`,
      ];
      wf.nodes.forEach((n, i) => {
        const cmd = n.config?.command ? ` → ${n.config.command}` : "";
        lines.push(`    ${i + 1}. [${n.type}] ${n.label}${cmd} (${n.status})`);
      });
      return lines.join("\n");
    },
    { description: "Get details of a workflow" },
  );

  commandRegistry.register(
    "workflow.delete",
    (id) => {
      if (!id) return 'Usage: workflow.delete("id")';
      const wf = useWorkflowStore.getState().getWorkflow(id);
      if (!wf) return `Not found: ${id}`;
      useWorkflowStore.getState().deleteWorkflow(id);
      return `Deleted workflow "${wf.name}"`;
    },
    { description: "Delete a workflow by ID" },
  );

  commandRegistry.register(
    "workflow.abort",
    (id) => {
      if (!id) return 'Usage: workflow.abort("id")';
      workflowEngine.abort(id);
      return `Aborted workflow ${id}`;
    },
    { description: "Abort a running workflow" },
  );

  commandRegistry.register(
    "workflow.duplicate",
    (id) => {
      if (!id) return 'Usage: workflow.duplicate("id")';
      const copy = useWorkflowStore.getState().duplicateWorkflow(id);
      if (!copy) return `Not found: ${id}`;
      return `Duplicated → "${copy.name}" (${copy.id})`;
    },
    { description: "Duplicate a workflow" },
  );

  // === workflow node manipulation ===
  commandRegistry.register(
    "workflow.addNode",
    (workflowId, type, label, config) => {
      if (!workflowId)
        return "Usage: workflow.addNode(workflowId, type, label, config)";
      const store = useWorkflowStore.getState();
      const wf = store.getWorkflow(workflowId);
      if (!wf) return `Workflow not found: ${workflowId}`;
      const node = store.addNode(workflowId, {
        type: type || "command",
        label: label || type || "New Node",
        config: typeof config === "string" ? JSON.parse(config) : config || {},
        x: 100 + wf.nodes.length * 200,
        y: 200,
      });
      return `Added ${node.type} node "${node.label}" (${node.id}) to workflow "${wf.name}"`;
    },
    { description: "Add a node to a workflow" },
  );

  commandRegistry.register(
    "workflow.updateNode",
    (workflowId, nodeId, updatesJson) => {
      if (!workflowId || !nodeId)
        return "Usage: workflow.updateNode(workflowId, nodeId, updatesJson)";
      const store = useWorkflowStore.getState();
      const wf = store.getWorkflow(workflowId);
      if (!wf) return `Workflow not found: ${workflowId}`;
      const updates =
        typeof updatesJson === "string"
          ? JSON.parse(updatesJson)
          : updatesJson || {};
      store.updateNode(workflowId, nodeId, updates);
      return `Updated node ${nodeId} in workflow "${wf.name}"`;
    },
    { description: "Update a node's properties in a workflow" },
  );

  commandRegistry.register(
    "workflow.deleteNode",
    (workflowId, nodeId) => {
      if (!workflowId || !nodeId)
        return "Usage: workflow.deleteNode(workflowId, nodeId)";
      const store = useWorkflowStore.getState();
      const wf = store.getWorkflow(workflowId);
      if (!wf) return `Workflow not found: ${workflowId}`;
      store.deleteNode(workflowId, nodeId);
      return `Deleted node ${nodeId} from workflow "${wf.name}"`;
    },
    { description: "Delete a node from a workflow" },
  );

  commandRegistry.register(
    "workflow.addConnection",
    (workflowId, fromNodeId, toNodeId) => {
      if (!workflowId || !fromNodeId || !toNodeId)
        return "Usage: workflow.addConnection(workflowId, fromNodeId, toNodeId)";
      const store = useWorkflowStore.getState();
      const wf = store.getWorkflow(workflowId);
      if (!wf) return `Workflow not found: ${workflowId}`;
      const conn = store.addConnection(workflowId, fromNodeId, toNodeId);
      if (!conn) return "Connection already exists or invalid node IDs";
      return `Connected ${fromNodeId} → ${toNodeId} in workflow "${wf.name}"`;
    },
    { description: "Connect two nodes in a workflow" },
  );

  commandRegistry.register(
    "workflow.removeConnection",
    (workflowId, connectionId) => {
      if (!workflowId || !connectionId)
        return "Usage: workflow.removeConnection(workflowId, connectionId)";
      const store = useWorkflowStore.getState();
      store.removeConnection(workflowId, connectionId);
      return `Removed connection ${connectionId}`;
    },
    { description: "Remove a connection between nodes" },
  );

  // === task update ===
  commandRegistry.register(
    "task.update",
    (id, updatesJson) => {
      if (!id) return "Usage: task.update(taskId, updatesJson)";
      const updates =
        typeof updatesJson === "string"
          ? JSON.parse(updatesJson)
          : updatesJson || {};
      useTaskStore.getState().updateTask(id, updates);
      return `Updated task ${id}`;
    },
    {
      description:
        "Update a task's properties (title, priority, dueDate, dueTime, status)",
    },
  );

  // === event update ===
  commandRegistry.register(
    "event.update",
    (id, updatesJson) => {
      if (!id) return "Usage: event.update(eventId, updatesJson)";
      const updates =
        typeof updatesJson === "string"
          ? JSON.parse(updatesJson)
          : updatesJson || {};
      const store = useTaskStore.getState();
      store.updateEvent ? store.updateEvent(id, updates) : null;
      return `Updated event ${id}`;
    },
    { description: "Update a calendar event's properties" },
  );

  // === workflow.test — Create and run 10 diverse test workflows ===
  commandRegistry.register(
    "workflow.test",
    async () => {
      const store = useWorkflowStore.getState();
      const results = [];
      const run = async (name, setup) => {
        try {
          const r = await setup();
          results.push(r);
        } catch (e) {
          results.push(`${name}: ❌ ERROR — ${e.message}`);
        }
      };

      // ── 1: Linear — Trigger → Command → Output (notification) ──
      await run("T1 linear+notify", async () => {
        const wf = store.createWorkflow({ name: "T1: Linear Notify" });
        const t = wf.nodes[0];
        const cmd = store.addNode(wf.id, {
          type: "command",
          label: "Notify",
          config: { command: 'system.notify("Test 1 passed!")' },
          x: 280,
          y: 200,
        });
        const out = store.addNode(wf.id, {
          type: "output",
          label: "Result",
          config: {
            action: "notify",
            message: "Workflow 1 complete: {{input}}",
          },
          x: 520,
          y: 200,
        });
        store.addConnection(wf.id, t.id, cmd.id);
        store.addConnection(wf.id, cmd.id, out.id);
        const r = await workflowEngine.execute(wf.id);
        const outN = store
          .getWorkflow(wf.id)
          .nodes.find((n) => n.id === out.id);
        return `T1 linear+notify: ${r.success && outN?.output?._output ? "✅ PASS" : "❌ FAIL"}`;
      });

      // ── 2: Delay passthrough — Trigger → Delay(1s) → Output ──
      await run("T2 delay", async () => {
        const wf = store.createWorkflow({ name: "T2: Delay Passthrough" });
        const t = wf.nodes[0];
        const d = store.addNode(wf.id, {
          type: "delay",
          label: "Wait 1s",
          config: { seconds: 1 },
          x: 280,
          y: 200,
        });
        const out = store.addNode(wf.id, {
          type: "output",
          label: "After Delay",
          config: { action: "log" },
          x: 520,
          y: 200,
        });
        store.addConnection(wf.id, t.id, d.id);
        store.addConnection(wf.id, d.id, out.id);
        const r = await workflowEngine.execute(wf.id);
        const outN = store
          .getWorkflow(wf.id)
          .nodes.find((n) => n.id === out.id);
        return `T2 delay: ${r.success && outN?.status === "resolved" ? "✅ PASS" : "❌ FAIL"}`;
      });

      // ── 3: Condition TRUE branch — Trigger(manual) → Condition(exists) → True/False ──
      await run("T3 condition-true", async () => {
        const wf = store.createWorkflow({ name: "T3: Condition TRUE" });
        const t = wf.nodes[0];
        const c = store.addNode(wf.id, {
          type: "condition",
          label: "Has Input?",
          config: { operator: "exists" },
          x: 280,
          y: 200,
        });
        const yes = store.addNode(wf.id, {
          type: "output",
          label: "Yes",
          config: { action: "log", message: "TRUE" },
          x: 520,
          y: 120,
        });
        const no = store.addNode(wf.id, {
          type: "output",
          label: "No",
          config: { action: "log", message: "FALSE" },
          x: 520,
          y: 300,
        });
        store.addConnection(wf.id, t.id, c.id);
        store.addConnection(wf.id, c.id, yes.id, "true");
        store.addConnection(wf.id, c.id, no.id, "false");
        const r = await workflowEngine.execute(wf.id);
        const w = store.getWorkflow(wf.id);
        const yesOk =
          w.nodes.find((n) => n.id === yes.id)?.status === "resolved";
        const noSkip =
          w.nodes.find((n) => n.id === no.id)?.status !== "resolved";
        return `T3 condition-true: ${r.success && yesOk && noSkip ? "✅ PASS" : "❌ FAIL (yes=" + yesOk + " no=" + !noSkip + ")"}`;
      });

      // ── 4: Condition FALSE branch — Trigger → Condition(equals "nope") → True/False ──
      await run("T4 condition-false", async () => {
        const wf = store.createWorkflow({ name: "T4: Condition FALSE" });
        const t = wf.nodes[0];
        const c = store.addNode(wf.id, {
          type: "condition",
          label: "Is Nope?",
          config: { operator: "equals", value: "nope" },
          x: 280,
          y: 200,
        });
        const yes = store.addNode(wf.id, {
          type: "output",
          label: "Match",
          config: { action: "log" },
          x: 520,
          y: 120,
        });
        const no = store.addNode(wf.id, {
          type: "output",
          label: "No Match",
          config: { action: "log" },
          x: 520,
          y: 300,
        });
        store.addConnection(wf.id, t.id, c.id);
        store.addConnection(wf.id, c.id, yes.id, "true");
        store.addConnection(wf.id, c.id, no.id, "false");
        const r = await workflowEngine.execute(wf.id);
        const w = store.getWorkflow(wf.id);
        const yesSkip =
          w.nodes.find((n) => n.id === yes.id)?.status !== "resolved";
        const noOk = w.nodes.find((n) => n.id === no.id)?.status === "resolved";
        return `T4 condition-false: ${r.success && yesSkip && noOk ? "✅ PASS" : "❌ FAIL"}`;
      });

      // ── 5: Data piping — Trigger → windows.list → Condition(exists) → Output ──
      await run("T5 data-pipe", async () => {
        const wf = store.createWorkflow({ name: "T5: Data Piping" });
        const t = wf.nodes[0];
        const cmd = store.addNode(wf.id, {
          type: "command",
          label: "List Windows",
          config: { command: "system.windows.list()" },
          x: 280,
          y: 200,
        });
        const c = store.addNode(wf.id, {
          type: "condition",
          label: "Has Data?",
          config: { operator: "exists" },
          x: 500,
          y: 200,
        });
        const out = store.addNode(wf.id, {
          type: "output",
          label: "Log",
          config: { action: "log", message: "Got: {{input}}" },
          x: 720,
          y: 200,
        });
        store.addConnection(wf.id, t.id, cmd.id);
        store.addConnection(wf.id, cmd.id, c.id);
        store.addConnection(wf.id, c.id, out.id);
        const r = await workflowEngine.execute(wf.id);
        const outN = store
          .getWorkflow(wf.id)
          .nodes.find((n) => n.id === out.id);
        return `T5 data-pipe: ${r.success && outN?.status === "resolved" ? "✅ PASS" : "❌ FAIL"}`;
      });

      // ── 6: Error handling — Trigger → bad.command → Output (should NOT run) ──
      await run("T6 error-skip", async () => {
        const wf = store.createWorkflow({ name: "T6: Error Skip" });
        const t = wf.nodes[0];
        const bad = store.addNode(wf.id, {
          type: "command",
          label: "Bad Cmd",
          config: { command: "nonexistent.command()" },
          x: 280,
          y: 200,
        });
        const out = store.addNode(wf.id, {
          type: "output",
          label: "After Bad",
          config: { action: "log" },
          x: 520,
          y: 200,
        });
        store.addConnection(wf.id, t.id, bad.id);
        store.addConnection(wf.id, bad.id, out.id);
        const r = await workflowEngine.execute(wf.id);
        const w = store.getWorkflow(wf.id);
        const badOk =
          w.nodes.find((n) => n.id === bad.id)?.status === "rejected";
        const outSkip =
          w.nodes.find((n) => n.id === out.id)?.status !== "resolved";
        return `T6 error-skip: ${badOk && outSkip ? "✅ PASS" : "❌ FAIL"}`;
      });

      // ── 7: Notification output — Trigger → Output(notify) — verify toast ──
      await run("T7 notify-output", async () => {
        const wf = store.createWorkflow({ name: "T7: Notification" });
        const t = wf.nodes[0];
        const out = store.addNode(wf.id, {
          type: "output",
          label: "Toast",
          config: { action: "notify", message: "Test 7 notification!" },
          x: 280,
          y: 200,
        });
        store.addConnection(wf.id, t.id, out.id);
        const r = await workflowEngine.execute(wf.id);
        const outN = store
          .getWorkflow(wf.id)
          .nodes.find((n) => n.id === out.id);
        return `T7 notify-output: ${r.success && outN?.output?._output && outN.output.action === "notify" ? "✅ PASS" : "❌ FAIL"}`;
      });

      // ── 8: Multi-step chain — Trigger → Cmd1 → Delay → Cmd2 → Output ──
      await run("T8 multi-step", async () => {
        const wf = store.createWorkflow({ name: "T8: Multi-Step Chain" });
        const t = wf.nodes[0];
        const c1 = store.addNode(wf.id, {
          type: "command",
          label: "Step 1",
          config: { command: 'system.notify("Step 1")' },
          x: 250,
          y: 200,
        });
        const d = store.addNode(wf.id, {
          type: "delay",
          label: "Pause",
          config: { seconds: 1 },
          x: 430,
          y: 200,
        });
        const c2 = store.addNode(wf.id, {
          type: "command",
          label: "Step 2",
          config: { command: 'system.notify("Step 2")' },
          x: 610,
          y: 200,
        });
        const out = store.addNode(wf.id, {
          type: "output",
          label: "Done",
          config: { action: "log", message: "All steps done" },
          x: 790,
          y: 200,
        });
        store.addConnection(wf.id, t.id, c1.id);
        store.addConnection(wf.id, c1.id, d.id);
        store.addConnection(wf.id, d.id, c2.id);
        store.addConnection(wf.id, c2.id, out.id);
        const r = await workflowEngine.execute(wf.id);
        const w = store.getWorkflow(wf.id);
        const allResolved = [c1.id, d.id, c2.id, out.id].every(
          (id) => w.nodes.find((n) => n.id === id)?.status === "resolved",
        );
        return `T8 multi-step: ${r.success && allResolved ? "✅ PASS" : "❌ FAIL"}`;
      });

      // ── 9: Condition with field — Trigger → Cmd(windows.summary) → Condition(field=type, exists) → Output ──
      await run("T9 field-condition", async () => {
        const wf = store.createWorkflow({ name: "T9: Field Condition" });
        const t = wf.nodes[0];
        const cmd = store.addNode(wf.id, {
          type: "command",
          label: "Get Summary",
          config: { command: "system.windows.summary()" },
          x: 280,
          y: 200,
        });
        const c = store.addNode(wf.id, {
          type: "condition",
          label: "Check",
          config: { operator: "exists" },
          x: 500,
          y: 200,
        });
        const out = store.addNode(wf.id, {
          type: "output",
          label: "Result",
          config: { action: "log" },
          x: 720,
          y: 200,
        });
        store.addConnection(wf.id, t.id, cmd.id);
        store.addConnection(wf.id, cmd.id, c.id);
        store.addConnection(wf.id, c.id, out.id);
        const r = await workflowEngine.execute(wf.id);
        return `T9 field-condition: ${r.success ? "✅ PASS" : "❌ FAIL — " + r.error}`;
      });

      // ── 10: Output result object — verify output contains structured data ──
      await run("T10 output-object", async () => {
        const wf = store.createWorkflow({ name: "T10: Output Object" });
        const t = wf.nodes[0];
        const out = store.addNode(wf.id, {
          type: "output",
          label: "Final",
          config: { action: "log", message: "result: {{input}}" },
          x: 280,
          y: 200,
        });
        store.addConnection(wf.id, t.id, out.id);
        const r = await workflowEngine.execute(wf.id);
        const outN = store
          .getWorkflow(wf.id)
          .nodes.find((n) => n.id === out.id);
        const hasObj =
          outN?.output?._output === true &&
          outN.output.action === "log" &&
          outN.output.message &&
          outN.output.timestamp;
        return `T10 output-object: ${r.success && hasObj ? "✅ PASS" : "❌ FAIL — output=" + JSON.stringify(outN?.output).substring(0, 80)}`;
      });

      // Check execution logs exist
      const firstWf = store.workflows[store.workflows.length - 10];
      const logs = store.getLogs(firstWf?.id);
      results.push(
        `Logs check: ${logs.length > 0 ? "✅ " + logs.length + " log entries" : "❌ No logs"}`,
      );

      const summary = results.join("\n");
      const passed = results.filter((r) => r.includes("✅")).length;
      const total = results.length;
      addNotification(
        `Workflow tests: ${passed}/${total} passed`,
        passed === total ? "success" : "warning",
      );
      return summary;
    },
    { description: "Create and run 10 diverse test workflows" },
  );

  // === system.test — Test scenarios ===
  commandRegistry.register(
    "system.test.runAll",
    async () => {
      addNotification("Running all 5 test scenarios...", "info");
      const result = await runAllTests();
      addNotification(
        result,
        result.includes("passed") ? "success" : "warning",
      );
      return result;
    },
    { description: "Run all 5 active-widget test scenarios" },
  );

  commandRegistry.register(
    "system.test.run",
    async (num) => {
      if (!num) return "Provide a test number 1-5";
      addNotification(`Running test ${num}...`, "info");
      const result = await runTest(Number(num));
      addNotification(
        result,
        result.includes("passed") ? "success" : "warning",
      );
      return result;
    },
    { description: "Run a single test scenario (1-5)" },
  );
}

/** Build a short signature string capturing workflow count, enabled flags, and trigger configs.
 *  Used to detect when the engine needs to re-init its event listeners. */
function _workflowSignature(workflows) {
  return workflows
    .map((w) => {
      const triggers = w.nodes
        .filter(
          (n) => n.type === "trigger" && n.config?.triggerType === "event",
        )
        .map((n) => n.config.eventName || "")
        .join(",");
      return `${w.id}:${w.enabled ? 1 : 0}:${triggers}`;
    })
    .join("|");
}

export default function App() {
  const isCommandBarOpen = useCommandStore((s) => s.isCommandBarOpen);
  const toggleCommandBar = useCommandStore((s) => s.toggleCommandBar);
  const theme = useThemeStore((s) => s.theme);
  const [oniVisible, setOniVisible] = useState(true);

  useEffect(() => {
    // Register all commands on mount
    registerAllCommands();

    // Initialize the scheduler engine (client-side fallback)
    const { executeCommand } = useCommandStore.getState();
    schedulerService.init(
      () => useTaskStore.getState(),
      () => useNotificationStore.getState(),
      (cmd) => executeCommand(cmd, "scheduler"),
      {
        getWindowStore: () => useWindowStore.getState(),
        getWorkflowStore: () => useWorkflowStore.getState(),
      },
    );

    // serverSync removed — gateway handles state sync

    // Initialize workflow event listeners (auto-fire on event triggers)
    workflowEngine.initListeners();
    // Re-init listeners when workflows change (count, enabled flags, or trigger configs)
    let prevWfSignature = _workflowSignature(
      useWorkflowStore.getState().workflows,
    );
    const unsubWorkflows = useWorkflowStore.subscribe((state) => {
      const sig = _workflowSignature(state.workflows);
      if (sig !== prevWfSignature) {
        prevWfSignature = sig;
        workflowEngine.initListeners();
      }
    });

    // Listen for command:execute events from widgets (e.g. chat file links)
    const unsubCmdExec = eventBus.on("command:execute", (rawCmd) => {
      if (typeof rawCmd === "string") {
        commandRegistry.execute(rawCmd, "widget");
      }
    });

    // Emit system:boot event after all initialization
    setTimeout(() => {
      eventBus.emit("system:boot", {
        timestamp: Date.now(),
        windowCount: useWindowStore.getState().windows.length,
        workflowCount: useWorkflowStore.getState().workflows.length,
      });
      console.log("[OniOS] System boot complete — all kernel events wired");
    }, 3000);

    // Initialize theme
    const savedTheme = localStorage.getItem("onios-theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    // Global keyboard shortcut for command bar
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggleCommandBar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setOniVisible((v) => !v);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unsubWorkflows();
      unsubCmdExec();
      workflowEngine.stopListeners();
    };
  }, []);

  // Update data-theme on change
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <>
      <Desktop />
      <Taskbar />
      <CommandBar />
      <Notifications />
      <OniWidget visible={oniVisible} onClose={() => setOniVisible(false)} />
    </>
  );
}
