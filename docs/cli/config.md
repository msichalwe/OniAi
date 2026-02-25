---
summary: "CLI reference for `oni config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `oni config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `oni configure`).

## Examples

```bash
oni config get browser.executablePath
oni config set browser.executablePath "/usr/bin/google-chrome"
oni config set agents.defaults.heartbeat.every "2h"
oni config set agents.list[0].tools.exec.node "node-id-or-name"
oni config unset tools.web.search.apiKey
```

## Paths

Paths use dot or bracket notation:

```bash
oni config get agents.defaults.workspace
oni config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
oni config get agents.list
oni config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--strict-json` to require JSON5 parsing. `--json` remains supported as a legacy alias.

```bash
oni config set agents.defaults.heartbeat.every "0m"
oni config set gateway.port 19001 --strict-json
oni config set channels.whatsapp.groups '["*"]' --strict-json
```

Restart the gateway after edits.
