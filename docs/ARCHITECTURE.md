# Architecture

Status: initial/foundational. This describes the intended shape of the
system and its boundaries, not a built system. Nothing below is implemented
yet unless explicitly marked "Sprint 0". Tech-stack specifics are
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
  website-quality/      # Module 1 — active module, not yet implemented
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

## Security & Configuration (binding from Sprint 0 onward)

- No credentials, API keys, or secrets in source control, ever.
- All configuration via environment variables/secrets management; no
  hard-coded values.
- Security is considered at every sprint, not bolted on later.

## Open Decisions (not yet made — do not assume)

These require explicit user approval before being locked in; see
`docs/DECISIONS.md` for the live log.

- Application language/framework (backend + any frontend).
- Database/storage technology.
- Hosting/deployment target.
- AI/LLM provider(s) and where in the pipeline AI is actually justified vs.
  deterministic logic.
- Rule authoring format and storage.
- Crawling approach/tooling for Website Quality (Sprint 1 concern).
