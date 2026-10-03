# Homeric plugins

Homeric's plugins for coding agents. Today there is one: **Homeric DX** (`homeric-dx`), the developer-experience companion.

Your agent offers to log what slows you down as it happens, shows you a numbers-only summary when a task ends, and records your monthly time split. Nothing is stored before you agree to the privacy promise, nothing your agent observed is sent before you confirm it, and only you see your own data. Your team sees group numbers, for groups of 3 or more.

More about Homeric DX: [homeric.ai/skills/dx](https://homeric.ai/skills/dx)

## Install

You need a Homeric workspace: the first call signs you in to it and asks you to agree to the privacy promise.

### Claude Code

```
/plugin marketplace add Homeric-ai/homeric-plugins
/plugin install homeric-dx@homeric
```

Then run `/homeric-dx:dx-status`.

### Codex (CLI, IDE extension, ChatGPT desktop app)

```bash
codex plugin marketplace add Homeric-ai/homeric-plugins
codex plugin add homeric-dx@homeric
```

Then, in Codex, run `/hooks` and trust `homeric-dx`'s `Stop` hook once (Codex runs a plugin's hooks only after you review them), and ask "what's my Homeric DX status?".

### Cursor

Until Homeric DX is listed in Cursor's plugin directory, copy the `cursor/homeric-dx` folder of this repository to `~/.cursor/plugins/local/homeric-dx/` and restart Cursor. Or add only the server, without the skill, rule and hooks: [install in Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=homeric-dx&config=eyJ1cmwiOiJodHRwczovL21jcC5ob21lcmljLmFpL2R4In0=).

### VS Code

VS Code's agent plugins read the Claude Code plugin format: add this repository as a plugin marketplace and install `homeric-dx`, or add only the server with `vscode:mcp/install?%7B%22name%22%3A%22homeric-dx%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.homeric.ai%2Fdx%22%7D`. Use the **Local** agent harness.

### Claude (web and Desktop)

Add a custom connector with the URL `https://mcp.homeric.ai/dx`.

## The privacy promise

Before Homeric DX stores anything, it asks you to agree to this:

- **Only you see your own data:** leaders see group numbers only, never for a group under 3, and nobody is ranked.
- **Not stored under your name:** a pseudonym for this workspace, whose key stays in WorkOS Vault, never next to your account.
- **Nothing leaves without you:** only the counts, durations and categories you confirm, never code, files or conversations.
- **Yours to see and delete:** you can see, export or delete everything about you at any time.
- **Never for performance reviews:** it is for improving how your team works, not for evaluating you.

You can ask your agent at any time what Homeric DX knows about you, to export it, or to delete it all.

## What is in this repository

| Path | What it is |
|---|---|
| `.claude-plugin/marketplace.json` | The Claude Code marketplace (`homeric`), also read by VS Code. |
| `homeric-dx/` | The plugin for Claude Code and VS Code: the Homeric DX server, the `dx-companion` skill, the `/dx-status` and `/dx-checkin` commands, and the session-summary hook. |
| `.agents/plugins/marketplace.json` | The Codex marketplace (`homeric`). |
| `codex/homeric-dx/` | The plugin for Codex. |
| `cursor/homeric-dx/` | The plugin for Cursor. |
| `LICENSE` | The license, also in each plugin's folder. |

Each plugin's own README says what each part does. The session-summary hook (`hooks/session-digest.mjs`) counts a session's numbers on your machine from your agent's own transcript; the transcript never leaves your machine, only the numbers you confirm.

## License

Proprietary, see [LICENSE](LICENSE). You may install these plugins and use them to connect to Homeric's services; you may not otherwise copy, modify or redistribute them.
