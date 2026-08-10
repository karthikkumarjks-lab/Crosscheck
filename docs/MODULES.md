# Modules

CrossCheck is organized as a set of asset-type modules that share common
platform capabilities (source-of-truth resolution, comparison engine, rule
library, findings/reporting, notifications). Modules are added one at a time;
none beyond Module 1 are implemented.

| # | Module | Status | Notes |
|---|---|---|---|
| 1 | Website Quality | **Active — architecture/foundation only, no implementation yet** | See below. |
| 2 | Brochure Quality | Not started (future) | Compare brochures against authoritative website/source info. |
| 3 | Email Quality | Not started (future) | Check email templates against authoritative info + approved claims. |
| 4 | WhatsApp Quality | Not started (future) | Check WhatsApp templates against authoritative info + approved claims. |
| 5 | Marketing Asset Quality | Not started (future) | General extension point for additional asset types. |

## Module 1: Website Quality

**Use case:** compare marketing landing pages with the appropriate
authoritative website/subsite (not blindly against a homepage or wrong
page — see Source of Truth in `docs/PRODUCT_VISION.md`).

Page types it must eventually handle (non-exhaustive, extensible):
course-specific landing pages, UG pages, PG pages, MBA/MCA/BBA/BCA/B.Com/
M.Com/MA JMC/MA Economics pages, combined course pages, other program pages,
institution-specific pages.

**Long-term capabilities (not all implemented yet — this is the target
behavior the architecture must support), in pipeline order — see
`docs/ARCHITECTURE.md` "Functional Boundaries" for the stage-level
definitions this list instantiates:**

1. Accept a landing page URL as the Asset under review.
2. Understand the landing page (parse its content, including page type).
3. Identify the brand/university it claims to represent.
4. Identify the program/degree it claims to represent.
5. Resolve the correct authoritative website/subsite for that Asset.
6. Discover the relevant authoritative pages on that source
   (hierarchy-aware).
7. Crawl those source pages.
8. Extract claims and data from both Asset and Source.
9. Normalize extracted data (units, phrasing, formats) before comparison.
10. Cross-check LP data against authoritative website data.
11. Classify mismatches (which cross-check results are meaningful, and
    their category/business impact).
12. Attach evidence (source and conflicting values) and severity to each
    mismatch.
13. Generate a quality report of findings for the Asset.
14. Maintain historical comparison results and detect when information
    changes over time (operates on accumulated reports).
15. Notify users about important changes.
16. Avoid false positives as much as possible (cross-cutting concern, not a
    pipeline stage).

Checkable information categories: see `docs/PRODUCT_VISION.md` (explicitly
non-final/extensible list).

**Sprint 0 scope for this module:** none of the above is implemented.
`modules/website-quality/` exists as a placeholder directory only.

**Sprint 1 scope for this module:** detailed technical design only (data
model, entity/source resolution, discovery, extraction, normalization,
comparison, mismatch classification, evidence, report structure) — see
`docs/design/WEBSITE_QUALITY_DESIGN.md`. Still no implementation; that
design's MVP definition is what future implementation sprints build
against.

## Modules 2–5 (Future)

Documented here only so the platform architecture (see
`docs/ARCHITECTURE.md`) avoids assumptions that would block them later —
e.g. the source-of-truth resolution, rule library, and comparison engine
must be asset-type-agnostic at their core, with Website Quality as the first
concrete consumer. No design work beyond this constraint has been done for
Modules 2–5. Do not implement them ahead of schedule.
