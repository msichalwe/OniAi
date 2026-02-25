---
summary: "Uninstall OniAI completely (CLI, service, state, workspace)"
read_when:
  - You want to remove OniAI from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `oni` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
oni uninstall
```

Non-interactive (automation / npx):

```bash
oni uninstall --all --yes --non-interactive
npx -y oni uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
oni gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
oni gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${ONI_STATE_DIR:-$HOME/.oni}"
```

If you set `ONI_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.oni/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g oni
pnpm remove -g oni
bun remove -g oni
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/OniAI.app
```

Notes:

- If you used profiles (`--profile` / `ONI_PROFILE`), repeat step 3 for each state dir (defaults are `~/.oni-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `oni` is missing.

### macOS (launchd)

Default label is `ai.oni.gateway` (or `ai.oni.<profile>`; legacy `com.oni.*` may still exist):

```bash
launchctl bootout gui/$UID/ai.oni.gateway
rm -f ~/Library/LaunchAgents/ai.oni.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.oni.<profile>`. Remove any legacy `com.oni.*` plists if present.

### Linux (systemd user unit)

Default unit name is `oni-gateway.service` (or `oni-gateway-<profile>.service`):

```bash
systemctl --user disable --now oni-gateway.service
rm -f ~/.config/systemd/user/oni-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `OniAI Gateway` (or `OniAI Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "OniAI Gateway"
Remove-Item -Force "$env:USERPROFILE\.oni\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.oni-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://oni.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g oni@latest`.
Remove it with `npm rm -g oni` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `oni ...` / `bun run oni ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
