import type { ExtractedClaim, ListComparisonItem, ListComparisonOutcome } from "../types.js";

/**
 * Component: Specialization list comparison (Sprint 4b §6). MVP
 * normalization is exact-text, not semantic/fuzzy matching: trim,
 * collapse whitespace, lowercase, dedupe. Two specialization lists are
 * diffed as sets under that normalization — present on both -> `match`;
 * present only on the target (asset side) -> `added`; present only on
 * the Master (source side) -> `removed`. No `changed`/rename detection
 * in this revision (approved scope narrowing, Decision #22) — renaming
 * vs. add+remove is not distinguished.
 */
function normalizeSpecialization(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** First claim per normalized value, in first-occurrence order — if a
 * page lists the same specialization twice (typo/duplication), only the
 * first occurrence's evidence is kept, matching how a human would read
 * the list. */
function indexByNormalizedValue(claims: ExtractedClaim[]): Map<string, ExtractedClaim> {
  const map = new Map<string, ExtractedClaim>();
  for (const claim of claims) {
    const key = normalizeSpecialization(claim.rawValue);
    if (key.length === 0) continue;
    if (!map.has(key)) map.set(key, claim);
  }
  return map;
}

/**
 * Sprint 6 — the generic engine behind `compareSpecializations` below,
 * parametrized by `fieldKey` so Accreditation and Rankings & Accreditations
 * (both naturally multi-valued, same "approved simple summary-string
 * representation" decision) can reuse the exact same order-independent,
 * no-false-rename-equivalence set-diff algorithm instead of a second
 * implementation. `compareSpecializations` itself is unchanged in
 * behavior — a thin wrapper fixing `fieldKey: "specializations"`.
 */
export function compareTextItemList(assetItems: ExtractedClaim[], sourceItems: ExtractedClaim[], fieldKey: string): ListComparisonOutcome {
  const assetByValue = indexByNormalizedValue(assetItems);
  const sourceByValue = indexByNormalizedValue(sourceItems);

  const allKeys = new Set<string>([...assetByValue.keys(), ...sourceByValue.keys()]);
  // Deterministic order: Master (source) order first, then any
  // target-only additions in target order — not insertion-into-Set
  // order, which would otherwise depend on iteration quirks.
  const orderedKeys = [
    ...sourceItems.map((c) => normalizeSpecialization(c.rawValue)).filter((k) => k.length > 0 && allKeys.has(k)),
    ...assetItems.map((c) => normalizeSpecialization(c.rawValue)).filter((k) => k.length > 0 && allKeys.has(k)),
  ];
  const seen = new Set<string>();
  const dedupedOrder = orderedKeys.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const items: ListComparisonItem[] = dedupedOrder.map((key): ListComparisonItem => {
    const assetClaim = assetByValue.get(key);
    const sourceClaim = sourceByValue.get(key);
    if (assetClaim && sourceClaim) {
      return { status: "match", masterValue: key, targetValue: key, masterClaim: sourceClaim, targetClaim: assetClaim };
    }
    if (assetClaim) {
      return { status: "added", targetValue: key, targetClaim: assetClaim };
    }
    return { status: "removed", masterValue: key, masterClaim: sourceClaim };
  });

  return { fieldKey, items };
}

export function compareSpecializations(assetItems: ExtractedClaim[], sourceItems: ExtractedClaim[]): ListComparisonOutcome {
  return compareTextItemList(assetItems, sourceItems, "specializations");
}
