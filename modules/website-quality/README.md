# modules/website-quality/

Module 1. Sprint 2 implemented the ingestion → extraction → understanding
foundation: given a landing page URL, fetch it, extract its structural
content, and produce a generic, data-driven best-effort understanding of
what it represents (brand/institution/program/degree/page type/claims).
Sprint 3 added `src/resolveForAnalysis.ts`, which takes that understanding
and resolves it against `@crosscheck/core`'s Source Registry to find the
correct authoritative page(s) — see
`docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md` and
`memory/CURRENT_SPRINT.md` for current status.

```
npm run test --workspace=@crosscheck/website-quality   # unit/integration tests
npm run build --workspace=@crosscheck/website-quality   # compiles to dist/, copies data/
node dist/cli.js <landing-page-url>                      # analyze + resolve + discover, prints combined JSON
```

**Not yet implemented** (later sprints): fetching/parsing the discovered
authoritative pages, Claim Normalization, Comparison, Mismatch
Classification, Report generation — see
`docs/design/WEBSITE_QUALITY_DESIGN.md` sections 7/8/9/11.

Full spec: `docs/MODULES.md`. Roadmap: `docs/ROADMAP.md` (Phases 1–6).
Do not expand scope here without a defined sprint plan in
`memory/CURRENT_SPRINT.md`.
