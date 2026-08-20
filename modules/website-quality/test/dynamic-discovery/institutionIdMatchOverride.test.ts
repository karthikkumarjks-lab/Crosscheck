import { describe, expect, it } from "vitest";
import type { IdentityGateSignals, InstitutionResolutionResult } from "@crosscheck/core";
import { DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG } from "@crosscheck/core";
import { evaluateInstitutionGateForPair } from "../../src/dynamic-discovery/masterPageIndexShared.js";

// 2026-08-20 fix -- live-confirmed on the real onlinemanipal.com site: a
// target hosted on a university's own separately-branded subdomain
// (mahe.onlinemanipal.com, page text "MAHE Online") was rejected against
// EVERY candidate on the shared multi-university portal domain, because
// every candidate there carries the SAME whole-portal brand text ("Online
// Manipal") regardless of which specific university it's actually about
// -- a genuine institution match (both resolve to institutionId "mahe" via
// URL/logo evidence) was treated as a hard text conflict purely because
// the two pages name the institution at different levels of specificity.

const noLogo = { imageUrl: null, altText: null, detectionMethod: "none" as const, decodedHash: null };

function signals(overrides: Partial<IdentityGateSignals>): IdentityGateSignals {
  return {
    sourceUrl: "https://example.test/",
    institution: null,
    brand: null,
    footerLegalText: null,
    logo: noLogo,
    ...overrides,
  };
}

function resolved(institutionId: string, institutionName: string): InstitutionResolutionResult {
  return {
    institutionId,
    institutionName,
    status: "resolved",
    resolutionMethod: "combined_signals",
    signals: {
      url: { institutionId, strength: "strong", evidence: "test" },
      pageIdentity: { institutionId: null, strength: "none", evidence: "test" },
      logo: { institutionId, strength: "strong", evidence: "test" },
    },
    fallbackApplied: false,
  };
}

const neverResolveLogoHash = async () => null;

describe("evaluateInstitutionGateForPair -- canonical institutionId override", () => {
  it("a confidently-resolved matching institutionId on both sides overrides a raw text conflict between a whole-portal brand and a specific university's own brand", async () => {
    const target = signals({ institution: { value: "MAHE Online", confidence: "medium", matchedSignals: [] } });
    const candidate = signals({ institution: { value: "Online Manipal", confidence: "medium", matchedSignals: [] } });

    // Without the institutionId override, this is a hard text conflict --
    // confirmed first, so the test proves the override is what changes
    // the outcome, not something else.
    const withoutOverride = await evaluateInstitutionGateForPair(target, candidate, DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG, neverResolveLogoHash);
    expect(withoutOverride.passed).toBe(false);

    const withOverride = await evaluateInstitutionGateForPair(
      target,
      candidate,
      DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG,
      neverResolveLogoHash,
      resolved("mahe", "Manipal Academy of Higher Education"),
      resolved("mahe", "Manipal Academy of Higher Education"),
    );
    expect(withOverride.passed).toBe(true);
  });

  it("a confidently-resolved DIFFERENT institutionId on each side never overrides -- the override can only turn a reject into a pass for a genuine match, never mask a real conflict", async () => {
    const target = signals({ institution: { value: "MAHE Online", confidence: "medium", matchedSignals: [] } });
    const candidate = signals({ institution: { value: "Online Manipal", confidence: "medium", matchedSignals: [] } });

    const result = await evaluateInstitutionGateForPair(
      target,
      candidate,
      DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG,
      neverResolveLogoHash,
      resolved("mahe", "Manipal Academy of Higher Education"),
      resolved("smu", "Sikkim Manipal University"),
    );
    expect(result.passed).toBe(false);
  });

  it("an unresolved institutionId on either side never overrides -- falls back to the pre-existing text/logo gate unchanged", async () => {
    const target = signals({ institution: { value: "MAHE Online", confidence: "medium", matchedSignals: [] } });
    const candidate = signals({ institution: { value: "Online Manipal", confidence: "medium", matchedSignals: [] } });

    const result = await evaluateInstitutionGateForPair(
      target,
      candidate,
      DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG,
      neverResolveLogoHash,
      { institutionId: null, institutionName: null, status: "unresolved", resolutionMethod: "unresolved", signals: { url: { institutionId: null, strength: "none", evidence: "" }, pageIdentity: { institutionId: null, strength: "none", evidence: "" }, logo: { institutionId: null, strength: "none", evidence: "" } }, fallbackApplied: false },
      resolved("mahe", "Manipal Academy of Higher Education"),
    );
    expect(result.passed).toBe(false);
  });

  it("genuinely matching text still passes exactly as before -- the override is additive, not a replacement for the existing text/logo checks", async () => {
    const target = signals({ institution: { value: "Northbridge University", confidence: "medium", matchedSignals: [] } });
    const candidate = signals({ institution: { value: "Northbridge University", confidence: "medium", matchedSignals: [] } });

    const result = await evaluateInstitutionGateForPair(target, candidate, DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG, neverResolveLogoHash);
    expect(result.passed).toBe(true);
  });
});
