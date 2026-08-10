# packages/core/

Shared, asset-type-agnostic domain logic for CrossCheck (TypeScript).

- `src/types.ts` — shared types: Sprint 2's `IngestionResult`,
  `ParsedLandingPage`, `EntityGuess`, `PageType`, `ExtractedClaim`,
  `LandingPageAnalysis`, plus Sprint 3's `Institution`, `Program`,
  `Source`, `SourceRegistry`, `SourceResolutionInput/Result`,
  `DiscoveryResult` — see `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`
  "Data Models".
- `src/registry/` — the hand-seeded MVP Source Registry (static JSON, not
  a database — ADR-006) + loader.
- `src/source-resolution/` — `resolveSource(input)`: deterministic
  URL-pattern match → institution/brand-alias fallback → program
  disambiguation. No AI.
- `src/discovery/` — `discoverPages(source)`: registry-defined page list
  only (no crawling/fetching — that's deferred to a later sprint).

```
npm run test --workspace=@crosscheck/core        # unit tests (11)
npm run build --workspace=@crosscheck/core        # compiles to dist/, copies registry/
```

Lives here rather than in `modules/website-quality` because Source
Resolution/Discovery must be asset-type-agnostic per
`docs/ARCHITECTURE.md`'s Guiding Constraint — a future Brochure/Email/
WhatsApp module needs the same registry lookup, not a website-specific
one (ADR-006).

Types/logic for Comparison and Reporting are documented in
`docs/design/WEBSITE_QUALITY_DESIGN.md`'s "Data Structures Summary" but
not implemented here yet — added when the sprint that builds them starts.
