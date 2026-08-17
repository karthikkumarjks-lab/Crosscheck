import type { ExtractionConfidence, SemanticClassification, SemanticFactClassifier, SemanticFieldCategory, SemanticSectionInput } from "../types.js";
import { SEMANTIC_CATEGORY_KEYWORDS, SEMANTIC_CATEGORY_PRIORITY } from "./semanticTaxonomy.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word/phrase-bounded match — "fee" matches "Course Fee Structure" but
 * never "coffee". Multi-word phrases (e.g. "area of specialization")
 * match as a contiguous phrase, not scattered words. */
function phraseMatches(haystack: string, phrase: string): boolean {
  const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(phrase.toLowerCase())}(?![a-z0-9])`, "i");
  return pattern.test(haystack.toLowerCase());
}

function keywordScore(text: string, keywords: string[]): { count: number; matched: string[] } {
  const matched = keywords.filter((k) => phraseMatches(text, k));
  return { count: matched.length, matched };
}

/**
 * Whether one short text fragment reads like the NAME of a named
 * offering (a specialization/elective) rather than page chrome — a
 * proper-noun-shaped phrase, no digit anywhere (real specialization
 * names essentially never contain one; dates, counts, ranks, fees, and
 * countdown timers all do), no label/currency punctuation, and a bounded
 * word count. Exported so extraction (`modules/website-quality`) can
 * apply the exact same per-item filter when actually pulling values out
 * of a section already classified as SPECIALIZATION — belt and suspenders
 * against the same noise this function screens out here.
 */
export function looksLikeNamedOffering(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/\d/.test(trimmed)) return false;
  if (/[:%$₹]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  return /^[A-Z]/.test(trimmed);
}

/**
 * The content-shape signal that lets a heading with no useful keyword of
 * its own (e.g. "Combinations Available") still be recognized as
 * SPECIALIZATION: a short list of items that overwhelmingly (>=70%) read
 * like named offerings (`looksLikeNamedOffering`), not sentences, labels,
 * dates, or UI chrome. Deliberately SPECIALIZATION-only for now — the
 * concrete case this project has real evidence for (§3 of the plan); not
 * a general "any short list is a specialization" rule extended to every
 * category without evidence.
 *
 * The 70% threshold and the per-item filter both come from a real
 * failure found live on `onlinemanipal.com`: a lead-capture widget
 * ("Admissions Closes in", "Seats filled!", a countdown timer, form
 * field labels) sitting after some unrelated heading was originally
 * misclassified as SPECIALIZATION by a much looser "short, non-sentence
 * items" rule — a real marketing page has far more short div/span
 * fragments than clean list markup, so the shape signal alone was nowhere
 * near selective enough.
 */
/** A genuine section heading is always a real phrase — never itself a
 * bare price/number (e.g. a pricing widget's own `<h3>INR 1,39,500</h3>`
 * price display, found live on `onlinemanipal.com`, whose few short
 * caption fragments underneath ("Each semester fee", "Inclusive of all
 * taxes") otherwise pass the per-item filter above easily). Content shape
 * never applies to a heading shaped like that, regardless of what's
 * listed under it. */
function headingLooksLikeRealHeading(headingText: string): boolean {
  return /[A-Za-z]{3,}/.test(headingText) && !/^\s*(INR|USD|Rs\.?|₹|\$)\s*[\d,.]/i.test(headingText);
}

function specializationContentShapeScore(headingText: string, items: string[]): { score: number; reason: string | null } {
  if (!headingLooksLikeRealHeading(headingText)) return { score: 0, reason: null };
  if (items.length < 2 || items.length > 20) return { score: 0, reason: null };
  const qualifying = items.filter(looksLikeNamedOffering);
  if (qualifying.length < 2 || qualifying.length / items.length < 0.7) return { score: 0, reason: null };
  const avgWords = qualifying.reduce((sum, item) => sum + item.trim().split(/\s+/).filter(Boolean).length, 0) / qualifying.length;
  if (avgWords <= 6) {
    return { score: 1, reason: `content shape: ${qualifying.length}/${items.length} short, title-cased, non-numeric items (avg ${avgWords.toFixed(1)} words each)` };
  }
  return { score: 0, reason: null };
}

/**
 * The default, deterministic `SemanticFactClassifier` implementation — no
 * ML/paid API calls anywhere. Scores every taxonomy category from three
 * independent, additive signals (heading keyword match, weighted highest;
 * body/table-header keyword match, weaker; and, for SPECIALIZATION only,
 * content shape) and picks the highest-scoring category, never requiring
 * exact heading-text equality against a fixed dictionary. Ties break by
 * `SEMANTIC_CATEGORY_PRIORITY` order (stable sort over insertion order).
 * A section that scores for more than one category (e.g. a combined
 * "Rankings & Accreditations" heading) reports every non-zero category via
 * `secondaryCategories`, so a caller extracting facts can still keep
 * Accreditation and Rankings distinct even though they share one section.
 */
export class RuleBasedSemanticClassifier implements SemanticFactClassifier {
  classifySection(input: SemanticSectionInput): SemanticClassification {
    const scored = new Map<Exclude<SemanticFieldCategory, "OTHER">, { score: number; signals: string[]; hasHeadingKeyword: boolean }>();

    for (const category of SEMANTIC_CATEGORY_PRIORITY) {
      const keywords = SEMANTIC_CATEGORY_KEYWORDS[category];
      const signals: string[] = [];
      let score = 0;
      let hasHeadingKeyword = false;

      const headingMatch = keywordScore(input.headingText, keywords);
      if (headingMatch.count > 0) {
        score += headingMatch.count * 2;
        hasHeadingKeyword = true;
        signals.push(`heading keyword: ${headingMatch.matched.map((m) => `"${m}"`).join(", ")}`);
      }

      // Only SHORT body text counts as a keyword signal -- a long,
      // sentence-shaped marketing paragraph merely containing an
      // incidental word (e.g. "...education recognized widely...")
      // must never single-handedly classify a section (the exact
      // "don't compare a whole paragraph as if it were the fact"
      // principle, applied at classification time too, not just
      // extraction time).
      const shortBodyText = input.nearbyParagraphText.filter((t) => t.trim().split(/\s+/).filter(Boolean).length <= 12);
      const bodyText = [...shortBodyText, ...(input.tableHeaders ?? [])].join(" ");
      const bodyMatch = keywordScore(bodyText, keywords);
      if (bodyMatch.count > 0) {
        score += bodyMatch.count;
        signals.push(`body keyword: ${bodyMatch.matched.map((m) => `"${m}"`).join(", ")}`);
      }

      if (category === "SPECIALIZATION") {
        const shape = specializationContentShapeScore(input.headingText, input.nearbyListItems);
        if (shape.score > 0) {
          score += shape.score;
          if (shape.reason) signals.push(shape.reason);
        }
      }

      if (score > 0) scored.set(category, { score, signals, hasHeadingKeyword });
    }

    if (scored.size === 0) {
      return { category: "OTHER", confidence: "LOW", matchedSignals: [], secondaryCategories: [] };
    }

    const ranked = [...scored.entries()].sort((a, b) => b[1].score - a[1].score);
    const [winnerCategory, winner] = ranked[0];
    const secondaryCategories = ranked.slice(1).map(([category]) => category);
    // A category won purely from body/content-shape signals (no heading
    // keyword at all) is a real but inferred result -- MEDIUM, not HIGH,
    // per §14's "do not fabricate certainty".
    const confidence: ExtractionConfidence = winner.hasHeadingKeyword ? "HIGH" : "MEDIUM";

    return { category: winnerCategory, confidence, matchedSignals: winner.signals, secondaryCategories };
  }
}

/** Stateless and side-effect-free — one shared instance is safe to reuse
 * across every caller in every workspace, rather than each call site
 * constructing its own. Swapping in a future AI/embedding-based
 * `SemanticFactClassifier` means changing what this constant points to,
 * not touching any caller. */
export const defaultSemanticFactClassifier: SemanticFactClassifier = new RuleBasedSemanticClassifier();
