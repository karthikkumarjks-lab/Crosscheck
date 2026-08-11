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
];
