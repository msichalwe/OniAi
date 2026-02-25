---
summary: "CLI reference for `oni daemon` (legacy alias for gateway service management)"
read_when:
  - You still use `oni daemon ...` in scripts
  - You need service lifecycle commands (install/start/stop/restart/status)
title: "daemon"
---

# `oni daemon`

Legacy alias for Gateway service management commands.

`oni daemon ...` maps to the same service control surface as `oni gateway ...` service commands.

## Usage

```bash
oni daemon status
oni daemon install
oni daemon start
oni daemon stop
oni daemon restart
oni daemon uninstall
```

## Subcommands

- `status`: show service install state and probe Gateway health
- `install`: install service (`launchd`/`systemd`/`schtasks`)
- `uninstall`: remove service
- `start`: start service
- `stop`: stop service
- `restart`: restart service

## Common options

- `status`: `--url`, `--token`, `--password`, `--timeout`, `--no-probe`, `--deep`, `--json`
- `install`: `--port`, `--runtime <node|bun>`, `--token`, `--force`, `--json`
- lifecycle (`uninstall|start|stop|restart`): `--json`

## Prefer

Use [`oni gateway`](/cli/gateway) for current docs and examples.
