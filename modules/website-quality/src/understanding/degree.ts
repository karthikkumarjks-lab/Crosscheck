import type { Confidence, EntityGuess, EntityMatchSignal, ParsedLandingPage } from "@crosscheck/core";
import { DEFAULT_PROGRAM_RELEVANCE_STOPWORDS, keywordsOf } from "@crosscheck/core";
import { degreeKeywords, type DegreeKeywordEntry } from "../data/index.js";
import { findWordBounded } from "./util.js";

interface FlatAlias {
  alias: string;
  entry: DegreeKeywordEntry;
}

const flatAliases: FlatAlias[] = degreeKeywords
  .flatMap((entry) => entry.aliases.map((alias) => ({ alias, entry })))
  .sort((a, b) => b.alias.length - a.alias.length);

const TITLE_SEPARATOR_PATTERN = /[|\-–—:]/;

export function getDegreeLevel(degreeName: string): DegreeKeywordEntry["level"] | null {
  const entry = degreeKeywords.find((candidate) => candidate.name === degreeName);
  return entry ? entry.level : null;
}

interface DegreeMatch {
  entry: DegreeKeywordEntry;
  alias: string;
  location: "title" | "heading" | "url";
}

function matchAliasIn(text: string): { alias: string; entry: DegreeKeywordEntry } | null {
  for (const { alias, entry } of flatAliases) {
    if (findWordBounded(text, alias)) return { alias, entry };
  }
  return null;
}

/** Title match > heading match > URL match; longest alias wins within a
 * location, so "MA JMC" is preferred over the bare "MA".
 *
 * 2026-08-31 fix — live-confirmed real case: onlinemanipal.com's
 * `online-bba-mahe` and `online-bcom-mahe` pages both carry a stale
 * `<title>` tag reading "...Master of Business Administration (MBA)
 * Courses..." — a leftover from template reuse — while their own H1 (the
 * page's real, current, visible content) correctly says "Online BBA /
 * BBA (Honors)..." and "Online BCom (Professional)..." respectively. The
 * unconditional title-first rule above took the stale title's degree
 * every time. When the primary heading (H1) names a DIFFERENT degree than
 * the title, the H1 wins — the page's own visible content is the more
 * trustworthy signal of what it currently offers than `<title>` metadata,
 * which this live case proves can go stale independent of the page body.
 * Scoped deliberately narrow: only the PRIMARY heading (not any heading
 * further down, e.g. a cross-sell section) can override title, and only
 * on an outright disagreement — an H1 with no degree mention of its own
 * never touches the title match, so every existing single-degree page
 * (title and H1 agreeing, or H1 silent) resolves exactly as before. */
function findDegreeMatch(parsed: ParsedLandingPage): DegreeMatch | null {
  const titleMatch = parsed.title ? matchAliasIn(parsed.title) : null;
  const primaryHeadingMatch = parsed.headings[0] ? matchAliasIn(parsed.headings[0].text) : null;
  if (titleMatch && primaryHeadingMatch && titleMatch.entry.id !== primaryHeadingMatch.entry.id) {
    return { entry: primaryHeadingMatch.entry, alias: primaryHeadingMatch.alias, location: "heading" };
  }
  if (titleMatch) return { entry: titleMatch.entry, alias: titleMatch.alias, location: "title" };

  for (const heading of parsed.headings) {
    for (const { alias, entry } of flatAliases) {
      if (findWordBounded(heading.text, alias)) return { entry, alias, location: "heading" };
    }
  }

  // Normalize path/query separators to spaces so findWordBounded's
  // alnum-boundary check applies to whole path segments/words, not raw
  // substrings — "ma" must not match inside ".../estimate-fees".
  const urlWords = decodeURIComponent(parsed.sourceUrl)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  for (const { alias, entry } of flatAliases) {
    if (alias.length >= 2 && findWordBounded(urlWords, alias)) {
      return { entry, alias, location: "url" };
    }
  }

  return null;
}

/** How many headings past the first same-degree ("primary") heading are
 * still eligible to be preferred over it. Keeps the specificity re-rank
 * below strictly local: a same-degree heading buried deep in an unrelated
 * section (e.g. a "Other Electives/Specializations Offered" cross-sell
 * list, which itself contains the degree alias in its own heading, plus
 * every list item below it) must never be treated as this page's own
 * program identity merely for having more distinctive words than the
 * primary heading. */
const HEADING_ADJACENCY_WINDOW = 2;

const PROGRAM_VALUE_STOPWORD_SET = new Set(DEFAULT_PROGRAM_RELEVANCE_STOPWORDS.map((word) => word.toLowerCase()));

/** How many words in `headingText` are neither part of the matched degree's
 * own name/aliases nor generic marketing/structural filler (the same,
 * already-reviewed, institution-agnostic list the Program Relevance Gate
 * uses — see `DEFAULT_PROGRAM_RELEVANCE_STOPWORDS`). A heading that is
 * just the degree name plus an institution name (e.g. "Master of Business
 * Administration from MAHE") scores low; a heading that also names a
 * specialization/variant (e.g. "...with Specialization in Finance")
 * scores higher — purely from vocabulary richness, never a specific
 * program/institution name hard-coded anywhere. */
function specificityScore(headingText: string, entry: DegreeKeywordEntry): number {
  const degreeTokens = new Set([entry.name, ...entry.aliases].flatMap((alias) => keywordsOf(alias)));
  return keywordsOf(headingText).filter((token) => !degreeTokens.has(token) && !PROGRAM_VALUE_STOPWORD_SET.has(token)).length;
}

/**
 * The <title> tag is often "<page-specific bit> | <institution>" — not a
 * useful program name on its own. Prefer a heading that names this same
 * degree (usually the H1, e.g. "MBA in Marketing Management"); among
 * same-degree headings within `HEADING_ADJACENCY_WINDOW` of the first
 * ("primary") one, prefer whichever carries the most specific content
 * (see `specificityScore`) — so a generic primary H1 ("Master of Business
 * Administration from MAHE") never shadows a more specific heading right
 * next to it ("Online MBA with Specialization in Finance"), while a
 * same-degree heading far down the page (a cross-sell electives list)
 * never overrides the primary no matter how specific-looking its own
 * text is. Falls back to the pre-separator segment of the title; falls
 * back to the bare degree name — unchanged from before, so a page with
 * only a generic heading and no nearby specialization wording still
 * returns that generic heading, never a fabricated one.
 */
function deriveProgramValue(entry: DegreeKeywordEntry, parsed: ParsedLandingPage): string {
  const matchingHeadings = parsed.headings
    .map((heading, index) => ({ heading, index }))
    .filter(({ heading }) => entry.aliases.some((alias) => findWordBounded(heading.text, alias)));

  if (matchingHeadings.length > 0) {
    const primary = matchingHeadings[0];
    let best = primary;
    let bestScore = specificityScore(primary.heading.text, entry);

    for (const candidate of matchingHeadings) {
      if (candidate === primary || candidate.index - primary.index > HEADING_ADJACENCY_WINDOW) continue;
      const score = specificityScore(candidate.heading.text, entry);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best.heading.text.trim();
  }

  if (parsed.title) {
    const firstSegment = parsed.title.split(TITLE_SEPARATOR_PATTERN)[0]?.trim();
    if (firstSegment && firstSegment.length > entry.name.length) {
      return firstSegment;
    }
  }

  return entry.name;
}

/**
 * Component C — generic, data-driven degree/program identification.
 * Matches against the degree dictionary (docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md
 * "Data-Driven, Not Hard-Coded"), not any single institution's structure.
 */
/** 2026-08-21 fix — user-confirmed real case: a "subject hub" page (e.g.
 * onlinemanipal.com/mahe-ds-courses) genuinely offers the SAME subject
 * ("Data Science") at multiple degree LEVELS (MSc and PGCP) side by side
 * — "different course pages, course is same but the level is different"
 * (user's own words). Its degree mentions live only inside a lead-capture
 * form's `<option>` values ("MSc Data Science", "PGCP Data Science"),
 * never in its title/heading/URL text, so `findDegreeMatch` correctly
 * finds nothing — but the page's own H1 still names a real, specific
 * subject ("Online Data Science Courses from Manipal Academy of Higher
 * Education"). Previously this meant BOTH `degree` and `program` came
 * back null, discarding that subject entirely and leaving every
 * downstream subject-keyword signal empty — the page could never surface
 * its real matching candidates at all, regardless of outcome.
 *
 * Falls back to the primary heading (or title) as a subject-only
 * `program` value, with `degree: null` and low confidence — never
 * fabricates a specific degree it can't find evidence for. This is
 * additive: every existing single-degree page still resolves exactly as
 * before, since `findDegreeMatch` succeeding always takes precedence.
 *
 * Guarded: only returns a value when the candidate text has at least two
 * substantive (non-stopword, 3+ letter) words — live-confirmed this
 * guard is load-bearing, not decorative. A blank/generic/dead-redirect
 * page's own heading ("Welcome") is exactly ONE generic word; without
 * this check it would have been fabricated into a "program" value,
 * silently resurrecting the top-up flip-flop bug ADR-024 fixed (a target
 * with no real identity keywords must never look like it has one — see
 * `identityKeywords(target).length > 0`'s top-up trigger guard in
 * `discoverAndCompareMany.ts`). A genuine subject-hub heading ("Online
 * Data Science Courses from Manipal Academy of Higher Education")
 * comfortably clears two substantive words ("data", "science") once
 * generic marketing/institution filler is subtracted. */
function hasSubstantiveSubjectContent(text: string): boolean {
  const substantiveWords = keywordsOf(text).filter((word) => !PROGRAM_VALUE_STOPWORD_SET.has(word));
  return substantiveWords.length >= 2;
}

function deriveSubjectOnlyProgramValue(parsed: ParsedLandingPage): string | null {
  const primaryHeading = parsed.headings[0]?.text?.trim();
  if (primaryHeading && hasSubstantiveSubjectContent(primaryHeading)) return primaryHeading;
  const titleFirstSegment = parsed.title?.split(TITLE_SEPARATOR_PATTERN)[0]?.trim();
  if (titleFirstSegment && hasSubstantiveSubjectContent(titleFirstSegment)) return titleFirstSegment;
  return null;
}

/** 2026-08-21 fix — live-confirmed real bug: a "subject hub" page's title
 * can name TWO degrees side by side ("MSC and PGCP DS LP" — a page
 * genuinely offering the same subject at two levels), and degree
 * matching only ever records the ONE winning match. The other degree
 * word was never excluded from anything downstream, silently surviving
 * into the target's subject-keyword set as if it were a real subject
 * differentiator — degenerately requiring a candidate to also say "msc"
 * to pass, when no real MSc-degree candidate's own text keeps its bare
 * degree acronym after its OWN degree-exclusion runs either. Scans the
 * SAME title/heading text for every OTHER degree dictionary alias
 * (different entry than the winner) and returns their matched text, to
 * be folded into the winning degree's own `matchedSignals` so
 * `degreeExclusionText` (packages/core/tokenize.ts) subtracts all of
 * them, not just the winner. */
function findOtherCoOccurringDegreeAliases(parsed: ParsedLandingPage, winningEntry: DegreeKeywordEntry): EntityMatchSignal[] {
  const texts: { text: string; location: "title" | "heading" }[] = [
    ...(parsed.title ? [{ text: parsed.title, location: "title" as const }] : []),
    ...parsed.headings.map((heading) => ({ text: heading.text, location: "heading" as const })),
  ];
  const found: EntityMatchSignal[] = [];
  const seenEntryIds = new Set<string>();
  for (const { text, location } of texts) {
    for (const { alias, entry } of flatAliases) {
      if (entry.id === winningEntry.id || seenEntryIds.has(entry.id)) continue;
      if (findWordBounded(text, alias)) {
        found.push({ signalType: "phrase_match", matchedText: alias, location });
        seenEntryIds.add(entry.id);
      }
    }
  }
  return found;
}

export function matchDegreeAndProgram(
  parsed: ParsedLandingPage,
): { degree: EntityGuess | null; program: EntityGuess | null } {
  const match = findDegreeMatch(parsed);
  if (!match) {
    const subjectOnlyValue = deriveSubjectOnlyProgramValue(parsed);
    if (!subjectOnlyValue) return { degree: null, program: null };
    return {
      degree: null,
      program: { value: subjectOnlyValue, confidence: "low", matchedSignals: [] },
    };
  }

  const { entry, alias, location } = match;
  const confidence: Confidence = location === "title" ? "high" : location === "heading" ? "medium" : "low";
  const signal: EntityMatchSignal = { signalType: "phrase_match", matchedText: alias, location };
  const otherDegreeSignals = findOtherCoOccurringDegreeAliases(parsed, entry);

  const degree: EntityGuess = { value: entry.name, confidence, matchedSignals: [signal, ...otherDegreeSignals] };
  const program: EntityGuess = { value: deriveProgramValue(entry, parsed), confidence, matchedSignals: [signal] };
  return { degree, program };
}
