import * as cheerio from "cheerio";
import type { EntityGuess, IdentityGateSignals, LogoCandidateSignal, LogoEvidence } from "@crosscheck/core";
import { institutionPatterns } from "../data/index.js";

/**
 * Component: Sprint 4b footer/legal-text and logo detection. Both operate
 * on the *original* HTML, not `ParsedLandingPage` — Sprint 2's
 * `parseLandingPage` deliberately strips `header`/`footer`/`nav` as noise
 * before producing its output (correct for claim extraction, but it means
 * this identity evidence isn't present there at all). Both are cheap,
 * synchronous, HTML-only operations — no network fetch, reusing whatever
 * HTML the caller already fetched for ingestion/crawling. See
 * docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md Revision 2 §4/§7, Revision 3 §2.
 */

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Reuses the exact copyright-pattern registry `matchInstitutionAndBrand`
 * already uses (`understanding/institution.ts`) — same extraction logic,
 * applied to `<footer>` text specifically instead of noise-stripped
 * `mainText`, since footer legal text is the strongest identity signal
 * and is exactly what Sprint 2's noise removal discards. */
export function extractFooterLegalText(html: string): string | null {
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return null;
  }
  const footerText = collapseWhitespace($("footer").text());
  if (!footerText) return null;

  for (const patternSource of institutionPatterns.copyrightPatterns) {
    const pattern = new RegExp(patternSource, "i");
    const match = pattern.exec(footerText);
    if (match?.[1]) {
      const candidate = match[1]
        .split(/\ball rights reserved\b/i)[0]
        .replace(/[.,]\s*$/, "")
        .trim();
      if (candidate.length > 0 && candidate.length < 100) return candidate;
    }
  }
  return null;
}

const LOGO_HINT_PATTERN = /logo/i;

function resolveUrl(src: string | undefined, base: URL): string | null {
  if (!src) return null;
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

function firstFromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
  return first || undefined;
}

/** Resolves the *real* image URL for an `<img>`, preferring lazy-load
 * attributes over a bare `src`. Many real sites (confirmed directly
 * against the live, D1-relevant Online Manipal target) use a lazy-load
 * plugin that leaves `src` as an inert placeholder (a 0x0-viewBox inline
 * SVG data URI, in the real case found) and puts the actual asset only in
 * `data-lazy-src`/`data-src`/`data-original`/`srcset` — reading only
 * `src`, as this function previously did, silently detects the
 * placeholder instead of the real logo. */
function resolveLazyImgUrl(getAttr: (name: string) => string | undefined, base: URL): string | null {
  const lazy = getAttr("data-lazy-src") ?? getAttr("data-src") ?? getAttr("data-original");
  const srcsetUrl = firstFromSrcset(getAttr("srcset") ?? getAttr("data-srcset"));
  return resolveUrl(lazy ?? srcsetUrl ?? getAttr("src"), base);
}

function findJsonLdLogoUrl($: cheerio.CheerioAPI): string | null {
  let found: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || !("logo" in entry)) continue;
      const logo = (entry as Record<string, unknown>).logo;
      if (typeof logo === "string" && logo.trim()) {
        found = logo.trim();
      } else if (logo && typeof logo === "object" && "url" in (logo as Record<string, unknown>)) {
        const url = (logo as Record<string, unknown>).url;
        if (typeof url === "string" && url.trim()) found = url.trim();
      }
    }
  });
  return found;
}

/**
 * Logo *detection* only — finds the URL/alt-text/method, never fetches
 * the image itself (hashing is a separate, lazy, cached step — see
 * `logoHash.ts` — precisely so every candidate can be detected cheaply at
 * crawl time without a per-candidate image fetch). Priority order per
 * Revision 2 §4: header/nav `<img>` matching logo heuristics -> JSON-LD
 * `logo` field -> `og:image` fallback -> not_found.
 */
export function detectLogo(html: string, baseUrl: string): LogoEvidence {
  let $: cheerio.CheerioAPI;
  let base: URL;
  try {
    $ = cheerio.load(html);
    base = new URL(baseUrl);
  } catch {
    return { imageUrl: null, altText: null, detectionMethod: "not_found", perceptualHash: null };
  }

  const headerNavImgs = $("header img, nav img").toArray();
  let bestMatch: { url: string; alt: string | null } | null = null;
  let firstImg: { url: string; alt: string | null } | null = null;
  for (const el of headerNavImgs) {
    const $el = $(el);
    const cls = $el.attr("class") ?? "";
    const id = $el.attr("id") ?? "";
    const alt = $el.attr("alt") ?? "";
    const url = resolveLazyImgUrl((name) => $el.attr(name), base);
    if (!url) continue;
    if (!firstImg) firstImg = { url, alt: alt || null };
    if (!bestMatch && (LOGO_HINT_PATTERN.test(cls) || LOGO_HINT_PATTERN.test(id) || LOGO_HINT_PATTERN.test(alt))) {
      bestMatch = { url, alt: alt || null };
    }
  }
  const headerCandidate = bestMatch ?? firstImg;
  if (headerCandidate) {
    return { imageUrl: headerCandidate.url, altText: headerCandidate.alt, detectionMethod: "header_logo_selector", perceptualHash: null };
  }

  const jsonLdLogo = findJsonLdLogoUrl($);
  const jsonLdUrl = resolveUrl(jsonLdLogo ?? undefined, base);
  if (jsonLdUrl) {
    return { imageUrl: jsonLdUrl, altText: null, detectionMethod: "structured_data_logo", perceptualHash: null };
  }

  const ogImage = $('meta[property="og:image"]').attr("content");
  const ogUrl = resolveUrl(ogImage, base);
  if (ogUrl) {
    return { imageUrl: ogUrl, altText: null, detectionMethod: "og_image_fallback", perceptualHash: null };
  }

  return { imageUrl: null, altText: null, detectionMethod: "not_found", perceptualHash: null };
}

function tokenizeFilename(imageUrl: string): string[] {
  try {
    const pathname = new URL(imageUrl).pathname;
    const last = pathname.split("/").pop() ?? "";
    const withoutExt = last.replace(/\.[a-z0-9]+$/i, "");
    return withoutExt
      .split(/[-_.]+/)
      .map((token) => token.toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nearbySurroundingText($: cheerio.CheerioAPI, el: any): string | null {
  const $el = $(el);
  const parentLink = $el.closest("a");
  const linkText = parentLink.length ? (parentLink.attr("title") ?? parentLink.attr("aria-label") ?? null) : null;
  if (linkText && linkText.trim()) return linkText.trim();
  const ariaLabel = $el.attr("aria-label");
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function placementOf($el: cheerio.Cheerio<any>): LogoCandidateSignal["placement"] {
  if ($el.closest("header, nav").length > 0) return "header_nav";
  if ($el.closest("footer").length > 0) return "footer";
  return "body";
}

// Deliberately a *positive* hint only (never a list of "known non-
// institution" names like accreditation bodies or vendors) — matches the
// D1 follow-up's classification rule: a candidate only ever counts as
// identity evidence if its own text independently names a known
// institution (checked later, against the registry); this pattern only
// decides which images are worth extracting *at all*, keeping the scan
// bounded to logo-shaped images instead of every <img> on the page.
const LOGO_CANDIDATE_HINT_PATTERN = /logo|brand|university|institute|college|academy/i;

/**
 * Component: D1 follow-up — broader logo *discovery* for standalone
 * institution identification (distinct from `detectLogo`'s narrower
 * "one primary header/nav brand logo" contract, which stays unchanged and
 * is still used for shared-template `compareIdentity`). Real pages
 * (confirmed on the live Online Manipal target) carry the
 * institution-identifying logo in a body-level accreditation/"recognized
 * by" section, not the header — so this scans header/nav (always) plus
 * any other `<img>`/inline-`<svg>` whose class/id/alt/filename hints at a
 * logo, extracting alt text, filename tokens, nearby link context, and
 * (for inline SVG) accessible `<title>`/`<desc>`/`aria-label` text — all
 * synchronous, zero network. Classification into "is this a
 * university/institution logo" happens later, by checking these texts
 * against the registry (`resolveLogoInstitutionSignal`,
 * `packages/core`) — this function only decides which images are worth
 * that check.
 */
export function detectLogoCandidates(html: string, baseUrl: string): LogoCandidateSignal[] {
  let $: cheerio.CheerioAPI;
  let base: URL;
  try {
    $ = cheerio.load(html);
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const candidates: LogoCandidateSignal[] = [];
  const seenKeys = new Set<string>();

  $("img").each((_, el) => {
    const $el = $(el);
    const inHeaderNav = $el.closest("header, nav").length > 0;
    const cls = $el.attr("class") ?? "";
    const id = $el.attr("id") ?? "";
    const alt = $el.attr("alt") ?? "";
    const rawSrcHint = $el.attr("src") ?? $el.attr("data-lazy-src") ?? $el.attr("data-src") ?? "";
    const looksLikeLogo =
      inHeaderNav ||
      LOGO_CANDIDATE_HINT_PATTERN.test(cls) ||
      LOGO_CANDIDATE_HINT_PATTERN.test(id) ||
      LOGO_CANDIDATE_HINT_PATTERN.test(alt) ||
      LOGO_CANDIDATE_HINT_PATTERN.test(rawSrcHint);
    if (!looksLikeLogo) return;

    const imageUrl = resolveLazyImgUrl((name) => $el.attr(name), base);
    const dedupeKey = imageUrl ?? `alt:${alt}|cls:${cls}`;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);

    candidates.push({
      imageUrl,
      altText: alt || null,
      filenameTokens: imageUrl ? tokenizeFilename(imageUrl) : [],
      surroundingText: nearbySurroundingText($, el),
      placement: placementOf($el),
      isSvg: !!imageUrl && /\.svg(\?|$)/i.test(imageUrl),
      // An <img src=".svg">-referenced file's own accessible metadata
      // isn't in this HTML at all -- it needs a separate, lazy fetch (see
      // fetchSvgStructuralText in logoHash.ts), only attempted when
      // cheaper signals (alt text, filename tokens) don't already resolve
      // an institution.
      svgStructuralText: null,
    });
  });

  $("svg").each((_, el) => {
    const $el = $(el);
    const cls = $el.attr("class") ?? "";
    const id = $el.attr("id") ?? "";
    const ariaLabel = $el.attr("aria-label") ?? "";
    const title = $el.find("title").first().text().trim();
    const desc = $el.find("desc").first().text().trim();
    const structuralText = [title, desc, ariaLabel].filter(Boolean).join(" ") || null;
    const inHeaderNav = $el.closest("header, nav").length > 0;
    const looksLikeLogo = inHeaderNav || LOGO_CANDIDATE_HINT_PATTERN.test(cls) || LOGO_CANDIDATE_HINT_PATTERN.test(id) || !!structuralText;
    if (!looksLikeLogo) return;

    const dedupeKey = `svg:${structuralText ?? ""}|${cls}|${id}`;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);

    candidates.push({
      imageUrl: null,
      altText: ariaLabel || null,
      filenameTokens: [],
      surroundingText: nearbySurroundingText($, el),
      placement: placementOf($el),
      isSvg: true,
      svgStructuralText: structuralText,
    });
  });

  return candidates;
}

/** Assembles the full cheap (no image fetch) identity-gate signal bundle
 * for one page — reused for every Master candidate at index-build time
 * and for every target at analysis time (§1 of the Revision 3 plan). */
export function buildIdentityGateSignals(
  sourceUrl: string,
  html: string,
  institution: EntityGuess | null,
  brand: EntityGuess | null,
): IdentityGateSignals {
  return {
    sourceUrl,
    institution,
    brand,
    footerLegalText: extractFooterLegalText(html),
    logo: detectLogo(html, sourceUrl),
  };
}
