# Architecture

Status: describes the intended shape of the system and its boundaries.
Most of this document is still a forward-looking design, not a built
system — read each section's own status framing rather than assuming
either way. The Website Quality module (Sprints 2–5B) is implemented,
tested, and live-validated as of 2026-08-11 (see "Performance &
Scalability" below and `docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md`);
the rule engine, comparison-engine internals beyond what Sprint 4/5
built, and the scheduling/notification/history-store components remain
design-only. Tech-stack specifics for anything not yet decided are
intentionally deferred — see "Open Decisions" at the end and
`docs/DECISIONS.md`.

## Guiding Constraint

The core platform (source-of-truth resolution, extraction, comparison,
rules, findings, notifications) must be asset-type-agnostic. Website Quality
is the first concrete module built on it; Brochure/Email/WhatsApp Quality
must be addable later without reworking the core. See `docs/MODULES.md`.

## Conceptual Data Model (sketch, not a schema)

These are the entities the system needs to reason about. Exact
storage/schema is a Sprint 1+ decision.

- **Institution / Brand** — e.g. Manipal University Jaipur (MUJ), Online
  Manipal.
- **Program / Course** — e.g. MBA, MCA, BBA, combined-course variants.
- **Source** — a piece of authoritative content (a subsite/page) tied to an
  Institution + Program, marked authoritative for specific claim categories.
- **Asset** — a marketing artifact under review (landing page today;
  brochure/email/WhatsApp template later), tied to the Institution + Program
  it claims to represent.
- **Claim / Field** — an extracted, structured unit of information from a
  Source or Asset (e.g. `duration`, `eligibility`, `fees`), not raw text.
- **Rule** — defines what to check, which source to trust, what counts as a
  mismatch, severity, category, explanation, recommended action, and
  whether human review is required. See "Rule / Guidelines Library" below.
- **Comparison Run** — one evaluation of an Asset against its resolved
  Source(s) at a point in time.
- **Finding** — a detected, rule-classified mismatch from a Comparison Run:
  category, severity, source value, asset value, explanation, status
  (open/acknowledged/resolved/false-positive).
- **Change Event** — a detected difference between two points in time for
  the same Source or Asset (drives notifications/reports).

Relationships are hierarchical and many-to-many in practice (one Asset can
map to more than one relevant Source field; one Source can back many
Assets) — this is why entity/source resolution is a first-class system
capability, not a config the user maintains by hand.

## Functional Boundaries (conceptual pipeline)

Each stage below is a separable concern. Sprint 1+ will decide which stages
are deterministic code vs. where AI/LLM involvement earns its cost (per
`docs/DEVELOPMENT_RULES.md`: prefer deterministic logic; use AI only where
semantic understanding adds real value).

1. **Understanding** — read and parse the Asset (e.g. a landing page),
   including its page type (course-specific, UG, PG, combined-course,
   institution page, etc.).
2. **Brand/University Identification** — identify the brand and
   institution/university the Asset claims to represent.
3. **Program/Degree Identification** — identify the specific
   program/course/degree the Asset claims to represent.
4. **Source Resolution** — using the identities from steps 2–3, resolve the
   correct authoritative website/subsite for this Asset. This is the step
   that makes "MUJ MBA landing page → Online Manipal → MUJ → MBA subsite"
   work correctly instead of defaulting to a homepage.
5. **Discovery** — given the resolved Source, discover its relevant
   authoritative pages and their hierarchy.
6. **Extraction** — turn raw Source/Asset content into structured claims and
   data (not free text).
7. **Normalization** — canonicalize extracted data (units, phrasing,
   formats) so semantically-equivalent values from Asset and Source compare
   correctly instead of triggering false positives on surface differences.
8. **Cross-Check (Comparison)** — evaluate normalized LP claims against
   website/Source claims using the Rule Library; deterministic where
   possible, semantic/AI-assisted where a rule requires judgment (e.g. "is
   this a harmless rewording or a factual change?").
9. **Mismatch Classification** — determine which cross-check results are
   meaningful mismatches, and their category/business impact.
10. **Evidence & Severity** — attach the human-readable "why", the
    conflicting source/asset values as evidence, and a severity rating to
    each mismatch.
11. **Quality Report** — generate the scheduled/on-demand report of
    findings for an Asset.
12. **History & Change Detection** — persist Comparison Runs, diff against
    prior runs to track changes over time. Operates on accumulated Quality
    Reports/findings, not a replacement for step 11.
13. **Notification** — notify users about important findings/changes.

These map roughly to the `packages/` skeleton created in Sprint 0 (see
"Directory Structure" below), but package boundaries will be refined once
Sprint 1 designs Website Quality concretely.

## Rule / Guidelines Library — Boundary (not the engine)

Sprint 0 documents the *boundary*, not the implementation:

- Rules are data, not code — they must be authorable/editable without a
  redeploy of application logic (exact authoring format TBD in a later
  sprint: could be structured config, DB-backed records, or similar).
- The comparison engine consumes rules generically; it does not hard-code
  per-category logic that only a rule change should affect.
- Adding a new rule category (e.g. a new checkable field) must not require
  touching the crawler, extractor, or notification code.
- Rules carry: what to check, trusted source, mismatch definition, severity,
  category, explanation template, recommended action, human-review flag —
  per `docs/PRODUCT_VISION.md`.

The full rule engine design (authoring format, storage, evaluation model) is
explicitly out of scope for Sprint 0 and deferred to a dedicated future
sprint.

## Directory Structure (provisional)

Created in Sprint 0 as empty scaffolding with placeholder READMEs only — no
application code. Layout is logical/conceptual, not a commitment to a
specific language or framework (that's an open decision, see below); it may
be reorganized once the stack is chosen.

```
apps/                   # future deployable applications (e.g. API, web UI)
modules/                # per-asset-type business logic
  website-quality/      # Module 1 — active module, implemented through Sprint 5B
  brochure-quality/      # Module 2 — future
  email-quality/         # Module 3 — future
  whatsapp-quality/      # Module 4 — future
packages/                # shared/core logic used across modules
  core/                   # shared domain model (Institution, Program, Source, Asset, ...)
  rule-engine/            # rule library boundary (see above) — design only
  comparison-engine/      # semantic/structured comparison logic — design only
docs/                     # stable product/architecture documentation
memory/                   # fast-changing project state (read every session)
```

## Performance & Scalability (binding from Sprint 5 onward)

**Implementation status (as of 2026-08-11):** the workflow below is now
implemented (Sprint 5, Sprint 5 Revision 1, Sprint 5B — see
`docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md`'s "Post-Implementation
Validation" section), tested, live-validated against two independent
real Master domains, and committed/pushed (`44395df`; see
`memory/CURRENT_STATE.md`). The performance targets in the table below
remain goals, not measured SLAs — live validation confirmed the
architectural property they depend on (Master-crawl cost stays flat
regardless of target count: identical request counts at 1 vs. 9 real
targets, and at 91 unique local-fixture targets), but no real, 100-target,
open-internet run has been performed, so the 100-target figure is
supported by extrapolation, not direct measurement.

The target product workflow is:

```
One Master Website
+ 1-100+ target URLs
→ discover authoritative Master pages
→ compare each target
→ produce consolidated results
```

**Independent target resolution (binding, see `docs/DECISIONS.md`
ADR-007).** Every target URL must be understood and resolved to its own
corresponding authoritative Master page. A target must never inherit
another target's resolved Master page merely because it was processed
earlier or in the same batch — e.g. an MBA target and an MSc Mathematics
target against the same Master site must each resolve independently, even
within one run. Reuse for performance is allowed at the level of fetched
pages and the Master Page Index; it is never allowed at the level of a
target's resolved answer.

Performance targets, expressed as **application performance goals under
normal network conditions** — not hard SLAs, since correctness depends on
third-party websites this system does not control and which can be slow,
rate-limiting, or unavailable regardless of how CrossCheck itself is
built:

| Batch size     | Target      |
|----------------|-------------|
| 1 target       | ≤30 seconds |
| 10 targets     | ≤60 seconds |
| 50 targets     | ≤2 minutes  |
| 100 targets    | ≤3 minutes  |

Architectural implications — master crawl once, a reusable Master Page
Index, Master-page fetch reuse, bounded concurrency, target
parallelization, duplicate URL elimination, early irrelevant-candidate
rejection, request timeouts, failure isolation, efficient memory usage at
100+ results, and progress reporting — were evaluated in `docs/design/
SPRINT_5_IMPLEMENTATION_PLAN.md`'s "Performance Architecture" section and
implemented in `docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md` (Master
Page Index build + independent per-target resolution/comparison,
`docs/DECISIONS.md` ADR-008). Unlimited concurrency was not used —
bounded concurrency (default 5, configurable) at both the crawl and
per-target layers. Carry this requirement forward into every future
sprint touching discovery or multi-target comparison, not just Sprint 5/5B.

## Future Architecture — Scheduling, Notifications, History (design boundary only, not implemented)

Long-term, CrossCheck supports automated periodic monitoring: a user
configures a Master Website, a set of Target URLs, and a check frequency
(daily/weekly/custom); the system then periodically re-runs comparisons,
detects what changed since the previous run, generates a report, and
notifies the user. None of this is implemented yet — see `docs/ROADMAP.md`
Phase 5 and `docs/DECISIONS.md` ADR-007. It is documented here only so
current design doesn't foreclose it.

Four concerns must stay logically separate components, not one coupled
system:

- **Comparison Engine** — the core target → resolve → compare → evidence
  pipeline. Must support both an on-demand **"Run Now"** invocation and a
  **"Scheduled Run"** invocation through the same core logic — scheduling
  is an external trigger, not a variant comparison path.
- **Scheduler** — owns frequency configuration (daily/weekly/custom) per
  Master+Target-set and triggers Comparison Engine runs. Frequency must be
  changeable by the user later without rebuilding/redeploying the system.
- **Results/History Store** — persists each Comparison Run's results
  (snapshots) so a later run can be compared against a prior one to answer:
  what changed, when, the old value, the new value, which target changed,
  and what evidence supports it.
- **Notification Engine** — informs users when a run detects meaningful
  change. Channel-agnostic at the core; email, WhatsApp, and Slack/Teams-
  style channels are the currently anticipated integrations, added
  independently, not hard-coded into the comparison or scheduling logic.

None of these four components exist yet. Building any of them ahead of
their scoped phase is out of scope — see `docs/ROADMAP.md`.

## Security & Configuration (binding from Sprint 0 onward)

- No credentials, API keys, or secrets in source control, ever.
- All configuration via environment variables/secrets management; no
  hard-coded values.
- Security is considered at every sprint, not bolted on later.

## Open Decisions (not yet made — do not assume)

These require explicit user approval before being locked in; see
`docs/DECISIONS.md` for the live log.

- ~~Application language/framework (backend + any frontend).~~ Decided:
  Node.js + TypeScript for the backend (ADR-005); Vite + React +
  TypeScript, with a thin Express HTTP adapter, for the frontend
  (ADR-011).
- Database/storage technology.
- Hosting/deployment target.
- AI/LLM provider(s) and where in the pipeline AI is actually justified vs.
  deterministic logic.
- Rule authoring format and storage.
