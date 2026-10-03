# Homeric DX for Codex (`homeric-dx`)

Homeric DX is a developer-experience companion: Codex offers to log what slows you down as it happens, shows you a numbers-only summary when a task ends, and records your monthly time split. Nothing is stored before you agree to the privacy promise, nothing Codex observed is sent before you confirm it, and only you see your own data (your team sees group numbers, for groups of 3 or more).

This plugin works in the Codex CLI, the IDE extension and the ChatGPT desktop app.

## Install

```bash
codex plugin marketplace add Homeric-ai/homeric-plugins
codex plugin add homeric-dx@homeric
```

Then, in Codex:

1. **Trust the session hook once**: run `/hooks`, review `homeric-dx`'s `Stop` hook, and trust it. Codex runs a plugin's hooks only after you have reviewed them, and again after any change.
2. Ask "what's my Homeric DX status?": the first call signs you in to your Homeric workspace and asks you to agree to the privacy promise.

Optional, in `~/.codex/config.toml`, so Codex does not ask before the tools that only read your own data:

```toml
[plugins."homeric-dx@homeric".mcp_servers.homeric-dx.tools.dx_status_get]
approval_mode = "approve"

[plugins."homeric-dx@homeric".mcp_servers.homeric-dx.tools.dx_insights_get]
approval_mode = "approve"

[plugins."homeric-dx@homeric".mcp_servers.homeric-dx.tools.dx_data_get]
approval_mode = "approve"
```

## What it contains

| Part | What it does |
|---|---|
| `.mcp.json` | The Homeric DX server, `https://mcp.homeric.ai/dx` (sign-in through your Homeric workspace). |
| `skills/dx-companion/` | When to check your DX status, offer to log friction, share a session summary and record your time split, and the privacy rules Codex follows. The same skill the server serves. |
| `hooks/` | At the end of a task, `session-digest.mjs` counts the session's numbers on your machine from Codex's own session log, and asks Codex to offer them through `dx_signals_submit`, which shows you the summary to confirm or edit first. Once per session, and only for a session of at least 10 minutes and 5 actions. The session log never leaves your machine. Needs Node 18 or later. |

Codex shows forms only with its `mcp_2026_07_28` feature; without it, Homeric DX asks in chat and you answer there.
