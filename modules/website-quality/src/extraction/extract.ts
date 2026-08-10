import * as cheerio from "cheerio";
import type { ExtractedLink, Heading, ParsedLandingPage, TextBlock } from "@crosscheck/core";
import { noiseKeywords } from "../data/index.js";

const CTA_PATTERN =
  /apply now|enroll now|enrol now|register now|download brochure|request (a )?call ?back|request (more )?info|get started|contact us|know more|learn more|talk to (an? )?(advisor|counsellor|counselor)/i;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
    const text = collapseWhitespace($(el).text());
    if (text) headings.push({ level, text });
  });
  return headings;
}

/**
 * Best-effort noise removal: standard semantic boilerplate tags plus any
 * element whose class/id matches a data-driven noise keyword. Documented
 * limitation (docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md, component B):
 * pages that don't use these conventions will retain some noise.
 */
function removeNoise($: cheerio.CheerioAPI): void {
  $("script, style, nav, header, footer, aside").remove();
  for (const keyword of noiseKeywords) {
    $(`[class*="${keyword}" i], [id*="${keyword}" i]`).remove();
  }
}

function extractMainTextAndBlocks($: cheerio.CheerioAPI): { mainText: string; textBlocks: TextBlock[] } {
  const textBlocks: TextBlock[] = [];
  let currentHeading: string | null = null;

  $("h1, h2, h3, h4, p, li").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = collapseWhitespace($(el).text());
    if (!text) return;

    if (/^h[1-4]$/.test(tag)) {
      currentHeading = text;
      return;
    }
    textBlocks.push({ headingContext: currentHeading, text });
  });

  const mainText = collapseWhitespace($("body").text());
  return { mainText, textBlocks };
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
  const title = collapseWhitespace($("title").first().text()) || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  const links = extractLinks($, sourceUrl);
  const structuredData = extractStructuredData($);

  removeNoise($);
  const headings = extractHeadings($);
  const { mainText, textBlocks } = extractMainTextAndBlocks($);

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
  };
}
