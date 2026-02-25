---
summary: "CLI reference for `oni voicecall` (voice-call plugin command surface)"
read_when:
  - You use the voice-call plugin and want the CLI entry points
  - You want quick examples for `voicecall call|continue|status|tail|expose`
title: "voicecall"
---

# `oni voicecall`

`voicecall` is a plugin-provided command. It only appears if the voice-call plugin is installed and enabled.

Primary doc:

- Voice-call plugin: [Voice Call](/plugins/voice-call)

## Common commands

```bash
oni voicecall status --call-id <id>
oni voicecall call --to "+15555550123" --message "Hello" --mode notify
oni voicecall continue --call-id <id> --message "Any questions?"
oni voicecall end --call-id <id>
```

## Exposing webhooks (Tailscale)

```bash
oni voicecall expose --mode serve
oni voicecall expose --mode funnel
oni voicecall expose --mode off
```

Security note: only expose the webhook endpoint to networks you trust. Prefer Tailscale Serve over Funnel when possible.
