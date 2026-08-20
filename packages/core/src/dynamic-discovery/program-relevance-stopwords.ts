/**
 * Generic, non-institution-specific marketing/structural filler words
 * that recur across any institution's program pages, regardless of
 * subject. Defense-in-depth for the Program Relevance Gate (Sprint 5
 * Revision 1, §3 Step 2) on top of degree-alias subtraction — an
 * illustrative starting set, not exhaustive, tunable independently of
 * gate logic. Contains no program, degree, or institution name.
 *
 * Includes broad academic-category words (e.g. "science", "arts",
 * "engineering") in addition to marketing filler: without these, two
 * genuinely different subjects that both happen to be named "...
 * Science"/"... Arts"/etc. (e.g. "MSc Data Science" vs. "MSc
 * Environmental Science") would pass the gate on that one shared,
 * non-discriminating category word alone — the exact class of
 * false-positive this gate exists to prevent (code review finding,
 * confirmed and fixed before this revision was reported complete).
 */
export const DEFAULT_PROGRAM_RELEVANCE_STOPWORDS: string[] = [
  "online",
  "program",
  "programme",
  "course",
  "degree",
  "from",
  "with",
  "the",
  "and",
  "for",
  "learn",
  "apply",
  "now",
  "get",
  "started",
  "your",
  "our",
  "top",
  "best",
  "new",
  "science",
  "arts",
  "engineering",
  "studies",
  "management",
  "technology",
  // 2026-08-20 addition -- the other half of every degree name's own
  // spelled-out form ("Master of Arts", "Bachelor of Commerce", etc.),
  // live-confirmed missing on onlinemanipal.com: every MA-degree
  // candidate's own heading/title text spells "Master of Arts" out in
  // full, so without this, "master" survived as a shared, non-
  // discriminating "subject" word across every MA program on the site.
  "master",
  "masters",
  "bachelor",
  "bachelors",
];
