import dictionary from "dictionary-en-gb";
import nspellFactory from "nspell";
import type { SpellCheckItem, SpellCheckResult } from "@crosscheck/core";

/**
 * Component: per-page spell check (2026-09-02, user-requested) — "does
 * THIS page's own text have spelling mistakes?", independent of the
 * Master-vs-Target comparison every other field does. Deterministic,
 * dictionary-based (Hunspell's `en_GB` word list via `nspell`), no LLM,
 * matching the rest of this project's "no-LLM" discipline.
 *
 * 2026-09-03, explicit user instruction ("We are using british english so
 * you can check accordingly"): British English (`dictionary-en-gb`), not
 * American, is the checked dialect — every institution this tool has been
 * tested against so far is Indian higher-ed, which follows British
 * spelling conventions throughout ("amongst", "programme", "colour",
 * "organise", "centre"...). A SINGLE dictionary, not merged with
 * `dictionary-en` (US) -- merging both was tried first (to get "the union
 * of both dialects never flagged") and rejected: nspell needs one
 * dictionary's own affix rules, and reusing one dialect's affix rules
 * against the other's differently-flag-coded `.dic` entries produced
 * cross-contaminated stemming that started marking a genuine typo
 * ("recieve") as *correct* -- an unacceptable regression to the one thing
 * this feature must never get wrong, confirmed via a direct comparison
 * test before reverting. A single `dictionary-en-gb` has no such risk
 * (one dictionary, one affix file) and was verified directly: every
 * common British spelling correct, "recieve"/"teh" still correctly wrong.
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
  // `dictionary-en-gb`'s and `@types/nspell`'s declared types disagree on
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
/** A short, mostly-uppercase token is never genuine English prose to
 * spell-check -- only above this length does "mostly uppercase" stop
 * being a reliable acronym/abbreviation signal (see `isAcronymOrCode`). */
const MAX_ACRONYM_LENGTH = 6;
/** Per distinct misspelled word, how many of its occurrences to keep
 * evidence for — a word repeated 40 times across a page's fee/EMI
 * boilerplate doesn't need 40 identical location entries to be useful. */
const MAX_LOCATIONS_PER_WORD = 5;

/**
 * An all-uppercase token (MAHE, UGC, EMI, NAAC, AICTE...) is never
 * genuine English prose to spell-check — it's an acronym/institution
 * code, generic across ANY institution's page, no site-specific
 * vocabulary hard-coded here. Real misspellings are essentially never
 * all-caps by construction (a typo in normal sentence-case text stays
 * sentence-case). Also covers the plural of an acronym (e.g. "EMIs") --
 * an acronym is never itself pluralized with an uppercase S, so
 * stripping one trailing lowercase "s" and re-checking never
 * misclassifies a genuine lowercase word.
 *
 * 2026-09-03, generalized after a second live-confirmed false positive:
 * "IoA" (Institute of Analytics) and, per the user's report, "MSc"/"PhD"-
 * shaped degree abbreviations all fail the all-uppercase check above
 * because of one embedded lowercase connector letter ("of" -> "o",
 * conventional degree styling "Sc"/"hD") -- exactly the kind of token a
 * higher-ed site is saturated with (MSc, PhD, BSc, MBA-adjacent
 * abbreviations...). A short (<= 6 char) token with 2+ uppercase letters
 * is, in practice, always this same acronym/abbreviation shape, never a
 * genuine typo: a real misspelling never spontaneously introduces a
 * SECOND capital letter mid-word, only wrong/missing/transposed letters
 * within the word's existing case.
 */
function isAcronymOrCode(word: string): boolean {
  if (word === word.toUpperCase()) return true;
  if (word.length > 2 && word.endsWith("s")) {
    const stem = word.slice(0, -1);
    if (stem === stem.toUpperCase()) return true;
  }
  if (word.length <= MAX_ACRONYM_LENGTH) {
    const upperCount = (word.match(/[A-Z]/g) ?? []).length;
    if (upperCount >= 2) return true;
  }
  return false;
}

/**
 * Words a generic British-English dictionary still won't carry, each
 * live-confirmed as a real false positive against actual onlinemanipal.com
 * runs, none of them a spelling-dialect issue (that's what switching to
 * `dictionary-en-gb` above already covers) -- proper nouns/brand names no
 * dictionary will ever carry ("Coursera", "DataCamp"), this site's own
 * domain fragment ("onlinemanipal"), an inclusive-language term
 * (differently "abled"), an informal marketing coinage ("flexi", as in
 * "flexi-payment"), and modern workforce/EdTech vocabulary too recent for
 * this dictionary ("upskilling"/"reskilling" and their inflections --
 * exactly the kind of term a career-education platform uses constantly).
 */
const EXTRA_ALLOWED_WORDS = new Set([
  "abled",
  "onlinemanipal",
  "coursera",
  "datacamp",
  "flexi",
  "upskill",
  "upskills",
  "upskilled",
  "upskilling",
  "reskill",
  "reskills",
  "reskilled",
  "reskilling",
]);

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
