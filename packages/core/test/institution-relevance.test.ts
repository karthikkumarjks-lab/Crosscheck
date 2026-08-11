import { describe, expect, it } from "vitest";
import type { EntityGuess, IdentityGateSignals, InstitutionRelevanceGateConfig } from "../src/types.js";
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
