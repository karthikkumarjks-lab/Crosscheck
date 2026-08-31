import { describe, expect, it } from "vitest";
import type { EntityGuess, IdentityGateSignals, InstitutionRelevanceGateConfig, SourceRegistry } from "../src/types.js";
import {
  DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG,
  evaluateInstitutionTextSignals,
  needsLogoTiebreak,
  passesInstitutionRelevanceGate,
} from "../src/dynamic-discovery/index.js";

function guess(value: string): EntityGuess {
  return { value, confidence: "medium", matchedSignals: [] };
}

function signals(overrides: Partial<IdentityGateSignals> & { url: string }): IdentityGateSignals {
  return {
    sourceUrl: overrides.url,
    institution: overrides.institution ?? null,
    brand: overrides.brand ?? null,
    footerLegalText: overrides.footerLegalText ?? null,
    logo: overrides.logo ?? { imageUrl: null, altText: null, detectionMethod: "not_found", perceptualHash: null },
  };
}

const config: InstitutionRelevanceGateConfig = DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG;

describe("evaluateInstitutionTextSignals — Step 1", () => {
  it("both sides silent -> inconclusive on both signals", () => {
    const target = signals({ url: "https://target.test" });
    const candidate = signals({ url: "https://candidate.test" });
    expect(evaluateInstitutionTextSignals(target, candidate)).toEqual({ institutionOrBrand: "inconclusive", footerLegal: "inconclusive" });
  });

  it("matching institution text -> agree", () => {
    const target = signals({ url: "https://target.test", institution: guess("Northbridge University") });
    const candidate = signals({ url: "https://candidate.test", institution: guess("Northbridge University") });
    expect(evaluateInstitutionTextSignals(target, candidate).institutionOrBrand).toBe("agree");
  });

  it("conflicting institution text -> conflict", () => {
    const target = signals({ url: "https://target.test", institution: guess("Northbridge University") });
    const candidate = signals({ url: "https://candidate.test", institution: guess("Eastgate University") });
    expect(evaluateInstitutionTextSignals(target, candidate).institutionOrBrand).toBe("conflict");
  });

  it("falls back to brand when institution is null, on either side", () => {
    const target = signals({ url: "https://target.test", brand: guess("Online Learning Co") });
    const candidate = signals({ url: "https://candidate.test", institution: guess("Online Learning Co") });
    expect(evaluateInstitutionTextSignals(target, candidate).institutionOrBrand).toBe("agree");
  });

  it("footer legal text is its own independent signal", () => {
    const target = signals({ url: "https://target.test", footerLegalText: "Northbridge University" });
    const candidate = signals({ url: "https://candidate.test", footerLegalText: "Eastgate University" });
    const result = evaluateInstitutionTextSignals(target, candidate);
    expect(result.footerLegal).toBe("conflict");
    expect(result.institutionOrBrand).toBe("inconclusive");
  });
});

describe("evaluateInstitutionTextSignals — 2026-08-20 fix: a shared, registered brand-name match is never treated as institution agreement", () => {
  const sharedPortalRegistry: SourceRegistry = {
    institutions: [
      { id: "muj", name: "Manipal University Jaipur", aliases: ["MUJ"], brandNames: ["Online Manipal"] },
      { id: "mahe", name: "Manipal Academy of Higher Education", aliases: ["MAHE"], brandNames: ["Online Manipal"] },
      { id: "smu", name: "Sikkim Manipal University", aliases: ["SMU"], brandNames: ["Online Manipal"] },
    ],
    programs: [],
    sources: [],
  };

  it("live-confirmed real bug: two DIFFERENT institutions sharing the exact same portal-wide brand text no longer 'agree' when a registry is supplied", () => {
    const target = signals({ url: "https://mahe.example.test", institution: guess("Online Manipal") });
    const candidate = signals({ url: "https://portal.example.test/smu-mba", institution: guess("Online Manipal") });

    const withoutRegistry = evaluateInstitutionTextSignals(target, candidate);
    expect(withoutRegistry.institutionOrBrand).toBe("agree"); // the old, buggy behavior, confirmed unchanged when no registry is passed

    const withRegistry = evaluateInstitutionTextSignals(target, candidate, sharedPortalRegistry);
    expect(withRegistry.institutionOrBrand).toBe("inconclusive");
  });

  it("a genuinely specific, non-shared institution name match still counts as agreement even with a registry supplied", () => {
    const target = signals({ url: "https://target.test", institution: guess("Manipal Academy of Higher Education") });
    const candidate = signals({ url: "https://candidate.test", institution: guess("Manipal Academy of Higher Education") });

    const result = evaluateInstitutionTextSignals(target, candidate, sharedPortalRegistry);
    expect(result.institutionOrBrand).toBe("agree");
  });

  it("a genuine conflict between two specific institution names is still a conflict with a registry supplied", () => {
    const target = signals({ url: "https://target.test", institution: guess("Manipal Academy of Higher Education") });
    const candidate = signals({ url: "https://candidate.test", institution: guess("Sikkim Manipal University") });

    const result = evaluateInstitutionTextSignals(target, candidate, sharedPortalRegistry);
    expect(result.institutionOrBrand).toBe("conflict");
  });

  it("the same shared-brand downgrade applies to footerLegal independently of institutionOrBrand", () => {
    const target = signals({ url: "https://mahe.example.test", footerLegalText: "Online Manipal" });
    const candidate = signals({ url: "https://portal.example.test/smu-mba", footerLegalText: "Online Manipal" });

    const withoutRegistry = evaluateInstitutionTextSignals(target, candidate);
    expect(withoutRegistry.footerLegal).toBe("agree"); // old, buggy behavior, confirmed unchanged when no registry is passed

    const withRegistry = evaluateInstitutionTextSignals(target, candidate, sharedPortalRegistry);
    expect(withRegistry.footerLegal).toBe("inconclusive");
  });

  it("a genuine footerLegal conflict between two specific institutions' own footer text is still a conflict with a registry supplied", () => {
    const target = signals({ url: "https://target.test", footerLegalText: "(c) Manipal Academy of Higher Education. All rights reserved." });
    const candidate = signals({ url: "https://candidate.test", footerLegalText: "(c) Sikkim Manipal University. All rights reserved." });

    const result = evaluateInstitutionTextSignals(target, candidate, sharedPortalRegistry);
    expect(result.footerLegal).toBe("conflict");
  });

  it("2026-08-21 fix: a target's partial/generic institution mention that doesn't exactly match any registered institution's full name is never treated as a hard conflict against a candidate whose text names a specific institution -- live-confirmed real bug: 'Manipal University' (missing 'Jaipur') is a literal substring of BOTH 'Manipal University Jaipur' and 'Sikkim Manipal University', so guessing either would be exactly the kind of unjustified guess this project forbids", () => {
    const target = signals({ url: "https://manipaluniversity.co.in/online-bba-degrees", institution: guess("Manipal University") });
    const candidate = signals({ url: "https://www.onlinemanipal.com/online-bba-degree-muj", institution: guess("Manipal University Jaipur") });

    const withoutRegistry = evaluateInstitutionTextSignals(target, candidate);
    expect(withoutRegistry.institutionOrBrand).toBe("conflict"); // the old, buggy behavior: raw string inequality alone

    const withRegistry = evaluateInstitutionTextSignals(target, candidate, sharedPortalRegistry);
    expect(withRegistry.institutionOrBrand).toBe("inconclusive");
  });

  it("2026-08-21 fix: two sides that resolve via alias/full-name phrasing differences to the SAME specific institution correctly agree, not conflict, once a registry is supplied", () => {
    const target = signals({ url: "https://target.test", institution: guess("MAHE") });
    const candidate = signals({ url: "https://candidate.test", institution: guess("Manipal Academy of Higher Education") });

    const withoutRegistry = evaluateInstitutionTextSignals(target, candidate);
    expect(withoutRegistry.institutionOrBrand).toBe("conflict"); // raw strings differ

    const withRegistry = evaluateInstitutionTextSignals(target, candidate, sharedPortalRegistry);
    expect(withRegistry.institutionOrBrand).toBe("agree");
  });

  it("end to end: with the shared-brand downgrade, the gate no longer passes purely on shared-brand text -- falls through to a genuine no-op (inconclusive, no logo evidence)", () => {
    const target = signals({ url: "https://mahe.example.test", institution: guess("Online Manipal") });
    const candidate = signals({ url: "https://portal.example.test/smu-mba", institution: guess("Online Manipal") });

    const result = passesInstitutionRelevanceGate(target, candidate, DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG, null, sharedPortalRegistry);
    expect(result.passed).toBe(true); // still passes -- no conflicting evidence either -- but NOT because of a false "agree"
    expect(result.signals.institutionOrBrand).toBe("inconclusive");
  });
});

describe("needsLogoTiebreak — Step 2->3 trigger", () => {
  const withLogo = { imageUrl: "https://x.test/logo.png", altText: null, detectionMethod: "header_logo_selector" as const, perceptualHash: null };

  it("true only when both text signals inconclusive AND both sides have a detected logo", () => {
    const target = signals({ url: "https://target.test", logo: withLogo });
    const candidate = signals({ url: "https://candidate.test", logo: withLogo });
    const text = evaluateInstitutionTextSignals(target, candidate);
    expect(needsLogoTiebreak(text, target, candidate)).toBe(true);
  });

  it("false if either side has no detected logo", () => {
    const target = signals({ url: "https://target.test", logo: withLogo });
    const candidate = signals({ url: "https://candidate.test" }); // no logo
    const text = evaluateInstitutionTextSignals(target, candidate);
    expect(needsLogoTiebreak(text, target, candidate)).toBe(false);
  });

  it("false if a text signal already agreed/conflicted (nothing to tiebreak)", () => {
    const target = signals({ url: "https://target.test", institution: guess("Northbridge"), logo: withLogo });
    const candidate = signals({ url: "https://candidate.test", institution: guess("Northbridge"), logo: withLogo });
    const text = evaluateInstitutionTextSignals(target, candidate);
    expect(needsLogoTiebreak(text, target, candidate)).toBe(false);
  });
});

describe("passesInstitutionRelevanceGate — combined verdict", () => {
  it("both signals inconclusive, no logo evidence -> safe no-op pass", () => {
    const target = signals({ url: "https://target.test" });
    const candidate = signals({ url: "https://candidate.test" });
    const result = passesInstitutionRelevanceGate(target, candidate, config, null);
    expect(result.passed).toBe(true);
    expect(result.signals.logoHashComputed).toBe(false);
  });

  it("institution text conflict -> hard reject, logo never consulted", () => {
    const target = signals({ url: "https://target.test", institution: guess("Northbridge University") });
    const candidate = signals({ url: "https://candidate.test", institution: guess("Eastgate University") });
    // Even if a similarity happened to be passed in, a text conflict short-circuits before it matters.
    const result = passesInstitutionRelevanceGate(target, candidate, config, 0.99);
    expect(result.passed).toBe(false);
    expect(result.signals.logoHashComputed).toBe(false);
  });

  it("footer text conflict alone is sufficient to reject", () => {
    const target = signals({ url: "https://target.test", footerLegalText: "(c) Northbridge University. All rights reserved." });
    const candidate = signals({ url: "https://candidate.test", footerLegalText: "(c) Eastgate University. All rights reserved." });
    const result = passesInstitutionRelevanceGate(target, candidate, config, null);
    expect(result.passed).toBe(false);
  });

  it("institution text agrees -> pass, independent of footer", () => {
    const target = signals({ url: "https://target.test", institution: guess("Northbridge University") });
    const candidate = signals({ url: "https://candidate.test", institution: guess("Northbridge University") });
    const result = passesInstitutionRelevanceGate(target, candidate, config, null);
    expect(result.passed).toBe(true);
  });

  it("logo similarity below threshold, text inconclusive -> conflict, reject", () => {
    const target = signals({ url: "https://target.test" });
    const candidate = signals({ url: "https://candidate.test" });
    const result = passesInstitutionRelevanceGate(target, candidate, config, 0.5);
    expect(result.passed).toBe(false);
    expect(result.signals.logo).toBe("conflict");
    expect(result.signals.logoHashComputed).toBe(true);
  });

  it("logo similarity at/above threshold, text inconclusive -> agree, pass", () => {
    const target = signals({ url: "https://target.test" });
    const candidate = signals({ url: "https://candidate.test" });
    const result = passesInstitutionRelevanceGate(target, candidate, config, 0.9);
    expect(result.passed).toBe(true);
    expect(result.signals.logo).toBe("agree");
  });

  it("disabled config -> always passes, never evaluates logo", () => {
    const target = signals({ url: "https://target.test", institution: guess("Northbridge University") });
    const candidate = signals({ url: "https://candidate.test", institution: guess("Eastgate University") });
    const result = passesInstitutionRelevanceGate(target, candidate, { enabled: false, logoSimilarityConflictThreshold: 0.75 }, null);
    expect(result.passed).toBe(true);
  });
});
