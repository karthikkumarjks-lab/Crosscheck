import { describe, expect, it } from "vitest";
import type { SemanticFact, SemanticFieldCategory } from "../../src/types.js";
import { compareSemanticFactSet } from "../../src/comparison/compareSemanticFactSet.js";

function fact(field: SemanticFieldCategory, value: string, side: "target" | "master" = "target"): SemanticFact {
  return { field, value, sourceUrl: `https://${side}.test/page`, sourceType: "heading_and_text", heading: "Specializations Offered", confidence: "HIGH" };
}

describe("compareSemanticFactSet — §17 fixture C: different headings, same values -> MATCH", () => {
  it("MBA specializations, identical set, from differently-worded sections -> match, with the §3 note wording", () => {
    const master = [fact("SPECIALIZATION", "Data Science & Analytics", "master"), fact("SPECIALIZATION", "Cloud Computing", "master"), fact("SPECIALIZATION", "Cyber Security", "master")];
    const target = [fact("SPECIALIZATION", "Data Science and Analytics"), fact("SPECIALIZATION", "Cloud Computing"), fact("SPECIALIZATION", "Cyber Security")];
    const result = compareSemanticFactSet(target, master, {
      itemLabelSingular: "specialization",
      matchNote: "Both pages list the same MBA specialization options. The section headings differ but represent the same specialization concept.",
    });
    expect(result.status).toBe("match");
    expect(result.notes).toBe("Both pages list the same MBA specialization options. The section headings differ but represent the same specialization concept.");
  });
});

describe("compareSemanticFactSet — §17 fixture D: different headings, different values -> UNMATCH", () => {
  it("target missing a master specialization -> changed, with the §6 note wording", () => {
    const master = [fact("SPECIALIZATION", "Healthcare Management", "master"), fact("SPECIALIZATION", "Finance", "master"), fact("SPECIALIZATION", "Marketing", "master")];
    const target = [fact("SPECIALIZATION", "Healthcare Management"), fact("SPECIALIZATION", "Finance")];
    const result = compareSemanticFactSet(target, master, { itemLabelSingular: "specialization" });
    expect(result.status).toBe("changed");
    expect(result.notes).toContain("Target is missing Marketing specialization listed on the authoritative page.");
  });
});

describe("compareSemanticFactSet — §6 example 3: near-equivalent wording ('Healthcare Management' vs 'Healthcare')", () => {
  it("a partial-token match is never silently a confident MATCH -> needs_review", () => {
    const master = [fact("SPECIALIZATION", "Healthcare Management", "master")];
    const target = [fact("SPECIALIZATION", "Healthcare")];
    const result = compareSemanticFactSet(target, master, { itemLabelSingular: "specialization" });
    expect(result.status).toBe("needs_review");
    expect(result.notes).toContain("Healthcare Management");
    expect(result.notes).toContain("worded differently");
  });
});

describe("compareSemanticFactSet — §7 (MBA + Healthcare Management prefix stripping, §6 example 1)", () => {
  it("'MBA Healthcare Management' (master) vs 'Healthcare Management' (target) -> match once the program name is known", () => {
    const master = [fact("SPECIALIZATION", "MBA Healthcare Management", "master"), fact("SPECIALIZATION", "MBA Finance", "master")];
    const target = [fact("SPECIALIZATION", "Healthcare Management"), fact("SPECIALIZATION", "Finance")];
    const result = compareSemanticFactSet(target, master, { itemLabelSingular: "specialization", programHint: "MBA" });
    expect(result.status).toBe("match");
  });
});

describe("compareSemanticFactSet — §17 fixture K: accreditation semantic comparison", () => {
  it("NAAC A+ + UGC entitled on both sides -> match", () => {
    const master = [fact("ACCREDITATION", "NAAC A+", "master"), fact("ACCREDITATION", "UGC entitled", "master")];
    const target = [fact("ACCREDITATION", "NAAC A+"), fact("ACCREDITATION", "UGC entitled")];
    const result = compareSemanticFactSet(target, master, { itemLabelSingular: "accreditation" });
    expect(result.status).toBe("match");
  });

  it("§11: target only states NAAC A+, master states both -> UNMATCH, notes explain what's missing", () => {
    const master = [fact("ACCREDITATION", "NAAC A+", "master"), fact("ACCREDITATION", "UGC entitled", "master")];
    const target = [fact("ACCREDITATION", "NAAC A+")];
    const result = compareSemanticFactSet(target, master, { itemLabelSingular: "accreditation" });
    expect(result.status).toBe("changed");
    expect(result.notes).toContain("UGC entitled");
  });
});

describe("compareSemanticFactSet — missing states", () => {
  it("both empty -> both_missing", () => {
    const result = compareSemanticFactSet([], [], { itemLabelSingular: "specialization" });
    expect(result.status).toBe("both_missing");
  });

  it("target empty, master has values -> target_missing", () => {
    const result = compareSemanticFactSet([], [fact("SPECIALIZATION", "Finance", "master")], { itemLabelSingular: "specialization" });
    expect(result.status).toBe("target_missing");
  });

  it("every missing state has a non-null, explanatory note -- never left blank for the caller's default-match fallback to mislabel", () => {
    expect(compareSemanticFactSet([], [], { itemLabelSingular: "specialization" }).notes).toBe("specialization not found on either page.");
    expect(compareSemanticFactSet([], [fact("SPECIALIZATION", "Finance", "master")], { itemLabelSingular: "specialization" }).notes).toBe("specialization not found on target page.");
    expect(compareSemanticFactSet([fact("SPECIALIZATION", "Finance")], [], { itemLabelSingular: "specialization" }).notes).toBe("specialization not found on master (authoritative) page.");
  });
});
