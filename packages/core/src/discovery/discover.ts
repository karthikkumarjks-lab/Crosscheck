import type { DiscoveryResult, Source } from "../types.js";

/**
 * Component: Authoritative-Page Discovery. MVP scope per
 * docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md "Authoritative-Page
 * Discovery Strategy": a direct read of the resolved Source's
 * registry-defined page list. No crawling, no sitemap parsing — that
 * remains the Sprint 1 design's documented "Post-MVP direction."
 */
export function discoverPages(source: Source): DiscoveryResult {
  // Defensive copy — source.pages may be a live reference into the
  // process-lifetime registry singleton; callers must not be able to
  // mutate it by mutating the returned array/objects.
  return { sourceId: source.id, pages: structuredClone(source.pages) };
}
