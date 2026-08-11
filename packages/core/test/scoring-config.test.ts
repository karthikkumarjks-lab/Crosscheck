import { describe, expect, it } from "vitest";
import { DEFAULT_DISCOVERY_SCORING_CONFIG } from "../src/dynamic-discovery/index.js";

describe("DEFAULT_DISCOVERY_SCORING_CONFIG", () => {
  it("matches the Sprint 5 plan's §7 weight table exactly", () => {
    expect(DEFAULT_DISCOVERY_SCORING_CONFIG.weights).toEqual({
      degreeMatch: 60,
      programMatch: 25,
      institutionMatch: 15,
      headingKeywordMatch: 10,
      urlKeywordMatch: 8,
      pageTypePlausibility: 5,
      homepagePenalty: -20,
      institutionIdentityMatch: 20,
    });
  });

  it("matches the Sprint 5 plan's §8 threshold defaults exactly", () => {
    expect(DEFAULT_DISCOVERY_SCORING_CONFIG.thresholds).toEqual({
      minConfidenceThreshold: 40,
      highConfidenceScore: 70,
      minWinnerMargin: 15,
    });
  });

  it("enables the Program Relevance Gate by default, per Sprint 5 Revision 1 §14 Decision #3", () => {
    expect(DEFAULT_DISCOVERY_SCORING_CONFIG.programRelevanceGate).toEqual({
      enabled: true,
      additionalStopwords: [],
      minOverlapCount: 1,
    });
  });

  it("is composable — overriding one field leaves every other field at its default", () => {
    const overridden = {
      ...DEFAULT_DISCOVERY_SCORING_CONFIG,
      thresholds: { ...DEFAULT_DISCOVERY_SCORING_CONFIG.thresholds, minWinnerMargin: 30 },
    };

    expect(overridden.thresholds.minWinnerMargin).toBe(30);
    expect(overridden.thresholds.minConfidenceThreshold).toBe(DEFAULT_DISCOVERY_SCORING_CONFIG.thresholds.minConfidenceThreshold);
    expect(overridden.thresholds.highConfidenceScore).toBe(DEFAULT_DISCOVERY_SCORING_CONFIG.thresholds.highConfidenceScore);
    expect(overridden.weights).toEqual(DEFAULT_DISCOVERY_SCORING_CONFIG.weights);
    // The original default export itself must be untouched by the override.
    expect(DEFAULT_DISCOVERY_SCORING_CONFIG.thresholds.minWinnerMargin).toBe(15);
  });
});
