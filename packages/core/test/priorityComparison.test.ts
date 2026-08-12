import { describe, expect, it } from "vitest";
import type { ExtractedClaim } from "../src/types.js";
import { buildPriorityComparison, buildSemesterFeeField } from "../src/comparison/priorityComparison.js";

function claim(fieldKey: string, rawValue: string, side: "target" | "master" = "target"): ExtractedClaim {
  return {
    fieldKey,
    rawValue,
    sourceLocation: { url: `https://${side}.test/page`, excerpt: rawValue },
    extractionMethod: "heading_scoped",
    extractedAt: "2026-08-12T00:00:00.000Z",
  };
}

function findField(comparison: ReturnType<typeof buildPriorityComparison>, fieldKey: string) {
  return [...comparison.priorityFields, ...comparison.secondaryFields, ...comparison.others].find((f) => f.fieldKey === fieldKey);
}

const noSpecializations: ExtractedClaim[] = [];

describe("buildPriorityComparison — Semester Fee", () => {
  it("same semester fee -> match", () => {
    const field = buildSemesterFeeField(
      [claim("feeCandidate", "₹50,000 per semester", "target")],
      [claim("feeCandidate", "₹50,000 per semester", "master")],
    );
    expect(field.status).toBe("match");
    expect(field.fieldKey).toBe("semesterFee");
  });

  it("changed semester fee -> changed", () => {
    const field = buildSemesterFeeField(
      [claim("feeCandidate", "₹55,000 per semester", "target")],
      [claim("feeCandidate", "₹50,000 per semester", "master")],
    );
    expect(field.status).toBe("changed");
  });

  it("total fee vs semester fee -> not falsely matched", () => {
    // Master only states a total program fee; target states a real
    // semester fee that happens to be exactly half the total. Must never
    // be reported as a confirmed match/changed from inferred arithmetic.
    const field = buildSemesterFeeField(
      [claim("feeCandidate", "₹50,000 per semester", "target")],
      [claim("feeCandidate", "Total Program Fee: ₹1,00,000", "master")],
    );
    expect(field.status).not.toBe("match");
    expect(field.status).toBe("master_missing");
    expect(field.targetValue).toContain("50,000");
  });

  it("application fee vs tuition fee -> not falsely matched", () => {
    const field = buildSemesterFeeField(
      [claim("feeCandidate", "₹50,000 per semester", "target")],
      [claim("feeCandidate", "Application Fee: ₹2,000", "master")],
    );
    expect(field.status).not.toBe("match");
    expect(field.status).toBe("master_missing");
  });

  it("ambiguous fee period -> needs_review (never a guessed match/changed)", () => {
    const field = buildSemesterFeeField([claim("feeCandidate", "₹50,000", "target")], [claim("feeCandidate", "₹50,000", "master")]);
    expect(field.status).toBe("needs_review");
  });

  it("both sides missing any fee candidate -> both_missing", () => {
    const field = buildSemesterFeeField([], []);
    expect(field.status).toBe("both_missing");
  });
});

describe("buildPriorityComparison — Course Duration", () => {
  it("2 years vs 24 months -> match", () => {
    const comparison = buildPriorityComparison([claim("duration", "2 Years")], [claim("duration", "24 Months", "master")], [], []);
    expect(findField(comparison, "duration")?.status).toBe("match");
  });

  it("different duration -> changed", () => {
    const comparison = buildPriorityComparison([claim("duration", "18 Months")], [claim("duration", "24 Months", "master")], [], []);
    expect(findField(comparison, "duration")?.status).toBe("changed");
  });
});

describe("buildPriorityComparison — Specializations", () => {
  const master = [claim("specializations", "Finance", "master"), claim("specializations", "Marketing", "master"), claim("specializations", "HR", "master")];

  it("same set -> match", () => {
    const target = [claim("specializations", "Finance"), claim("specializations", "Marketing"), claim("specializations", "HR")];
    const comparison = buildPriorityComparison([], [], target, master);
    const field = findField(comparison, "specializations");
    expect(field?.status).toBe("match");
  });

  it("added item -> changed", () => {
    const target = [claim("specializations", "Finance"), claim("specializations", "Marketing"), claim("specializations", "HR"), claim("specializations", "Operations")];
    const comparison = buildPriorityComparison([], [], target, master);
    const field = findField(comparison, "specializations");
    expect(field?.status).toBe("changed");
    expect(field?.notes).toContain("Operations");
  });

  it("removed item -> changed", () => {
    const target = [claim("specializations", "Finance"), claim("specializations", "Marketing")];
    const comparison = buildPriorityComparison([], [], target, master);
    const field = findField(comparison, "specializations");
    expect(field?.status).toBe("changed");
    expect(field?.notes).toContain("HR");
  });

  it("reordered items -> match (order-independent)", () => {
    const target = [claim("specializations", "HR"), claim("specializations", "Finance"), claim("specializations", "Marketing")];
    const comparison = buildPriorityComparison([], [], target, master);
    expect(findField(comparison, "specializations")?.status).toBe("match");
  });
});

describe("buildPriorityComparison — Accreditation", () => {
  it("same accreditation -> match", () => {
    const comparison = buildPriorityComparison(
      [claim("accreditationItem", "UGC entitled")],
      [claim("accreditationItem", "UGC entitled", "master")],
      [],
      [],
    );
    expect(findField(comparison, "accreditationItem")?.status).toBe("match");
  });

  it("changed accreditation -> changed", () => {
    const comparison = buildPriorityComparison(
      [claim("accreditationItem", "UGC entitled")],
      [claim("accreditationItem", "UGC entitled", "master"), claim("accreditationItem", "NAAC A+", "master")],
      [],
      [],
    );
    expect(findField(comparison, "accreditationItem")?.status).toBe("changed");
  });

  it("missing accreditation -> correct missing state", () => {
    const comparison = buildPriorityComparison([], [claim("accreditationItem", "UGC entitled", "master")], [], []);
    expect(findField(comparison, "accreditationItem")?.status).toBe("target_missing");

    const bothMissing = buildPriorityComparison([], [], [], []);
    expect(findField(bothMissing, "accreditationItem")?.status).toBe("both_missing");
  });

  it("different accreditation authorities are NOT treated as equivalent", () => {
    const comparison = buildPriorityComparison(
      [claim("accreditationItem", "NAAC A+")],
      [claim("accreditationItem", "UGC entitled", "master")],
      [],
      [],
    );
    const field = findField(comparison, "accreditationItem");
    expect(field?.status).toBe("changed");
    expect(field?.masterValue).toContain("UGC");
    expect(field?.targetValue).toContain("NAAC");
  });
});

describe("buildPriorityComparison — Rankings & Accreditations", () => {
  it("same rank/year -> match", () => {
    const comparison = buildPriorityComparison(
      [claim("rankingItem", "NIRF Rank 45, 2025")],
      [claim("rankingItem", "NIRF Rank 45, 2025", "master")],
      [],
      [],
    );
    expect(findField(comparison, "rankingItem")?.status).toBe("match");
  });

  it("different rank -> changed", () => {
    const comparison = buildPriorityComparison(
      [claim("rankingItem", "NIRF Rank 50, 2025")],
      [claim("rankingItem", "NIRF Rank 45, 2025", "master")],
      [],
      [],
    );
    expect(findField(comparison, "rankingItem")?.status).toBe("changed");
  });

  it("different year -> changed/review, never silently identical", () => {
    const comparison = buildPriorityComparison(
      [claim("rankingItem", "NIRF Rank 45, 2024")],
      [claim("rankingItem", "NIRF Rank 45, 2025", "master")],
      [],
      [],
    );
    expect(findField(comparison, "rankingItem")?.status).toBe("changed");
  });

  it("missing ranking -> correct missing state", () => {
    const comparison = buildPriorityComparison([claim("rankingItem", "NIRF Rank 45, 2025")], [], [], []);
    expect(findField(comparison, "rankingItem")?.status).toBe("master_missing");
  });
});

describe("buildPriorityComparison — Others", () => {
  it("meaningful factual difference is surfaced", () => {
    const comparison = buildPriorityComparison(
      [claim("placementSupport", "Dedicated placement cell with 200+ hiring partners")],
      [claim("placementSupport", "Dedicated placement cell with 50+ hiring partners", "master")],
      [],
      [],
    );
    const field = findField(comparison, "placementSupport");
    expect(field?.status).toBe("changed");
  });

  it("irrelevant wording (whitespace/case) difference is not treated as a material change", () => {
    const comparison = buildPriorityComparison(
      [claim("placementSupport", "  Dedicated PLACEMENT cell   with 50+ hiring partners")],
      [claim("placementSupport", "Dedicated placement cell with 50+ hiring partners", "master")],
      [],
      [],
    );
    const field = findField(comparison, "placementSupport");
    expect(field?.status).toBe("match");
  });
});

describe("buildPriorityComparison — overall", () => {
  it("verified_match when every field cleanly matches or is consistently absent", () => {
    const comparison = buildPriorityComparison(
      [claim("duration", "24 Months")],
      [claim("duration", "24 Months", "master")],
      noSpecializations,
      noSpecializations,
    );
    expect(comparison.overallStatus).toBe("verified_match");
    expect(comparison.changedFieldCount).toBe(0);
  });

  it("changes_found when at least one field differs", () => {
    const comparison = buildPriorityComparison(
      [claim("duration", "18 Months")],
      [claim("duration", "24 Months", "master")],
      noSpecializations,
      noSpecializations,
    );
    expect(comparison.overallStatus).toBe("changes_found");
    expect(comparison.changedFieldCount).toBeGreaterThan(0);
  });

  it("returns exactly 5 priority fields, 2 secondary fields, 7 others fields, always in fixed order", () => {
    const comparison = buildPriorityComparison([], [], [], []);
    expect(comparison.priorityFields.map((f) => f.fieldKey)).toEqual([
      "semesterFee",
      "duration",
      "specializations",
      "accreditationItem",
      "rankingItem",
    ]);
    expect(comparison.secondaryFields.map((f) => f.fieldKey)).toEqual(["mode", "eligibility"]);
    expect(comparison.others).toHaveLength(7);
  });
});
