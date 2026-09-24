import type { ExtractedClaim, ParsedLandingPage } from "@crosscheck/core";
import { accreditationItemLabels, feeCandidateLabels, othersFieldLabels, rankingItemLabels } from "../data/index.js";
import { escapeRegExp, findWordBounded } from "./util.js";

const EXCERPT_MAX_LENGTH = 300;

interface LabeledMatch {
  value: string;
  excerpt: string;
  feeDiscountRole?: "original" | "discounted";
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

  function record(excerpt: string, value: string, feeDiscountRole?: "original" | "discounted"): void {
    const key = excerpt.trim().toLowerCase();
    if (seenExcerpts.has(key) || !key) return;
    seenExcerpts.add(key);
    matches.push({ value: value.slice(0, EXCERPT_MAX_LENGTH), excerpt: excerpt.slice(0, EXCERPT_MAX_LENGTH), feeDiscountRole });
  }

  // Regex compiled once per label (not once per block x label) --
  // labels.length is small and fixed, textBlocks can be large on a real
  // page, so this is the axis worth hoisting out of the loop.
  const patterns = labels.map((label) => new RegExp(`\\b${escapeRegExp(label)}\\b\\s*[:\\-–—]\\s*(.+)`, "i"));
  for (const block of parsed.textBlocks) {
    for (const pattern of patterns) {
      const match = pattern.exec(block.text);
      const value = match?.[1]?.trim();
      if (value) record(block.text, value, block.feeDiscountRole);
    }
  }

  for (const heading of parsed.headings) {
    const matchesLabel = labels.some((label) => findWordBounded(heading.text, label));
    if (!matchesLabel) continue;
    const blocks = parsed.textBlocks.filter((block) => block.headingContext === heading.text);
    for (const block of blocks) {
      if (block.text) record(block.text, block.text, block.feeDiscountRole);
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
      feeDiscountRole: m.feeDiscountRole,
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

/** A bare "N Credits" badge (2026-09-24, user-requested) — some pages
 * checked show this as its own short summary badge alongside "24
 * months"/"4 Sem" (a program-overview info-strip, not a "Label: Value"
 * pair, and not under a heading literally named "Credits" either -- it
 * sits inside the Course Curriculum section's own intro strip), so
 * neither of `findAllLabeledMatches`'s two strategies would find it.
 * Every OTHER "credit" mention on a real page checked ("Academic Bank of
 * Credits", "credit norms" in a loan-eligibility FAQ) is unrelated —
 * anchoring the match to the WHOLE text block (`^...$`, not `\b...\b`
 * anywhere in a longer sentence) keeps this specific to the genuine
 * total-credits badge. First match only (a scalar field, like
 * duration) — a page states its own program credit total once. */
const CREDITS_BADGE_PATTERN = /^\d+\s*credits?$/i;

/** 2026-09-24, live-confirmed real bug: other pages never give credits
 * its own bare block at all -- it's folded into one pipe-separated
 * "quick facts" summary line together with duration/semesters/weekly
 * hours (e.g. "24 months | 4 semesters | 15-20 hours/week | 92
 * credits"), so `CREDITS_BADGE_PATTERN`'s whole-block anchor never
 * matches it. Falls back to finding "<number> credit(s)" anywhere
 * within a block -- still requiring the number immediately before the
 * word (not `\bcredits?\b` alone), which is what keeps it from matching
 * unrelated prose like "Academic Bank of Credits" or "meeting credit
 * norms" (neither has a digit right before "credit"). Extracts just the
 * matched "NN Credits" portion, not the whole summary line, so this
 * compares like-for-like against a page that states it as its own bare
 * badge. */
const CREDITS_EMBEDDED_PATTERN = /\b(\d+)\s*credits?\b/i;

export function extractCreditsClaim(parsed: ParsedLandingPage): ExtractedClaim[] {
  const bareBadge = parsed.textBlocks.find((b) => CREDITS_BADGE_PATTERN.test(b.text.trim()));
  if (bareBadge) {
    const text = bareBadge.text.trim();
    return [{ fieldKey: "credits", rawValue: text, sourceLocation: { url: parsed.sourceUrl, excerpt: text }, extractionMethod: "regex", extractedAt: new Date().toISOString() }];
  }
  for (const block of parsed.textBlocks) {
    const match = CREDITS_EMBEDDED_PATTERN.exec(block.text);
    if (!match) continue;
    const value = `${match[1]} Credits`;
    return [{ fieldKey: "credits", rawValue: value, sourceLocation: { url: parsed.sourceUrl, excerpt: block.text.trim() }, extractionMethod: "regex", extractedAt: new Date().toISOString() }];
  }
  return [];
}

/** Combines every Sprint 6 priority-field extraction into one flat
 * `ExtractedClaim[]`, meant to be spread alongside the existing
 * `understanding.claims`/`extendedFactClaims(...)` at each of this
 * project's 3 claim-assembly points (mirrors `extendedFactClaims`'s own
 * "one call combining everything a caller needs" pattern). Pure — takes
 * an already-parsed page, fetches nothing. */
export function extractPriorityFieldClaims(parsed: ParsedLandingPage): ExtractedClaim[] {
  return [...extractFeeCandidates(parsed), ...extractAccreditationItems(parsed), ...extractRankingItems(parsed), ...extractOthersClaims(parsed), ...extractCreditsClaim(parsed)];
}
