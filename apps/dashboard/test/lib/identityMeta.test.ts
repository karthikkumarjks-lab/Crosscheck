import { describe, expect, it } from "vitest";
import type { InstitutionResolutionMethod } from "@crosscheck/core";
import { IDENTITY_METHOD_META, isPolicyDefault } from "../../src/lib/identityMeta.js";

const ALL_METHODS: InstitutionResolutionMethod[] = [
  "url_identifier",
  "page_identity",
  "logo",
  "combined_signals",
  "multi_university_default",
  "single_university_default",
  "conflict",
  "unresolved",
];

describe("IDENTITY_METHOD_META", () => {
  it("has an entry for every real backend resolutionMethod value, and no extras", () => {
    expect(Object.keys(IDENTITY_METHOD_META).sort()).toEqual([...ALL_METHODS].sort());
  });

  it("distinguishes detected methods from the policy-default methods -- the core D1/detected-vs-defaulted requirement", () => {
    expect(IDENTITY_METHOD_META.url_identifier.tone).toBe("detected");
    expect(IDENTITY_METHOD_META.page_identity.tone).toBe("detected");
    expect(IDENTITY_METHOD_META.logo.tone).toBe("detected");
    expect(IDENTITY_METHOD_META.combined_signals.tone).toBe("combined");
    expect(IDENTITY_METHOD_META.multi_university_default.tone).toBe("default");
    expect(IDENTITY_METHOD_META.single_university_default.tone).toBe("default");
    // No "detected"-toned method shares its tone with either default method.
    for (const detected of ["url_identifier", "page_identity", "logo"] as const) {
      expect(IDENTITY_METHOD_META[detected].tone).not.toBe("default");
    }
  });

  it("conflict and unresolved are both 'problem' tone, distinct from every success-shaped state", () => {
    expect(IDENTITY_METHOD_META.conflict.tone).toBe("problem");
    expect(IDENTITY_METHOD_META.unresolved.tone).toBe("problem");
  });

  it("the multi_university_default label never claims the institution was 'detected'", () => {
    expect(IDENTITY_METHOD_META.multi_university_default.label.toLowerCase()).not.toContain("detected");
  });
});

describe("isPolicyDefault", () => {
  it("reads fallbackApplied directly, never re-derives it", () => {
    expect(isPolicyDefault(true)).toBe(true);
    expect(isPolicyDefault(false)).toBe(false);
  });
});
