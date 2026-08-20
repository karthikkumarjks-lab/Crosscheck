import { describe, expect, it } from "vitest";
import type { DiscoveryCandidateInput, DiscoveryPageIdentity, DiscoveryScoringConfig, EntityGuess, InstitutionResolutionResult } from "../src/types.js";
import { DEFAULT_DISCOVERY_SCORING_CONFIG, identityKeywords, scoreCandidate, selectAuthoritativePage } from "../src/dynamic-discovery/index.js";

function guess(value: string): EntityGuess {
  return { value, confidence: "medium", matchedSignals: [] };
}

const MASTER_HOMEPAGE = "https://master.example.test/";

function identity(overrides: Partial<DiscoveryPageIdentity> & { url: string }): DiscoveryPageIdentity {
  return {
    url: overrides.url,
    title: overrides.title ?? null,
    headings: overrides.headings ?? [],
    degree: overrides.degree ?? null,
    program: overrides.program ?? null,
    institution: overrides.institution ?? null,
    brand: overrides.brand ?? null,
    pageType: overrides.pageType ?? null,
    specializations: overrides.specializations ?? null,
  };
}

const target = identity({
  url: "https://agency.example.test/data-science",
  title: "M.Sc. Data Science | Northbridge Institute of Technology",
  headings: ["M.Sc. Data Science"],
  degree: guess("M.Sc"),
  program: guess("M.Sc. Data Science"),
  institution: guess("Northbridge Institute of Technology"),
  pageType: { value: "pg", confidence: "medium", matchedSignals: [] },
});

function guessWithMatchedText(value: string, matchedText: string): EntityGuess {
  return { value, confidence: "medium", matchedSignals: [{ signalType: "phrase_match", matchedText, location: "title" }] };
}

describe("identityKeywords — 2026-08-20 fix: excludes degree-boilerplate words, not just raw tokenization", () => {
  it("live-confirmed regression: 'Master of Arts (Political Science) (MA)' no longer leaks 'master'/'arts' as if they were subject-discriminating ('science' is already excluded as a pre-existing generic academic-category stopword, leaving just the one real discriminator, 'political')", () => {
    const politicalScience = identity({
      url: "https://agency.example.test/ln-ma-political-smu",
      degree: guessWithMatchedText("MA", "MA"),
      program: guessWithMatchedText("Master of Arts (Political Science) (MA)", "MA"),
    });
    const keywords = identityKeywords(politicalScience);
    expect(keywords).not.toContain("master");
    expect(keywords).not.toContain("arts");
    expect(keywords).toContain("political");
  });

  it("a different MA specialization on the SAME site never shares a keyword with 'political science' anymore -- previously both would share 'master'/'arts'", () => {
    const politicalScience = identity({
      url: "https://agency.example.test/ln-ma-political-smu",
      degree: guessWithMatchedText("MA", "MA"),
      program: guessWithMatchedText("Master of Arts (Political Science) (MA)", "MA"),
    });
    const sociologyKeywords = identityKeywords(
      identity({
        url: "https://master.example.test/online-ma-sociology-degree",
        degree: guessWithMatchedText("MA", "MA"),
        program: guessWithMatchedText("Master of Arts (Sociology) (MA)", "MA"),
      }),
    );
    const politicalScienceKeywords = identityKeywords(politicalScience);
    expect(politicalScienceKeywords.some((k) => sociologyKeywords.includes(k))).toBe(false);
  });

  it("the earlier MCA/MCom phrasing-mismatch fix still holds -- degree.value's own tokens (spelled-out or concatenated) are still excluded", () => {
    const bareMca = identity({
      url: "https://agency.example.test/ln-mca-smu",
      degree: { value: "MCA", confidence: "high", matchedSignals: [{ signalType: "phrase_match", matchedText: "Master of Computer Applications", location: "title" }] },
      program: guessWithMatchedText("Online MCA", "Master of Computer Applications"),
    });
    expect(identityKeywords(bareMca)).toEqual([]);
  });
});

describe("scoreCandidate — every §7 signal", () => {
  it("scores a full match: degree + program + institution + heading keyword + url keyword + pageType", () => {
    const candidate = identity({
      url: "https://master.example.test/msc-data-science",
      title: "M.Sc. Data Science | Northbridge Institute of Technology",
      headings: ["M.Sc. Data Science"],
      degree: guess("M.Sc"),
      program: guess("M.Sc. Data Science"),
      institution: guess("Northbridge Institute of Technology"),
      pageType: { value: "pg", confidence: "medium", matchedSignals: [] },
    });

    const { score, scoreBreakdown } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);

    expect(score).toBe(60 + 25 + 15 + 10 + 8 + 5);
    expect(scoreBreakdown).toHaveLength(6);
  });

  it("degree match alone contributes exactly 60", () => {
    const candidate = identity({ url: "https://master.example.test/x", degree: guess("M.Sc") });
    const { score } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(60);
  });

  it("program match alone contributes exactly 25", () => {
    const candidate = identity({ url: "https://master.example.test/x", program: guess("M.Sc. Data Science") });
    const { score } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(25);
  });

  it("institution match alone contributes exactly 15", () => {
    const candidate = identity({ url: "https://master.example.test/x", institution: guess("Northbridge Institute of Technology") });
    const { score } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(15);
  });

  it("brand is used as an institution-match fallback when institution is absent on either side", () => {
    const targetWithBrandOnly = identity({ ...target, institution: null, brand: guess("Northbridge") });
    const candidate = identity({ url: "https://master.example.test/x", brand: guess("Northbridge") });
    const { score } = scoreCandidate(targetWithBrandOnly, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(15);
  });

  it("heading/title keyword overlap alone contributes exactly 10", () => {
    const candidate = identity({ url: "https://master.example.test/x", headings: ["Learn Data Science with us"] });
    const { score } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(10);
  });

  it("URL keyword overlap alone contributes exactly 8", () => {
    const candidate = identity({ url: "https://master.example.test/programs/data-science-online" });
    const { score } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(8);
  });

  it("pageType plausibility alone contributes exactly 5", () => {
    const candidate = identity({
      url: "https://master.example.test/x",
      pageType: { value: "pg", confidence: "medium", matchedSignals: [] },
    });
    const { score } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(5);
  });

  it("scores zero when nothing matches", () => {
    const candidate = identity({
      url: "https://master.example.test/about-us",
      title: "About Us",
      headings: ["Our History"],
      degree: null,
      program: null,
      institution: guess("A Completely Different College"),
      pageType: { value: "institution_page", confidence: "medium", matchedSignals: [] },
    });
    const { score, scoreBreakdown } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(0);
    expect(scoreBreakdown).toHaveLength(0);
  });
});

describe("scoreCandidate — homepage penalty", () => {
  it("applies the -20 penalty when the candidate IS the Master homepage and nothing else matched", () => {
    const candidate = identity({ url: MASTER_HOMEPAGE, title: "Northbridge Homepage", headings: ["Welcome"] });
    const { score, scoreBreakdown } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(-20);
    expect(scoreBreakdown).toHaveLength(1);
  });

  it("does NOT apply the homepage penalty when the homepage also matches on another signal", () => {
    const candidate = identity({ url: MASTER_HOMEPAGE, degree: guess("M.Sc") });
    const { score } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(60); // no -20 penalty stacked on top
  });

  it("does not apply the penalty to a non-homepage URL", () => {
    const candidate = identity({ url: "https://master.example.test/somewhere-else" });
    const { score, scoreBreakdown } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(0);
    expect(scoreBreakdown).toHaveLength(0);
  });

  it("treats a trailing-slash variant of the homepage as the same URL", () => {
    const candidate = identity({ url: "https://master.example.test", title: "x" });
    const { score } = scoreCandidate(target, candidate, MASTER_HOMEPAGE);
    expect(score).toBe(-20);
  });
});

describe("selectAuthoritativePage — two-gate rule (§8), finalized per approved Decision #4", () => {
  const strictProgram = guess("M.Sc. Data Science");
  const otherProgram = guess("M.Sc. Statistics");

  function candidateInput(url: string, program: EntityGuess | null, degree: EntityGuess | null = guess("M.Sc")): DiscoveryCandidateInput {
    return { url, discoveryMethod: "sitemap", identity: identity({ url, degree, program }) };
  }

  it("selects the single clear winner at medium confidence when the score clears minConfidenceThreshold but stays below highConfidenceScore", () => {
    // program (25) + institution (15) = 40 (URL deliberately keyword-neutral,
    // i.e. contains neither "data" nor "science", so urlKeywordMatch does
    // not also fire): clears minConfidenceThreshold (40) but stays below
    // highConfidenceScore (70) -> "medium", not "high".
    const candidates: DiscoveryCandidateInput[] = [
      {
        url: "https://master.example.test/program",
        discoveryMethod: "sitemap",
        identity: identity({ url: "https://master.example.test/program", program: strictProgram, institution: guess("Northbridge Institute of Technology") }),
      },
    ];
    const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE);
    expect(result.evaluations[0].score).toBe(40);
    expect(result.selectedUrl).toBe("https://master.example.test/program");
    expect(result.confidence).toBe("medium");
  });

  it("labels a score >= highConfidenceScore as high once both gates already pass", () => {
    const candidates = [
      candidateInput("https://master.example.test/program", strictProgram),
      candidateInput("https://master.example.test/noise", null, null),
    ];
    const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE);
    expect(result.evaluations[0].score).toBe(85); // degree 60 + program 25
    expect(result.confidence).toBe("high"); // 85 >= 70
    expect(result.selectedUrl).toBe("https://master.example.test/program");
  });

  it("returns authoritative_page_not_found when there are zero candidates", () => {
    const result = selectAuthoritativePage(target, [], MASTER_HOMEPAGE);
    expect(result.selectedUrl).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.failureReason).toBe("authoritative_page_not_found");
  });

  it("returns authoritative_page_not_found when nothing matches the target's identity", () => {
    const candidates = [candidateInput("https://master.example.test/about", null, null)];
    const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE);
    expect(result.failureReason).toBe("authoritative_page_not_found");
  });

  it("correctly disambiguates two shared-template candidates by program text, not just degree (the Data Science vs Statistics scenario)", () => {
    // Both candidates share the same degree (M.Sc, from the shared
    // template). Under the Sprint 5 Revision 1 Program Relevance Gate,
    // the Statistics candidate ("statistics" shares no subject keyword
    // with the target's "data"/"science") is excluded before scoring
    // ever runs, not merely outscored — exactly like Northbridge's two
    // real fixture pages, and the concrete motivation for this revision.
    const candidates = [
      candidateInput("https://master.example.test/data-science", strictProgram),
      candidateInput("https://master.example.test/statistics", otherProgram),
    ];
    const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE);
    const dataScience = result.evaluations.find((e) => e.url.endsWith("/data-science"))!;
    const statistics = result.evaluations.find((e) => e.url.endsWith("/statistics"))!;
    expect(dataScience.score).toBe(93); // degree 60 + program 25 + url keyword 8
    expect(dataScience.passedProgramRelevanceGate).toBe(true);
    expect(statistics.passedProgramRelevanceGate).toBe(false);
    expect(statistics.score).toBeUndefined(); // never scored -- rejected before scoring
    expect(result.selectedUrl).toBe("https://master.example.test/data-science");
    expect(result.failureReason).toBeUndefined();
  });

  it("returns ambiguous_candidates when two gate-eligible candidates tie because neither's program text is distinguishable from the target's", () => {
    // Both share the target's subject ("data"/"science") so both pass
    // the Program Relevance Gate, but neither's program text exactly
    // matches the target's -- so programMatch never fires for either,
    // and both land on degree-only: 60.
    const candidates = [
      candidateInput("https://master.example.test/page-a", guess("Data Science – Track A")),
      candidateInput("https://master.example.test/page-b", guess("Data Science – Track B")),
    ];
    const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE);
    expect(result.evaluations[0].score).toBe(60);
    expect(result.evaluations[1].score).toBe(60);
    expect(result.evaluations[0].passedProgramRelevanceGate).toBe(true);
    expect(result.evaluations[1].passedProgramRelevanceGate).toBe(true);
    expect(result.selectedUrl).toBeNull();
    expect(result.failureReason).toBe("ambiguous_candidates");
    expect(result.evaluations).toHaveLength(2);
  });

  it("returns authoritative_page_not_found when every candidate is rejected by the Program Relevance Gate (no program information at all)", () => {
    // A candidate with no program/heading/title information provides no
    // positive evidence it's about the target's specific subject -- the
    // gate rejects it before scoring, distinct from the old "scored 0"
    // path this test previously exercised.
    const candidates = [candidateInput("https://master.example.test/page-a", null)];
    const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE);
    expect(result.selectedUrl).toBeNull();
    expect(result.failureReason).toBe("authoritative_page_not_found");
    expect(result.evaluations[0].passedProgramRelevanceGate).toBe(false);
    expect(result.evaluations[0].score).toBeUndefined();
  });

  it('"highest score alone is never sufficient": two very-high, near-tied scores still resolve to ambiguous_candidates', () => {
    const config: DiscoveryScoringConfig = DEFAULT_DISCOVERY_SCORING_CONFIG;
    const candidates = [
      candidateInput("https://master.example.test/data-science-a", strictProgram),
      { ...candidateInput("https://master.example.test/data-science-b", strictProgram), discoveryMethod: "nav_link" as const },
    ];
    // Both score 85 (degree + program), comfortably above highConfidenceScore (70),
    // but margin is 0 < minWinnerMargin (15) -> still ambiguous, not "pick the first one".
    const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE, config);
    expect(result.evaluations[0].score).toBeGreaterThanOrEqual(config.thresholds.highConfidenceScore);
    expect(result.evaluations[1].score).toBeGreaterThanOrEqual(config.thresholds.highConfidenceScore);
    expect(result.selectedUrl).toBeNull();
    expect(result.failureReason).toBe("ambiguous_candidates");
  });

  describe("exact boundary cases", () => {
    const config: DiscoveryScoringConfig = {
      weights: { degreeMatch: 40, programMatch: 0, institutionMatch: 0, headingKeywordMatch: 0, urlKeywordMatch: 0, pageTypePlausibility: 0, homepagePenalty: 0, institutionIdentityMatch: 0 },
      thresholds: { minConfidenceThreshold: 40, highConfidenceScore: 40, minWinnerMargin: 15 },
    };

    // These boundary cases isolate the confidence/margin thresholds
    // (main plan §8) from the Program Relevance Gate: every candidate
    // below is given a program value that shares a subject keyword with
    // the target (so it clears the gate) but, where the custom config's
    // own programMatch weight is non-zero, does NOT exactly equal the
    // target's program text (so the exact-match programMatch signal
    // stays silent) -- preserving each test's precise intended score.
    const gateEligibleProgram = guess("Data Science Overview");

    it("score exactly === minConfidenceThreshold passes the confidence gate (and, here, also labels high)", () => {
      const candidates = [candidateInput("https://master.example.test/x", gateEligibleProgram, guess("M.Sc"))]; // scores exactly 40
      const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE, config);
      expect(result.evaluations[0].score).toBe(40);
      expect(result.selectedUrl).toBe("https://master.example.test/x");
      expect(result.confidence).toBe("high");
    });

    it("score === minConfidenceThreshold - 1 fails the confidence gate -> authoritative_page_not_found", () => {
      const lowConfig: DiscoveryScoringConfig = {
        ...config,
        weights: { ...config.weights, degreeMatch: 39 },
      };
      const candidates = [candidateInput("https://master.example.test/x", gateEligibleProgram, guess("M.Sc"))]; // scores exactly 39
      const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE, lowConfig);
      expect(result.evaluations[0].score).toBe(39);
      expect(result.selectedUrl).toBeNull();
      expect(result.failureReason).toBe("authoritative_page_not_found");
    });

    it("score === highConfidenceScore - 1 labels medium, not high", () => {
      const mediumConfig: DiscoveryScoringConfig = {
        ...config,
        weights: { ...config.weights, degreeMatch: 39 },
        thresholds: { ...config.thresholds, minConfidenceThreshold: 30, highConfidenceScore: 40 },
      };
      const candidates = [candidateInput("https://master.example.test/x", gateEligibleProgram, guess("M.Sc"))]; // scores exactly 39
      const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE, mediumConfig);
      expect(result.evaluations[0].score).toBe(39);
      expect(result.selectedUrl).toBe("https://master.example.test/x");
      expect(result.confidence).toBe("medium");
    });

    it("margin exactly === minWinnerMargin is decisive, not ambiguous", () => {
      const marginConfig: DiscoveryScoringConfig = {
        weights: { degreeMatch: 40, programMatch: 15, institutionMatch: 0, headingKeywordMatch: 0, urlKeywordMatch: 0, pageTypePlausibility: 0, homepagePenalty: 0, institutionIdentityMatch: 0 },
        thresholds: { minConfidenceThreshold: 10, highConfidenceScore: 1000, minWinnerMargin: 15 },
      };
      const candidates = [
        candidateInput("https://master.example.test/winner", strictProgram), // 40 + 15 = 55
        candidateInput("https://master.example.test/runner-up", gateEligibleProgram, guess("M.Sc")), // 40 (no exact program match)
      ];
      const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE, marginConfig);
      expect(result.evaluations[0].score - result.evaluations[1].score).toBe(15);
      expect(result.selectedUrl).toBe("https://master.example.test/winner");
      expect(result.failureReason).toBeUndefined();
    });

    it("margin === minWinnerMargin - 1 is ambiguous_candidates", () => {
      const marginConfig: DiscoveryScoringConfig = {
        weights: { degreeMatch: 40, programMatch: 14, institutionMatch: 0, headingKeywordMatch: 0, urlKeywordMatch: 0, pageTypePlausibility: 0, homepagePenalty: 0, institutionIdentityMatch: 0 },
        thresholds: { minConfidenceThreshold: 10, highConfidenceScore: 1000, minWinnerMargin: 15 },
      };
      const candidates = [
        candidateInput("https://master.example.test/winner", strictProgram), // 40 + 14 = 54
        candidateInput("https://master.example.test/runner-up", gateEligibleProgram, guess("M.Sc")), // 40 (no exact program match)
      ];
      const result = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE, marginConfig);
      expect(result.evaluations[0].score - result.evaluations[1].score).toBe(14);
      expect(result.selectedUrl).toBeNull();
      expect(result.failureReason).toBe("ambiguous_candidates");
    });
  });

  it("a passed-in non-default config actually changes the outcome (proves the config is consumed, not just documented)", () => {
    const strictConfig: DiscoveryScoringConfig = {
      ...DEFAULT_DISCOVERY_SCORING_CONFIG,
      thresholds: { ...DEFAULT_DISCOVERY_SCORING_CONFIG.thresholds, minConfidenceThreshold: 94 },
    };
    const candidates = [candidateInput("https://master.example.test/data-science", strictProgram)]; // scores 93 (degree 60 + program 25 + url keyword 8)
    const permissive = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE, DEFAULT_DISCOVERY_SCORING_CONFIG);
    const strict = selectAuthoritativePage(target, candidates, MASTER_HOMEPAGE, strictConfig);

    expect(permissive.selectedUrl).not.toBeNull();
    expect(strict.selectedUrl).toBeNull();
    expect(strict.failureReason).toBe("authoritative_page_not_found");
  });
});

// Fix 1 — real SMU-batch validation found that two candidates from
// different institutions, sharing one generic brand, can tie exactly on
// every existing signal (degree/program/institution-text/heading/URL) —
// e.g. the real MBA/B.Com "Online Manipal" case, where SMU's and MUJ's
// own pages both say "Online Manipal" and both otherwise match the
// target identically. `institutionIdentityMatch` lets the specific,
// already-resolved institution identity (URL token / page text / logo —
// never the multi-university-default fallback) settle exactly that kind
// of tie, without ever forcing a choice when the evidence itself doesn't
// resolve one.
describe("selectAuthoritativePage — institution identity tie-break (Fix 1)", () => {
  function resolved(institutionId: string, institutionName: string): InstitutionResolutionResult {
    return {
      institutionId,
      institutionName,
      status: "resolved",
      resolutionMethod: "url_identifier",
      signals: {
        url: { institutionId, strength: "strong", evidence: `URL token "${institutionId}"` },
        pageIdentity: { institutionId: null, strength: "none", evidence: "no institution text detected on the page" },
        logo: { institutionId: null, strength: "none", evidence: "no logo detected on the page" },
      },
      fallbackApplied: false,
    };
  }

  const unresolved: InstitutionResolutionResult = {
    institutionId: null,
    institutionName: null,
    status: "unresolved",
    resolutionMethod: "unresolved",
    signals: {
      url: { institutionId: null, strength: "none", evidence: "no institution identifier found in the URL path" },
      pageIdentity: { institutionId: null, strength: "none", evidence: "no institution text detected on the page" },
      logo: { institutionId: null, strength: "none", evidence: "no logo detected on the page" },
    },
    fallbackApplied: false,
  };

  const tieTarget = identity({
    url: "https://agency.example.test/mba-smu",
    title: "MBA | Online Manipal",
    headings: ["MBA"],
    degree: guess("MBA"),
    program: guess("MBA"),
    institution: guess("Online Manipal"),
    pageType: { value: "pg", confidence: "medium", matchedSignals: [] },
  });

  const candidateSmu = identity({
    url: "https://master.example.test/online-mba-degree-smu",
    title: "MBA | Online Manipal",
    headings: ["MBA"],
    degree: guess("MBA"),
    program: guess("MBA"),
    institution: guess("Online Manipal"),
    pageType: { value: "pg", confidence: "medium", matchedSignals: [] },
  });

  const candidateMuj = identity({
    url: "https://master.example.test/online-mba-degree-muj",
    title: "MBA | Online Manipal",
    headings: ["MBA"],
    degree: guess("MBA"),
    program: guess("MBA"),
    institution: guess("Online Manipal"),
    pageType: { value: "pg", confidence: "medium", matchedSignals: [] },
  });

  function toInput(id: DiscoveryPageIdentity): DiscoveryCandidateInput {
    return { url: id.url, discoveryMethod: "nav_link", identity: id };
  }
  const candidates = [toInput(candidateSmu), toInput(candidateMuj)];

  it("without any institution identity signal, two candidates from different institutions tie exactly and stay ambiguous (baseline, proves the tie is real)", () => {
    const result = selectAuthoritativePage(tieTarget, candidates, MASTER_HOMEPAGE, DEFAULT_DISCOVERY_SCORING_CONFIG);
    expect(result.evaluations[0].score).toBe(result.evaluations[1].score);
    expect(result.selectedUrl).toBeNull();
    expect(result.failureReason).toBe("ambiguous_candidates");
  });

  it("a candidate from the target's resolved institution beats an otherwise-identical candidate from a different institution", () => {
    const candidateInstitutionIdentities = new Map<string, InstitutionResolutionResult>([
      [candidateSmu.url, resolved("smu", "Sikkim Manipal University")],
      [candidateMuj.url, resolved("muj", "Manipal University Jaipur")],
    ]);
    const result = selectAuthoritativePage(
      tieTarget,
      candidates,
      MASTER_HOMEPAGE,
      DEFAULT_DISCOVERY_SCORING_CONFIG,
      undefined,
      resolved("smu", "Sikkim Manipal University"),
      candidateInstitutionIdentities,
    );
    expect(result.selectedUrl).toBe(candidateSmu.url);
    expect(result.failureReason).toBeUndefined();
  });

  it("never forces a selection when the target's own institution identity is unresolved — the tie is preserved", () => {
    const candidateInstitutionIdentities = new Map<string, InstitutionResolutionResult>([
      [candidateSmu.url, resolved("smu", "Sikkim Manipal University")],
      [candidateMuj.url, resolved("muj", "Manipal University Jaipur")],
    ]);
    const result = selectAuthoritativePage(tieTarget, candidates, MASTER_HOMEPAGE, DEFAULT_DISCOVERY_SCORING_CONFIG, undefined, unresolved, candidateInstitutionIdentities);
    expect(result.selectedUrl).toBeNull();
    expect(result.failureReason).toBe("ambiguous_candidates");
  });

  it("never forces a selection when both candidates resolve to the SAME institution as the target — a legitimate unresolved tie stays ambiguous", () => {
    const candidateInstitutionIdentities = new Map<string, InstitutionResolutionResult>([
      [candidateSmu.url, resolved("smu", "Sikkim Manipal University")],
      [candidateMuj.url, resolved("smu", "Sikkim Manipal University")],
    ]);
    const result = selectAuthoritativePage(
      tieTarget,
      candidates,
      MASTER_HOMEPAGE,
      DEFAULT_DISCOVERY_SCORING_CONFIG,
      undefined,
      resolved("smu", "Sikkim Manipal University"),
      candidateInstitutionIdentities,
    );
    expect(result.evaluations[0].score).toBe(result.evaluations[1].score);
    expect(result.selectedUrl).toBeNull();
    expect(result.failureReason).toBe("ambiguous_candidates");
  });

  it("never contributes when the candidate's own institution identity is unresolved — no bonus for missing evidence", () => {
    const candidateInstitutionIdentities = new Map<string, InstitutionResolutionResult>([
      [candidateSmu.url, resolved("smu", "Sikkim Manipal University")],
      [candidateMuj.url, unresolved],
    ]);
    const result = selectAuthoritativePage(
      tieTarget,
      candidates,
      MASTER_HOMEPAGE,
      DEFAULT_DISCOVERY_SCORING_CONFIG,
      undefined,
      resolved("smu", "Sikkim Manipal University"),
      candidateInstitutionIdentities,
    );
    expect(result.selectedUrl).toBe(candidateSmu.url);
  });
});

/**
 * Resolution hierarchy fix: specialization detection must be a FALLBACK,
 * consulted only once direct program/subject-evidence resolution has
 * already found nothing usable — never something that overrides a valid
 * program match. See `program-relevance.test.ts` for `resolveSpecializationFor`/
 * `searchCandidatesBySpecialization` unit coverage; this block exercises
 * the same mechanism wired into the full `selectAuthoritativePage`
 * pipeline, generically (no institution/degree/specialization name is
 * hard-coded here — "MBA"/"Healthcare Management" are just this test's own
 * fixture data, exercised the same way "Finance" or "Data Science" would
 * be, matching the requirement that the algorithm not be hard-coded to any
 * one specialization).
 */
describe("selectAuthoritativePage — Specialization Fallback Search (base-program-first resolution)", () => {
  function guessWithMatchedText(value: string, matchedText: string): EntityGuess {
    return { value, confidence: "medium", matchedSignals: [{ signalType: "phrase_match", matchedText, location: "heading" }] };
  }

  function candidateInput(url: string, overrides: Partial<DiscoveryPageIdentity> = {}): DiscoveryCandidateInput {
    return { url, discoveryMethod: "sitemap", identity: identity({ url, ...overrides }) };
  }

  const mbaHealthcareTarget = identity({
    url: "https://agency.example.test/online-mba-healthcare",
    title: "Online MBA in Healthcare Management",
    headings: ["Online MBA in Healthcare Management"],
    degree: guessWithMatchedText("MBA", "MBA"),
    program: guessWithMatchedText("MBA in Healthcare Management", "MBA"),
  });

  it("resolves via specialization search when no candidate matches directly, but exactly one candidate's own specializations list names the term", () => {
    const genericMba = candidateInput("https://master.example.test/mba", {
      title: "MBA",
      headings: ["MBA"],
      degree: guessWithMatchedText("MBA", "MBA"),
      program: guessWithMatchedText("MBA", "MBA"),
      specializations: ["Finance", "Marketing", "Healthcare Management", "Data Science"],
    });
    const unrelatedMsc = candidateInput("https://master.example.test/msc-mathematics", {
      degree: guessWithMatchedText("M.Sc", "M.Sc"),
      program: guessWithMatchedText("M.Sc Mathematics", "M.Sc"),
    });

    const result = selectAuthoritativePage(mbaHealthcareTarget, [genericMba, unrelatedMsc], MASTER_HOMEPAGE);

    expect(result.selectedUrl).toBe(genericMba.url);
    expect(result.confidence).toBe("medium");
    expect(result.failureReason).toBeUndefined();
    const winner = result.evaluations.find((e) => e.url === genericMba.url)!;
    expect(winner.specialization).toEqual({ term: "Healthcare Management", validated: true, matchedCandidateUrl: genericMba.url });
  });

  it("never overrides a candidate that already won on direct program/subject evidence", () => {
    const dedicatedHealthcarePage = candidateInput("https://master.example.test/mba-healthcare", {
      title: "MBA Healthcare Management",
      headings: ["MBA Healthcare Management"],
      degree: guessWithMatchedText("MBA", "MBA"),
      program: guessWithMatchedText("MBA Healthcare Management", "MBA"),
    });
    // A generic page that (incorrectly, or for an unrelated reason) also
    // lists the same word -- must never win over the direct match above.
    const genericMba = candidateInput("https://master.example.test/mba", {
      title: "MBA",
      degree: guessWithMatchedText("MBA", "MBA"),
      program: guessWithMatchedText("MBA", "MBA"),
      specializations: ["Healthcare Management"],
    });

    const result = selectAuthoritativePage(mbaHealthcareTarget, [dedicatedHealthcarePage, genericMba], MASTER_HOMEPAGE);
    expect(result.selectedUrl).toBe(dedicatedHealthcarePage.url);
  });

  it("stays ambiguous_candidates — never forces a pick — when two different programs' specializations lists both name the term", () => {
    const genericMba = candidateInput("https://master.example.test/mba", {
      degree: guessWithMatchedText("MBA", "MBA"),
      program: guessWithMatchedText("MBA", "MBA"),
      specializations: ["Healthcare Management"],
    });
    const genericPgdm = candidateInput("https://master.example.test/pgdm", {
      degree: guessWithMatchedText("MBA", "MBA"),
      program: guessWithMatchedText("MBA", "MBA"),
      specializations: ["Healthcare Management"],
    });

    const result = selectAuthoritativePage(mbaHealthcareTarget, [genericMba, genericPgdm], MASTER_HOMEPAGE);
    expect(result.selectedUrl).toBeNull();
    expect(result.failureReason).toBe("ambiguous_candidates");
  });

  it("stays authoritative_page_not_found when no candidate's specializations list names the term either", () => {
    const genericMba = candidateInput("https://master.example.test/mba", {
      degree: guessWithMatchedText("MBA", "MBA"),
      program: guessWithMatchedText("MBA", "MBA"),
      specializations: ["Finance", "Marketing"],
    });

    const result = selectAuthoritativePage(mbaHealthcareTarget, [genericMba], MASTER_HOMEPAGE);
    expect(result.selectedUrl).toBeNull();
    expect(result.failureReason).toBe("authoritative_page_not_found");
  });

  it("reverse case: resolves the parent program from specialization wording alone when the target's own program text carries no base-program signal beyond the degree", () => {
    // Mirrors "the URL is not an exact base-program URL" -- program value
    // is just the specialization phrase itself, degree is present but the
    // target otherwise looks nothing like any candidate's own title/
    // heading text.
    const specializationOnlyTarget = identity({
      url: "https://agency.example.test/healthcare-management",
      title: "Healthcare Management",
      headings: ["Healthcare Management"],
      degree: guessWithMatchedText("MBA", "MBA"),
      program: guessWithMatchedText("Healthcare Management", "MBA"),
    });
    const genericMba = candidateInput("https://master.example.test/mba", {
      degree: guessWithMatchedText("MBA", "MBA"),
      program: guessWithMatchedText("MBA", "MBA"),
      specializations: ["Finance", "Healthcare Management"],
    });

    const result = selectAuthoritativePage(specializationOnlyTarget, [genericMba], MASTER_HOMEPAGE);
    expect(result.selectedUrl).toBe(genericMba.url);
  });
});
