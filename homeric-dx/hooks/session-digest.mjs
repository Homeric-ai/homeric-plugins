#!/usr/bin/env node
// Homeric DX session digest: the numbers of a coding session,
// computed on this machine from the agent's own transcript, at the end of a
// task. The transcript never leaves the machine: only the numbers below do,
// and only through dx_signals_submit, which asks the person to confirm them
// first ("y / edit / n").
//
// Run as the agent's Stop hook. It reads the hook input on stdin, reads the
// transcript it points to, and, once per session and only for a session
// worth summarizing, asks the agent to offer the summary. Otherwise it says
// nothing and the agent stops as usual.
//
//   node session-digest.mjs [--client claude-code|codex|cursor] [--record]
//
// No dependencies; Node 18 or later. Readers: Claude Code (and VS Code, which
// runs Claude-format plugin hooks), Codex, Cursor. Cursor's transcript holds
// the prompts and tool calls but no results and no times, so in Cursor this
// script also runs as its afterShellExecution and postToolUseFailure hooks
// (`--record`), appending each command and failure to a log in the temp
// folder that its stop hook then reads; Cursor's stop hook answers with a
// `followup_message` instead of `decision: block`.

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Normalized events: what both readers produce, all the digest needs.
//   { kind: 'prompt', at, text }                 a person's message
//   { kind: 'cmd', at, end, command, failed, output }   a shell command
//   { kind: 'tool', at, end, name, failed, empty }      any other tool call
//   { kind: 'edit', at }                          the agent changed a file
// ---------------------------------------------------------------------------

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'apply_patch']);
const SEARCH_TOOLS = new Set(['Grep', 'Glob']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'shell', 'exec_command', 'local_shell']);

const ms = (t) => Date.parse(t);

function parseLines(text) {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Claude Code's transcript (one JSON object per line: user and assistant messages). */
export function readClaudeCode(text) {
  const events = [];
  const pending = new Map();
  for (const o of parseLines(text)) {
    if (o.type !== 'user' && o.type !== 'assistant') continue;
    const at = ms(o.timestamp);
    const content = o.message?.content;
    if (o.type === 'user' && typeof content === 'string') {
      if (!o.isMeta && !content.startsWith('<command-'))
        events.push({ kind: 'prompt', at, text: content });
      continue;
    }
    for (const b of Array.isArray(content) ? content : []) {
      if (b.type === 'text' && o.type === 'user' && !o.isMeta) {
        if (!String(b.text).startsWith('<')) events.push({ kind: 'prompt', at, text: b.text });
      } else if (b.type === 'tool_use') {
        pending.set(b.id, { at, name: b.name, input: b.input ?? {} });
      } else if (b.type === 'tool_result') {
        const use = pending.get(b.tool_use_id);
        if (!use) continue;
        const output =
          typeof b.content === 'string'
            ? b.content
            : (b.content ?? []).map((x) => x?.text ?? '').join(' ');
        const failed = b.is_error === true;
        if (SHELL_TOOLS.has(use.name)) {
          events.push({
            kind: 'cmd',
            at: use.at,
            end: at,
            command: String(use.input.command ?? ''),
            failed,
            output,
          });
        } else {
          if (EDIT_TOOLS.has(use.name) && !failed) events.push({ kind: 'edit', at });
          events.push({
            kind: 'tool',
            at: use.at,
            end: at,
            name: use.name,
            failed,
            empty:
              SEARCH_TOOLS.has(use.name) &&
              /^(No files found|No matches found)/.test(output.trim()),
          });
        }
      }
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

/** The command of a Codex tool call: `exec_command({cmd:"..."})` (0.15x) or `shell` arguments. */
function codexCommand(p) {
  if (p.type === 'custom_tool_call') {
    const m = /cmd:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/.exec(String(p.input ?? ''));
    if (!m) return null;
    return m[1].startsWith('"') ? JSON.parse(m[1]) : m[1].slice(1, -1);
  }
  try {
    const args = JSON.parse(p.arguments ?? '{}');
    const c = args.command ?? args.cmd;
    return Array.isArray(c) ? c.join(' ') : c == null ? null : String(c);
  } catch {
    return null;
  }
}

/** The exit code and output of a Codex tool result. */
function codexResult(p) {
  const raw = Array.isArray(p.output)
    ? p.output.map((x) => x?.text ?? '').join('\n')
    : String(p.output ?? '');
  const json = raw.match(/\{[\s\S]*"exit_code"[\s\S]*\}/)?.[0];
  if (json) {
    try {
      const r = JSON.parse(json);
      return { exit: r.exit_code ?? r.metadata?.exit_code ?? 0, output: String(r.output ?? '') };
    } catch {
      // fall through
    }
  }
  const exit = /exit[_ ]code["\s:]+(-?\d+)/i.exec(raw);
  return { exit: exit ? Number(exit[1]) : 0, output: raw };
}

/** Cursor's transcript: the person's prompts (the commands and failures come from recordLog). */
export function readCursorPrompts(text, at) {
  const events = [];
  for (const o of parseLines(text)) {
    if (o.role !== 'user') continue;
    for (const b of o.message?.content ?? []) {
      const query = /<user_query>([\s\S]*?)<\/user_query>/.exec(String(b?.text ?? ''));
      if (query) events.push({ kind: 'prompt', at, text: query[1].trim() });
    }
  }
  return events;
}

/** One Cursor hook event (afterShellExecution, postToolUseFailure), as a normalized event. */
export function cursorEvent(input, now) {
  const duration = Number(input.duration) || 0;
  if (input.hook_event_name === 'afterShellExecution') {
    const output = String(input.output ?? '');
    return {
      kind: 'cmd',
      at: now - duration,
      end: now,
      command: String(input.command ?? ''),
      // Cursor gives no exit code here: a failure shows in the output.
      failed:
        /exit(?:ed)?(?: with)? code:? [1-9]|command not found|is not recognized as|npm ERR!|\bFAIL(?:ED)?\b/i.test(
          output,
        ),
      output: output.slice(-2000),
    };
  }
  if (input.hook_event_name === 'postToolUseFailure') {
    return {
      kind: 'tool',
      at: now - duration,
      end: now,
      name: String(input.tool_name ?? ''),
      failed: true,
      empty: false,
    };
  }
  return null;
}

/** Codex's session log (rollout-*.jsonl). */
export function readCodex(text) {
  const events = [];
  const pending = new Map();
  for (const o of parseLines(text)) {
    const p = o.payload ?? {};
    const at = ms(o.timestamp);
    if (o.type !== 'response_item') continue;
    if (p.type === 'message' && p.role === 'user') {
      const t = (p.content ?? []).map((x) => x?.text ?? '').join(' ');
      if (!t.startsWith('<')) events.push({ kind: 'prompt', at, text: t });
    } else if (p.type === 'custom_tool_call' || p.type === 'function_call') {
      pending.set(p.call_id, { at, name: p.name, command: codexCommand(p) });
    } else if (p.type === 'custom_tool_call_output' || p.type === 'function_call_output') {
      const use = pending.get(p.call_id);
      if (!use) continue;
      if (use.name === 'apply_patch') {
        events.push({ kind: 'edit', at });
      } else if (use.command !== null) {
        const r = codexResult(p);
        events.push({
          kind: 'cmd',
          at: use.at,
          end: at,
          command: use.command,
          failed: r.exit !== 0,
          output: r.output,
        });
      }
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------------------
// The digest: numbers only.
// ---------------------------------------------------------------------------

const TEST_OR_BUILD =
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|ci|lint|typecheck|check)\b|\b(vitest|jest|pytest|mocha|tsc|playwright|cypress)\b|\bgo\s+(test|build|vet)\b|\bcargo\s+(test|build|check|clippy)\b|\b(mvn|gradle|gradlew)\b|\bdotnet\s+(test|build)\b|\bmake\b|\bgh\s+(run\s+watch|pr\s+checks)\b/i;
// A command that never ran (refused, or not installed): a tool failure, whatever it was.
const DID_NOT_RUN =
  /requires approval|blocked by policy|command not found|is not recognized as|Exit code 127|permission denied/i;
// Other environment failures, for commands that are not a build or a test.
const ENV_FAILURE = /EACCES|ENOENT|ECONNREFUSED|ETIMEDOUT|network|certificate/i;
const SEARCH_COMMAND = /^\s*(rg|grep|git\s+grep|findstr|ag|ack)\b|Select-String/i;
const REVERT = /\bgit\s+(checkout\s+--|restore\b|revert\b|reset\s+--hard)/i;
const CORRECTION =
  /^\s*(no\b|nope\b|don'?t\b|do not\b|stop\b|wrong\b|that'?s not\b|that is not\b|not like that\b|instead\b|actually\b|revert\b|undo\b)/i;
const IDLE_GAP_MS = 10 * 60_000;

const minutes = (msValue) => Math.round(msValue / 60_000);

/** The numbers of a session. Null where the transcript cannot say. */
export function digest(events, client) {
  const timed = events.filter((e) => Number.isFinite(e.at));
  if (!timed.length) return null;
  const start = timed[0].at;
  const end = Math.max(...timed.map((e) => e.end ?? e.at));

  // Stretches: split at idle gaps of more than 10 minutes.
  let longest = 0;
  let stretchStart = start;
  let last = start;
  for (const e of timed) {
    if (e.at - last > IDLE_GAP_MS) {
      longest = Math.max(longest, last - stretchStart);
      stretchStart = e.at;
    }
    last = Math.max(last, e.end ?? e.at);
  }
  longest = Math.max(longest, last - stretchStart);

  let ciRuns = 0;
  let ciWait = 0;
  let flaky = 0;
  let toolFailures = 0;
  let contextMisses = 0;
  let reverted = 0;
  let editedSince = false;
  let editsSoFar = 0;
  let lastTest = null; // { command, failed, editedAfter }
  for (const e of timed) {
    if (e.kind === 'edit') {
      editedSince = true;
      editsSoFar++;
    } else if (e.kind === 'cmd') {
      const command = e.command.trim();
      if (e.failed && DID_NOT_RUN.test(String(e.output ?? ''))) {
        toolFailures++;
      } else if (TEST_OR_BUILD.test(command)) {
        ciRuns++;
        ciWait += (e.end ?? e.at) - e.at;
        if (
          lastTest &&
          lastTest.command === command &&
          lastTest.failed &&
          !e.failed &&
          !editedSince
        )
          flaky++;
        lastTest = { command, failed: e.failed };
        editedSince = false;
      } else if (e.failed && ENV_FAILURE.test(`${command}\n${e.output ?? ''}`)) {
        toolFailures++;
      } else if (SEARCH_COMMAND.test(command) && !String(e.output ?? '').trim()) {
        contextMisses++;
      }
      if (REVERT.test(command) && editsSoFar > 0) reverted++;
    } else if (e.kind === 'tool') {
      if (e.failed) toolFailures++;
      else if (e.empty) contextMisses++;
    }
  }
  const prompts = timed.filter((e) => e.kind === 'prompt');
  const corrections = prompts.slice(1).filter((p) => CORRECTION.test(p.text)).length;

  return {
    session_on: new Date(start).toISOString().slice(0, 10),
    session_minutes: minutes(end - start),
    ci_wait_minutes: minutes(ciWait),
    ci_runs: ciRuns,
    flaky_retries: flaky,
    longest_stretch_minutes: minutes(longest),
    context_misses: contextMisses,
    human_corrections: corrections,
    reverted_agent_edits: reverted,
    tool_failures: toolFailures,
    client,
  };
}

/** Is the session worth a summary? Enough work, enough time (tunable for tests). */
export function worthSummarizing(events, row, env = process.env) {
  const minMinutes = Number(env.HOMERIC_DX_DIGEST_MIN_MINUTES ?? 10);
  const minActions = Number(env.HOMERIC_DX_DIGEST_MIN_ACTIONS ?? 5);
  const actions = events.filter((e) => e.kind === 'cmd' || e.kind === 'tool' || e.kind === 'edit');
  return Boolean(row) && row.session_minutes >= minMinutes && actions.length >= minActions;
}

/** What the agent is asked to do with the numbers (the hook's `reason`). */
export function offerText(row) {
  return [
    'Homeric DX: the numbers of this session, computed on this machine from your own transcript (nothing else leaves it):',
    JSON.stringify(row),
    'Call the dx_signals_submit tool now, with exactly these arguments. Do not show the numbers yourself first:',
    'the tool asks the person to confirm or edit them (a form), or returns the summary for you to show them and ask "y / edit / n", and nothing is stored unless they say yes.',
    'If they say no, or have not agreed to the Homeric DX privacy promise, drop it and stop: do not ask again this session.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// The hook.
// ---------------------------------------------------------------------------

function markerFor(sessionKey) {
  const dir = join(tmpdir(), 'homeric-dx-digest');
  mkdirSync(dir, { recursive: true });
  return join(dir, createHash('sha256').update(sessionKey).digest('hex').slice(0, 32));
}

/** Cursor's per-conversation log of commands and failures (the --record hooks write it). */
function recordLog(conversationId) {
  return `${markerFor(`cursor-log:${conversationId}`)}.jsonl`;
}

async function main() {
  const clientArg = process.argv.indexOf('--client');
  const client = clientArg > 0 ? process.argv[clientArg + 1] : 'claude-code';
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return; // not a hook call we understand: stay silent
  }

  if (client === 'cursor') {
    const conversation = String(input.conversation_id ?? '');
    if (!conversation) return;
    if (process.argv.includes('--record')) {
      const event = cursorEvent(input, Date.now());
      if (event) appendFileSync(recordLog(conversation), `${JSON.stringify(event)}\n`);
      return;
    }
    // stop: once per conversation, never in a follow-up loop.
    if (Number(input.loop_count) > 0 || input.status !== 'completed') return;
    const marker = markerFor(`cursor:${conversation}`);
    if (existsSync(marker)) return;
    const log = recordLog(conversation);
    const recorded = existsSync(log) ? parseLines(readFileSync(log, 'utf8')) : [];
    const first = recorded[0]?.at ?? Date.now();
    const prompts =
      input.transcript_path && existsSync(input.transcript_path)
        ? readCursorPrompts(readFileSync(input.transcript_path, 'utf8'), first)
        : [];
    const events = [...prompts, ...recorded].sort((a, b) => a.at - b.at);
    const row = digest(events, client);
    if (!worthSummarizing(events, row)) return;
    writeFileSync(marker, new Date().toISOString());
    process.stdout.write(JSON.stringify({ followup_message: offerText(row) }));
    return;
  }

  // Already continuing because of a stop hook: never loop.
  if (input.stop_hook_active) return;
  const path = input.transcript_path;
  if (!path || !existsSync(path)) return;
  const marker = markerFor(`${client}:${input.session_id ?? path}`);
  if (existsSync(marker)) return;

  const text = readFileSync(path, 'utf8');
  const events = client === 'codex' ? readCodex(text) : readClaudeCode(text);
  const row = digest(events, client);
  if (!worthSummarizing(events, row)) return;
  writeFileSync(marker, new Date().toISOString());
  process.stdout.write(JSON.stringify({ decision: 'block', reason: offerText(row) }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(() => {
    // A digest must never break the agent: fail silent.
  });
}
