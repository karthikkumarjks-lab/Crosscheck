import type { FactEvidence, PriorityFieldStatus, SemanticFact } from "../types.js";
import { normalizeSemanticValue, stripProgramPrefix } from "../normalization/normalizeSemanticValue.js";

/**
 * Generic evidence-backed set comparison over `SemanticFact[]` — shared
 * by Specialization (list comparison), Accreditation, and Rankings &
 * Accreditations (§6/§11 of the semantic layer plan all describe the same
 * shape of comparison: two lists of short facts, matched by meaning, not
 * literal string equality). Reuses `normalizeSemanticValue` for exact-
 * equivalence keying, then a token-overlap pass reconciles near-
 * equivalent wording ("Healthcare Management" vs. "Healthcare") into an
 * explicit `NEEDS_REVIEW`-worthy pairing rather than reporting it as two
 * unrelated differences — per the explicit requirement not to guess a
 * confident match OR mismatch for a partial-wording case.
 */

function keywordSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length >= 3),
  );
}

/** True when at least half of the smaller value's meaningful tokens also
 * appear in the larger value — "healthcare" (1 token) fully contained in
 * "healthcare management" (2 tokens) scores 1/1 = 1.0; two unrelated
 * short phrases sharing at most an incidental word score low and are
 * correctly NOT paired. */
export function tokensOverlapEnough(a: string, b: string): boolean {
  const ta = keywordSet(a);
  const tb = keywordSet(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const [smaller, larger] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let overlap = 0;
  for (const token of smaller) if (larger.has(token)) overlap += 1;
  return overlap / smaller.size >= 0.5;
}

interface KeyedFact {
  key: string;
  fact: SemanticFact;
}

function keyFacts(facts: SemanticFact[], programHint: string | null): KeyedFact[] {
  const seen = new Set<string>();
  const result: KeyedFact[] = [];
  for (const fact of facts) {
    const key = normalizeSemanticValue(stripProgramPrefix(fact.value, programHint));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ key, fact });
  }
  return result;
}

function toEvidence(fact: SemanticFact): FactEvidence {
  return { url: fact.sourceUrl, excerpt: fact.value, confidence: fact.confidence, sourceType: fact.sourceType, heading: fact.heading };
}

export interface SemanticFactSetComparison {
  status: PriorityFieldStatus;
  masterValues: string[];
  targetValues: string[];
  notes: string | null;
  masterEvidence: FactEvidence | null;
  targetEvidence: FactEvidence | null;
}

export function compareSemanticFactSet(
  targetFacts: SemanticFact[],
  masterFacts: SemanticFact[],
  options: { programHint?: string | null; itemLabelSingular?: string; matchNote?: string | null } = {},
): SemanticFactSetComparison {
  const programHint = options.programHint ?? null;
  const itemLabel = options.itemLabelSingular ?? "item";

  const masterKeyed = keyFacts(masterFacts, programHint);
  const targetKeyed = keyFacts(targetFacts, programHint);
  const masterValues = masterKeyed.map((k) => k.fact.value);
  const targetValues = targetKeyed.map((k) => k.fact.value);
  const masterEvidence = masterKeyed[0] ? toEvidence(masterKeyed[0].fact) : null;
  const targetEvidence = targetKeyed[0] ? toEvidence(targetKeyed[0].fact) : null;

  if (masterKeyed.length === 0 && targetKeyed.length === 0) {
    return { status: "both_missing", masterValues, targetValues, notes: `${itemLabel} not found on either page.`, masterEvidence, targetEvidence };
  }
  if (masterKeyed.length === 0) {
    return { status: "master_missing", masterValues, targetValues, notes: `${itemLabel} not found on master (authoritative) page.`, masterEvidence, targetEvidence };
  }
  if (targetKeyed.length === 0) {
    return { status: "target_missing", masterValues, targetValues, notes: `${itemLabel} not found on target page.`, masterEvidence, targetEvidence };
  }

  const masterOnly = masterKeyed.filter((m) => !targetKeyed.some((t) => t.key === m.key));
  const targetOnly = targetKeyed.filter((t) => !masterKeyed.some((m) => m.key === t.key));

  // Reconcile near-equivalent wording pairs (e.g. "Healthcare Management"
  // vs. "Healthcare") out of the plain masterOnly/targetOnly leftovers --
  // greedy, first-match-wins, each item paired at most once.
  const pairedMasterKeys = new Set<string>();
  const pairedTargetKeys = new Set<string>();
  const nearEquivalentPairs: { master: KeyedFact; target: KeyedFact }[] = [];
  for (const m of masterOnly) {
    const pair = targetOnly.find((t) => !pairedTargetKeys.has(t.key) && tokensOverlapEnough(m.fact.value, t.fact.value));
    if (pair) {
      pairedMasterKeys.add(m.key);
      pairedTargetKeys.add(pair.key);
      nearEquivalentPairs.push({ master: m, target: pair });
    }
  }
  const unpairedMasterOnly = masterOnly.filter((m) => !pairedMasterKeys.has(m.key));
  const unpairedTargetOnly = targetOnly.filter((t) => !pairedTargetKeys.has(t.key));

  if (unpairedMasterOnly.length === 0 && unpairedTargetOnly.length === 0 && nearEquivalentPairs.length === 0) {
    return {
      status: "match",
      masterValues,
      targetValues,
      notes: options.matchNote ?? null,
      masterEvidence,
      targetEvidence,
    };
  }

  if (unpairedMasterOnly.length === 0 && unpairedTargetOnly.length === 0) {
    // Every difference is a near-equivalent wording pair -- a real
    // signal, but not confidently either a match or a mismatch.
    const notes = nearEquivalentPairs
      .map((p) => `Master says "${p.master.fact.value}", target says "${p.target.fact.value}" — likely the same ${itemLabel}, worded differently; review to confirm.`)
      .join(" ");
    return { status: "needs_review", masterValues, targetValues, notes, masterEvidence, targetEvidence };
  }

  const noteParts: string[] = [];
  for (const m of unpairedMasterOnly) noteParts.push(`Target is missing ${m.fact.value} ${itemLabel} listed on the authoritative page.`);
  for (const t of unpairedTargetOnly) noteParts.push(`Target additionally lists ${t.fact.value}, not found on the authoritative page.`);
  for (const p of nearEquivalentPairs)
    noteParts.push(`Master says "${p.master.fact.value}", target says "${p.target.fact.value}" — likely the same ${itemLabel}, worded differently; review to confirm.`);

  return { status: "changed", masterValues, targetValues, notes: noteParts.join(" "), masterEvidence, targetEvidence };
}
