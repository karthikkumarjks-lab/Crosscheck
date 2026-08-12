import type { ExtractedClaim, ParsedLandingPage } from "@crosscheck/core";
import { accreditationItemLabels, feeCandidateLabels, othersFieldLabels, rankingItemLabels } from "../data/index.js";
import { escapeRegExp, findWordBounded } from "./util.js";

const EXCERPT_MAX_LENGTH = 300;

interface LabeledMatch {
  value: string;
  excerpt: string;
}

/**
 * Multi-match variant of `claims.ts`'s label-driven extraction (Sprint 6,
 * `docs/design/SPRINT_6_IMPLEMENTATION_PLAN.md` §6/§9/§10). `claims.ts`'s
 * `findLabeledPattern`/`findHeadingScoped` both deliberately return only
 * the FIRST match — correct for a scalar field like `duration`, wrong for
 * fee/accreditation/ranking harvesting, where a real page can legitimately
 * state several distinct fee/accreditation/ranking mentions that must each
 * be seen (e.g. an "Application Fee" AND a "Semester Fee" on the same
 * page) so the classifier downstream can tell them apart. Same two
 * strategies as the scalar extractor (inline "Label: Value", then
 * heading-scoped), just collecting every match instead of stopping at the
 * first, deduped by excerpt so a block matched by two different labels
 * isn't counted twice.
 */
function findAllLabeledMatches(parsed: ParsedLandingPage, labels: string[]): LabeledMatch[] {
  const matches: LabeledMatch[] = [];
  const seenExcerpts = new Set<string>();

  function record(excerpt: string, value: string): void {
    const key = excerpt.trim().toLowerCase();
    if (seenExcerpts.has(key) || !key) return;
    seenExcerpts.add(key);
    matches.push({ value: value.slice(0, EXCERPT_MAX_LENGTH), excerpt: excerpt.slice(0, EXCERPT_MAX_LENGTH) });
  }

  // Regex compiled once per label (not once per block x label) --
  // labels.length is small and fixed, textBlocks can be large on a real
  // page, so this is the axis worth hoisting out of the loop.
  const patterns = labels.map((label) => new RegExp(`\\b${escapeRegExp(label)}\\b\\s*[:\\-–—]\\s*(.+)`, "i"));
  for (const block of parsed.textBlocks) {
    for (const pattern of patterns) {
      const match = pattern.exec(block.text);
      const value = match?.[1]?.trim();
      if (value) record(block.text, value);
    }
  }

  for (const heading of parsed.headings) {
    const matchesLabel = labels.some((label) => findWordBounded(heading.text, label));
    if (!matchesLabel) continue;
    const blocks = parsed.textBlocks.filter((block) => block.headingContext === heading.text);
    for (const block of blocks) {
      if (block.text) record(block.text, block.text);
    }
  }

  return matches;
}

function toExtractedClaims(matches: LabeledMatch[], fieldKey: string, sourceUrl: string): ExtractedClaim[] {
  const extractedAt = new Date().toISOString();
  return matches.map(
    (m): ExtractedClaim => ({
      fieldKey,
      rawValue: m.value,
      sourceLocation: { url: sourceUrl, excerpt: m.excerpt },
      extractionMethod: "heading_scoped",
      extractedAt,
    }),
  );
}

/** Every distinct fee-shaped mention on the page (semester/annual/total/
 * application/admission/registration/examination — the classifier in
 * `packages/core`'s `priorityComparison.ts` decides which is which from
 * the text, extraction here just harvests candidates generically). */
export function extractFeeCandidates(parsed: ParsedLandingPage): ExtractedClaim[] {
  const labels = feeCandidateLabels.flatMap((entry) => entry.labels);
  return toExtractedClaims(findAllLabeledMatches(parsed, labels), "feeCandidate", parsed.sourceUrl);
}

/** Every distinct accreditation/approval mention (Sprint 6 §9) — compared
 * as a set, not reduced to a single yes/no, so "UGC entitled" and "NAAC
 * A+" are never treated as interchangeable. */
export function extractAccreditationItems(parsed: ParsedLandingPage): ExtractedClaim[] {
  const labels = accreditationItemLabels.flatMap((entry) => entry.labels);
  return toExtractedClaims(findAllLabeledMatches(parsed, labels), "accreditationItem", parsed.sourceUrl);
}

/** Every distinct ranking/award mention (Sprint 6 §10). A ranking's own
 * wording (which typically includes its year, e.g. "NIRF 2025") flows
 * straight into the set-diff as raw text, so two rankings that differ
 * only by year are naturally never treated as identical — no separate
 * year-parsing logic needed. */
export function extractRankingItems(parsed: ParsedLandingPage): ExtractedClaim[] {
  const labels = rankingItemLabels.flatMap((entry) => entry.labels);
  return toExtractedClaims(findAllLabeledMatches(parsed, labels), "rankingItem", parsed.sourceUrl);
}

/** The 7 "Others" fields (Sprint 6 §12) — ordinary scalar fields (one
 * claim per field, first match, exactly like `claims.ts`'s existing
 * fields), reusing `others-field-labels.json` rather than
 * `claim-field-labels.json` so the legacy Sprint 4 `claims` array/
 * comparison table is never affected by this addition. */
export function extractOthersClaims(parsed: ParsedLandingPage): ExtractedClaim[] {
  const extractedAt = new Date().toISOString();
  const claims: ExtractedClaim[] = [];
  for (const { fieldKey, labels } of othersFieldLabels) {
    const matches = findAllLabeledMatches(parsed, labels);
    if (matches.length === 0) continue;
    const first = matches[0];
    claims.push({
      fieldKey,
      rawValue: first.value,
      sourceLocation: { url: parsed.sourceUrl, excerpt: first.excerpt },
      extractionMethod: "heading_scoped",
      extractedAt,
    });
  }
  return claims;
}

/** Combines every Sprint 6 priority-field extraction into one flat
 * `ExtractedClaim[]`, meant to be spread alongside the existing
 * `understanding.claims`/`extendedFactClaims(...)` at each of this
 * project's 3 claim-assembly points (mirrors `extendedFactClaims`'s own
 * "one call combining everything a caller needs" pattern). Pure — takes
 * an already-parsed page, fetches nothing. */
export function extractPriorityFieldClaims(parsed: ParsedLandingPage): ExtractedClaim[] {
  return [...extractFeeCandidates(parsed), ...extractAccreditationItems(parsed), ...extractRankingItems(parsed), ...extractOthersClaims(parsed)];
}
