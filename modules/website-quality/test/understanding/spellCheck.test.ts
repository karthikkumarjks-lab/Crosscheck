import { describe, expect, it } from "vitest";
import { checkSpelling, properNounWordsFrom } from "../../src/understanding/spellCheck.js";

describe("properNounWordsFrom", () => {
  it("lowercases every word from every non-empty value passed in", () => {
    const words = properNounWordsFrom("Manipal University", "MBA", null, undefined);
    expect(words.has("manipal")).toBe(true);
    expect(words.has("university")).toBe(true);
    expect(words.has("mba")).toBe(true);
  });
});

describe("checkSpelling", () => {
  it("reports 0 with no items for text containing no misspellings", async () => {
    const result = await checkSpelling([{ fieldKey: "eligibility", text: "Candidates must hold a recognized bachelor's degree." }], new Set());
    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("flags a genuine misspelling once, with its field and an excerpt", async () => {
    const result = await checkSpelling([{ fieldKey: "curriculum", text: "Students recieve a certificate on completion." }], new Set());
    expect(result.count).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].word.toLowerCase()).toBe("recieve");
    expect(result.items[0].locations[0].fieldKey).toBe("curriculum");
    expect(result.items[0].locations[0].excerpt).toContain("recieve");
  });

  it("does not flag a word in the caller-supplied known-proper-nouns set", async () => {
    const result = await checkSpelling([{ fieldKey: "institution", text: "Manipal Academy of Higher Education" }], properNounWordsFrom("Manipal Academy of Higher Education"));
    expect(result.count).toBe(0);
  });

  it("does not flag all-uppercase acronyms (institution codes, EMI, etc.)", async () => {
    const result = await checkSpelling([{ fieldKey: "accreditation", text: "Approved by UGC and AICTE, EMI options available." }], new Set());
    expect(result.count).toBe(0);
  });

  it("counts the same misspelling once per occurrence but groups locations under one item", async () => {
    const result = await checkSpelling(
      [
        { fieldKey: "fee", text: "No-cost EMI, recieve your schedule early." },
        { fieldKey: "eligibility", text: "You will recieve confirmation by email." },
      ],
      new Set(),
    );
    expect(result.count).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].locations).toHaveLength(2);
  });
});
