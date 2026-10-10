#!/usr/bin/env node
// Homeric DX at the start of a session: at most once a day on this machine,
// ask the agent to call dx_status_get quietly. Its result is where Homeric DX
// asks for consent to the privacy promise the first time, and where it
// offers the weekly check-in when it is due (the server keeps the rules: once
// a day per person, from Wednesday, not before a day the person named, never
// once the week's check-in is done).
//
// Run as the agent's session-start hook. It makes no network call and reads
// no transcript: it prints the words in session-start.txt (next to this
// file) as context for the agent, and stays silent otherwise, so it never
// holds up the session. The agent is told not to let the call hold up the
// person's first request either.
//
//   node session-start.mjs [--client claude-code|codex|cursor]
//
// Claude Code (and VS Code, which runs Claude-format plugin hooks) and Codex
// read `hookSpecificOutput.additionalContext` from a SessionStart hook;
// Cursor reads `additional_context` from its sessionStart hook.
// HOMERIC_DX_SESSION_START=off turns it off. No dependencies; Node 18 or later.

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The local day, YYYY-MM-DD: "once a day" is the person's day. */
export function localDay(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The hook's answer in each client's format, or null for a client it does not know. */
export function hookOutput(client, context) {
  if (client === 'cursor') return { additional_context: context };
  if (client === 'claude-code' || client === 'codex') {
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } };
  }
  return null;
}

/**
 * Claim today on this machine. True only for the first session of the day:
 * the marker is created exclusively, so two sessions starting together do not
 * both claim it. Earlier days' markers are removed.
 */
export function claimToday(dir, day) {
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(join(dir, day), new Date().toISOString(), { flag: 'wx' });
  } catch {
    return false;
  }
  for (const name of readdirSync(dir)) {
    if (name !== day) rmSync(join(dir, name), { force: true });
  }
  return true;
}

function main() {
  if (String(process.env.HOMERIC_DX_SESSION_START ?? '').toLowerCase() === 'off') return;
  const arg = process.argv.indexOf('--client');
  const client = arg > 0 ? process.argv[arg + 1] : 'claude-code';
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return; // not a hook call we understand: stay silent
  }
  // A background agent (Cursor) has nobody to ask or to offer anything to.
  if (input.is_background_agent === true) return;
  const here = dirname(fileURLToPath(import.meta.url));
  const context = readFileSync(join(here, 'session-start.txt'), 'utf8').trim();
  const out = hookOutput(client, context);
  if (!context || !out) return;
  if (!claimToday(join(tmpdir(), 'homeric-dx-session-start'), localDay())) return;
  process.stdout.write(JSON.stringify(out));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch {
    // The start of a session must never fail because of Homeric DX: stay silent.
  }
}
