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

**Not started.** Per `docs/DECISIONS.md` ADR-007's gate list, updated as
of 2026-08-11 (ADR-009; full detail in `docs/design/
SPRINT_4_IMPLEMENTATION_PLAN.md` Revision 3):

- ✅ Sprint 5B is implemented.
- ✅ Sprint 4b (Institution Relevance Gate/Identity Resolution, logo/brand
  identity, extended fact comparison, specialization diff) is implemented.
- ✅ Full tests, typecheck, and build pass (266 tests, 0 failures).
- ✅ Online Manipal multi-target validation passes (correctness/safety
  properties held; see the ❗ item below for a confirmed, unresolved
  correctness gap on a specific subset of targets).
- ✅ Non-Online-Manipal multi-target validation passes (Sprint 5B cycle).
- ✅ 1/10/100-target performance architecture is validated (real 10-target
  Online Manipal batch ~26s; 100-target figure remains synthetic/local,
  not a directly-measured open-internet result).
- ❗ **New, critical, unresolved finding (D1)**: the Source Registry
  (Sprint 3) resolves any MBA/MCA-shaped target on `onlinemanipal.com` to
  MUJ's registered page regardless of actual institution, bypassing both
  Relevance Gates — confirmed live, root-caused, not fixed. See ADR-009.
  **This should be resolved or explicitly accepted before frontend work
  begins**, since the frontend would otherwise display a confidently-
  wrong institution for those program types.
- ❌ Changes are **not yet committed or pushed**.
- ❌ Explicit user go-ahead for frontend work specifically has **not** been
  given.

Frontend work remains blocked on the last two items, and D1 is flagged as
a reason to pause and decide even once those two are satisfied. Once
unblocked, it is intended to support: Master Website input, bulk Target
URL input (paste/upload), run/progress display, results, evidence, and
change history.

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
