import { describe, expect, it } from "vitest";
import type { DiscoveryPageIdentity, EntityGuess, ProgramRelevanceGateConfig } from "../src/types.js";
import { DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG, passesProgramRelevanceGate, subjectKeywords } from "../src/dynamic-discovery/index.js";

function guessWithMatchedText(value: string, matchedText: string): EntityGuess {
  return { value, confidence: "medium", matchedSignals: [{ signalType: "phrase_match", matchedText, location: "heading" }] };
}

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
  };
}

/** Target: "MSc Mathematics", degree matched via the literal alias
 * "MSc" -- mirrors the real onlinemanipal.com/ln-msc-maths worked
 * example (Sprint 5 Revision 1 §2), and every hand-computed example in
 * this file was independently verified against the real degree
 * dictionary/understanding pipeline before implementation (see the
 * revision plan's pre-coding verification step). */
const mscMathematicsTarget = identity({
  url: "https://agency.example.test/ln-msc-maths",
  title: "MSc Mathematics",
  headings: ["MSc Mathematics"],
  degree: guessWithMatchedText("M.Sc", "MSc"),
  program: guessWithMatchedText("MSc Mathematics", "MSc"),
});

function candidate(url: string, programValue: string, degreeMatchedText = "MSc", degreeValue = "M.Sc"): DiscoveryPageIdentity {
  return identity({
    url,
    title: programValue,
    headings: [programValue],
    degree: guessWithMatchedText(degreeValue, degreeMatchedText),
    program: guessWithMatchedText(programValue, degreeMatchedText),
  });
}

describe("subjectKeywords", () => {
  it("removes the identity's own matched degree-alias tokens from its program text", () => {
    expect(subjectKeywords(mscMathematicsTarget, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG)).toEqual(["mathematics"]);
  });

  it("returns an empty set for a bare, unspecialized program (program text === matched degree alias)", () => {
    const bareTarget = identity({
      url: "https://agency.example.test/mba",
      program: guessWithMatchedText("Master of Business Administration", "Master of Business Administration"),
      degree: guessWithMatchedText("MBA", "Master of Business Administration"),
    });
    expect(subjectKeywords(bareTarget, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG)).toEqual([]);
  });

  it("strips generic marketing/structural stopwords in addition to degree tokens", () => {
    const noisyTarget = identity({
      url: "https://agency.example.test/x",
      program: guessWithMatchedText("Online MSc Mathematics Program", "MSc"),
      degree: guessWithMatchedText("M.Sc", "MSc"),
    });
    expect(subjectKeywords(noisyTarget, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG)).toEqual(["mathematics"]);
  });
});

describe("passesProgramRelevanceGate — A-F test matrix (Sprint 5 Revision 1 §10)", () => {
  it("A — exact program match passes", () => {
    const result = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/msc-mathematics", "MSc Mathematics"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(result.passed).toBe(true);
    expect(result.overlap).toEqual(["mathematics"]);
  });

  it("B — program wording variation passes (punctuation/abbreviation differences)", () => {
    const inFormResult = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/msc-in-mathematics", "MSc in Mathematics"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(inFormResult.passed).toBe(true);

    const spelledOutResult = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/master-of-science-mathematics", "Master of Science in Mathematics", "Master of Science", "M.Sc"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(spelledOutResult.passed).toBe(true);

    // Known, explicitly documented limitation (revision plan §8/§11):
    // literal-token overlap, not semantic synonymy -- "Maths" shares no
    // token with "Mathematics" and is correctly, intentionally rejected.
    const abbreviatedSynonymResult = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/msc-maths", "MSc Maths"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(abbreviatedSynonymResult.passed).toBe(false);
  });

  it("C — legitimate specialization/elective passes", () => {
    const econometrics = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/msc-mathematics-econometrics", "MSc Mathematics – Econometrics"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(econometrics.passed).toBe(true);

    const computational = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/msc-mathematics-computational", "MSc Mathematics – Computational Science"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(computational.passed).toBe(true);
  });

  it("D — clearly different program is rejected", () => {
    const dataScience = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/msc-data-science", "MSc Data Science"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(dataScience.passed).toBe(false);
    expect(dataScience.overlap).toEqual([]);

    const mba = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/mba", "MBA", "MBA", "MBA"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(mba.passed).toBe(false);
  });

  it("E — two legitimate variants both pass (ambiguity itself is selectAuthoritativePage's concern, not the gate's — see score.test.ts)", () => {
    const a = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/variant-a", "MSc Mathematics – Statistics Elective"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    const b = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/variant-b", "MSc Mathematics – Applied Elective"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(a.passed).toBe(true);
    expect(b.passed).toBe(true);
  });

  it("F — an unrelated domain's pages all fail the gate", () => {
    const unrelated = passesProgramRelevanceGate(
      mscMathematicsTarget,
      candidate("https://master.example.test/mba-finance", "MBA in Finance", "MBA", "MBA"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(unrelated.passed).toBe(false);
  });
});

describe("passesProgramRelevanceGate — required edge cases", () => {
  it("empty target subject-keyword set is a no-op: passes every candidate, including an unrelated one", () => {
    const bareTarget = identity({
      url: "https://agency.example.test/mba",
      program: guessWithMatchedText("Master of Business Administration", "Master of Business Administration"),
      degree: guessWithMatchedText("MBA", "Master of Business Administration"),
    });
    const unrelated = candidate("https://master.example.test/msc-data-science", "MSc Data Science");
    const result = passesProgramRelevanceGate(bareTarget, unrelated, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG);
    expect(result.passed).toBe(true);
    expect(result.overlap).toEqual([]);
  });

  it("enabled: false makes the gate a true opt-out — even a clearly wrong-subject candidate passes", () => {
    const disabledConfig: ProgramRelevanceGateConfig = { ...DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG, enabled: false };
    const dataScience = candidate("https://master.example.test/msc-data-science", "MSc Data Science");
    const result = passesProgramRelevanceGate(mscMathematicsTarget, dataScience, disabledConfig);
    expect(result.passed).toBe(true);
  });

  it("minOverlapCount boundary: exactly the configured count passes, one fewer fails", () => {
    const twoWordTarget = identity({
      url: "https://agency.example.test/x",
      program: guessWithMatchedText("MSc Business Analytics", "MSc"),
      degree: guessWithMatchedText("M.Sc", "MSc"),
    });
    const strictConfig: ProgramRelevanceGateConfig = { ...DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG, minOverlapCount: 2 };

    const bothWords = candidate("https://master.example.test/a", "MSc Business Analytics");
    expect(passesProgramRelevanceGate(twoWordTarget, bothWords, strictConfig).passed).toBe(true);

    const oneWordOnly = candidate("https://master.example.test/b", "MSc Business Strategy");
    expect(passesProgramRelevanceGate(twoWordTarget, oneWordOnly, strictConfig).passed).toBe(false);
  });

  it("does not pass on a shared generic academic-category word alone (code review finding: 'science'/'arts'/'engineering' etc. are stopworded)", () => {
    const dataScienceTarget = identity({
      url: "https://agency.example.test/x",
      program: guessWithMatchedText("MSc Data Science", "MSc"),
      degree: guessWithMatchedText("M.Sc", "MSc"),
    });
    // Shares only the generic category word "science" -- must NOT pass,
    // since "Data Science" and "Environmental Science" are different
    // subjects that happen to share a degree-family word, not variants
    // of the same program.
    const environmentalScience = candidate("https://master.example.test/msc-environmental-science", "MSc Environmental Science");
    const result = passesProgramRelevanceGate(dataScienceTarget, environmentalScience, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG);
    expect(result.passed).toBe(false);
    expect(result.overlap).toEqual([]);

    // A genuine Data Science variant, sharing the real subject word
    // "data", still correctly passes.
    const dataAnalyticsElective = candidate("https://master.example.test/msc-data-science-analytics", "MSc Data Science – Analytics Elective");
    expect(passesProgramRelevanceGate(dataScienceTarget, dataAnalyticsElective, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG).passed).toBe(true);
  });

  it("backward compatibility: a candidate that shares no matchedSignals data still gets a defined, non-throwing result", () => {
    const noSignalTarget = identity({
      url: "https://agency.example.test/x",
      program: { value: "MSc Mathematics", confidence: "medium", matchedSignals: [] },
      degree: { value: "M.Sc", confidence: "medium", matchedSignals: [] },
    });
    const result = passesProgramRelevanceGate(
      noSignalTarget,
      candidate("https://master.example.test/msc-mathematics", "MSc Mathematics"),
      DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
    );
    expect(result.passed).toBe(true);
  });
});
