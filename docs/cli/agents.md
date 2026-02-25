---
summary: "CLI reference for `oni agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `oni agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
oni agents list
oni agents add work --workspace ~/.oni/workspace-work
oni agents set-identity --workspace ~/.oni/workspace --from-identity
oni agents set-identity --agent main --avatar avatars/oni.png
oni agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.oni/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
oni agents set-identity --workspace ~/.oni/workspace --from-identity
```

Override fields explicitly:

```bash
oni agents set-identity --agent main --name "OniAI" --emoji "🤖" --avatar avatars/oni.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "OniAI",
          theme: "midnight indigo",
          emoji: "🤖",
          avatar: "avatars/oni.png",
        },
      },
    ],
  },
}
```
