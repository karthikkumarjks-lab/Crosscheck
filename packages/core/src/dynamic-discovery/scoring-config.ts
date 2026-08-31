import type { DiscoveryScoringConfig } from "../types.js";
import { DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG } from "./program-relevance.js";

/**
 * Sprint 5 MVP defaults (docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md §7,
 * approved with binding requirements per §18 Decision #4). Every weight
 * and threshold lives here, in exactly one place — score.ts never
 * hard-codes a number inline. Tuning a default after real-world
 * validation is a data change here, not a code change in score.ts.
 */
export const DEFAULT_DISCOVERY_SCORING_CONFIG: DiscoveryScoringConfig = {
  weights: {
    degreeMatch: 60,
    programMatch: 25,
    institutionMatch: 15,
    headingKeywordMatch: 10,
    // 2026-08-21 fix — live-confirmed real case (msc-ds-popup): a
    // candidate's OWN URL containing the target's subject keyword is
    // deliberate, curated evidence (a page's URL slug is chosen
    // specifically to represent that page's own subject) — more
    // reliable than a heading merely mentioning the word once, which can
    // happen incidentally (a Biostatistics page's own accurate,
    // unrelated curriculum bullet "Explore Data Science in Healthcare"
    // gave a wrong candidate the same heading bonus a genuine Data
    // Science candidate got). Raised from 8 (below headingKeywordMatch)
    // to 15 so a URL match this specific and deliberate can, on its own,
    // widen a close score gap past minWinnerMargin — the correct
    // candidate was already winning by score (118 vs 110) purely from
    // its own URL containing "data science"; only the margin was too
    // thin to clear the ambiguity threshold.
    urlKeywordMatch: 15,
    pageTypePlausibility: 5,
    homepagePenalty: -20,
    // Fix 1 (institution identity tie-break, real SMU-batch validation):
    // must alone exceed minWinnerMargin (15) below, so a specific,
    // resolved institution match can settle an otherwise-exact tie
    // between same-degree candidates from different institutions sharing
    // one generic brand (the real MBA/B.Com Online Manipal case) without
    // needing to touch any other weight.
    institutionIdentityMatch: 20,
  },
  thresholds: {
    minConfidenceThreshold: 40,
    highConfidenceScore: 70,
    minWinnerMargin: 15,
  },
  // Sprint 5 Revision 1 — Program Relevance Gate, on by default (§14
  // Decision #3): the whole point of this revision is to fix the
  // demonstrated gap by default, not require callers to discover and
  // enable it.
  programRelevanceGate: DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
};
