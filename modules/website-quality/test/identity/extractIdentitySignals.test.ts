import { describe, expect, it } from "vitest";
import { detectLogo, detectLogoCandidates, extractFooterLegalText } from "../../src/identity/extractIdentitySignals.js";

describe("extractFooterLegalText", () => {
  it("extracts institution name from a copyright pattern inside <footer>", () => {
    const html = `<html><body><header>ignored</header><footer>&copy; 2026 Northbridge University. All rights reserved.</footer></body></html>`;
    expect(extractFooterLegalText(html)).toBe("Northbridge University");
  });

  it("returns null when there is no <footer>", () => {
    const html = `<html><body><p>&copy; 2026 Northbridge University.</p></body></html>`;
    expect(extractFooterLegalText(html)).toBeNull();
  });

  it("returns null when footer text doesn't match a copyright pattern", () => {
    const html = `<html><body><footer>Contact us | Privacy Policy</footer></body></html>`;
    expect(extractFooterLegalText(html)).toBeNull();
  });

  it("never throws on malformed HTML", () => {
    expect(() => extractFooterLegalText("<<<not html")).not.toThrow();
  });
});

describe("detectLogo", () => {
  const base = "https://university.example.test/mba";

  it("prefers a header/nav <img> with a logo-hinting class over a plain first image", () => {
    const html = `<html><body><header><img src="/banner.png" alt="banner"><img class="site-logo" src="/logo.png" alt="Northbridge"></header></body></html>`;
    const result = detectLogo(html, base);
    expect(result.detectionMethod).toBe("header_logo_selector");
    expect(result.imageUrl).toBe("https://university.example.test/logo.png");
    expect(result.altText).toBe("Northbridge");
  });

  it("falls back to the first header/nav image when none match logo heuristics", () => {
    const html = `<html><body><nav><img src="/first.png" alt="x"></nav></body></html>`;
    const result = detectLogo(html, base);
    expect(result.detectionMethod).toBe("header_logo_selector");
    expect(result.imageUrl).toBe("https://university.example.test/first.png");
  });

  it("falls back to JSON-LD logo when no header/nav image exists", () => {
    const html = `<html><body><script type="application/ld+json">{"@type":"CollegeOrUniversity","logo":"/assets/logo.svg"}</script></body></html>`;
    const result = detectLogo(html, base);
    expect(result.detectionMethod).toBe("structured_data_logo");
    expect(result.imageUrl).toBe("https://university.example.test/assets/logo.svg");
  });

  it("falls back to og:image when nothing else is found", () => {
    const html = `<html><head><meta property="og:image" content="/social.png"></head><body></body></html>`;
    const result = detectLogo(html, base);
    expect(result.detectionMethod).toBe("og_image_fallback");
    expect(result.imageUrl).toBe("https://university.example.test/social.png");
  });

  it("reports not_found when nothing is detectable", () => {
    const html = `<html><body><p>No images here.</p></body></html>`;
    const result = detectLogo(html, base);
    expect(result.detectionMethod).toBe("not_found");
    expect(result.imageUrl).toBeNull();
  });

  it("never throws on malformed HTML", () => {
    expect(() => detectLogo("<<<not html", base)).not.toThrow();
  });

  it("D1 follow-up: prefers data-lazy-src over an inert placeholder src (the real Online Manipal lazy-load pattern)", () => {
    const html = `<html><body><header><a class="logo"><img src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%200%200'%3E%3C/svg%3E" alt="Online Manipal" data-lazy-src="/wp-content/themes/flamingo/images/logo.png"></a></header></body></html>`;
    const result = detectLogo(html, base);
    expect(result.imageUrl).toBe("https://university.example.test/wp-content/themes/flamingo/images/logo.png");
    expect(result.imageUrl).not.toContain("data:image/svg+xml");
  });

  it("falls back to data-src, then srcset, when data-lazy-src is absent", () => {
    const html1 = `<html><body><header><img src="/placeholder.gif" data-src="/real.png" alt="x"></header></body></html>`;
    expect(detectLogo(html1, base).imageUrl).toBe("https://university.example.test/real.png");

    const html2 = `<html><body><header><img src="/placeholder.gif" srcset="/real2.png 1x, /real2-2x.png 2x" alt="x"></header></body></html>`;
    expect(detectLogo(html2, base).imageUrl).toBe("https://university.example.test/real2.png");
  });
});

describe("detectLogoCandidates — D1 follow-up broader institution-logo discovery", () => {
  const base = "https://www.onlinemanipal.com/ln-mba-mahe";

  it("finds a body-level accreditation-section logo with alt text, not just header/nav (the real MAHE case)", () => {
    const html = `<html><body>
      <header><a class="logo"><img src="data:image/svg+xml,..." alt="Online Manipal" data-lazy-src="/logo.png"></a></header>
      <section class="recognized-by">
        <img src="data:image/svg+xml,..." alt="Manipal Academy of Higher Education" data-lazy-src="/wp-content/themes/flamingo/images/mahe-logo.png">
      </section>
    </body></html>`;
    const candidates = detectLogoCandidates(html, base);
    const mahe = candidates.find((c) => c.altText === "Manipal Academy of Higher Education");
    expect(mahe).toBeDefined();
    expect(mahe?.imageUrl).toBe("https://www.onlinemanipal.com/wp-content/themes/flamingo/images/mahe-logo.png");
    expect(mahe?.filenameTokens).toEqual(["mahe", "logo"]);
    expect(mahe?.placement).toBe("body");
  });

  it("extracts filename tokens even when alt text is absent", () => {
    const html = `<html><body><img class="partner-logo" src="/assets/smu-logo.svg" alt=""></body></html>`;
    const candidates = detectLogoCandidates(html, base);
    expect(candidates[0]?.filenameTokens).toEqual(["smu", "logo"]);
    expect(candidates[0]?.isSvg).toBe(true);
  });

  it("extracts accessible <title>/<desc> text from inline <svg> markup", () => {
    const html = `<html><body><a href="/"><svg class="site-logo" role="img"><title>Sikkim Manipal University</title></svg></a></body></html>`;
    const candidates = detectLogoCandidates(html, base);
    const svgCandidate = candidates.find((c) => c.isSvg && c.svgStructuralText);
    expect(svgCandidate?.svgStructuralText).toBe("Sikkim Manipal University");
  });

  it("does not treat an unrelated decorative inline <svg> icon (no logo hint, no title/desc) as a candidate", () => {
    const html = `<html><body><svg class="arrow-icon" width="10" height="10"><path d="M0 0"/></svg></body></html>`;
    const candidates = detectLogoCandidates(html, base);
    expect(candidates).toHaveLength(0);
  });

  it("bounded scan: a plain content photo with no logo hint anywhere is not picked up", () => {
    const html = `<html><body><main><img src="/course-photo.jpg" alt="Students in a classroom"></main></body></html>`;
    const candidates = detectLogoCandidates(html, base);
    expect(candidates).toHaveLength(0);
  });

  it("captures multiple distinct logo-like candidates on one page without duplicates", () => {
    const html = `<html><body>
      <header><img class="site-logo" src="/logo.png" alt="Online Manipal"></header>
      <section><img class="logo" src="/ugc-logo.svg" alt="UGC Entitled"></section>
      <section><img class="logo" src="/coursera-logo.svg" alt="Coursera"></section>
      <section><img class="logo" src="/mahe-logo.png" alt="Manipal Academy of Higher Education"></section>
    </body></html>`;
    const candidates = detectLogoCandidates(html, base);
    expect(candidates).toHaveLength(4);
    expect(new Set(candidates.map((c) => c.imageUrl)).size).toBe(4);
  });

  it("never throws on malformed HTML", () => {
    expect(() => detectLogoCandidates("<<<not html", base)).not.toThrow();
  });
});
