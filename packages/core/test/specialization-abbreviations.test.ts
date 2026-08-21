import { describe, expect, it } from "vitest";
import { DEFAULT_SPECIALIZATION_ABBREVIATIONS, expandSpecializationAbbreviations } from "../src/dynamic-discovery/specialization-abbreviations.js";

describe("expandSpecializationAbbreviations", () => {
  it("appends the expansion for a word that exactly matches a known abbreviation", () => {
    expect(expandSpecializationAbbreviations("online msc ds")).toBe("online msc ds Data Science");
  });

  it("is case-insensitive", () => {
    expect(expandSpecializationAbbreviations("online msc DS")).toBe("online msc DS Data Science");
  });

  it("never replaces or removes the original text -- purely additive", () => {
    const result = expandSpecializationAbbreviations("online pgcp lsc mahe");
    expect(result).toContain("pgcp");
    expect(result).toContain("lsc");
    expect(result).toContain("Logistics and Supply Chain Management");
  });

  it("a word not in the dictionary passes through with no expansion appended", () => {
    expect(expandSpecializationAbbreviations("online mba finance")).toBe("online mba finance");
  });

  it("does not expand a substring match -- only a whole word exactly equal to an abbreviation", () => {
    // "mds" contains "ds" as a substring but is not the abbreviation "ds" itself.
    expect(expandSpecializationAbbreviations("online mds program")).toBe("online mds program");
  });

  it("expands every known abbreviation independently when several appear together", () => {
    const result = expandSpecializationAbbreviations("pgcp ds and hrm");
    expect(result).toContain("Data Science");
    expect(result).toContain("Human Resource Management");
  });

  it("the default dictionary covers the user-reported real abbreviations", () => {
    const abbreviations = DEFAULT_SPECIALIZATION_ABBREVIATIONS.map((a) => a.abbreviation);
    expect(abbreviations).toContain("ds");
    expect(abbreviations).toContain("lsc");
    expect(abbreviations).toContain("lscm");
  });
});
