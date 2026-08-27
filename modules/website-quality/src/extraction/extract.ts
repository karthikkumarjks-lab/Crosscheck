import * as cheerio from "cheerio";
import type { ExtractedLink, Heading, ParsedLandingPage, ParsedTable, SectionImage, TextBlock } from "@crosscheck/core";
import { noiseKeywords } from "../data/index.js";

const CTA_PATTERN =
  /apply now|enroll now|enrol now|register now|download brochure|request (a )?call ?back|request (more )?info|get started|contact us|know more|learn more|talk to (an? )?(advisor|counsellor|counselor)/i;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Cheerio's own `.text()` concatenates every descendant text node with NO
 * separator at element boundaries -- fine for ordinary prose markup, but a
 * real, live-found bug when a heading/label wraps PART of its own text in
 * a nested styling `<span>` with no surrounding whitespace in the source:
 * `<h1>Online MBA in Healthcare<span>Manipal Academy of <span>Higher
 * Education</span></span></h1>`, live-confirmed on
 * `mahe.onlinemanipal.com` -- `.text()` produces "...HealthcareManipal
 * Academy..." as one merged, unmatchable word, which then broke that
 * target's own program-subject matching entirely. Walks the same node
 * tree `.text()` would, but inserts a single space at every text-node/
 * element boundary that doesn't already have one. Every call site already
 * runs the result through `collapseWhitespace`, which harmlessly collapses
 * the extra space this adds at a boundary that already HAD real
 * whitespace -- so this can only ever add a missing word boundary, never
 * double an existing one or drop real content. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textWithBoundarySpaces($: cheerio.CheerioAPI, node: any): string {
  let result = "";
  const append = (piece: string) => {
    if (!piece) return;
    if (result && !/\s$/.test(result) && !/^\s/.test(piece)) result += " ";
    result += piece;
  };
  $(node)
    .contents()
    .each((_, child) => {
      if (child.type === "text") {
        append((child as unknown as { data?: string }).data ?? "");
      } else if (child.type === "tag") {
        append(textWithBoundarySpaces($, child));
      }
    });
  return result;
}

function extractLinks($: cheerio.CheerioAPI, sourceUrl: string): ExtractedLink[] {
  const base = new URL(sourceUrl);
  const links: ExtractedLink[] = [];

  $("a[href]").each((_, el) => {
    const $el = $(el);
    const hrefRaw = $el.attr("href");
    if (!hrefRaw) return;

    let absolute: URL;
    try {
      absolute = new URL(hrefRaw, sourceUrl);
    } catch {
      return;
    }
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") return;

    const text = collapseWhitespace($el.text()) || null;
    const relation: ExtractedLink["relation"] = absolute.hostname === base.hostname ? "internal" : "external";

    let linkType: ExtractedLink["linkType"];
    if ($el.closest("nav, header, footer").length > 0) {
      linkType = "navigation";
    } else if (text && CTA_PATTERN.test(text)) {
      linkType = "cta";
    } else if (text) {
      linkType = "content";
    } else {
      linkType = "unknown";
    }

    links.push({ url: absolute.toString(), text, relation, linkType });
  });

  return links;
}

function extractStructuredData($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const structuredData: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed: unknown = JSON.parse(raw);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (entry && typeof entry === "object") {
          structuredData.push({ source: "json-ld", ...(entry as Record<string, unknown>) });
        }
      }
    } catch {
      // Malformed JSON-LD is untrusted external content — skip, don't throw.
    }
  });

  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr("property");
    const content = $(el).attr("content");
    if (property && content) openGraph[property] = content;
  });
  if (Object.keys(openGraph).length > 0) {
    structuredData.push({ source: "opengraph", ...openGraph });
  }

  return structuredData;
}

function extractHeadings($: cheerio.CheerioAPI): Heading[] {
  const headings: Heading[] = [];
  $("h1, h2, h3, h4").each((_, el) => {
    const level = Number(el.tagName.slice(1)) as Heading["level"];
    const text = collapseWhitespace(textWithBoundarySpaces($, el));
    if (text) headings.push({ level, text });
  });
  return headings;
}

/** `class`/`id` values are token lists (space-separated for `class`; `id`
 * is a single token, but split the same way defensively), never a blob to
 * substring-search — matching a noise keyword as a *substring* of the
 * whole attribute value causes false positives on real pages: a layout
 * modifier class like `"no-sidebar"` (meaning this element explicitly has
 * NO sidebar) contains the substring "sidebar" and was being wrongly
 * treated as an actual sidebar element, deleting its entire subtree
 * (confirmed live on the real Online Manipal site — a page's whole main-
 * content wrapper carried class `"wrapper no-sidebar"` and was silently
 * removed, along with its hero heading and specialization wording, well
 * before understanding/comparison ever ran). Requiring an EXACT match
 * against one space-separated class token (or the id) keeps genuine noise
 * classes working — `noiseKeywords` already lists compound forms like
 * `"site-footer"`/`"site-header"` as their own explicit entries for
 * exactly this reason — while no longer matching an unrelated class that
 * merely contains the keyword as a substring.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function elementHasNoiseClassOrId($el: cheerio.Cheerio<any>, noiseKeywordSet: Set<string>): boolean {
  const classTokens = ($el.attr("class") ?? "").split(/\s+/).filter(Boolean);
  const idTokens = ($el.attr("id") ?? "").split(/\s+/).filter(Boolean);
  return [...classTokens, ...idTokens].some((token) => noiseKeywordSet.has(token.toLowerCase()));
}

/**
 * Best-effort noise removal: standard semantic boilerplate tags plus any
 * element whose class/id token exactly matches a data-driven noise
 * keyword. Documented limitation (docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md,
 * component B): pages that don't use these conventions will retain some
 * noise.
 */
function removeNoise($: cheerio.CheerioAPI): void {
  $("script, style, nav, header, footer, aside").remove();
  // `<del>`/`<s>`/`<strike>` mark a superseded value (a struck-through
  // "original price" next to a discounted one) -- a real, live pattern
  // found on `onlinemanipal.com`'s BA fee cards
  // (`<del>INR 75,000</del><span>INR 67,500</span>`). An earlier version
  // of this function unconditionally removed these elements: that avoided
  // the ancestor (e.g. the surrounding `<h3>`) capturing an AMBIGUOUS
  // two-number block, but it also silently discarded the original price
  // forever -- the ₹75,000 vs ₹67,500 confusion downstream was actually
  // this line, not the comparison logic. `<del>`/`<s>`/`<strike>` are now
  // LEFT IN PLACE and captured as their own tagged `struckOriginal`
  // text blocks by `extractMainTextAndBlocks` (which also excludes their
  // text from each ancestor's own capture via `ownText`, so the original
  // AMBIGUOUS-block problem stays fixed too).
  const noiseKeywordSet = new Set(noiseKeywords.map((keyword) => keyword.toLowerCase()));
  $("*")
    .filter((_, el) => elementHasNoiseClassOrId($(el), noiseKeywordSet))
    .remove();
}

/** One `<table>`'s headers (every `<th>` found, in document order) and
 * data rows (every `<td>`-bearing `<tr>` with no `<th>`). Deliberately
 * does NOT fall back to "treat the first row as headers" when no `<th>`
 * exists -- a real fee table (§8/§9 of the semantic layer plan) is
 * commonly header-less rows of `Semester 1 | ₹25,000` label/value pairs,
 * and treating the first such row as a header would silently drop it as
 * data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTable($: cheerio.CheerioAPI, $table: cheerio.Cheerio<any>): { headers: string[]; rows: string[][] } {
  const headers: string[] = [];
  const rows: string[][] = [];

  $table.find("tr").each((_, tr) => {
    const $tr = $(tr);
    const ths = $tr
      .find("th")
      .toArray()
      .map((th) => collapseWhitespace($(th).text()))
      .filter(Boolean);
    if (ths.length > 0) {
      headers.push(...ths);
      return;
    }
    const tds = $tr
      .find("td")
      .toArray()
      .map((td) => collapseWhitespace($(td).text()));
    if (tds.some((v) => v)) rows.push(tds);
  });

  return { headers, rows };
}

function resolveAbsoluteImageUrl(src: string | undefined, sourceUrl: string): string | null {
  if (!src) return null;
  try {
    return new URL(src, sourceUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Component B extraction, extended for the semantic fact layer (see
 * `docs/design/SEMANTIC_FACT_LAYER_PLAN.md`). One single document-order
 * walk, same `currentHeading` tracking as before, now also collecting:
 *
 * - Leaf `div`/`span` text (no element children of their own) as
 *   ordinary `TextBlock`s alongside `p`/`li` -- fixes a real gap found
 *   against the live Online Manipal site: a card-grid "Rankings &
 *   Accreditations" section rendered its content entirely in `<div>`/
 *   `<span>` wrappers (a common modern template pattern), which the
 *   previous `p, li`-only selector never saw at all, so that section's
 *   text never reached extraction regardless of heading-label matching.
 *   Table cells are explicitly excluded here (`closest("table")`) since
 *   `parseTable` captures those separately, structured.
 * - `<table>`s, structured (`tables`).
 * - `<img>`s, associated with whichever heading they fall under
 *   (`sectionImages`) -- the input the OCR path needs to know a FEES
 *   section's value lives in an image, without a second fetch/parse.
 *
 * `mainText` is unchanged (`$("body").text()`, not built from
 * `textBlocks`), so Sprint 2's `rawTextLength`/`mainText` output is
 * byte-identical to before this change.
 */
/** `$el`'s own text with any `<del>`/`<s>`/`<strike>` descendant excluded
 * -- so an ancestor like `<h3 class="course-price"><del>INR
 * 75,000</del><span>INR 67,500</span></h3>` captures only the live "INR
 * 67,500" as its own value (the struck descendant is captured separately,
 * see the `del, s, strike` branch below), rather than the two numbers
 * colliding into one ambiguous block. A no-op (identical to `$el.text()`)
 * for the overwhelming majority of elements that contain no struck
 * descendant at all. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ownText($: cheerio.CheerioAPI, $el: cheerio.Cheerio<any>): string {
  const target = $el.find("del, s, strike").length === 0 ? $el : $el.clone().find("del, s, strike").remove().end();
  return textWithBoundarySpaces($, target.get(0));
}

function extractMainTextAndBlocks($: cheerio.CheerioAPI, sourceUrl: string): { mainText: string; textBlocks: TextBlock[]; tables: ParsedTable[]; sectionImages: SectionImage[] } {
  const textBlocks: TextBlock[] = [];
  const tables: ParsedTable[] = [];
  const sectionImages: SectionImage[] = [];
  let currentHeading: string | null = null;

  $("h1, h2, h3, h4, p, li, div, span, table, img, del, s, strike, select").each((_, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();

    if (tag === "del" || tag === "s" || tag === "strike") {
      const text = collapseWhitespace($el.text());
      if (text) textBlocks.push({ headingContext: currentHeading, text, struckOriginal: true });
      return;
    }

    if (/^h[1-4]$/.test(tag)) {
      const text = collapseWhitespace(ownText($, $el));
      if (!text) return;
      // A real, live pattern found on `onlinemanipal.com`'s BA fee
      // section: a price/duration value styled large via a heading tag
      // purely for visual weight (`<h3 class="course-price">INR
      // 75,000</h3>`), sibling to a `<p class="course-text">Full Fee
      // Payment</p>` label. Treating every h1-h4 as a section-title reset
      // silently threw the actual number away (it became `currentHeading`
      // for whatever came next, never a capturable value itself) -- the
      // root cause of fee amounts being found "as a label" but never as a
      // number. A value-shaped heading is captured as ordinary content
      // under the CURRENT (unchanged) heading instead of starting a new
      // section.
      if (isValueShapedText(text)) {
        textBlocks.push({ headingContext: currentHeading, text });
      } else {
        currentHeading = text;
      }
      return;
    }

    if (tag === "table") {
      const { headers, rows } = parseTable($, $el);
      if (headers.length > 0 || rows.length > 0) tables.push({ headingContext: currentHeading, headers, rows });
      return;
    }

    if (tag === "select") {
      // A real, live pattern found on `onlinemanipal.com`'s BA page: the
      // Target page's own "Combinations available:" specializations list
      // renders as a `<select><option>` dropdown, not `p`/`li`/`div`/`span`
      // markup -- completely invisible to extraction before this, so a
      // genuinely present specialization list was reported as entirely
      // missing. Each real option becomes its own text block, same as any
      // other list item; the placeholder option (no `value`, e.g. "Select
      // Elective") is skipped.
      $el.find("option").each((_, optEl) => {
        const $opt = $(optEl);
        const value = ($opt.attr("value") ?? "").trim();
        const text = collapseWhitespace($opt.text());
        if (!text || !value) return;
        textBlocks.push({ headingContext: currentHeading, text });
      });
      return;
    }

    if (tag === "img") {
      const imageUrl = resolveAbsoluteImageUrl($el.attr("src") ?? $el.attr("data-lazy-src") ?? $el.attr("data-src"), sourceUrl);
      if (imageUrl) sectionImages.push({ headingContext: currentHeading, imageUrl, altText: $el.attr("alt")?.trim() || null });
      return;
    }

    if (tag === "p" || tag === "li") {
      const text = collapseWhitespace(ownText($, $el));
      if (text) textBlocks.push({ headingContext: currentHeading, text });
      return;
    }

    // div/span: only as leaf text carriers (no NON-ICON element children of
    // their own -- otherwise its text is either a duplicate of a child's, or
    // will be captured when that child itself is visited), and never
    // inside a table (parseTable already captured that content) or inside
    // a heading itself. The heading exclusion is a real, live-found bug
    // fix: a heading commonly wraps part of its own text in a styling
    // `<span>` (e.g. `<h2>Eligibility for <span>online BA</span></h2>`,
    // found on the real onlinemanipal.com BA page) -- without this
    // exclusion, that span independently matches the `span` selector
    // above and gets captured as its OWN textBlock, attributed to the
    // very heading it's part of ("online BA", `headingContext:
    // "Eligibility for online BA"`). Old-path `findHeadingScoped`
    // (claims.ts) then picks it up as if it were the field's actual
    // content -- a heading fragment being mistaken for a fact, not the
    // OTP-modal proximity leak this codebase already guards against
    // elsewhere.
    if ($el.closest("table").length > 0) return;
    if ($el.closest("h1, h2, h3, h4").length > 0) return;
    // 2026-08-27 fix -- real, live pattern found on onlinemanipal.com's
    // pgcp-ba landing page: an icon-prefixed label, `<span><svg>...huge
    // path data...</svg>Duration: </span>`, immediately followed by a
    // sibling `<span class="durationText">12 months</span>`. The OLD "any
    // element child disqualifies this span" rule assumed a child would
    // always independently get its own capture -- true for a real content
    // child, false for `<svg>`/`<img>`, which are never themselves visited
    // by this selector and carry no text of their own anyway. That silently
    // discarded the ENTIRE label ("Duration:"/"Eligibility:"/"Fees:") for
    // every icon+label quick-facts-bar row on the page -- not a wording
    // mismatch, a total extraction gap: `synthesizeLabelValuePairs` below
    // had no label block to pair the value with at all, so Course
    // Duration/Eligibility/Discount/Others came back as "not found on
    // target" even though the value was sitting right there in the HTML.
    // A purely decorative icon child no longer disqualifies this element;
    // only a REAL (non-svg/non-img) element child still does, preserving
    // the original no-duplication guarantee for genuine nested content.
    const nonIconChildren = $el.children().filter((_, child) => !["svg", "img"].includes((child.tagName ?? "").toLowerCase()));
    if (nonIconChildren.length > 0) return;
    const text = collapseWhitespace($el.children().length > 0 ? $el.clone().find("svg, img").remove().end().text() : $el.text());
    if (text) textBlocks.push({ headingContext: currentHeading, text });
  });

  synthesizeLabelValuePairs(textBlocks);

  const mainText = collapseWhitespace($("body").text());
  return { mainText, textBlocks, tables, sectionImages };
}

/** Strips currency/number/unit tokens from `text` and reports whether any
 * real word (3+ letters) is left -- i.e. whether `text` is really just a
 * bare number/price/duration display with no topical content of its own.
 * Used both to stop a price/duration styled as a heading tag (see the
 * `isValueShapedText(text)` call above) from being mistaken for a section
 * title, and, below, to find the "value" half of an adjacent label+value
 * pair. */
function isValueShapedText(text: string): boolean {
  const stripped = text
    .replace(/[\d,.]+/g, " ")
    .replace(/\b(years?|months?|semesters?|lakhs?|crores?|inr|usd|rs)\b/gi, " ")
    .replace(/[₹$%]/g, " ");
  return !/[A-Za-z]{3,}/.test(stripped);
}

/** A short, plain phrase with no digit of its own -- the "label" half of
 * an adjacent label+value pair (see below). Deliberately not the negation
 * of `isValueShapedText` alone: a short label must have NO digit at all,
 * not just "not exclusively numeric" (a genuinely mixed sentence should
 * never be mistaken for a bare label). */
function looksLikeShortLabel(text: string): boolean {
  if (/\d/.test(text)) return false;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 6;
}

/**
 * Real, live pattern found on `onlinemanipal.com`'s BA fee section: a
 * fee card renders its label and its number as two SEPARATE sibling
 * elements under the same heading (`<p class="course-text">Full Fee
 * Payment</p>` immediately followed by `<h3 class="course-price">INR
 * 75,000</h3>`, itself now captured as a plain text block by the
 * `isValueShapedText` heading fix above). Each becomes its own
 * `TextBlock`, correctly -- but downstream fee classification
 * (`classifyFeeText` in `packages/core`) needs BOTH the label word
 * ("full fee" -> total-programme period) AND the number in the SAME
 * string to correctly classify AND extract a component in one step. This
 * synthesizes one ADDITIONAL combined "Label: Value" block for every
 * adjacent (label, value) pair sharing a heading -- purely additive, the
 * two original blocks are never removed, so nothing that worked before
 * regresses; this only adds a new, more useful candidate alongside them.
 * Generic across every field this applies to (fee/duration/any other
 * card-styled number), not fee-specific.
 */
function synthesizeLabelValuePairs(textBlocks: TextBlock[]): void {
  const synthesized: TextBlock[] = [];
  for (let i = 0; i < textBlocks.length - 1; i++) {
    const label = textBlocks[i];
    if (label.headingContext === null) continue;
    if (!looksLikeShortLabel(label.text) || isValueShapedText(label.text)) continue;

    // Collect EVERY immediately-following value-shaped block under the
    // same heading, not just the first -- a real "original price /
    // discounted price" card renders as two consecutive value blocks
    // after one label (`<p>Full Fee Payment</p><h3><del>INR
    // 75,000</del><span>INR 67,500</span></h3>`, itself now two separate
    // value TextBlocks -- see `ownText`/the `del,s,strike` branch above).
    // Stops at the first non-value-shaped block (the next label, or plain
    // prose), so an ordinary single label/value pair behaves exactly as
    // before.
    const values: TextBlock[] = [];
    for (let j = i + 1; j < textBlocks.length && textBlocks[j].headingContext === label.headingContext && isValueShapedText(textBlocks[j].text); j++) {
      values.push(textBlocks[j]);
    }

    // 2026-08-27 fix -- real, live pattern found on onlinemanipal.com's
    // pgcp-ba landing page: a label can be immediately followed by a
    // genuine free-text value, not just a bare number/duration/price (e.g.
    // "Eligibility:" -> "Completion of Bachelors' with min 50% marks").
    // The scan above only recognizes numeric-shaped values (by design, for
    // the original/discounted multi-value fee case above); when it finds
    // none, fall back to pairing with the SINGLE immediately-following
    // block, as long as that block doesn't itself look like another short
    // label (which would mean it's the NEXT field's label, not this one's
    // value) -- so this can never over-merge into unrelated prose beyond
    // one sibling block, and never mispairs two adjacent labels together.
    if (values.length === 0) {
      const next = textBlocks[i + 1];
      if (next && next.headingContext === label.headingContext && !looksLikeShortLabel(next.text)) {
        values.push(next);
      }
    }
    if (values.length === 0) continue;

    // A mixed run (at least one struck value alongside at least one
    // non-struck value) is a genuine original/discounted pair -- tag each
    // synthesized pair with which role it plays so fee classification can
    // tell them apart deterministically, instead of requiring the word
    // "discount" to appear in the same text block (a real page routinely
    // renders that word in a separate sibling element instead, e.g. a
    // `<p class="msg-text">10% discount</p>` after the price card). A
    // uniform run (all struck, or all non-struck -- the overwhelmingly
    // common case) gets no role at all, leaving existing keyword-based
    // classification completely unchanged.
    const hasStruck = values.some((v) => v.struckOriginal);
    const hasNonStruck = values.some((v) => !v.struckOriginal);
    const mixed = hasStruck && hasNonStruck;

    // 2026-08-27 fix -- a label's OWN text can already end in its own
    // separator (e.g. the icon+label span's text is literally "Duration: ",
    // colon included, unlike the pre-existing `<p>Full Fee Payment</p>`
    // case this was originally written for). Appending another ": "
    // unconditionally produced a double separator ("Duration:: 12
    // months") that the downstream label-matching regex parses as if the
    // value had a stray leading colon. Strip any trailing separator first
    // so the synthesized text always has exactly one.
    const labelText = label.text.replace(/[:\-–—]+\s*$/, "").trim();

    for (const value of values) {
      synthesized.push({
        headingContext: label.headingContext,
        text: `${labelText}: ${value.text}`,
        feeDiscountRole: mixed ? (value.struckOriginal ? "original" : "discounted") : undefined,
      });
    }
  }
  textBlocks.push(...synthesized);
}

/**
 * Component B — page extraction. Turns raw HTML into a structural
 * representation (docs/design/WEBSITE_QUALITY_DESIGN.md section 2).
 * Single parse, single tree: links and structured data are read first
 * (context like "is this link inside <nav>" matters, and nav links must
 * still appear in the output, classified "navigation"), then noise is
 * removed from that same tree in place before reading headings/main
 * text/text blocks — so a heading that only exists inside nav/header/
 * footer boilerplate never reaches understanding.
 */
export function parseLandingPage(html: string, sourceUrl: string): ParsedLandingPage {
  const $ = cheerio.load(html);
  const titleEl = $("title").first();
  const title = (titleEl.length > 0 ? collapseWhitespace(textWithBoundarySpaces($, titleEl.get(0))) : "") || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  const links = extractLinks($, sourceUrl);
  const structuredData = extractStructuredData($);

  removeNoise($);
  const headings = extractHeadings($);
  const { mainText, textBlocks, tables, sectionImages } = extractMainTextAndBlocks($, sourceUrl);

  return {
    sourceUrl,
    title,
    metaDescription,
    headings,
    textBlocks,
    mainText,
    structuredData,
    links,
    rawTextLength: mainText.length,
    sectionImages,
    tables,
  };
}
