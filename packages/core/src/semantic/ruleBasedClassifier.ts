import type { ExtractionConfidence, SemanticClassification, SemanticFactClassifier, SemanticFieldCategory, SemanticSectionInput } from "../types.js";
import { SEMANTIC_CATEGORY_KEYWORDS, SEMANTIC_CATEGORY_PRIORITY } from "./semanticTaxonomy.js";
import { isPageChromeNoise } from "../normalization/pageChromeNoise.js";

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
/** A short, generic denylist of navigational/related-content heading
 * phrases -- live-confirmed false positive on `onlinemanipal.com`'s BA
 * page: a "Read Related Blogs on BA Degree" section, whose content is
 * entirely blog-post link cards (titles, dates, read-times, and a tag
 * cloud), was classified SPECIALIZATION -- not even via the content-shape
 * signal, but because two of the blog TITLES themselves happen to contain
 * the word "Specializations" ("Guide to BA Degree Courses: Subject List,
 * Specializations & Opportunities"), a real body-keyword match despite
 * being entirely unrelated marketing copy about other pages. A "Related
 * Blogs"/"You May Also Like" section is universal web-page furniture (not
 * site-specific vocabulary) whose content is never this page's own
 * program facts -- gating the WHOLE section (every scoring signal, not
 * just content-shape) is the correct fix, same bounded, evidence-driven
 * discipline as `pageChromeNoise.ts`'s item-level denylist, applied at the
 * heading/section level instead. */
const RELATED_CONTENT_HEADING_PATTERN = /\brelated\s*(blogs?|articles?|posts?)\b|\byou\s*may\s*also\s*like\b|\brecommended\s*(for\s*you|articles?|posts?)\b|\bpopular\s*(posts?|articles?)\b/i;

/** "Foundation Course(s)" is a standard, generic EdTech term for
 * introductory/bridge/supplementary coursework — a distinctly different
 * concept from a specialization/major/concentration, across any
 * institution, not a site-specific label. Live-confirmed false positive
 * on `onlinemanipal.com`'s BA page: a "Foundation Courses" section
 * ("Access 110+ hours of professional education courses worth INR 50K
 * and get certified" — a paid add-on skills bundle, e.g. "Emerging Tech
 * for Future Leaders") passed the content-shape check (short,
 * title-cased, digit-free item names) and was reported as 11 of the
 * Specializations row's ~12 remaining false "missing on Target" items.
 * Deliberately narrower than `RELATED_CONTENT_HEADING_PATTERN` (which
 * gates a whole section from every signal): this only removes
 * SPECIALIZATION's content-shape signal specifically, since "Foundation
 * Courses" content isn't known to falsely trigger any other category, and
 * a page's genuine specializations sitting under a DIFFERENT, real
 * heading (e.g. the MAHE MBA regression fixture's "What are the MBA
 * course subjects?", a real MEDIUM-confidence content-shape win this
 * exclusion must NOT affect) still needs to win normally. */
const FOUNDATION_COURSE_HEADING_PATTERN = /\bfoundation\s*courses?\b/i;

/** "Career Options"/"Job Profiles"/a bare "Industries" heading — a
 * program page's career-outcomes section (job titles, industry sectors a
 * graduate might work in) is a standard, generic marketing section on
 * essentially every EdTech program page, always a distinct concept from
 * the program's own specializations. Live-confirmed false positive on
 * `onlinemanipal.com`'s MSc Mathematics page, TWICE, under two
 * differently-worded headings for what is structurally the same
 * career-outcomes section on two different program pages: "Career
 * Options with MSc in Mathematics" (items: "Data Science", "Statistics",
 * "Cryptography"...) and, on a different target page for the same
 * program, a bare "Industries" heading (items: "Academia & Research",
 * "Finance & Banking", "Data Science & AI"...) — both real career
 * fields, not specializations, both passing the same content-shape check
 * as "Foundation Courses" above. */
const CAREER_OPTIONS_HEADING_PATTERN = /\bcareer\s*(options?|paths?|opportunities|prospects)\b|\bjob\s*(profiles?|roles?)\b|\bpotential\s*careers?\b|^\s*industries\s*$/i;

/** "Additional skill enhancement content"/"skill enhancement"/"upskilling"
 * — the exact same paid add-on skills bundle as "Foundation Courses"
 * above (live-confirmed: identical item text, "Emerging Tech for Future
 * Leaders", "Skills for Business Leadership"..., recurring verbatim
 * across different `onlinemanipal.com` program pages), just under a
 * differently-worded heading on a different page for the same
 * underlying widget. A generic EdTech marketing-section concept
 * (supplementary skills content, not the program's own specialization),
 * not site-specific vocabulary. */
const SKILL_ENHANCEMENT_HEADING_PATTERN = /\b(additional|extra)?\s*skill\s*(enhancement|building|development)\b|\bupskilling\b/i;

/** "Meet ... Faculty"/"Our Faculty"/"Meet the Team" — a faculty/instructor
 * listing (names and titles like "Assistant Professor") is never a list
 * of specializations, and its own generic "Read More" link-per-card
 * label is UI chrome, not content — both live-confirmed on the same real
 * MSc Mathematics page ("Meet your expert faculty" section). */
const FACULTY_HEADING_PATTERN = /\b(meet\s*(your|our)?\s*(expert\s*)?faculty)\b|\bmeet\s*the\s*team\b|\bour\s*(instructors?|mentors?|trainers?)\b/i;

/** Headings whose content is real, but never the program's own
 * specializations — see each pattern's own doc comment above. Deliberately
 * narrower than `RELATED_CONTENT_HEADING_PATTERN` (which gates a whole
 * section from every scoring signal): these only remove SPECIALIZATION's
 * content-shape signal specifically, since none of this content is known
 * to falsely trigger any OTHER category, and a page's genuine
 * specializations sitting under a DIFFERENT, real heading (e.g. the MAHE
 * MBA regression fixture's "What are the MBA course subjects?", a real
 * MEDIUM-confidence content-shape win this exclusion must NOT affect)
 * still needs to win normally. */
const NON_SPECIALIZATION_CONTENT_HEADING_PATTERN = new RegExp(
  [FOUNDATION_COURSE_HEADING_PATTERN.source, CAREER_OPTIONS_HEADING_PATTERN.source, SKILL_ENHANCEMENT_HEADING_PATTERN.source, FACULTY_HEADING_PATTERN.source].join("|"),
  "i",
);

/** "Featured Alumni"/"Alumni Speak"/"Success Stories"/"Real Stories, Real
 * Impact" — an alumni testimonial/success-story section is never this
 * page's own program facts, for ANY category, not just SPECIALIZATION's
 * content shape. Live-confirmed why content-shape-only scoping (the
 * pattern every other exclusion above uses) isn't enough here: a real
 * alumni bio's own narrative text incidentally contains a genuine
 * SPECIALIZATION keyword ("Enrolled in an Online BBA with a
 * *specialization* in Marketing") — a real, independent BODY-keyword
 * match that content-shape gating never touches, so a first attempt at
 * this fix (content-shape-only, matching the other exclusions' pattern)
 * still reported 10+ alumni names/milestones as Specializations. Gated
 * like `RELATED_CONTENT_HEADING_PATTERN` instead: an alumni section is
 * universal EdTech-marketing-page furniture (never program-fact content,
 * for any category), so every scoring signal is skipped, not just one. */
const ALUMNI_STORIES_HEADING_PATTERN = /\b(featured\s*)?alumni\b|\b(student|success)\s*stor(y|ies)\b|\breal\s*stories\b/i;

function headingLooksLikeRealHeading(headingText: string): boolean {
  return /[A-Za-z]{3,}/.test(headingText) && !/^\s*(INR|USD|Rs\.?|₹|\$)\s*[\d,.]/i.test(headingText) && !NON_SPECIALIZATION_CONTENT_HEADING_PATTERN.test(headingText);
}

/**
 * 2026-08-19: `isPageChromeNoise` now also excludes qualifying items, not
 * just the final extracted facts -- live-confirmed collision: a real
 * Academic Bank of Credits (ABC) account FAQ's registration field-label
 * list ("Roll number issued by the university", "Name (as mentioned in
 * Aadhaar)", "Gender", "Date of Birth", "Mobile number...") is
 * shape-identical to a genuine specialization list (short, capitalized,
 * digit-free) and was winning classification outright via content shape
 * -- filtering noise only from the later extraction step left the
 * CLASSIFICATION decision itself unaffected, so the section still won
 * SPECIALIZATION and any one non-noise item ("Gender") alone would have
 * kept polluting the report. Chrome-noise items now count neither toward
 * `qualifying` nor the denominator, so a section that's mostly
 * registration/administrative chrome fails the shape check entirely
 * instead of squeaking through.
 */
function specializationContentShapeScore(headingText: string, items: string[]): { score: number; reason: string | null } {
  if (!headingLooksLikeRealHeading(headingText)) return { score: 0, reason: null };
  const realItems = items.filter((item) => !isPageChromeNoise(item));
  if (realItems.length < 2 || realItems.length > 20) return { score: 0, reason: null };
  const qualifying = realItems.filter(looksLikeNamedOffering);
  if (qualifying.length < 2 || qualifying.length / realItems.length < 0.7) return { score: 0, reason: null };
  const avgWords = qualifying.reduce((sum, item) => sum + item.trim().split(/\s+/).filter(Boolean).length, 0) / qualifying.length;
  if (avgWords <= 6) {
    return { score: 1, reason: `content shape: ${qualifying.length}/${realItems.length} short, title-cased, non-numeric items (avg ${avgWords.toFixed(1)} words each)` };
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
    // A "Related Blogs"/"You May Also Like" section, or an alumni
    // testimonial/success-story section, is never this page's own program
    // facts -- gated before any scoring signal runs (heading keyword, body
    // keyword, or content-shape), not just the content-shape fallback. See
    // `RELATED_CONTENT_HEADING_PATTERN`'s and `ALUMNI_STORIES_HEADING_PATTERN`'s
    // doc comments.
    if (RELATED_CONTENT_HEADING_PATTERN.test(input.headingText) || ALUMNI_STORIES_HEADING_PATTERN.test(input.headingText)) {
      return { category: "OTHER", confidence: "LOW", matchedSignals: [], secondaryCategories: [] };
    }

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
