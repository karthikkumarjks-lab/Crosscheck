# Roadmap

Phased, sprint-by-sprint. Only the current/next sprint is ever concretely
planned in detail — later phases are directional, not commitments, and will
be re-scoped when reached. See `docs/DEVELOPMENT_RULES.md` for the mandatory
per-sprint workflow.

## Phase 0 — Foundation (Sprint 0) — **current**

Documentation/memory system, product definition, architecture boundaries,
placeholder directory structure. No application code. Status tracked in
`memory/CURRENT_SPRINT.md`.

## Phase 1 — Website Quality: Skeleton & Core Entities

Design and implement the minimal slice of the conceptual data model (
Institution, Program, Source, Asset) and pick the tech stack (logged as a
decision in `docs/DECISIONS.md` before implementation starts). No crawling
or comparison yet — this phase proves the entity/source-resolution model on
a small hand-seeded example (e.g. the MUJ MBA case).

Full technical design for Phases 1–3 (this phase, plus Discovery/Extraction
and Comparison v1 below) was produced together in Sprint 1, since the
pipeline only makes sense reviewed end-to-end — see
`docs/design/WEBSITE_QUALITY_DESIGN.md`. Their *implementation* still
proceeds as separate sprints starting from that design's MVP definition.

Sprint 2 (first implementation sprint,
`docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`) narrows this phase further:
ingestion, extraction, and generic page understanding (brand/institution/
program/degree/page-type identification without a pre-registered
institution) only — Source Resolution (the Source Registry's actual use)
is deferred to a later sprint within this phase.

Sprint 3 (`docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`, planned, not yet
implemented) is that later sprint: Source Resolution (using Sprint 2's
understanding output to resolve a confirmed registry entry, including a
brand-name-aware fallback for Sprint 2's known institution/brand
conflation limitation) plus authoritative-page Discovery in its Sprint 1
design's MVP form (registry-defined page list, no crawling).

## Phase 2 — Discovery & Extraction (Website Quality)

Crawl/fetch relevant pages for a given source domain, classify page type,
extract structured claims/fields from both authoritative sources and
landing pages. Deterministic-first; flag where semantic/AI help is actually
needed rather than assuming it upfront. Design: see
`docs/design/WEBSITE_QUALITY_DESIGN.md` sections 5–7 (original MVP scope
cut full crawling to a registry-defined page list only; superseded in
practice by Sprint 5's bounded, sitemap/nav/link-based dynamic discovery —
implemented, tested, and live-validated — see `docs/design/
SPRINT_5_IMPLEMENTATION_PLAN.md`).

## Phase 3 — Comparison Engine v1 (deterministic)

Compare extracted Asset claims to resolved Source claims using an initial,
small set of hand-authored rules (a handful of high-value categories, e.g.
program name, duration, fees). Produce Findings with severity/category/
explanation. No AI required for this phase if deterministic rules suffice.
Design: see `docs/design/WEBSITE_QUALITY_DESIGN.md` sections 8–11.

## Phase 4 — Semantic/AI Layer

Introduce AI where deterministic comparison genuinely can't judge meaning
(e.g. "harmless rewording" vs. "factual change"). Scope AI usage narrowly
and document why deterministic logic wasn't sufficient (per
`docs/DEVELOPMENT_RULES.md` principle 6).

## Phase 5 — History, Reporting & Notifications

Persist Comparison Runs over time, detect Change Events, generate
daily/weekly reports, notify users of significant changes.

Includes user-configurable scheduled monitoring: Master Website + Target
URLs + frequency (daily/weekly/custom), changeable later without
rebuilding the project. Each scheduled run compares targets against the
current Master state and against the previous snapshot, so the system can
answer what changed, when, the old value, the new value, which target
changed, and what evidence supports it. Anticipated notification channels
are email, WhatsApp, and Slack/Teams-style integrations, added
independently of the comparison/scheduling core. See
`docs/ARCHITECTURE.md`'s "Future Architecture — Scheduling, Notifications,
History" for the required component separation (Comparison Engine /
Scheduler / Notification Engine / Results-History Store) and
`docs/DECISIONS.md` ADR-007 for the full requirement record.

## Frontend / Dashboard (gated, not scheduled to a phase number)

**Implemented (2026-08-11).** The gate recorded in `docs/DECISIONS.md`
ADR-007/ADR-009/ADR-010 is satisfied — D1 was root-caused and fixed
(ADR-010), the backend (Sprint 5B, Sprint 4b, the D1 fix) is committed
and pushed (`44395df`), and the frontend was then built and approved
(ADR-011):

- ✅ `apps/api` — a thin Express HTTP adapter (`POST /api/runs`,
  `GET /api/runs/:runId`) over the existing, unmodified
  `runMultiTargetDiscoveryAndComparison`. No identity/program/comparison
  logic is duplicated here — every such computation stays in
  `packages/core`/`modules/website-quality`. Run bookkeeping is in-memory,
  isolated behind a `RunStore` interface (see "Not yet built" below).
- ✅ `apps/dashboard` — a Vite + React + TypeScript single-page app: a new
  Run form, a multi-target overview (status/institution/program/
  authoritative page/changed-field-count per target, scales to any target
  count), and a per-target detail/audit view (identity resolution
  evidence, program resolution, field-by-field fact comparison,
  specializations, warnings). Institution identity is rendered with an
  explicit, evidence-driven distinction between a detected resolution and
  the multi/single-university policy default — never collapsed into a
  bare "Detected Institution: X".
- ✅ Full tests, typecheck, and build pass across all four workspaces
  (398 tests total: 181 `packages/core` + 146 `modules/website-quality`,
  both unmodified, + 17 `apps/api` + 54 `apps/dashboard`, including
  component tests for every real backend outcome/resolution-method/
  comparison-status value and tests against real captured Online Manipal
  run data, not just synthetic fixtures).
- ✅ Live-validated against the real Online Manipal site through the
  actual running API: the 10-URL validation batch and the MBA
  institution matrix (MAHE/SMU/MUJ explicit + generic-URL cases),
  reproducing the backend's own validated results with zero reshaping.

**Not yet built (explicitly deferred, tracked as future work, not
regressions):** persistent run storage (a real database behind the
already-isolated `RunStore` interface — Phase 5 territory), a run
history/list view, scheduling, and notifications. See Phase 5 above for
the scheduling/notification/history architecture this will eventually
plug into.

## Phase 6 — Rule Library Maturity

Move from hand-authored/hard-coded rules to a proper rule authoring/storage
system per the boundary defined in `docs/ARCHITECTURE.md`, so new rule
categories don't require code changes.

## Phase 7+ — Future Modules

Brochure Quality, Email Quality, WhatsApp Quality, general Marketing Asset
Quality — built on the now-proven core platform. Not scoped in detail until
their phase is reached. See `docs/MODULES.md`.

## Explicitly Not Scheduled Yet

Nothing beyond Phase 1 has a target date or detailed technical task list.
Each phase becomes a real sprint plan (Objective/Scope/Out of
scope/Technical tasks/Acceptance criteria/Test plan) only when it starts.
