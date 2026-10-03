# Homeric DX for Cursor (`homeric-dx`)

Homeric DX is a developer-experience companion: Cursor's agent offers to log what slows you down as it happens, offers a numbers-only summary when a task ends, and records your monthly time split. Nothing is stored before you agree to the privacy promise, nothing the agent observed is sent before you confirm it, and only you see your own data (your team sees group numbers, for groups of 3 or more).

## Install

- **The plugin** (once it is listed in Cursor's plugin directory): Customize, find Homeric DX, Install.
- **For development**: copy this folder to `~/.cursor/plugins/local/homeric-dx/` and restart Cursor.
- **The server only**, without the skill, rule and hooks: open `cursor://anysphere.cursor-deeplink/mcp/install?name=homeric-dx&config=eyJ1cmwiOiJodHRwczovL21jcC5ob21lcmljLmFpL2R4In0=`.

Then ask the agent "what's my Homeric DX status?": the first call signs you in to your Homeric workspace and asks you to agree to the privacy promise.

## What it contains

| Part | What it does |
|---|---|
| `mcp.json` | The Homeric DX server, `https://mcp.homeric.ai/dx`. |
| `skills/dx-companion/` | When to check your DX status, offer to log friction, share a session summary and record your time split, and the privacy rules the agent follows. The same skill the server serves. |
| `rules/homeric-dx.mdc` | The same, short, always on: when to call `dx_status_get` and `dx_friction_log`. |
| `hooks/` | `session-digest.mjs` notes each terminal command and tool failure of the conversation in a log in your temp folder (command, duration, whether it failed), and when the agent stops, counts the session's numbers and asks the agent to offer them through `dx_signals_submit`, which shows you the summary to confirm or edit first. Once per conversation, only for a session of at least 10 minutes and 5 actions. Nothing leaves your machine but the numbers you confirm. Needs Node 18 or later. |
