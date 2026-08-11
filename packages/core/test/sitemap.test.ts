import { describe, expect, it } from "vitest";
import { parseSitemapXml } from "../src/dynamic-discovery/index.js";

describe("parseSitemapXml", () => {
  it("parses a flat <urlset> sitemap", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://northbridge.example.test/msc-data-science</loc></url>
        <url><loc>https://northbridge.example.test/msc-statistics</loc></url>
      </urlset>`;

    const result = parseSitemapXml(xml);
    expect(result.urls).toEqual([
      "https://northbridge.example.test/msc-data-science",
      "https://northbridge.example.test/msc-statistics",
    ]);
    expect(result.sitemapIndexUrls).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("parses a <sitemapindex> and returns child sitemap URLs, not page URLs", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://northbridge.example.test/sitemap-programs.xml</loc></sitemap>
        <sitemap><loc>https://northbridge.example.test/sitemap-pages.xml</loc></sitemap>
      </sitemapindex>`;

    const result = parseSitemapXml(xml);
    expect(result.sitemapIndexUrls).toEqual([
      "https://northbridge.example.test/sitemap-programs.xml",
      "https://northbridge.example.test/sitemap-pages.xml",
    ]);
    expect(result.urls).toEqual([]);
  });

  it("truncates at the URL cap and reports truncated: true", () => {
    const urls = Array.from({ length: 501 }, (_, i) => `<url><loc>https://northbridge.example.test/p${i}</loc></url>`).join("\n");
    const xml = `<urlset>${urls}</urlset>`;

    const result = parseSitemapXml(xml);
    expect(result.urls).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it("does not truncate when exactly at the cap", () => {
    const urls = Array.from({ length: 500 }, (_, i) => `<url><loc>https://northbridge.example.test/p${i}</loc></url>`).join("\n");
    const xml = `<urlset>${urls}</urlset>`;

    const result = parseSitemapXml(xml);
    expect(result.urls).toHaveLength(500);
    expect(result.truncated).toBe(false);
  });

  it("returns an empty result for malformed/empty XML rather than throwing", () => {
    expect(() => parseSitemapXml("")).not.toThrow();
    expect(parseSitemapXml("")).toEqual({ urls: [], sitemapIndexUrls: [], truncated: false });
    expect(() => parseSitemapXml("<not-xml-at-all")).not.toThrow();
    expect(parseSitemapXml("not xml at all, just text")).toEqual({ urls: [], sitemapIndexUrls: [], truncated: false });
  });

  it("ignores namespaced extension tags like <image:loc>", () => {
    const xml = `<urlset>
      <url>
        <loc>https://northbridge.example.test/msc-data-science</loc>
        <image:image><image:loc>https://northbridge.example.test/logo.png</image:loc></image:image>
      </url>
    </urlset>`;

    const result = parseSitemapXml(xml);
    expect(result.urls).toEqual(["https://northbridge.example.test/msc-data-science"]);
  });

  it("decodes basic XML entities in URLs", () => {
    const xml = `<urlset><url><loc>https://northbridge.example.test/search?a=1&amp;b=2</loc></url></urlset>`;
    const result = parseSitemapXml(xml);
    expect(result.urls).toEqual(["https://northbridge.example.test/search?a=1&b=2"]);
  });
});
