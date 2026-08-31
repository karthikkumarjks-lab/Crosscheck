import type { ParsedLandingPage, SemanticFact, SemanticFactClassifier, SemanticFieldCategory, SemanticSectionInput } from "@crosscheck/core";
import { looksLikeNamedOffering, isPageChromeNoise, extractEligibilitySubFacts } from "@crosscheck/core";

/** A short, list-item-shaped block (no sentence-ending punctuation
 * mid-string, few enough words) vs. a longer paragraph -- the same shape
 * distinction `RuleBasedSemanticClassifier`'s content-shape signal uses,
 * applied here to split each section's own text into the two buckets a
 * `SemanticSectionInput` expects. */
const LIST_ITEM_MAX_WORDS = 8;

function isListItemShaped(text: string): boolean {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return wordCount > 0 && wordCount <= LIST_ITEM_MAX_WORDS && !/[.!?]\s*\S/.test(text.trim());
}

interface Section {
  headingText: string;
  headingLevel: 1 | 2 | 3 | 4;
  listItems: string[];
  paragraphText: string[];
  tableHeaders: string[];
  tableRows: string[][];
  images: { imageUrl: string; altText: string | null }[];
}

/** Groups an already-parsed page's headings + everything under them
 * (text blocks, tables, images -- all already heading-tagged by
 * `extract.ts`'s single document-order walk) into one `Section` per
 * heading, in document order. Pure grouping -- no classification here. */
function buildSections(parsed: ParsedLandingPage): Section[] {
  const sections = new Map<string, Section>();
  const order: string[] = [];

  for (const heading of parsed.headings) {
    if (sections.has(heading.text)) continue;
    sections.set(heading.text, { headingText: heading.text, headingLevel: heading.level, listItems: [], paragraphText: [], tableHeaders: [], tableRows: [], images: [] });
    order.push(heading.text);
  }

  for (const block of parsed.textBlocks) {
    if (!block.headingContext) continue;
    const section = sections.get(block.headingContext);
    if (!section) continue;
    if (isListItemShaped(block.text)) section.listItems.push(block.text);
    else section.paragraphText.push(block.text);
  }

  for (const table of parsed.tables) {
    if (!table.headingContext) continue;
    const section = sections.get(table.headingContext);
    if (!section) continue;
    section.tableHeaders.push(...table.headers);
    section.tableRows.push(...table.rows);
  }

  for (const image of parsed.sectionImages) {
    if (!image.headingContext) continue;
    const section = sections.get(image.headingContext);
    if (!section) continue;
    section.images.push({ imageUrl: image.imageUrl, altText: image.altText });
  }

  return order.map((headingText) => sections.get(headingText)!);
}

function toClassifierInput(section: Section): SemanticSectionInput {
  return {
    headingText: section.headingText,
    headingLevel: section.headingLevel,
    nearbyListItems: section.listItems,
    nearbyParagraphText: section.paragraphText,
    tableHeaders: section.tableHeaders,
    hasImage: section.images.length > 0,
  };
}

/** A short, closed set of words that only ever show up in a GENUINE
 * admission/eligibility requirement, used as a topical fallback for text
 * `extractEligibilitySubFacts` doesn't recognize any structured sub-fact
 * in (a real requirement phrased outside that bounded vocabulary) --
 * never used alone, always alongside the sub-fact check below. */
const ELIGIBILITY_TOPIC_HINT = /\beligib|qualif|criteria|admission\s*requirement|percentile|\bcgpa\b|entrance\s*exam/i;

/** A genuine eligibility clause is a short sentence/phrase ("Bachelor's
 * degree with minimum 50% marks") that is actually ABOUT an admission
 * requirement -- never a bare form-field label, and never generic page
 * chrome (an OTP/payment/login prompt, cookie banner, etc.) that merely
 * happens to sit under an "Eligibility"-labeled section because Sprint 2's
 * heading-scoped text grouping (unchanged, `extract.ts`) associates by DOM
 * proximity to the nearest heading, not semantic relevance (a documented,
 * pre-existing imprecision -- see `memory/CURRENT_STATE.md`'s "Known
 * Issues"). Real, live failure this fixes: an Online Manipal target's
 * Eligibility field extracted as "Enter the 4 digit OTP received on Note
 * for online payments Manipal scholarship scheme..." -- a real,
 * grammatical, 3+ word sentence the previous shape-only filter accepted
 * outright. Requires BOTH: (1) not page-chrome noise (`isPageChromeNoise`),
 * and (2) genuine positive evidence this text is actually about
 * eligibility -- either `extractEligibilitySubFacts` recognizes at least
 * one structured sub-fact (qualification/percentage/institution-qualifier/
 * experience), or the text contains one of the small
 * `ELIGIBILITY_TOPIC_HINT` words. Text that fails this is simply not
 * extracted as an eligibility fact -- never silently guessed, same
 * safe-failure direction as every other bounded pattern in this codebase
 * (`buildEligibilityField` then falls back to an honest target_missing/
 * master_missing rather than comparing garbage). */
/** A percentage co-occurring with one of these is plausibly a real marks/
 * grade requirement ("min 50% marks", "60% aggregate"); a bare percentage
 * with none of them is just as likely something else entirely -- a real,
 * live false-positive this guards against: an unrelated "87% seats
 * filled" admissions-urgency widget, classified into the same section as
 * genuine eligibility content purely by DOM/heading proximity (the same
 * documented imprecision `looksLikeEligibilitySentence`'s own doc comment
 * already calls out), read as an eligibility percentage requirement. */
const MARKS_CONTEXT_PATTERN = /\b(marks?|aggregate|grade|score)\b/i;

function looksLikeEligibilitySentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  if (!/[A-Za-z]{3,}/.test(trimmed)) return false;
  if (isPageChromeNoise(trimmed)) return false;
  const subFacts = extractEligibilitySubFacts(trimmed);
  // 2026-08-27 fix -- a bare percentage alone (no qualification group, no
  // institution qualifier, no experience years) is too weak a signal by
  // itself: it also needs either a marks/grade word nearby, or one of the
  // other sub-facts, before it counts as positive evidence.
  const hasNonPercentageSubFact = subFacts.qualificationGroups.length > 0 || subFacts.institutionQualifierPresent || subFacts.experienceYears !== null;
  const hasCorroboratedPercentage = subFacts.percentage !== null && MARKS_CONTEXT_PATTERN.test(trimmed);
  const hasSubFact = hasNonPercentageSubFact || hasCorroboratedPercentage;
  return hasSubFact || ELIGIBILITY_TOPIC_HINT.test(trimmed);
}

/** One row of a fee table, rendered as a `"label: value"` fact when it
 * looks like a label/value pair (§8: "Fee information... inside...
 * Tables"), or the raw joined cells otherwise. */
function tableRowToFactValue(row: string[]): string | null {
  const cells = row.filter((c) => c.trim().length > 0);
  if (cells.length === 0) return null;
  if (cells.length === 1) return cells[0];
  return `${cells[0]}: ${cells.slice(1).join(" ")}`;
}

/**
 * The semantic fact layer's extraction entry point (§2-§9 of the plan).
 * Classifies every section of an already-parsed page, then produces one
 * `SemanticFact` per candidate value for the categories this project's
 * comparison actually uses today (SPECIALIZATION, ACCREDITATION,
 * RANKINGS, FEES) -- a section classified into any OTHER category is
 * simply not extracted from (nothing in the Priority Fact Comparison
 * Report needs it yet; the classifier still runs over it, so adding a
 * consumer for those categories later needs no re-classification).
 *
 * Image-based FEES facts get `sourceType: "image_ocr"` with an EMPTY
 * `value` and `confidence: "LOW"` here -- actually running OCR is a
 * separate, async, opt-in step (`imageFeeOcr.ts`'s
 * `resolveImageFeeFacts`), never performed inside this function (which
 * stays pure/synchronous, consistent with every other extractor in this
 * project: "takes an already-parsed page, fetches nothing").
 */
export function extractSemanticFacts(parsed: ParsedLandingPage, classifier: SemanticFactClassifier): SemanticFact[] {
  const facts: SemanticFact[] = [];

  for (const section of buildSections(parsed)) {
    const classification = classifier.classifySection(toClassifierInput(section));
    if (classification.category === "OTHER") continue;

    // ACCREDITATION and RANKINGS are the one deliberate exception where a
    // merely-SECONDARY category still gets full extraction (§12: a
    // combined "Rankings & Accreditations" heading must keep both
    // distinct, not just whichever won the tie-break). SPECIALIZATION and
    // FEES only extract when they're the actual WINNING category -- a
    // real gap found live: a small, otherwise-plausible-looking 2-item
    // list under an "Easy EMI & scholarships" heading tripped
    // SPECIALIZATION's content-shape signal as a SECONDARY score behind
    // FEES's real heading-keyword win ("EMI"), which used to be enough to
    // extract bogus Specialization facts from a fee-related section.
    const categories: SemanticFieldCategory[] =
      classification.category === "ACCREDITATION" || classification.category === "RANKINGS"
        ? [classification.category, ...classification.secondaryCategories.filter((c) => c === "ACCREDITATION" || c === "RANKINGS")]
        : classification.category === "CURRICULUM" || classification.category === "PROGRAM_STRUCTURE"
          ? [classification.category, ...classification.secondaryCategories.filter((c) => c === "CURRICULUM" || c === "PROGRAM_STRUCTURE")]
          : [classification.category];

    for (const category of categories) {
      if (category === "SPECIALIZATION") {
        // Defense-in-depth, same filter the classifier's own content-shape
        // signal uses (`looksLikeNamedOffering`) — a section reached via a
        // genuine heading keyword match is usually clean list markup, but
        // this still screens out a stray non-offering item mixed in. Also
        // rejects generic page chrome (`isPageChromeNoise`) that happens to
        // be short/capitalized enough to pass the shape check alone (e.g.
        // "Log In Now").
        for (const item of section.listItems.filter((i) => looksLikeNamedOffering(i) && !isPageChromeNoise(i))) {
          facts.push({ field: "SPECIALIZATION", value: item, sourceUrl: parsed.sourceUrl, sourceType: "heading_and_text", heading: section.headingText, confidence: classification.confidence });
        }
      } else if (category === "ACCREDITATION" || category === "RANKINGS") {
        for (const item of section.listItems.filter((i) => !isPageChromeNoise(i))) {
          facts.push({ field: category, value: item, sourceUrl: parsed.sourceUrl, sourceType: "heading_and_text", heading: section.headingText, confidence: classification.confidence });
        }
        for (const item of section.paragraphText.filter((i) => !isPageChromeNoise(i))) {
          facts.push({ field: category, value: item, sourceUrl: parsed.sourceUrl, sourceType: "text", heading: section.headingText, confidence: classification.confidence });
        }
      } else if (category === "ELIGIBILITY") {
        // Eligibility criteria are ordinary sentence/list text, not a
        // named-offering shape (§SPECIALIZATION's filter would wrongly
        // reject "Bachelor's degree with minimum 50% marks" for
        // containing a digit) -- captured the same way FEES text/list
        // content is, for `buildEligibilityField`'s own bounded
        // sub-fact decomposition to run over downstream.
        // `looksLikeEligibilitySentence` itself now rejects page-chrome
        // noise AND requires genuine topical evidence (see its doc
        // comment) -- not just a shape check.
        for (const item of section.listItems.filter(looksLikeEligibilitySentence)) {
          facts.push({ field: "ELIGIBILITY", value: item, sourceUrl: parsed.sourceUrl, sourceType: "heading_and_text", heading: section.headingText, confidence: classification.confidence });
        }
        for (const item of section.paragraphText.filter(looksLikeEligibilitySentence)) {
          facts.push({ field: "ELIGIBILITY", value: item, sourceUrl: parsed.sourceUrl, sourceType: "text", heading: section.headingText, confidence: classification.confidence });
        }
      } else if (category === "CURRICULUM" || category === "PROGRAM_STRUCTURE") {
        // Subject/module names are named-offering-shaped, same filter as
        // SPECIALIZATION -- screens out stray non-subject chrome mixed
        // into a curriculum list, plus the same page-chrome denylist.
        for (const item of section.listItems.filter((i) => looksLikeNamedOffering(i) && !isPageChromeNoise(i))) {
          facts.push({ field: category, value: item, sourceUrl: parsed.sourceUrl, sourceType: "heading_and_text", heading: section.headingText, confidence: classification.confidence });
        }
        for (const row of section.tableRows) {
          const subject = row.map((c) => c.trim()).find((c) => c.length > 0);
          if (subject && looksLikeNamedOffering(subject) && !isPageChromeNoise(subject)) {
            facts.push({ field: category, value: subject, sourceUrl: parsed.sourceUrl, sourceType: "table", heading: section.headingText, confidence: classification.confidence });
          }
        }
      } else if (category === "FEES") {
        for (const item of [...section.listItems, ...section.paragraphText].filter((i) => !isPageChromeNoise(i))) {
          facts.push({ field: "FEES", value: item, sourceUrl: parsed.sourceUrl, sourceType: "text", heading: section.headingText, confidence: classification.confidence });
        }
        for (const row of section.tableRows) {
          const value = tableRowToFactValue(row);
          if (value && !isPageChromeNoise(value)) facts.push({ field: "FEES", value, sourceUrl: parsed.sourceUrl, sourceType: "table", heading: section.headingText, confidence: classification.confidence });
        }
        for (const image of section.images) {
          facts.push({
            field: "FEES",
            value: "",
            sourceUrl: parsed.sourceUrl,
            sourceType: "image_ocr",
            heading: section.headingText,
            confidence: "LOW",
            imageUrl: image.imageUrl,
          });
        }
      }
    }
  }

  return facts;
}
