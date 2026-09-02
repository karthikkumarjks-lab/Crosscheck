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
 * sentence-case). */
function isAcronymOrCode(word: string): boolean {
  return word === word.toUpperCase();
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

  for (const { fieldKey, text } of sources) {
    WORD_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD_PATTERN.exec(text))) {
      const word = match[0];
      if (word.length < MIN_WORD_LENGTH) continue;
      if (isAcronymOrCode(word)) continue;
      const lower = word.toLowerCase();
      if (knownWords.has(lower)) continue;
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
