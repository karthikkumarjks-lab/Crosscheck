import { describe, expect, it } from "vitest";
import type { EntityGuess, IdentityGateSignals, LogoEvidence } from "@crosscheck/core";
import { compareIdentity } from "../../src/identity/compareIdentity.js";

function guess(value: string): EntityGuess {
  return { value, confidence: "medium", matchedSignals: [] };
}

const NO_LOGO: LogoEvidence = { imageUrl: null, altText: null, detectionMethod: "not_found", perceptualHash: null };
function logo(url: string): LogoEvidence {
  return { imageUrl: url, altText: null, detectionMethod: "header_logo_selector", perceptualHash: null };
}

function signals(overrides: Partial<IdentityGateSignals> & { url: string }): IdentityGateSignals {
  return {
    sourceUrl: overrides.url,
    institution: overrides.institution ?? null,
    brand: overrides.brand ?? null,
    footerLegalText: overrides.footerLegalText ?? null,
    logo: overrides.logo ?? NO_LOGO,
  };
}

describe("compareIdentity", () => {
  it("all strong signals agree -> correct_identity, high confidence", () => {
    const master = signals({
      url: "https://master.test",
      institution: guess("Northbridge University"),
      brand: guess("Northbridge"),
      footerLegalText: "Northbridge University",
      logo: logo("https://master.test/logo.png"),
    });
    const target = signals({
      url: "https://target.test",
      institution: guess("Northbridge University"),
      brand: guess("Northbridge"),
      footerLegalText: "Northbridge University",
      logo: logo("https://target.test/logo.png"),
    });
    const result = compareIdentity(master, target, 1.0);
    expect(result.status).toBe("correct_identity");
    expect(result.confidence).toBe("high");
  });

  it("institution name conflicts -> wrong_identity, even if other signals are silent", () => {
    const master = signals({ url: "https://master.test", institution: guess("Northbridge University") });
    const target = signals({ url: "https://target.test", institution: guess("Eastgate University") });
    const result = compareIdentity(master, target, null);
    expect(result.status).toBe("wrong_identity");
  });

  it("logo alone conflicting (everything else agrees) is enough for wrong_identity -- logo is a real signal, not decorative", () => {
    const master = signals({
      url: "https://master.test",
      institution: guess("Northbridge University"),
      logo: logo("https://master.test/logo.png"),
    });
    const target = signals({
      url: "https://target.test",
      institution: guess("Northbridge University"),
      logo: logo("https://target.test/logo.png"),
    });
    const result = compareIdentity(master, target, 0.2); // low similarity -> mismatch
    expect(result.logo.status).toBe("mismatch");
    expect(result.status).toBe("wrong_identity");
  });

  it("logo is never the SOLE deciding signal in isolation from evidence -- a low-similarity logo with no other signals available still surfaces as wrong_identity (logo is itself a strong signal), but signalComparisons show it's the only contributing signal", () => {
    const master = signals({ url: "https://master.test", logo: logo("https://master.test/logo.png") });
    const target = signals({ url: "https://target.test", logo: logo("https://target.test/logo.png") });
    const result = compareIdentity(master, target, 0.1);
    expect(result.status).toBe("wrong_identity");
    const definiteSignals = result.signalComparisons.filter((s) => s.match !== "uncertain");
    expect(definiteSignals).toHaveLength(1);
    expect(definiteSignals[0].signalType).toBe("logo");
  });

  it("no strong evidence anywhere -> unable_to_determine, never fabricated", () => {
    const master = signals({ url: "https://master.test" });
    const target = signals({ url: "https://target.test" });
    const result = compareIdentity(master, target, null);
    expect(result.status).toBe("unable_to_determine");
    expect(result.confidence).toBe("low");
  });

  it("high logo similarity in the possible_variant band -> possible_variant, not wrong_identity", () => {
    const master = signals({
      url: "https://master.test",
      institution: guess("Northbridge University"),
      logo: logo("https://master.test/logo.png"),
    });
    const target = signals({
      url: "https://target.test",
      institution: guess("Northbridge University"),
      logo: logo("https://target.test/logo.png"),
    });
    const result = compareIdentity(master, target, 0.8); // between 0.75 and 0.95
    expect(result.logo.status).toBe("possible_variant");
    expect(result.status).toBe("possible_variant");
  });

  it("missing logo on one side is 'missing', not 'mismatch' -- never punished as a conflict", () => {
    const master = signals({ url: "https://master.test", institution: guess("Northbridge University"), logo: logo("https://master.test/logo.png") });
    const target = signals({ url: "https://target.test", institution: guess("Northbridge University") }); // no logo detected
    const result = compareIdentity(master, target, null);
    expect(result.logo.status).toBe("missing");
    expect(result.status).toBe("correct_identity"); // institution still agrees
  });

  it("preserves full two-sided evidence on every comparison", () => {
    const master = signals({ url: "https://master.test", institution: guess("Northbridge University"), footerLegalText: "Northbridge University" });
    const target = signals({ url: "https://target.test", institution: guess("Eastgate University"), footerLegalText: "Eastgate University" });
    const result = compareIdentity(master, target, null);
    const institutionSignal = result.signalComparisons.find((s) => s.signalType === "institution_name");
    expect(institutionSignal?.masterValue).toBe("Northbridge University");
    expect(institutionSignal?.targetValue).toBe("Eastgate University");
  });
});
