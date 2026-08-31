import type { EntityGuess, SourceRegistry } from "../types.js";

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Shared tokenizer for every dynamic-discovery signal that compares free
 * text by keyword (candidate scoring's heading/URL keyword signals, and
 * the Program Relevance Gate's subject-keyword derivation). Lives in its
 * own module, separate from `score.ts`/`program-relevance.ts`, purely so
 * those two files can both depend on it without depending on each other.
 */
export function keywordsOf(value: string): string[] {
  return normalizeForComparison(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= 3);
}

/** Combines an identity's matched degree alias with its canonicalized
 * `degree.value` -- plus a punctuation-stripped, concatenated form of
 * `degree.value` (e.g. "M.Com" -> "MCom") -- into one string for a caller
 * to exclude degree-boilerplate tokens from a subject/keyword comparison.
 * Shared by `program-relevance.ts`'s `subjectTokens` (the Program
 * Relevance Gate) and `score.ts`'s `identityKeywords` (candidate scoring's
 * heading/URL keyword bonus) — both need the exact same exclusion rule,
 * for the exact same reason: a program's own text almost always spells
 * the degree out in full ("Master of Arts (Political Science) (MA)"), so
 * without this, generic degree-name words ("master", "arts") leak through
 * as if they were subject-discriminating, causing every candidate sharing
 * that same degree family to score/match on that shared boilerplate
 * alone, regardless of actual subject (2026-08-20 fix, live-confirmed on
 * onlinemanipal.com: every MA-degree candidate scored a uniform +10
 * keyword-overlap bonus against every MA target, real subject or not,
 * because "master"/"arts" appear in literally every MA page's own
 * heading/title text — never subtracted from `identityKeywords` before
 * this fix, unlike the Program Relevance Gate's own `subjectTokens`,
 * which already excluded them). See docs/DECISIONS.md ADR-025.
 *
 * 2026-08-21 fix — live-confirmed real bug: a "subject hub" page's title
 * can name TWO degrees at once ("MSC and PGCP DS LP"), and degree
 * matching only ever picks ONE winner (whichever alias the matcher
 * prefers) to become `degree.value`/the primary `matchedSignals[0]`. The
 * OTHER, non-winning degree word was never excluded from anything,
 * silently surviving into the subject-keyword set as if it were a real
 * differentiator — degenerately requiring a candidate to also say "msc"
 * to pass, when no real MSc-degree candidate's own text ever keeps its
 * own bare degree acronym after its OWN degree-exclusion runs. Now folds
 * in EVERY `matchedSignals` entry, not just the first — the caller
 * (`matchDegreeAndProgram` in modules/website-quality) is responsible
 * for recording every co-occurring degree mention there when it finds
 * one, not just the winning match. Purely additive for every existing
 * single-degree caller, whose `matchedSignals` already has exactly one
 * entry. */
export function degreeExclusionText(degree: EntityGuess | null): string | null {
  if (!degree) return null;
  const concatenatedValue = degree.value.replace(/[^a-zA-Z0-9]/g, "");
  const matchedTexts = degree.matchedSignals.map((signal) => signal.matchedText);
  return [...matchedTexts, degree.value, concatenatedValue].join(" ");
}

/** 2026-08-21 fix — the same exclusion `degreeExclusionText` provides for
 * degree wording, but for an identity's own detected institution/brand
 * text. The Program Relevance Gate's own doc comment already states a
 * candidate must never pass "on the basis of ... institution/brand
 * match ... structurally excluded from this function's own inputs" — but
 * nothing was actually subtracting institution/brand words from the raw
 * subject-token set, so whenever a target's own `program` text had no
 * real specialization wording beyond institution/brand boilerplate (e.g.
 * "Online BBA courses from Manipal Universities" — real subject content:
 * none; degree "BBA" already excluded; left over: "manipal",
 * "universities"), those institution/brand words silently became the
 * ENTIRE subject-keyword set, degenerately requiring every candidate to
 * also repeat "manipal"/"university" to pass — live-confirmed on
 * manipaluniversity.co.in/online-bba-degrees, which rejected its own
 * correct MUJ BBA candidate this way. Excluding these words restores the
 * gate's own stated invariant instead of violating it.
 *
 * 2026-08-21 fix: also accepts an optional `registry`, whose every
 * institution's own name/aliases/brandNames are folded into the
 * exclusion text too — not just the ONE institution/brand guess this
 * particular identity's own extractor happened to detect. Live-confirmed
 * real regression from the guess-only version above: a target's
 * institution guess can be phrased differently ("MAHE Online") from how
 * its OWN program/title text spells the institution out ("Manipal
 * Academy of Higher Education") — leaving "manipal"/"academy" etc.
 * unexcluded on the target side while a candidate whose guess literally
 * says "Online Manipal" gets "manipal" excluded on ITS side, breaking a
 * previously-working match through pure asymmetry. Institution name
 * fragments can never legitimately be the subject/specialization word
 * that makes two DIFFERENT programs distinguishable (that's the
 * Institution Relevance Gate's job, deliberately excluded from this
 * function's own inputs per its doc comment above) — so excluding every
 * registered institution's own vocabulary, symmetrically, on both sides,
 * closes this gap regardless of which phrasing either page happens to
 * use. Optional/absent for every pre-fix caller — zero behavior change
 * unless `registry` is passed. */
export function institutionExclusionText(institution: EntityGuess | null, brand: EntityGuess | null, registry?: SourceRegistry): string | null {
  const guessText = [
    institution?.matchedSignals[0]?.matchedText ?? "",
    institution?.value ?? "",
    brand?.matchedSignals[0]?.matchedText ?? "",
    brand?.value ?? "",
  ].join(" ");
  if (!registry) return institution || brand ? guessText : null;
  const registryText = registry.institutions.flatMap((inst) => [inst.name, ...inst.aliases, ...inst.brandNames]).join(" ");
  return [guessText, registryText].join(" ");
}
