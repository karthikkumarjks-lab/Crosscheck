import { describe, expect, it } from "vitest";
import type { SemanticFact } from "@crosscheck/core";
import { resolveImageFeeFacts, type ImageOcrResolver } from "../../src/understanding/imageFeeOcr.js";

function imageFeeFact(overrides: Partial<SemanticFact> = {}): SemanticFact {
  return { field: "FEES", value: "", sourceUrl: "https://example.test/page", sourceType: "image_ocr", heading: "Fee Structure", confidence: "LOW", imageUrl: "https://example.test/fee.png", ...overrides };
}

describe("resolveImageFeeFacts — §17 fixture G: high-confidence OCR resolves the fact", () => {
  it("fills in the OCR'd value and confidence", async () => {
    const resolve: ImageOcrResolver = async () => ({ text: "Semester Fee: ₹25,000", confidence: "HIGH" });
    const [resolved] = await resolveImageFeeFacts([imageFeeFact()], resolve);
    expect(resolved.value).toBe("Semester Fee: ₹25,000");
    expect(resolved.confidence).toBe("HIGH");
    expect(resolved.sourceType).toBe("image_ocr");
  });
});

describe("resolveImageFeeFacts — §17 fixture H: low OCR confidence stays a real, but uncertain, fact", () => {
  it("fills in the value but keeps LOW confidence -- never upgraded to look certain", async () => {
    const resolve: ImageOcrResolver = async () => ({ text: "₹25,000", confidence: "LOW" });
    const [resolved] = await resolveImageFeeFacts([imageFeeFact()], resolve);
    expect(resolved.value).toBe("₹25,000");
    expect(resolved.confidence).toBe("LOW");
  });
});

describe("resolveImageFeeFacts — image fetch/OCR failure", () => {
  it("a resolver returning null leaves the fact unresolved (empty value, LOW confidence) rather than throwing or fabricating text", async () => {
    const resolve: ImageOcrResolver = async () => null;
    const [resolved] = await resolveImageFeeFacts([imageFeeFact()], resolve);
    expect(resolved.value).toBe("");
    expect(resolved.confidence).toBe("LOW");
  });
});

describe("resolveImageFeeFacts — passthrough", () => {
  it("never calls the resolver for a non-FEES fact", async () => {
    let called = false;
    const resolve: ImageOcrResolver = async () => {
      called = true;
      return { text: "x", confidence: "HIGH" };
    };
    const specializationFact: SemanticFact = { field: "SPECIALIZATION", value: "Finance", sourceUrl: "https://example.test", sourceType: "heading_and_text", heading: "Specializations", confidence: "HIGH" };
    await resolveImageFeeFacts([specializationFact], resolve);
    expect(called).toBe(false);
  });

  it("never calls the resolver for an already-resolved FEES fact (non-empty value)", async () => {
    let called = false;
    const resolve: ImageOcrResolver = async () => {
      called = true;
      return { text: "x", confidence: "HIGH" };
    };
    await resolveImageFeeFacts([imageFeeFact({ value: "already resolved" })], resolve);
    expect(called).toBe(false);
  });

  it("never calls the resolver for a text/table FEES fact (no image)", async () => {
    let called = false;
    const resolve: ImageOcrResolver = async () => {
      called = true;
      return { text: "x", confidence: "HIGH" };
    };
    await resolveImageFeeFacts([imageFeeFact({ sourceType: "text", value: "Semester Fee: ₹25,000" })], resolve);
    expect(called).toBe(false);
  });
});
