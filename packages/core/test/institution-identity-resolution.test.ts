import { describe, expect, it } from "vitest";
import type { EntityGuess, LogoCandidateSignal, SourceRegistry } from "../src/types.js";
import {
  matchSpecificInstitution,
  resolveInstitutionIdentity,
  resolveLogoInstitutionSignal,
  resolveMultiUniversityDefault,
  resolvePageInstitutionSignal,
  resolveUrlInstitutionSignal,
} from "../src/dynamic-discovery/institution-identity-resolution.js";
import { sourceRegistry } from "../src/registry/index.js";

function guess(value: string): EntityGuess {
  return { value, confidence: "medium", matchedSignals: [] };
}

function logo(overrides: Partial<LogoCandidateSignal> = {}): LogoCandidateSignal {
  return {
    imageUrl: null,
    altText: null,
    filenameTokens: [],
    surroundingText: null,
    placement: "body",
    isSvg: false,
    svgStructuralText: null,
    ...overrides,
  };
}

describe("matchSpecificInstitution — never matches brandNames", () => {
  it("matches an institution's own name/alias", () => {
    const result = matchSpecificInstitution(["MAHE"], sourceRegistry);
    expect(result?.institution.id).toBe("mahe");
  });

  it("does NOT match the shared brand 'Online Manipal' to any specific institution", () => {
    const result = matchSpecificInstitution(["Online Manipal"], sourceRegistry);
    expect(result).toBeNull();
  });
});

describe("resolveUrlInstitutionSignal", () => {
  it("resolves a strong signal from an explicit URL token", () => {
    const result = resolveUrlInstitutionSignal("https://www.onlinemanipal.com/ln-mba-mahe", sourceRegistry);
    expect(result.institutionId).toBe("mahe");
    expect(result.strength).toBe("strong");
  });

  it("resolves MUJ and SMU the same generic way", () => {
    expect(resolveUrlInstitutionSignal("https://www.onlinemanipal.com/ln-mba-muj", sourceRegistry).institutionId).toBe("muj");
    expect(resolveUrlInstitutionSignal("https://www.onlinemanipal.com/ln-mba-smu", sourceRegistry).institutionId).toBe("smu");
  });

  it("finds nothing for a generic URL with no institution token", () => {
    const result = resolveUrlInstitutionSignal("https://www.onlinemanipal.com/ln-mba", sourceRegistry);
    expect(result.institutionId).toBeNull();
    expect(result.strength).toBe("none");
  });

  // 2026-08-20 fix -- live-confirmed real bug: a genuine onlinemanipal.com
  // MUJ course URL spells the institution's full name out across several
  // hyphenated segments instead of a short "-muj" slug token, so the
  // single-word exact-token match never fired and this page's institution
  // stayed permanently "unresolved" -- indistinguishable from a page with
  // zero institution evidence at all, despite the URL being completely
  // unambiguous about which university it belongs to.
  it("resolves a multi-word institution name/alias spelled out across several hyphenated URL segments, which no single hyphen-split token could ever match alone", () => {
    const result = resolveUrlInstitutionSignal("https://www.onlinemanipal.com/online-mba-manipal-university-jaipur", sourceRegistry);
    expect(result.institutionId).toBe("muj");
    expect(result.strength).toBe("strong");
  });

  it("multi-word alias resolution is word-bounded, not a loose substring match -- a URL that merely contains a superset of the words in a different order does not falsely resolve", () => {
    const result = resolveUrlInstitutionSignal("https://www.onlinemanipal.com/jaipur-manipal-university-mba", sourceRegistry);
    expect(result.institutionId).toBeNull();
  });
});

describe("resolvePageInstitutionSignal", () => {
  it("is 'weak', not 'strong', for the generic shared brand", () => {
    const result = resolvePageInstitutionSignal(guess("Online Manipal"), sourceRegistry);
    expect(result.institutionId).toBeNull();
    expect(result.strength).toBe("weak");
  });

  it("is 'strong' for a specific institution name", () => {
    const result = resolvePageInstitutionSignal(guess("Manipal Academy of Higher Education"), sourceRegistry);
    expect(result.institutionId).toBe("mahe");
    expect(result.strength).toBe("strong");
  });

  it("is 'none' when nothing was extracted at all", () => {
    expect(resolvePageInstitutionSignal(null, sourceRegistry).strength).toBe("none");
  });

  // 2026-08-21 fix -- live-confirmed real bug: onlinemanipal.com/online-bba's
  // own institution META guess is just the generic shared brand ("Online
  // Manipal"), but that SAME page's own program/title text spells the
  // specific institution out in full ("Online BBA From Manipal University
  // Jaipur") -- a human reading the page recognizes this instantly, but
  // nothing checked program text for institution evidence before, leaving
  // an unambiguous page's institution permanently "unresolved" and
  // producing a false ambiguous_candidates tie against SMU/MAHE.
  it("falls back to the page's own program text when the institution guess is only the generic shared brand, resolving via a multi-word phrase match", () => {
    const result = resolvePageInstitutionSignal(guess("Online Manipal"), sourceRegistry, guess("Online BBA From Manipal University Jaipur"));
    expect(result.institutionId).toBe("muj");
    expect(result.strength).toBe("strong");
  });

  it("program-text fallback also resolves via an exact whole-string match", () => {
    const result = resolvePageInstitutionSignal(guess("Online Manipal"), sourceRegistry, guess("Manipal Academy of Higher Education"));
    expect(result.institutionId).toBe("mahe");
  });

  it("program-text fallback never fires when the institution guess already resolved specifically -- it's a fallback, not an override", () => {
    const result = resolvePageInstitutionSignal(guess("Sikkim Manipal University"), sourceRegistry, guess("Online BBA From Manipal University Jaipur"));
    expect(result.institutionId).toBe("smu");
  });

  it("program-text fallback stays 'weak', not resolved, when the program text is also just generic wording naming no specific institution", () => {
    const result = resolvePageInstitutionSignal(guess("Online Manipal"), sourceRegistry, guess("Online BBA Courses"));
    expect(result.institutionId).toBeNull();
    expect(result.strength).toBe("weak");
  });
});

describe("resolveLogoInstitutionSignal — classification (D1 follow-up requirement)", () => {
  it("resolves a strong signal from a logo whose alt text names a specific institution", () => {
    const result = resolveLogoInstitutionSignal([logo({ imageUrl: "/mahe-logo.png", altText: "Manipal Academy of Higher Education" })], sourceRegistry);
    expect(result.institutionId).toBe("mahe");
    expect(result.strength).toBe("strong");
  });

  it("resolves via filename tokens alone when alt text is absent", () => {
    const result = resolveLogoInstitutionSignal([logo({ imageUrl: "/wp-content/images/smu-logo.png", filenameTokens: ["smu", "logo"] })], sourceRegistry);
    expect(result.institutionId).toBe("smu");
  });

  it("an accreditation logo alone is NOT enough to resolve institution", () => {
    const result = resolveLogoInstitutionSignal(
      [logo({ imageUrl: "/ugc-logo.svg", altText: "UGC Entitled", filenameTokens: ["ugc", "logo"] })],
      sourceRegistry,
    );
    expect(result.institutionId).toBeNull();
  });

  it("an unrelated partner/vendor logo is NOT enough to resolve institution", () => {
    const result = resolveLogoInstitutionSignal(
      [logo({ imageUrl: "/coursera-logo.svg", altText: "Coursera", filenameTokens: ["coursera", "logo"] })],
      sourceRegistry,
    );
    expect(result.institutionId).toBeNull();
  });

  it("a generic shared-brand logo (e.g. 'Online Manipal') does not resolve an institution on its own", () => {
    const result = resolveLogoInstitutionSignal([logo({ imageUrl: "/logo.png", altText: "Online Manipal" })], sourceRegistry);
    expect(result.institutionId).toBeNull();
  });

  it("mixed page: an accreditation logo plus a genuine institution logo still resolves via the institution one", () => {
    const result = resolveLogoInstitutionSignal(
      [
        logo({ imageUrl: "/ugc-logo.svg", altText: "UGC Entitled" }),
        logo({ imageUrl: "/coursera-logo.svg", altText: "Coursera" }),
        logo({ imageUrl: "/mahe-logo.png", altText: "Manipal Academy of Higher Education" }),
      ],
      sourceRegistry,
    );
    expect(result.institutionId).toBe("mahe");
  });

  it("no logo candidates at all -> 'none', not a conflict or a guess", () => {
    expect(resolveLogoInstitutionSignal([], sourceRegistry).strength).toBe("none");
  });
});

describe("resolveMultiUniversityDefault — derived from registry data, never hardcoded", () => {
  it("MBA is multi-university (MUJ/MAHE/SMU all have an MBA Program record) and defaults to the one reachable on this domain", () => {
    const result = resolveMultiUniversityDefault(guess("MBA"), "https://www.onlinemanipal.com", sourceRegistry);
    expect(result.method).toBe("multi_university_default");
    expect(result.institution?.id).toBe("muj"); // only MUJ has a registered Source here -- a data fact, not a hardcoded name
  });

  it("BBA is single-university (only Sunrise Valley) and resolves that way, not via the multi-university path", () => {
    const result = resolveMultiUniversityDefault(guess("BBA"), "https://example-sunrise.test", sourceRegistry);
    expect(result.method).toBe("single_university_default");
    expect(result.institution?.id).toBe("sunrise-valley");
  });

  it("2026-08-20 fix: BBA's single registered participant (Sunrise Valley) is never defaulted to for a Master domain it has no registered Source at — live-confirmed real-world bug on onlinemanipal.com, which used to be told 'Institution: Sunrise Valley University' for every BBA target purely because BBA had exactly one participant registered anywhere, with zero check that this specific Master domain has anything to do with it", () => {
    const result = resolveMultiUniversityDefault(guess("BBA"), "https://www.onlinemanipal.com", sourceRegistry);
    expect(result.institution).toBeNull();
    expect(result.method).toBeNull();
  });

  it("an unknown program never invents a default", () => {
    const result = resolveMultiUniversityDefault(guess("Diploma in Underwater Basket Weaving"), "https://www.onlinemanipal.com", sourceRegistry);
    expect(result.institution).toBeNull();
    expect(result.method).toBeNull();
  });

  it("no program guess at all never invents a default", () => {
    const result = resolveMultiUniversityDefault(null, "https://www.onlinemanipal.com", sourceRegistry);
    expect(result.institution).toBeNull();
  });
});

describe("resolveInstitutionIdentity — full combinator", () => {
  const masterUrl = "https://www.onlinemanipal.com";

  it("A: multi-university program + no institution anywhere -> MUJ fallback, explicitly labeled as a default", () => {
    const result = resolveInstitutionIdentity(
      { targetUrl: "https://www.onlinemanipal.com/ln-mba", masterUrl, institutionGuess: null, programGuess: guess("MBA"), logoCandidates: [] },
      sourceRegistry,
    );
    expect(result.status).toBe("resolved");
    expect(result.institutionId).toBe("muj");
    expect(result.resolutionMethod).toBe("multi_university_default");
    expect(result.fallbackApplied).toBe(true); // never pretend this was detected
  });

  it("B: MAHE in the URL -> MAHE, never MUJ", () => {
    const result = resolveInstitutionIdentity(
      { targetUrl: "https://www.onlinemanipal.com/ln-mba-mahe", masterUrl, institutionGuess: guess("Online Manipal"), programGuess: guess("MBA"), logoCandidates: [] },
      sourceRegistry,
    );
    expect(result.institutionId).toBe("mahe");
    expect(result.resolutionMethod).toBe("url_identifier");
    expect(result.fallbackApplied).toBe(false);
  });

  it("C: SMU in the URL -> SMU, never MUJ", () => {
    const result = resolveInstitutionIdentity(
      { targetUrl: "https://www.onlinemanipal.com/ln-mba-smu", masterUrl, institutionGuess: null, programGuess: guess("MBA"), logoCandidates: [] },
      sourceRegistry,
    );
    expect(result.institutionId).toBe("smu");
  });

  it("D: MUJ in the URL -> MUJ, and explicitly via url_identifier, not silently via the fallback", () => {
    const result = resolveInstitutionIdentity(
      { targetUrl: "https://www.onlinemanipal.com/ln-mba-muj", masterUrl, institutionGuess: null, programGuess: guess("MBA"), logoCandidates: [] },
      sourceRegistry,
    );
    expect(result.institutionId).toBe("muj");
    expect(result.resolutionMethod).toBe("url_identifier"); // NOT "multi_university_default"
    expect(result.fallbackApplied).toBe(false);
  });

  it("E: no URL signal but strong MAHE page evidence -> MAHE wins over the MUJ fallback", () => {
    const result = resolveInstitutionIdentity(
      {
        targetUrl: "https://www.onlinemanipal.com/some-generic-path",
        masterUrl,
        institutionGuess: guess("Manipal Academy of Higher Education"),
        programGuess: guess("MBA"),
        logoCandidates: [],
      },
      sourceRegistry,
    );
    expect(result.institutionId).toBe("mahe");
    expect(result.resolutionMethod).toBe("page_identity");
  });

  it("F: conflicting strong evidence (URL says MAHE, logo says SMU) -> explicit conflict, never a silent default", () => {
    const result = resolveInstitutionIdentity(
      {
        targetUrl: "https://www.onlinemanipal.com/ln-mba-mahe",
        masterUrl,
        institutionGuess: null,
        programGuess: guess("MBA"),
        logoCandidates: [logo({ imageUrl: "/smu-logo.png", altText: "Sikkim Manipal University" })],
      },
      sourceRegistry,
    );
    expect(result.status).toBe("conflict");
    expect(result.institutionId).toBeNull();
    expect(result.conflictingInstitutionIds?.sort()).toEqual(["mahe", "smu"]);
    expect(result.fallbackApplied).toBe(false);
  });

  it("G: single-university program (BBA/Sunrise Valley) + no institution in URL -> resolves to the only valid institution, labeled distinctly from the multi-university path", () => {
    const result = resolveInstitutionIdentity(
      {
        targetUrl: "https://agency.example.test/bba",
        masterUrl: "https://example-sunrise.test",
        institutionGuess: null,
        programGuess: guess("BBA"),
        logoCandidates: [],
      },
      sourceRegistry,
    );
    expect(result.institutionId).toBe("sunrise-valley");
    expect(result.resolutionMethod).toBe("single_university_default");
    expect(result.fallbackApplied).toBe(true);
  });

  it("2026-08-20 fix: the same BBA program guess on the real onlinemanipal.com domain (unrelated to Sunrise Valley) stays unresolved rather than fabricating an institution", () => {
    const result = resolveInstitutionIdentity(
      {
        targetUrl: "https://www.onlinemanipal.com/online-bba",
        masterUrl: "https://www.onlinemanipal.com",
        institutionGuess: null,
        programGuess: guess("BBA"),
        logoCandidates: [],
      },
      sourceRegistry,
    );
    expect(result.institutionId).toBeNull();
    expect(result.status).toBe("unresolved");
    expect(result.fallbackApplied).toBe(false);
  });

  it("H: unknown program/institution -> never invents an institution", () => {
    const result = resolveInstitutionIdentity(
      {
        targetUrl: "https://totally-unregistered-college.test/some-program",
        masterUrl: "https://totally-unregistered-college.test",
        institutionGuess: null,
        programGuess: guess("Diploma in Underwater Basket Weaving"),
        logoCandidates: [],
      },
      sourceRegistry,
    );
    expect(result.status).toBe("unresolved");
    expect(result.institutionId).toBeNull();
  });

  it("logo alone resolves institution when URL and page text are both silent (rule C)", () => {
    const result = resolveInstitutionIdentity(
      {
        targetUrl: "https://www.onlinemanipal.com/some-generic-path",
        masterUrl,
        institutionGuess: guess("Online Manipal"),
        programGuess: guess("MBA"),
        logoCandidates: [logo({ imageUrl: "/mahe-logo.png", altText: "Manipal Academy of Higher Education" })],
      },
      sourceRegistry,
    );
    expect(result.institutionId).toBe("mahe");
    expect(result.resolutionMethod).toBe("logo");
  });

  it("URL and logo agreeing produces combined_signals, higher-confidence resolution", () => {
    const result = resolveInstitutionIdentity(
      {
        targetUrl: "https://www.onlinemanipal.com/ln-mba-mahe",
        masterUrl,
        institutionGuess: guess("Online Manipal"),
        programGuess: guess("MBA"),
        logoCandidates: [logo({ imageUrl: "/mahe-logo.png", altText: "Manipal Academy of Higher Education" })],
      },
      sourceRegistry,
    );
    expect(result.institutionId).toBe("mahe");
    expect(result.resolutionMethod).toBe("combined_signals");
  });

  it("an accreditation-only logo never contributes to resolution -> generic MBA URL still falls to the MUJ default, not a false institution match", () => {
    const result = resolveInstitutionIdentity(
      {
        targetUrl: "https://www.onlinemanipal.com/ln-mba",
        masterUrl,
        institutionGuess: guess("Online Manipal"),
        programGuess: guess("MBA"),
        logoCandidates: [logo({ imageUrl: "/ugc-logo.svg", altText: "UGC Entitled" }), logo({ imageUrl: "/coursera-logo.svg", altText: "Coursera" })],
      },
      sourceRegistry,
    );
    expect(result.institutionId).toBe("muj");
    expect(result.resolutionMethod).toBe("multi_university_default");
    expect(result.fallbackApplied).toBe(true);
  });
});
