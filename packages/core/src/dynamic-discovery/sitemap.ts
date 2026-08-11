import type { ParsedSitemap } from "../types.js";

const MAX_SITEMAP_URLS_PARSED = 500;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Only top-level `<loc>` tags — deliberately excludes namespaced
 * extension tags like `<image:loc>`, since the leading `<loc` match
 * requires nothing but whitespace/attributes between `<` and `loc`. */
function extractLocValues(xml: string): string[] {
  const pattern = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const value = match[1].trim();
    if (value) values.push(decodeXmlEntities(value));
  }
  return values;
}

/**
 * Component: sitemap parsing (Sprint 5, §6/§12). Pure text-in/data-out —
 * no fetching, no recursion into child sitemaps (a sitemap index's child
 * sitemap URLs are returned for the caller,
 * modules/website-quality/src/dynamic-discovery/crawlCandidates.ts, to
 * fetch and parse again, bounded by MAX_SITEMAP_INDEX_DEPTH there).
 * Malformed/empty XML never throws — untrusted external content per
 * docs/DEVELOPMENT_RULES.md, so a parse "failure" is just an empty
 * result, not an exception.
 */
export function parseSitemapXml(xml: string): ParsedSitemap {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locValues = extractLocValues(xml);
  const truncated = locValues.length > MAX_SITEMAP_URLS_PARSED;
  const capped = locValues.slice(0, MAX_SITEMAP_URLS_PARSED);

  return isIndex
    ? { urls: [], sitemapIndexUrls: capped, truncated }
    : { urls: capped, sitemapIndexUrls: [], truncated };
}
