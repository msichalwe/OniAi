# OniAI Server Deployment & Infrastructure

## Server Details

| Field | Value |
|---|---|
| **Hostname** | `srv1318794.hstgr.cloud` |
| **IP** | `76.13.32.166` |
| **OS** | Ubuntu 25.10 (Questing Quokka) |
| **Plan** | KVM 4 |
| **RAM** | 16 GB |
| **Disk** | 193 GB |
| **Node** | v22.22.0 |
| **pnpm** | installed globally |
| **Git** | 2.51.0 |
| **SSH** | `ssh root@76.13.32.166` |
| **Renewal** | 2026-04-01 |

---

## Oni Installation on Server

### Directory Layout

```
/opt/oni/                    # Oni source code (cloned from GitHub)
├── dist/                    # Built output
├── src/                     # Source code
├── scripts/
│   └── deploy.sh            # Auto-deploy script (called by GitHub Actions)
├── package.json
└── pnpm-lock.yaml

/root/.oni/                  # Oni runtime data
├── oni.json                 # Main config
├── exec-approvals.json      # Exec security config (supervised mode)
├── logs/
│   ├── gateway.log          # Gateway stdout
│   └── gateway.err.log      # Gateway stderr
├── sessions/                # Session transcripts
└── workspace/               # Agent workspace
    ├── AGENTS.md             # Agent behavior rules
    ├── SOUL.md               # Personality / identity
    ├── TOOLS.md              # Local tool notes + macOS automation reference
    ├── HEARTBEAT.md          # Proactive check-in tasks
    ├── IDENTITY.md           # Bot identity
    ├── USER.md               # User profile
    ├── MEMORY.md             # Long-term memory
    ├── BOOTSTRAP.md          # First-run instructions
    └── memory/               # Daily memory files (memory/YYYY-MM-DD.md)
```

### Initial Setup (done once)

```bash
# SSH into server
ssh root@76.13.32.166

# Clone repo
cd /opt
git clone https://github.com/msichalwe/OniAi.git oni

# Install deps
cd /opt/oni
pnpm install

# Create A2UI stub (headless server doesn't need canvas UI)
mkdir -p src/canvas-host/a2ui
echo "// stub" > src/canvas-host/a2ui/a2ui.bundle.js

# Build
pnpm build

# Create runtime directories
mkdir -p /root/.oni/workspace/memory /root/.oni/logs /root/.oni/sessions
```

### Configuration

The main config lives at `/root/.oni/oni.json`. Key settings:

```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "openai-codex/gpt-5.3-codex" },
      "workspace": "/root/.oni/workspace",
      "compaction": { "mode": "safeguard" },
      "maxConcurrent": 4,
      "subagents": { "maxConcurrent": 8 }
    }
  },
  "messages": {
    "tts": {
      "auto": "inbound",
      "provider": "openai",
      "openai": { "model": "gpt-4o-mini-tts", "voice": "nova" }
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "pairing",
      "botToken": "<TELEGRAM_BOT_TOKEN>",
      "reactionLevel": "extensive",
      "reactionNotifications": "all"
    }
  },
  "gateway": {
    "port": 19100,
    "mode": "local",
    "bind": "lan",
    "controlUi": { "enabled": false }
  }
}
```

### Exec Security

`/root/.oni/exec-approvals.json` — set to `supervised` mode:

```json
{
  "version": 1,
  "defaults": {
    "security": "supervised",
    "ask": "on-miss",
    "autoAllowSkills": true
  }
}
```

**Supervised mode** auto-approves read-only commands (`ls`, `cat`, `grep`, `git status`, etc.) and prompts for mutating commands (`rm`, `sudo`, `npm install`, etc.). All decisions are logged to `~/.oni/trust-journal.jsonl`.

---

## Systemd Service

The gateway runs as a systemd service for auto-start and crash recovery.

### Service File

`/etc/systemd/system/oni-gateway.service`:

```ini
[Unit]
Description=OniAI Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/oni
ExecStart=/usr/bin/node /opt/oni/dist/entry.js gateway run --bind lan --port 19100 --force
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=HOME=/root
StandardOutput=append:/root/.oni/logs/gateway.log
StandardError=append:/root/.oni/logs/gateway.err.log

[Install]
WantedBy=multi-user.target
```

### Service Commands

```bash
# Start
systemctl start oni-gateway

# Stop
systemctl stop oni-gateway

# Restart
systemctl restart oni-gateway

# Status
systemctl status oni-gateway

# View logs
tail -f /root/.oni/logs/gateway.log
tail -f /root/.oni/logs/gateway.err.log

# Enable auto-start on boot
systemctl enable oni-gateway

# Disable auto-start
systemctl disable oni-gateway
```

---

## GitHub Actions — Auto Deploy

Every push to `main` automatically deploys to the server.

### Workflow

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Server

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Deploy to server via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: 76.13.32.166
          username: root
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: /opt/oni/scripts/deploy.sh
```

### Deploy Script

`/opt/oni/scripts/deploy.sh` (runs on the server):

```bash
#!/bin/bash
set -e
cd /opt/oni
git pull origin main
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
mkdir -p src/canvas-host/a2ui
[ -f src/canvas-host/a2ui/a2ui.bundle.js ] || echo "// stub" > src/canvas-host/a2ui/a2ui.bundle.js
pnpm build
systemctl restart oni-gateway
sleep 5
systemctl status oni-gateway --no-pager | head -10
```

### GitHub Secrets

| Secret | Description |
|---|---|
| `DEPLOY_SSH_KEY` | SSH private key (`/root/.ssh/id_deploy`) for server access |

### Deploy Flow

```
Developer pushes to main
        ↓
GitHub Actions triggers "Deploy to Server"
        ↓
SSH into root@76.13.32.166
        ↓
git pull → pnpm install → pnpm build → systemctl restart oni-gateway
        ↓
Gateway restarts with new code (~10 seconds downtime)
```

### Manual Deploy

```bash
# From your local machine
ssh root@76.13.32.166 "/opt/oni/scripts/deploy.sh"

# Or trigger via GitHub Actions UI
# Go to Actions → "Deploy to Server" → "Run workflow"
```

---

## Telegram Bot

| Field | Value |
|---|---|
| **Bot** | `@oniv2_mwansa_bot` |
| **Running on** | Cloud server (76.13.32.166) |
| **DM Policy** | `pairing` (users must pair first) |
| **Group Policy** | `allowlist` |
| **Reactions** | `extensive` (reacts to messages liberally) |
| **Reaction Notifications** | `all` (sees all reactions, not just on own messages) |

### Important: Bot Token Conflict

A Telegram bot token can only be used by **one** gateway at a time. The token is currently active on the cloud server. If you want to run Telegram locally instead:

1. **On local machine**: Set `channels.telegram.enabled: true` in `~/.oni/oni.json`
2. **On server**: Set `channels.telegram.enabled: false` via SSH or deploy
3. Restart both gateways

Current state:
- **Local Mac**: Telegram disabled (`enabled: false`)
- **Cloud server**: Telegram enabled (`enabled: true`)

---

## TTS (Voice Notes)

| Setting | Value |
|---|---|
| **Provider** | OpenAI |
| **Model** | `gpt-4o-mini-tts` |
| **Voice** | `nova` (warm, natural) |
| **Auto Mode** | `inbound` (responds with voice when user sends voice) |
| **Max Text** | 4096 chars |

The old `edge` TTS (Microsoft) was robotic. OpenAI's `gpt-4o-mini-tts` with the `nova` voice is much more natural and expressive.

---

## Agentic Features (Phases 1-10)

All of these are active on the server:

| Feature | Description |
|---|---|
| **Task Queue** | `task` tool — persistent autonomous work queue, heartbeat-driven |
| **Plan Tool** | `plan` tool — structured multi-step planning, survives compaction |
| **Delegate Tool** | `delegate` tool — fire-and-forget sub-agent delegation |
| **System Health** | `system_health` tool — self-monitoring, auto-recovery |
| **Event Bus** | Typed triggers for webhooks, file watchers, system monitors |
| **Supervised Exec** | Auto-approve reads, prompt for mutations, trust journal |
| **Project Scanner** | Auto-detect tech stack, scripts, structure from any project |
| **Coding Agents** | Integration with Claude Code, Codex, Aider CLIs |
| **Auto-Memory** | Structured daily memory extraction, session bridging |
| **Proactive Research** | Agent gathers context before answering |
| **Learning Loop** | Agent auto-saves discoveries to MEMORY.md |
| **Alive Personality** | Proactive heartbeat tasks, morning greetings, curiosity |

---

## Troubleshooting

### Gateway won't start

```bash
# Check logs
tail -50 /root/.oni/logs/gateway.err.log

# Common issues:
# - "gateway.bind: Invalid input" → must be "loopback", "lan", "auto", "custom", or "tailnet"
# - "controlUi requires allowedOrigins" → set controlUi.enabled: false for headless servers
# - Port already in use → kill stale process: pkill -f oni-gateway
```

### Telegram not connecting

```bash
# Check if bot token is valid
tail -20 /root/.oni/logs/gateway.log | grep telegram

# Check if another gateway is using the same token
# Only ONE gateway can use a Telegram bot token at a time
```

### Deploy failing

```bash
# Check GitHub Actions logs at:
# https://github.com/msichalwe/OniAi/actions

# Manual deploy:
ssh root@76.13.32.166 "/opt/oni/scripts/deploy.sh"

# If build fails (A2UI missing):
ssh root@76.13.32.166 "mkdir -p /opt/oni/src/canvas-host/a2ui && echo '// stub' > /opt/oni/src/canvas-host/a2ui/a2ui.bundle.js"
```

### View live logs

```bash
# Gateway output
ssh root@76.13.32.166 "tail -f /root/.oni/logs/gateway.log"

# Gateway errors
ssh root@76.13.32.166 "tail -f /root/.oni/logs/gateway.err.log"

# System service
ssh root@76.13.32.166 "journalctl -u oni-gateway -f"
```

### Restart everything

```bash
ssh root@76.13.32.166 "systemctl restart oni-gateway && sleep 5 && systemctl status oni-gateway --no-pager | head -10"
```

---

## SSH Quick Reference

```bash
# Connect to server
ssh root@76.13.32.166

# Run a command remotely
ssh root@76.13.32.166 "systemctl status oni-gateway"

# Upload a file
scp local-file.txt root@76.13.32.166:/root/.oni/workspace/

# Download a file
scp root@76.13.32.166:/root/.oni/workspace/MEMORY.md ./

# Sync workspace to server
scp -r ~/.oni/workspace/*.md root@76.13.32.166:/root/.oni/workspace/
```
