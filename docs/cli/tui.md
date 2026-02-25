---
summary: "CLI reference for `oni tui` (terminal UI connected to the Gateway)"
read_when:
  - You want a terminal UI for the Gateway (remote-friendly)
  - You want to pass url/token/session from scripts
title: "tui"
---

# `oni tui`

Open the terminal UI connected to the Gateway.

Related:

- TUI guide: [TUI](/web/tui)

## Examples

```bash
oni tui
oni tui --url ws://127.0.0.1:19100 --token <token>
oni tui --session main --deliver
```
