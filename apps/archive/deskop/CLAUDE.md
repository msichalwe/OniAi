# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Oni is a desktop AI assistant built as an Electron app with React. It provides real-time multimodal awareness (screen capture, camera, microphone, ambient hearing) and maintains a persistent memory graph ("memory bubbles") across conversations. Uses OpenAI's API (GPT-4o/GPT-4o-mini for chat, GPT-4o Realtime for voice mode).

## Commands

- `npm run dev` - Start development with hot reload (electron-vite dev)
- `npm run build` - Build for production (electron-vite build)
- `npm run package` - Build and package with electron-builder
- No test runner is configured

## Architecture

**electron-vite** project with three process layers:

### Main Process (`src/main/index.ts`)
- Window: 1200x800 resizable, frameless with traffic lights
- System tray with toggle checkboxes for Ambient Listening, Screen Capture, Camera, Always-on-Top
- Global shortcut: Cmd+Shift+O to toggle window
- IPC: screen capture (1920x1080), keytar-backed API key storage, SQLite (better-sqlite3 WAL mode) for memory bubbles, system info, active window detection via osascript
- Tray-to-renderer sync via `tray-toggle` channel

### Preload (`src/preload/index.ts`)
Exposes `window.api` with: captureScreen, store, db (getBubbles/insertBubble/updateBubbleAccess/deleteBubble), window controls, system info, tray sync + onToggle listener. Types in `src/preload/index.d.ts`.

### Renderer (`src/renderer/`)
React 19 + Tailwind CSS 4 + Zustand. Multi-panel desktop layout:

**Layout:** Sidebar (64px) | Main Content (Chat or Memory panel) | MediaPanel (camera + screen, 288px, conditional)

**Components:**
- `Sidebar.tsx` - Navigation (chat/memory), voice mode, TTS, clear, logout
- `StatusBar.tsx` - Feature toggles (ambient, mic, camera, screen) + window controls
- `ChatPanel.tsx` - Messages, input, voice mode overlay, empty state
- `MediaPanel.tsx` - Camera video feed (720p) + screen capture preview
- `MemoryPanel.tsx` - Full memory browser with category filters, search, add/delete
- `LoginScreen.tsx` - API key entry

**State:** Zustand store with `AppMode`: `login -> idle -> listening -> thinking -> responding`

**Services:**
- `openai-realtime.ts` - Client singleton, RealtimeSession (voice), `streamResponse` (text chat), `streamAmbientResponse` (proactive), built-in rate limiter (15 req/min), uses gpt-4o-mini for text-only and gpt-4o when images attached
- `memory.ts` - Memory bubble CRUD with auto-linking by shared entities, `recallMemories` (keyword scoring), `extractAndStoreBubbles` (gpt-4o-mini entity extraction), `buildSystemPrompt` with memory context
- `tts.ts` - Web Speech Synthesis with `StreamSpeaker` for streaming
- `systemContext.ts` - OS/app context via IPC, 10s cache TTL
- `screenUnderstanding.ts` - Screen description via gpt-4o-mini vision (30s throttle)
- `cameraAwareness.ts` - Camera observation via gpt-4o-mini vision (60s throttle)

**Hooks:** `useMic`, `useCamera` (720p), `useScreenCapture`, `useVoiceMode`, `useAmbientListening` (2s silence buffer before triggering)

## Key Patterns

- Memory bubbles: `person | episode | preference | note | place | topic`, auto-linked by shared entities, stored in SQLite via IPC
- `streamResponse` is an async generator yielding `thinking | text | done | error` chunks
- Ambient listening uses Web Speech API with 2s silence buffer, then sends to `streamAmbientResponse` which decides whether to respond or `[SKIP]`
- Tray menu checkboxes sync bidirectionally with renderer via IPC
- `@renderer` path alias maps to `src/renderer/src`
- Two tsconfigs: `tsconfig.node.json` (main + preload), `tsconfig.web.json` (renderer)
