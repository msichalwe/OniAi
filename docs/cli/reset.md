---
summary: "CLI reference for `oni reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `oni reset`

Reset local config/state (keeps the CLI installed).

```bash
oni reset
oni reset --dry-run
oni reset --scope config+creds+sessions --yes --non-interactive
```
