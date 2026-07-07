# Agent Rules — react-native-fast-image

Applies to any coding agent working in this repo (Claude Code, Cursor, Codex, Copilot, etc).

## Mandatory memory protocol

`.agent/memory.json` is the centralized, tool-agnostic memory log for this repo. It survives across sessions and across different agent tools — it is not tied to any one assistant's private memory system.

**Before starting any task or plan:**
1. Read `.agent/memory.json`.
2. Check whether prior entries are still true (file paths exist, functions still named as recorded, decisions not superseded). A memory that says X existed when written — verify before relying on it.
3. Use relevant entries to inform the task; do not re-derive context already recorded.

**After finishing any task or plan:**
1. Append a new entry to `.agent/memory.json` (see schema below). Do not rewrite or delete prior entries — this is an append-only log. If an old entry is now wrong, add a new entry that supersedes it (reference the old `id`) rather than editing history silently.
2. Keep entries factual and specific: what changed, why, what future agents should do differently as a result. Skip entries for trivial/reversible actions (typo fixes, formatting) — log decisions, architecture facts, non-obvious gotchas, and task outcomes that change how future work should proceed.

## Entry schema

```json
{
  "id": "kebab-case-unique-slug",
  "date": "YYYY-MM-DD",
  "type": "decision | fact | task | gotcha",
  "summary": "one line, what happened or what is true",
  "detail": "specifics: files touched, commands run, values chosen",
  "why": "the reasoning or constraint behind it",
  "how_to_apply": "what a future agent should do differently because of this",
  "supersedes": null
}
```

## Non-negotiable

- Never skip the before-read or after-write step, even for small tasks, unless the user explicitly says to skip it for this task.
- Never silently edit/delete a past entry to "clean up" — append a superseding entry instead, so the log stays an honest history.
- `.agent/memory.json` must always remain valid JSON (a single top-level array of entry objects).
