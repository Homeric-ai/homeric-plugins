# Homeric DX for coding agents (`homeric-dx`)

Homeric DX is a developer-experience companion: your agent offers to log what slows you down as it happens, shows you a numbers-only summary when a task ends, and records your monthly time split. Nothing is stored before you agree to the privacy promise, nothing your agent observed is sent before you confirm it, and only you see your own data (your team sees group numbers, for groups of 3 or more).

This plugin connects your agent to Homeric DX (`https://mcp.homeric.ai/dx`) and gives it the `dx-companion` skill and two commands, `/dx-status` and `/dx-checkin`.

## Install

**Claude Code** (from the Homeric marketplace, [Homeric-ai/homeric-plugins](https://github.com/Homeric-ai/homeric-plugins)):

```
/plugin marketplace add Homeric-ai/homeric-plugins
/plugin install homeric-dx@homeric
```

(or, from a terminal: `claude plugin marketplace add Homeric-ai/homeric-plugins` then `claude plugin install homeric-dx@homeric`)

Then run `/homeric-dx:dx-status`: the first call signs you in to your Homeric workspace and asks you to agree to the privacy promise.

**VS Code** (agent plugins read this same Claude plugin format): install the plugin from the marketplace, or add only the server with this link: `vscode:mcp/install?%7B%22name%22%3A%22homeric-dx%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.homeric.ai%2Fdx%22%7D`. Use the **Local** agent harness: the Copilot harness does not reach signed-in remote servers.

**Claude (web and Desktop)**: where your organization runs plugins, install it there; otherwise add a custom connector with the URL `https://mcp.homeric.ai/dx`.

## What it contains

| Part | What it does |
|---|---|
| `.mcp.json` | The Homeric DX server, `https://mcp.homeric.ai/dx` (sign-in through your Homeric workspace). |
| `skills/dx-companion/` | When to check your DX status, offer to log friction, share a session summary and record your time split, and the privacy rules your agent follows. The same skill the server serves. |
| `commands/dx-status.md` | `/dx-status`: your status, and the privacy promise the first time. |
| `commands/dx-checkin.md` | `/dx-checkin`: the weekly check-in, in a panel where your client shows one, else on a check-in page it links to. |
| `hooks/` | `session-start.mjs`, at the start of the first session of the day on your machine, asks your agent to call `dx_status_get` quietly, without holding up your first request: the first time it asks you to agree to the privacy promise, and when your weekly check-in is due it offers it once, after your request is done. It makes no network call itself, and `HOMERIC_DX_SESSION_START=off` turns it off. At the end of a task, `session-digest.mjs` counts the session's numbers on your machine (time waiting on builds and tests, flaky retries, tool failures, empty searches, corrections, reverted edits) from your agent's own transcript, and asks your agent to offer them through `dx_signals_submit`, which asks you to confirm or edit them first. Once per session, and only for a session of at least 10 minutes and 5 actions. The transcript never leaves your machine. Needs Node 18 or later. |


## Your data

You can ask your agent at any time what Homeric DX knows about you, to export it, or to delete it all.
