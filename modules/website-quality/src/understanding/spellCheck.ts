import dictionary from "dictionary-en";
import nspellFactory from "nspell";
import type { SpellCheckItem, SpellCheckResult } from "@crosscheck/core";

/**
 * Component: per-page spell check (2026-09-02, user-requested) — "does
 * THIS page's own text have spelling mistakes?", independent of the
 * Master-vs-Target comparison every other field does. Deterministic,
 * dictionary-based (Hunspell's `en_US` word list via `nspell`), no LLM,
 * matching the rest of this project's "no-LLM" discipline.
 *
 * Checks the tool's own already-extracted content (`{text, fieldKey}`
 * pairs built by the caller from claims/semantic facts) rather than raw
 * page HTML — the meaningful prose the report already surfaces (fee
 * text, eligibility, curriculum, specializations, accreditation...), not
 * nav links/footer/cookie-banner chrome nobody asked to have checked.
 */

let spellPromise: Promise<ReturnType<typeof nspellFactory>> | null = null;

/** Loaded once per process, reused for every page — the dictionary
 * itself never changes between calls, and (re)loading it is the one
 * genuinely non-trivial cost here. */
function getSpellChecker(): Promise<ReturnType<typeof nspellFactory>> {
  // `dictionary-en`'s and `@types/nspell`'s declared types disagree on
  // Buffer vs Uint8Array for the exact same data at runtime (confirmed
  // working via manual test) -- an `any` cast here, not a real type hole.
  if (!spellPromise) spellPromise = Promise.resolve(nspellFactory(dictionary as any));
  return spellPromise;
}

const WORD_PATTERN = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
/** Below this length, a "misspelling" is almost always noise (a stray
 * single letter from bullet-point markup, "a"/"an"/"to" always spell
 * correctly anyway) — not a real product decision, just avoids wasted
 * dictionary lookups on tokens too short to ever legitimately fail. */
const MIN_WORD_LENGTH = 3;
/** Per distinct misspelled word, how many of its occurrences to keep
 * evidence for — a word repeated 40 times across a page's fee/EMI
 * boilerplate doesn't need 40 identical location entries to be useful. */
const MAX_LOCATIONS_PER_WORD = 5;

/** An all-uppercase token (MAHE, UGC, EMI, NAAC, AICTE...) is never
 * genuine English prose to spell-check — it's an acronym/institution
 * code, generic across ANY institution's page, no site-specific
 * vocabulary hard-coded here. Real misspellings are essentially never
 * all-caps by construction (a typo in normal sentence-case text stays
 * sentence-case). Also covers the plural of an acronym (e.g. "EMIs") --
 * live-confirmed false positive: an acronym is never itself pluralized
 * with an uppercase S, so stripping one trailing lowercase "s" and
 * re-checking never misclassifies a genuine lowercase word. */
function isAcronymOrCode(word: string): boolean {
  if (word === word.toUpperCase()) return true;
  if (word.length > 2 && word.endsWith("s")) {
    const stem = word.slice(0, -1);
    if (stem === stem.toUpperCase()) return true;
  }
  return false;
}

/**
 * Common British/Indian-English spellings that `dictionary-en` (US-only)
 * doesn't recognize — live-confirmed real false positive: "amongst" is
 * completely standard English, just not the American spelling this one
 * dictionary carries, and Indian higher-ed sites use British spelling
 * throughout. Merging in a full `dictionary-en-gb` word list was tried
 * and rejected: nspell needs one dictionary's own affix rules, and
 * reusing en_US's affix rules against en_GB's differently-coded `.dic`
 * entries produced cross-contaminated stemming that started marking a
 * genuine typo ("recieve") as correct too — a real, unacceptable
 * regression to the one thing this feature must never get wrong. A
 * small, explicit, hand-checked list carries none of that risk.
 */
const BRITISH_SPELLING_ALLOWLIST = new Set([
  "amongst",
  "whilst",
  "programme",
  "programmes",
  "colour",
  "colours",
  "favour",
  "favours",
  "favourite",
  "organisation",
  "organisations",
  "organise",
  "organised",
  "organising",
  "recognise",
  "recognised",
  "recognising",
  "centre",
  "centres",
  "theatre",
  "licence",
  "licenced",
  "defence",
  "honour",
  "honours",
  "labour",
  "neighbour",
  "practise",
  "practised",
  "enrolment",
  "fulfil",
  "fulfilment",
  "skilful",
  "catalogue",
  "catalogues",
  "analyse",
  "analysed",
  "analysing",
  "realise",
  "realised",
  "utilise",
  "utilised",
  "utilising",
]);

/**
 * 2026-09-03, explicit user request ("abled, onlinemanipal, Coursera is
 * also a word so you can ignore that as well" -- reported against a real
 * onlinemanipal.com run's spell-check results): three more real, non-
 * British-spelling false positives from the same dictionary-coverage gap
 * class as `BRITISH_SPELLING_ALLOWLIST` above, just not British spellings
 * specifically -- "abled" (as in "differently abled", standard inclusive-
 * language phrasing `dictionary-en` doesn't carry alone), "Coursera" (a
 * real third-party platform name, a proper noun no generic dictionary
 * will ever carry), and "onlinemanipal" (this site's own domain name
 * fragment, appearing in its own body text, e.g. "official links on the
 * onlinemanipal.com domain"). Kept separate from the British-spelling
 * list since the reasoning for each entry differs, even though the
 * lookup mechanism is identical.
 *
 * "ioa" added same day: the user's very first report ("remove IOA") was
 * actually THIS -- "IoA" (Institute of Analytics), written in mixed case
 * on the real page ("accredited by the Institute of Analytics (IoA)").
 * `isAcronymOrCode` only recognizes an ALL-CAPS acronym (or its plural);
 * "IoA" 's lowercase "o" fails that check, so it fell through to the
 * dictionary and was flagged. Confirmed only after re-checking `spellCheck`
 * data directly -- an earlier case-sensitive text search for "IOA" (all
 * caps) across `priorityComparison` missed it because the real text is
 * "IoA", not "IOA"; that miss is what led to a separate, still
 * independently valid, user-confirmed "IOE Status" accreditation-item
 * exclusion instead (see `EXCLUDED_FACT_PATTERNS` in
 * `packages/core/.../priorityComparison.ts`). Both stand: they're
 * unrelated, and neither is wrong on its own.
 */
const EXTRA_ALLOWED_WORDS = new Set(["abled", "onlinemanipal", "coursera", "ioa"]);

/** Strips HTML tags before tokenizing -- live-confirmed real bug: some
 * FEES semantic facts carry raw markup fragments (e.g. an `<img src="…">`
 * that leaked into a fact's extracted value) rather than clean text, and
 * without this, attribute/tag names like "img"/"src"/"svg" get flagged
 * as "misspellings" — meaningless noise that undermines the whole
 * feature's counts. This is a defensive fix at the spell-check boundary,
 * not a fix to whatever upstream extraction let the markup through in
 * the first place (a separate, deeper issue). */
function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, " ");
}

/**
 * Builds the per-page known-proper-nouns set from this SAME page's own
 * already-resolved identity (institution/program/brand/degree names) —
 * generic, not hard-coded to any specific institution: whatever this
 * page's own text says its institution/program is becomes exempt from
 * spell-checking, since a real institution/program name is never a
 * "misspelling" regardless of whether a generic English dictionary
 * happens to recognize it (e.g. "Manipal").
 */
export function properNounWordsFrom(...values: (string | null | undefined)[]): Set<string> {
  const words = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const word of value.split(/[^A-Za-z']+/)) {
      if (word.length >= 2) words.add(word.toLowerCase());
    }
  }
  return words;
}

export interface SpellCheckTextSource {
  fieldKey: string;
  text: string;
}

export async function checkSpelling(sources: SpellCheckTextSource[], knownWords: Set<string>): Promise<SpellCheckResult> {
  const spell = await getSpellChecker();
  const items = new Map<string, SpellCheckItem>();
  let count = 0;

  for (const { fieldKey, text: rawText } of sources) {
    const text = stripHtmlTags(rawText);
    WORD_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD_PATTERN.exec(text))) {
      const word = match[0];
      if (word.length < MIN_WORD_LENGTH) continue;
      if (isAcronymOrCode(word)) continue;
      const lower = word.toLowerCase();
      if (knownWords.has(lower)) continue;
      if (BRITISH_SPELLING_ALLOWLIST.has(lower)) continue;
      if (EXTRA_ALLOWED_WORDS.has(lower)) continue;
      if (spell.correct(word)) continue;

      count += 1;
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + word.length + 30);
      const excerpt = text.slice(start, end).trim();

      const existing = items.get(lower);
      if (existing) {
        if (existing.locations.length < MAX_LOCATIONS_PER_WORD) existing.locations.push({ fieldKey, excerpt });
      } else {
        items.set(lower, { word, locations: [{ fieldKey, excerpt }] });
      }
    }
  }

  return { count, items: [...items.values()] };
}
