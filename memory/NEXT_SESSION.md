# Next Session

_Written 2026-08-11. Across several sessions on this same day: Sprint 4b
(Institution Relevance Gate, logo/brand identity, extended fact
comparison, specialization diff) was implemented and live-validated,
which surfaced a critical defect (D1). D1 was then investigated,
root-caused, fixed (a standalone Institution Identity Resolution stage:
URL identifier → page text → logo → an explicit multi-university
default), and live-revalidated as resolved. Full detail: ADR-009 (the
original Sprint 4b work and D1 finding) and ADR-010 (the D1 fix), both in
`docs/DECISIONS.md`. Nothing committed or pushed._

## What Was Completed

- **Sprint 4b**: Institution Relevance Gate ("Identity Resolution" stage,
  multi-signal text/footer/logo), post-selection `IdentityAssessment`,
  extended fact fields (program/degree/institution), specialization list
  diff, `TargetIdentification`, `safeFetchBinary`. New dependency
  `jimp`+`blockhash-core` (approved, installed).
- **D1 fix**: standalone, pure `resolveInstitutionIdentity` combinator
  (`packages/core/src/dynamic-discovery/institution-identity-resolution.ts`)
  — URL-token, page-text, and logo signal tiers, each contributing only
  when it names one *specific* institution (never a generic/shared brand
  — the original root cause), plus an explicit, evidenced
  multi-university default derived from registry data (never a hardcoded
  institution name). Wired into the registry accept/reject decision in
  both `resolveAuthoritativePage.ts` (single-target) and
  `discoverAndCompareMany.ts` (multi-target), evaluated *before* that
  decision, matching the approved `Identity Resolution → Program
  Resolution → Authoritative Page Selection` pipeline order.
  `resolveSource` itself is unchanged.
- **Logo as a real identity signal**: broader logo discovery
  (`detectLogoCandidates`) beyond the original header/nav-only
  `detectLogo`, a fixed lazy-load-attribute bug (`data-lazy-src`/etc. —
  the real Online Manipal header logo was resolving to an inert
  placeholder before this), filename/alt/surrounding-text/SVG-structural
  matching against known institution aliases only (never
  `Institution.brandNames`, and never an accreditation/vendor logo that
  doesn't independently name an institution). SVG rasterization and a
  per-institution reference-logo-hash registry were both evaluated and
  explicitly deferred (no new dependency) — structural/text signals
  proved sufficient for every real case found, including a genuine
  external `.svg` asset fetched and parsed live.
- **Registry data**: lightweight MAHE/SMU `Institution` + MBA `Program`
  records added (name + short-code aliases only — **no** `Source`/
  authoritative-page entries; they remain unregistered for discovery/
  comparison purposes).
- **Tests**: 327 total (up from 266; up from 205 before Sprint 4b), 61 new
  this work (30 pure combinator + extraction/end-to-end/SVG), zero
  regressions anywhere. `typecheck`/`build` clean, both workspaces. Zero
  institution-specific production logic and zero LLM/AI calls anywhere
  in the pipeline (both grep-verified).
- **Live validation, real network, multiple runs**:
  - Full 10-target Online Manipal batch (`ln-mba-mahe`, `ln-msc-ds-mahe`,
    `ln-mca-mahe`, `ln-msc-ba-mahe`, `ln-bcom-mahe`, `ln-pgcp-ei-mahe`,
    `ln-pgcp-ds-mahe`, `ln-pgcp-ba-mahe`, `ln-pgcp-lscm-mahe`,
    `ln-bba-honors-mahe`): both previously-wrong targets fixed —
    `ln-mba-mahe` now safely `authoritative_page_not_found` (was
    confidently-wrong MUJ); `ln-mca-mahe` now correctly resolves to
    MAHE's own real page via dynamic discovery. 4 success / 1 ambiguous /
    5 not-found this run — all safe or correct, never wrong. ~34s wall
    time this run (network-variance range observed across sessions:
    ~14–34s), well under the 3-minute goal.
  - MBA institution matrix (5 real targets): `ln-mba-mahe`→MAHE (URL
    token), `ln-mba-smu`→SMU (URL token + a real, matching `smu-logo.png`
    asset — `combined_signals`), `online-mba-muj`→MUJ (URL token),
    generic `/ln-mba`→MUJ via a **real** `muj-logo.png` asset
    (`resolutionMethod: "logo"`, `fallbackApplied: false` — genuine
    detection, not the default), and MUJ's own real canonical page
    (`master-of-business-administration`)→MUJ via the explicit
    `multi_university_default` (`fallbackApplied: true`) — the
    detected-vs-defaulted distinction verified holding even on MUJ's own
    page, which uses a shared multi-institution template with no clean
    self-identifying signal of its own. ~15s wall time.
  - Comparison-output review (real pages): `degree`/`institution` fields
    reliably `match`; `program` correctly flags real textual differences;
    `duration`/`mode`/`accreditation` are frequently `both_missing`, and
    `eligibility`/`fees` occasionally capture a table-header label
    instead of the value, on some real pages — pre-existing Sprint 2
    extraction gaps, confirmed still present, unrelated to and unaffected
    by the D1 fix. `specializations` diff returned empty on every target
    checked (genuinely nothing extracted on either side for these
    specific real pages, not a bug).

## Investigated and left as a documented limitation, not fixed

**`ln-pgcp-ei-mahe`**: this specific real URL now returns a 302 redirect
straight to the Master's bare homepage — the intended page no longer
exists on the live site. The homepage carries no program-specific
evidence anywhere (title/meta/nav only advertise unrelated programs);
forcing a match would mean guessing among dissimilar nav-menu links,
which was explicitly rejected as exactly the kind of guess this whole fix
exists to prevent. Confirmed via direct investigation (fetched and
followed the redirect, inspected the landing page's content) that no
reliable evidence exists — not assumed. Left as the safe
`authoritative_page_not_found` result. This is a stale-URL/content
problem on the real site, not a resolution-logic defect, and needs no
code change.

## What Remains (not started)

- **Commit and push** — not done, not asked for yet.
- **Frontend/Dashboard** — still gated (see gate below); this session's
  work satisfies the correctness-side gate items that were previously
  blocking (D1 resolved, logo signal implemented and validated), but
  commit/push and an explicit separate go-ahead are still outstanding.
- The narrower residual D1-adjacent gap (generic-shared-brand-only
  targets) — open decision, not undertaken (full MAHE/SMU Source
  registration, or deeper extraction).
- **C5** (Sprint 5/5B, large non-university-shaped sites) — open
  decision, not undertaken.
- Pre-existing Sprint 2 extraction gaps (duration/mode/accreditation
  frequently missing, eligibility/fees occasionally capturing a label
  instead of a value, PG-Certificate-style degree naming not recognized)
  — all confirmed still present this session, none fixed (out of scope
  for the institution-identity work).
- Sprint 6 (Mismatch Classification/Report generation, `course/program
  structure` comparison, fuzzy specialization rename detection) — not
  scoped, not started.

## Known Issues / Limitations

1. `ln-pgcp-ei-mahe` stale-redirect case — see above, documented, not a
   defect.
2. Residual D1-adjacent generic-shared-brand-only gap — open decision,
   see above; not observed as the deciding factor in any real target this
   session.
3. Program Relevance Gate subject-overlap can still false-positive-tie
   across genuinely different subjects (`ln-msc-ds-mahe`) — safe, never
   wrong, same family as C5, not fixed.
4. PG-Certificate-style program naming not recognized by
   `degree-keywords.json` — Understanding-layer gap, not
   discovery/gating/identity logic.
5. Sprint 2 fact-extraction gaps on some real pages (duration/mode/
   accreditation missing; eligibility/fees occasionally capturing a label
   instead of a value) — confirmed present, unrelated to and unaffected
   by this session's work.
6. Carried forward, unaffected: institution/brand conflation (Sprint 2,
   mitigated for registered institutions), heading-scoped claim
   extraction imprecision (Sprint 2), C5 (Sprint 5/5B).

## Open Decisions Requiring User Input

- Whether/when to commit and push Sprint 4b + the D1 fix + the still-
  uncommitted Sprint 5/Revision 1/Sprint 5B work (together or
  separately).
- Whether to pursue full MAHE/SMU Source registration or deeper
  extraction for the narrower residual D1-adjacent gap, or accept it as
  a documented limitation.
- C5 fix-or-leave, database/storage/hosting/AI-provider decisions,
  Sprint 6 scoping (all carried forward, unchanged).

## Frontend Gate — current status

Per `docs/DECISIONS.md` ADR-007/008/010 and `docs/ROADMAP.md`:
correctness-side implementation/testing/validation items (including D1
and the logo identity signal) are now satisfied. Outstanding:
**commit/push**, and an **explicit, separate user go-ahead** for frontend
work specifically. Do not begin frontend work without both.

## Exact Recommended Next Action

1. User reviews this session's D1-fix + logo-identity-signal validation
   report.
2. Decide whether to commit and push (Sprint 4b + D1 fix + Sprint 5/
   Revision 1/Sprint 5B together, or separately).
3. Decide on the residual generic-shared-brand-only gap (accept as
   documented, or scope a follow-up).
4. Once satisfied, and with an explicit separate go-ahead, reconsider the
   frontend gate.
