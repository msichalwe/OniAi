# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases  
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras
- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH
- home-server → 192.168.1.100, user: admin

### TTS
- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

### Credentials
- **Gmail:** `onisichalwe@gmail.com` / `oni123R10@` (Used for platform signups and HaileyHub automation)

---

Add whatever helps you do your job. This is your cheat sheet.

## OniOS Action API

When running inside OniOS, ALL tool execution goes through the REST API:
`POST http://localhost:5173/api/oni/actions/{action}`

Actions: task, window, note, terminal, file, notification, search, storage, system, scheduler, workflow

Examples:
- Open terminal: `{"action":"open","widgetType":"terminal"}` → /actions/window
- Create task: `{"action":"create","title":"...","priority":"high"}` → /actions/task
- Run command: `{"action":"run","command":"ls -la"}` → /actions/terminal
- Create note: `{"action":"create","title":"...","content":"..."}` → /actions/note

NEVER run native commands. ALWAYS use the action API.
