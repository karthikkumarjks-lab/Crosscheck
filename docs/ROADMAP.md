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

## Phase 2 — Discovery & Extraction (Website Quality)

Crawl/fetch relevant pages for a given source domain, classify page type,
extract structured claims/fields from both authoritative sources and
landing pages. Deterministic-first; flag where semantic/AI help is actually
needed rather than assuming it upfront. Design: see
`docs/design/WEBSITE_QUALITY_DESIGN.md` sections 5–7 (MVP scope cuts full
crawling to a registry-defined page list; see that doc's "Decisions
Requiring Approval").

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
