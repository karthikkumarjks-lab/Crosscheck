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
  // 2026-08-20 addition -- plain plural forms of words already on this
  // list. `keywordsOf` does zero stemming (exact string tokens only), so
  // "course"/"program"/"degree" being listed never covered their own
  // plurals. Live-confirmed real bug on onlinemanipal.com: a target
  // page's own program text ends in the boilerplate suffix "... (MBA)
  // Courses", and with the singular "course" already excluded but
  // "courses" not, that ONE leftover plural word became the target's
  // entire subject-keyword set -- degenerately passing the gate for any
  // unrelated candidate (a BCom page, an MA Economics page, etc.) that
  // happened to also say "Courses" anywhere, while REJECTING the actual
  // correct MBA candidate page because its own title/headings never
  // happen to repeat that generic word. A gate meant to require genuine
  // subject overlap was instead keying off which pages repeat one
  // boilerplate marketing word.
  "courses",
  "programs",
  "programmes",
  "degrees",
  // 2026-08-21 addition -- generic institutional-category words, the
  // same category as "science"/"arts"/"engineering"/"management" above:
  // recur across ANY institution's own naming (a university names itself
  // "... University", a college "... College") and, on their own, never
  // discriminate one specific institution's subject from another's --
  // `institutionExclusionText` (tokenize.ts) already subtracts an
  // identity's OWN specific institution/brand wording (e.g. "Manipal"),
  // but a plural/singular mismatch between that guess ("Manipal
  // University") and a page's own phrasing ("Manipal Universities") can
  // leave the generic word itself behind -- live-confirmed on
  // manipaluniversity.co.in/online-bba-degrees.
  "university",
  "universities",
  "college",
  "colleges",
  "institute",
  "institutes",
  "institution",
  "institutions",
];
