# CLAUDE.md — Instructions for Claude Code Sessions

This file is the entry point for any Claude Code session working on CrossCheck.
Read this first, every session, before touching code or docs.

## What CrossCheck Is

CrossCheck is an AI-powered Marketing Quality, Consistency and Compliance
platform. It inspects marketing assets (landing pages, brochures, emails,
WhatsApp templates, etc.), compares them against an authoritative source of
truth, detects meaningful mismatches, explains them in plain language, tracks
them over time, and notifies users. Full detail: `docs/PRODUCT_VISION.md`.

The first module being built is **Website Quality** (compare marketing
landing pages against the correct authoritative website/subsite). See
`docs/MODULES.md`.

## Read This Before Doing Anything Else

At the start of every session, read — in this order — only what you need:

1. `memory/CURRENT_STATE.md` — what exists right now.
2. `memory/NEXT_SESSION.md` — exactly what to do next and why.
3. `memory/CURRENT_SPRINT.md` — the active sprint's scope and status.
4. `memory/AI_PROJECT_STATE.json` — machine-readable snapshot (phase, sprint
   number, module statuses, pending decisions).

Only open files under `docs/` when the task actually requires that context
(e.g. don't reread `PRODUCT_VISION.md` to fix a typo). `docs/` holds the
stable, slow-changing "why/what", `memory/` holds the fast-changing
"where are we right now".

## Token Efficiency Rules

- Do not re-read the whole repository "to be safe." Read the memory files
  above, then only the specific docs/code the current task touches.
- Do not regenerate documentation that already exists — update it in place.
- Before writing new code, search for existing implementations first.
- Keep answers to the user concise; don't repeat large chunks of docs back
  to them verbatim.

## Development Workflow (mandatory)

Product requirement → Architecture → Sprint definition → Implementation →
Tests → Review → Documentation → Git commit → Next sprint.

Never collapse multiple large features into one uncontrolled implementation.
Every sprint is scoped with: Objective, Scope, Out of scope, Technical tasks,
Acceptance criteria, Test plan, Completion status (see
`memory/CURRENT_SPRINT.md` for the live example).

Do not start a new sprint's implementation without an explicit go-ahead from
the user, and do not silently expand scope mid-sprint.

## Hard Rules

Full list: `docs/DEVELOPMENT_RULES.md`. The ones most likely to be violated
by accident:

- Do not implement future modules (Brochure/Email/WhatsApp/Marketing Asset
  Quality) — architecture must allow them, but they are not built yet.
- Do not treat this as a text-diff tool. Every comparison is
  asset-vs-authoritative-source, mediated by structured/semantic
  understanding, not raw string equality. See `docs/ARCHITECTURE.md`.
- No hard-coded credentials, ever. Config via environment variables/secrets.
- No paid third-party services without explicit user approval.
- Don't add dependencies, services, or abstractions the current sprint
  doesn't need.
- Any major architectural decision (tech stack, data model, storage, AI
  provider, hosting) must be logged in `docs/DECISIONS.md` and, if not yet
  decided, flagged there as pending — do not decide it unilaterally.

## Ending a Session

Before ending a session (or when told to wrap up), update:

- `memory/CURRENT_STATE.md`
- `memory/CURRENT_SPRINT.md` (mark completion status)
- `memory/NEXT_SESSION.md` (completed / in progress / remaining / decisions /
  known issues / exact next action)
- `memory/AI_PROJECT_STATE.json`

If a decision was made along the way, add it to `docs/DECISIONS.md` rather
than only mentioning it in chat.
