---
summary: "CLI reference for `oni logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `oni logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
oni logs
oni logs --follow
oni logs --json
oni logs --limit 500
oni logs --local-time
oni logs --follow --local-time
```

Use `--local-time` to render timestamps in your local timezone.
