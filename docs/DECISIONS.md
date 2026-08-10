# Decisions

Architecture Decision Record (ADR)-style log. Add a new entry whenever a
major decision is made — don't leave it implicit in chat history. Never
delete an entry; supersede it with a new one that links back.

Format per entry: Date, Status, Context, Decision, Alternatives considered,
Consequences.

---

## ADR-001: Documentation-first project foundation (Sprint 0)

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** Repository was empty except a README. Product scope is large
  (multiple current + future modules) and sessions are discontinuous
  (separate Claude Code sessions over time).
- **Decision:** Before any application code, establish a documentation and
  project-memory system (`CLAUDE.md`, `docs/`, `memory/`) so any future
  session can resume without re-reading full history, plus a stack-agnostic
  placeholder directory skeleton.
- **Alternatives considered:** Jumping straight into Website Quality
  implementation. Rejected — explicit user instruction, and consistent with
  principle of avoiding uncontrolled/undocumented implementation.
- **Consequences:** Slightly slower start; much lower risk of context loss
  or redundant rework across sessions.

## ADR-002: Source-of-truth separation as a core, non-negotiable principle

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** Naive designs could treat "compare two documents" as
  symmetric text diffing.
- **Decision:** The system always distinguishes Authoritative Information
  from Marketing Asset Information, and always resolves an asset to the
  *correct* authoritative source before comparing (not a default/homepage).
  See `docs/PRODUCT_VISION.md`.
- **Alternatives considered:** Simple two-document diff tool. Rejected —
  explicitly against product intent; would not scale to multi-institution,
  multi-program catalogs.
- **Consequences:** Requires an entity/source-resolution capability
  (institution/brand/program identification) before comparison can be
  correct — this becomes first-class scope, not an assumed input.

## ADR-003: Deterministic-first, AI-where-justified comparison approach

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** It would be easy to route every comparison through an LLM.
  That's costly (tokens/API calls) and less predictable/auditable than
  deterministic rules for clearly-structured fields (e.g. exact fee
  amounts, dates).
- **Decision:** Prefer deterministic, rule-driven logic by default; use AI
  specifically where semantic judgment is required (e.g. "is this wording
  difference meaningful?"). See `docs/DEVELOPMENT_RULES.md` principles 5–8.
- **Alternatives considered:** AI-first comparison for everything. Rejected
  for cost, predictability, and auditability reasons at this stage.
- **Consequences:** Comparison engine design must cleanly separate
  deterministic rule evaluation from AI-assisted judgment calls, so each
  can be reasoned about/tested independently.

## ADR-004: Rule library documented as a boundary only, not implemented

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** The rule/guidelines library is central to long-term product
  value but designing it fully now would be premature — no real rules have
  been authored yet, and its authoring format should be informed by Phase 1
  experience.
- **Decision:** Sprint 0 documents the rule library's responsibilities and
  boundary (`docs/ARCHITECTURE.md`) only. Authoring format, storage, and
  evaluation engine are deferred to a dedicated future sprint.
- **Alternatives considered:** Designing the full rule engine now. Rejected
  — would guess at requirements not yet known, against principle 17
  (don't over-constrain based on assumptions).
- **Consequences:** Phase 3 (Comparison Engine v1) will use a small number
  of hand-authored/hard-coded rules initially; migration to the proper rule
  library happens in Phase 6, by design.

## ADR-005: Application language/framework — Node.js + TypeScript

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** Sprint 2 (first implementation sprint) needs a language to
  write any code in. Sprint 1 and Sprint 2's design docs
  (`docs/design/WEBSITE_QUALITY_DESIGN.md`,
  `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`) already specify every
  interface/data model in TypeScript-like pseudo-notation.
- **Decision:** Node.js + TypeScript, for both the Website Quality module's
  logic and any future API/dashboard. HTML parsing via `cheerio`; HTTP
  fetch via the built-in `fetch`/`undici`; tests via `vitest`.
- **Alternatives considered:** Python (`httpx`/`BeautifulSoup`, `pytest`) —
  strong scraping/text ecosystem and a better fit if Phase 4's AI/NLP work
  leans on Python's ML ecosystem specifically. Rejected for now: the
  existing design docs are already written as near-direct TypeScript, and
  a single language across backend logic and a likely future web
  dashboard reduces context-switching. Revisit only if Phase 4 AI work
  specifically needs a Python-only capability.
- **Consequences:** `packages/`/`modules/` scaffolding will use
  `.ts` files, `package.json`/`tsconfig.json` per package, `vitest` for
  tests. Unblocks Sprint 2 implementation.

---

## Open / Pending Decisions (require explicit user approval before locking in)

None of these are decided. Do not implement against an assumed answer.

- **Database/storage technology.**
- **Hosting/deployment target.**
- **AI/LLM provider(s)** for the semantic layer (Phase 4+), and any paid-API
  approval this implies (principle 14 requires explicit approval).
- **Crawling approach/tooling** for Website Quality discovery (Phase 2).
- **Rule authoring format and storage** (Phase 6, informed by Phase 1–3
  experience).

Sprint 1 (`docs/design/WEBSITE_QUALITY_DESIGN.md`) proposed concrete,
still-unapproved options/recommendations for several of these as they apply
to the MVP specifically — see that document's "Decisions Requiring
Approval" section: Source Registry storage (recommends a static config
file, not a DB, for the MVP), ingestion method (recommends plain HTTP fetch
over a headless browser for the MVP, with a flagged JS-rendering risk), the
`wording_difference` classification boundary staying deterministic-only
for the MVP (no AI), and fixture-based vs. live-network testing
(recommends fixtures). These are proposals, not decisions — they still
require explicit approval, and are narrower in scope than the
project-wide items above (MVP-specific, not the final answer for every
future phase).

These will be proposed with alternatives and trade-offs at the start of the
sprint that actually needs them, per the escalation rule in `CLAUDE.md`.
