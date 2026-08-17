import { describe, expect, it } from "vitest";
import { normalizeSemanticValue, stripProgramPrefix } from "../src/normalization/normalizeSemanticValue.js";

describe("normalizeSemanticValue — §5", () => {
  it("'&' and 'and' are equivalent", () => {
    expect(normalizeSemanticValue("Data Science & Analytics")).toBe(normalizeSemanticValue("Data Science and Analytics"));
  });

  it("a trailing boilerplate 'Specialization' suffix is stripped", () => {
    expect(normalizeSemanticValue("Cloud Computing Specialization")).toBe(normalizeSemanticValue("Cloud Computing"));
  });

  it("decorative leading bullets are stripped", () => {
    expect(normalizeSemanticValue("• Cyber Security")).toBe(normalizeSemanticValue("Cyber Security"));
  });

  it("case and whitespace differences are equivalent", () => {
    expect(normalizeSemanticValue("  CLOUD   Computing  ")).toBe(normalizeSemanticValue("Cloud Computing"));
  });

  it("does not strip a meaningful word merely because it resembles a boilerplate suffix mid-value", () => {
    expect(normalizeSemanticValue("Specialization in Data Science")).toContain("data science");
    expect(normalizeSemanticValue("Specialization in Data Science")).toContain("specialization");
  });

  it("does not strip a value down to nothing", () => {
    expect(normalizeSemanticValue("Specialization")).not.toBe("");
  });
});

describe("stripProgramPrefix — §6 example 1 (MBA Healthcare Management -> Healthcare Management)", () => {
  it("strips the resolved program name as a leading prefix", () => {
    expect(stripProgramPrefix("MBA Healthcare Management", "MBA")).toBe("Healthcare Management");
  });

  it("is case-insensitive", () => {
    expect(stripProgramPrefix("mba Finance", "MBA")).toBe("Finance");
  });

  it("does nothing when there is no program hint", () => {
    expect(stripProgramPrefix("MBA Healthcare Management", null)).toBe("MBA Healthcare Management");
  });

  it("does nothing when the value doesn't start with the program name", () => {
    expect(stripProgramPrefix("Healthcare Management", "MBA")).toBe("Healthcare Management");
  });
});
