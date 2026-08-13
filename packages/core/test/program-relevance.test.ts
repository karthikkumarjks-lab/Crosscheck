import { describe, expect, it } from "vitest";
import type { DiscoveryPageIdentity, EntityGuess, ProgramRelevanceGateConfig } from "../src/types.js";
import {
  DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
  passesProgramRelevanceGate,
  resolveSpecializationFor,
  searchCandidatesBySpecialization,
  subjectKeywords,
} from "../src/dynamic-discovery/index.js";

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
    specializations: overrides.specializations ?? null,
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

/** Resolution hierarchy fix: specialization detection is a FALLBACK,
 * consulted only once direct program/subject-evidence resolution has
 * already failed — never something that overrides a valid program match.
 * These tests exercise `resolveSpecializationFor` (validates a
 * specialization against an ALREADY-selected candidate) and
 * `searchCandidatesBySpecialization` (the fallback search itself) in
 * isolation, generically — no institution, degree, or specialization name
 * is hard-coded into the functions under test, only into these fixtures. */
describe("resolveSpecializationFor — validating a specialization against an already-selected candidate", () => {
  const mbaHealthcareTarget = identity({
    url: "https://agency.example.test/online-mba-healthcare",
    program: guessWithMatchedText("MBA in Healthcare Management", "MBA"),
    degree: guessWithMatchedText("MBA", "MBA"),
  });

  it("validated: true when the candidate's own extracted specializations list contains the term", () => {
    const genericMbaPage = candidate("https://master.example.test/mba", "MBA", "MBA", "MBA");
    genericMbaPage.specializations = ["Finance", "Marketing", "Healthcare Management", "Data Science"];

    const result = resolveSpecializationFor(mbaHealthcareTarget, genericMbaPage, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG);
    expect(result).toEqual({ term: "Healthcare Management", validated: true, matchedCandidateUrl: genericMbaPage.url });
  });

  it("Fix 3: returns null, never a fabricated result, when the term isn't in the candidate's own specializations list — generic title/heading overlap is not evidence", () => {
    const dedicatedPage = candidate("https://master.example.test/mba-healthcare", "MBA Healthcare Management", "MBA", "MBA");
    // dedicatedPage has no structured `specializations` list at all -- its
    // title merely happens to share subject vocabulary with the target.
    // Before Fix 3 this produced a `validated: false` guess; now it must
    // return null rather than report anything.
    const result = resolveSpecializationFor(mbaHealthcareTarget, dedicatedPage, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG);
    expect(result).toBeNull();
  });

  it("Fix 3: a validated URL specialization signal still requires candidate-side corroboration -- a bare URL match with no matching specializations list entry returns null", () => {
    const urlOnlyTarget = identity({
      url: "https://agency.example.test/online-mba-healthcare-mahe",
      program: guessWithMatchedText("Master of Business Administration from MAHE", "MBA"),
      degree: guessWithMatchedText("MBA", "MBA"),
    });
    const dedicatedPage = candidate("https://master.example.test/mba-healthcare", "MBA Healthcare Management", "MBA", "MBA");
    expect(resolveSpecializationFor(urlOnlyTarget, dedicatedPage, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG)).toBeNull();
  });

  it("Fix 3: a validated URL specialization signal DOES resolve once the candidate's own specializations list corroborates it -- even when the target's heading/program wording alone carries no such evidence", () => {
    const urlOnlyTarget = identity({
      url: "https://agency.example.test/online-mba-healthcare-mahe",
      program: guessWithMatchedText("Master of Business Administration from MAHE", "MBA"),
      degree: guessWithMatchedText("MBA", "MBA"),
    });
    const genericMbaPage = candidate("https://master.example.test/mba", "MBA", "MBA", "MBA");
    genericMbaPage.specializations = ["Finance", "Marketing", "Healthcare Management", "Data Science"];

    const result = resolveSpecializationFor(urlOnlyTarget, genericMbaPage, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG);
    expect(result).toEqual({ term: "Healthcare Management", validated: true, matchedCandidateUrl: genericMbaPage.url });
  });

  it("returns null when the target has no specialization wording at all (nothing to validate)", () => {
    const bareTarget = identity({
      url: "https://agency.example.test/mba",
      program: guessWithMatchedText("Master of Business Administration", "Master of Business Administration"),
      degree: guessWithMatchedText("MBA", "Master of Business Administration"),
    });
    const genericMbaPage = candidate("https://master.example.test/mba", "MBA", "MBA", "MBA");
    expect(resolveSpecializationFor(bareTarget, genericMbaPage, DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG)).toBeNull();
  });
});

describe("searchCandidatesBySpecialization — the fallback search over an institution's known programs", () => {
  const mbaFinanceTarget = identity({
    url: "https://agency.example.test/online-mba-finance",
    program: guessWithMatchedText("MBA in Finance", "MBA"),
    degree: guessWithMatchedText("MBA", "MBA"),
  });

  it("finds the single program whose own specializations list contains the term, generically (works for any specialization name)", () => {
    const genericMba = candidate("https://master.example.test/mba", "MBA", "MBA", "MBA");
    genericMba.specializations = ["Finance", "Marketing", "Business Analytics"];
    const unrelatedMsc = candidate("https://master.example.test/msc-mathematics", "MSc Mathematics");

    const matches = searchCandidatesBySpecialization(mbaFinanceTarget, [genericMba, unrelatedMsc], DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG);
    expect(matches.map((m) => m.candidateUrl)).toEqual([genericMba.url]);
    expect(matches[0].matchedEntry).toBe("Finance");
  });

  it("returns no matches, never forcing a guess, when no candidate's specializations list contains the term", () => {
    const genericMba = candidate("https://master.example.test/mba", "MBA", "MBA", "MBA");
    genericMba.specializations = ["Marketing", "Operations"];
    const matches = searchCandidatesBySpecialization(mbaFinanceTarget, [genericMba], DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG);
    expect(matches).toEqual([]);
  });

  it("returns every match when two different programs both list the term — caller must treat this as ambiguous, never pick one", () => {
    const genericMba = candidate("https://master.example.test/mba", "MBA", "MBA", "MBA");
    genericMba.specializations = ["Finance"];
    const genericPgdm = candidate("https://master.example.test/pgdm", "PGDM", "PGDM", "PGDM");
    genericPgdm.specializations = ["Finance"];

    const matches = searchCandidatesBySpecialization(mbaFinanceTarget, [genericMba, genericPgdm], DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG);
    expect(matches.map((m) => m.candidateUrl).sort()).toEqual([genericMba.url, genericPgdm.url].sort());
  });

  it("is a no-op (returns no matches) when the target has no specialization wording", () => {
    const bareTarget = identity({
      url: "https://agency.example.test/mba",
      program: guessWithMatchedText("Master of Business Administration", "Master of Business Administration"),
      degree: guessWithMatchedText("MBA", "Master of Business Administration"),
    });
    const genericMba = candidate("https://master.example.test/mba", "MBA", "MBA", "MBA");
    genericMba.specializations = ["Finance", "Marketing"];
    expect(searchCandidatesBySpecialization(bareTarget, [genericMba], DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG)).toEqual([]);
  });
});
