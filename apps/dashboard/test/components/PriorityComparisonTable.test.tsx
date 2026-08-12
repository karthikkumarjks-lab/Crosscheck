import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PriorityComparisonTable } from "../../src/components/PriorityComparisonTable.js";
import { makePriorityComparison, makePriorityField } from "../fixtures/factories.js";

function rowFor(label: string) {
  const cell = screen.getByText(label, { selector: "td.priority-row__field" });
  return cell.closest("tr")!;
}

describe("PriorityComparisonTable", () => {
  it("1. renders Match for every field when all priority fields match", () => {
    render(<PriorityComparisonTable priorityComparison={makePriorityComparison()} />);
    expect(within(rowFor("Semester Fee")).getByText("Match")).toBeInTheDocument();
    expect(within(rowFor("Course Duration")).getByText("Match")).toBeInTheDocument();
    expect(within(rowFor("Specializations")).getByText("Match")).toBeInTheDocument();
    expect(within(rowFor("Accreditation")).getByText("Match")).toBeInTheDocument();
    expect(within(rowFor("Rankings & Accreditations")).getByText("Match")).toBeInTheDocument();
    expect(within(rowFor("Mode")).getByText("Match")).toBeInTheDocument();
    expect(within(rowFor("Eligibility")).getByText("Match")).toBeInTheDocument();
  });

  it("2. semester fee changed -> Changed, both values shown", () => {
    const pc = makePriorityComparison({
      priorityFields: [
        makePriorityField("semesterFee", "changed", { label: "Semester Fee", masterValue: "₹50,000 per semester", targetValue: "₹55,000 per semester", notes: "Semester fee differs." }),
        makePriorityField("duration", "match", { label: "Course Duration" }),
        makePriorityField("specializations", "match", { label: "Specializations" }),
        makePriorityField("accreditationItem", "match", { label: "Accreditation" }),
        makePriorityField("rankingItem", "match", { label: "Rankings & Accreditations" }),
      ],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    const row = rowFor("Semester Fee");
    expect(within(row).getByText("Changed")).toBeInTheDocument();
    expect(within(row).getByText("₹50,000 per semester")).toBeInTheDocument();
    expect(within(row).getByText("₹55,000 per semester")).toBeInTheDocument();
  });

  it("3. semester fee needs_review -> Needs Review, never rendered as a confirmed Changed", () => {
    const pc = makePriorityComparison({
      priorityFields: [
        makePriorityField("semesterFee", "needs_review", {
          label: "Semester Fee",
          masterValue: "₹50,000 per semester",
          targetValue: "Full Fee Payment",
          notes: "Fee value could not be safely normalized.",
        }),
        makePriorityField("duration", "match", { label: "Course Duration" }),
        makePriorityField("specializations", "match", { label: "Specializations" }),
        makePriorityField("accreditationItem", "match", { label: "Accreditation" }),
        makePriorityField("rankingItem", "match", { label: "Rankings & Accreditations" }),
      ],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    const row = rowFor("Semester Fee");
    expect(within(row).getByText("Needs Review")).toBeInTheDocument();
    expect(within(row).queryByText("Changed")).not.toBeInTheDocument();
    expect(row.className).not.toContain("priority-row--changed");
    expect(row.className).toContain("priority-row--review");
    expect(within(row).getByText(/could not be safely normalized/i)).toBeInTheDocument();
  });

  it("4. course duration changed -> Changed", () => {
    const pc = makePriorityComparison({
      priorityFields: [
        makePriorityField("semesterFee", "match", { label: "Semester Fee" }),
        makePriorityField("duration", "changed", { label: "Course Duration", masterValue: "2 Years", targetValue: "18 Months" }),
        makePriorityField("specializations", "match", { label: "Specializations" }),
        makePriorityField("accreditationItem", "match", { label: "Accreditation" }),
        makePriorityField("rankingItem", "match", { label: "Rankings & Accreditations" }),
      ],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    expect(within(rowFor("Course Duration")).getByText("Changed")).toBeInTheDocument();
  });

  it("5. specializations changed -> Changed, notes explain what's missing", () => {
    const pc = makePriorityComparison({
      priorityFields: [
        makePriorityField("semesterFee", "match", { label: "Semester Fee" }),
        makePriorityField("duration", "match", { label: "Course Duration" }),
        makePriorityField("specializations", "changed", {
          label: "Specializations",
          masterValue: "Finance, Marketing, Human Resources, Operations",
          targetValue: "Finance, Marketing, Human Resources",
          notes: "Operations missing from target",
        }),
        makePriorityField("accreditationItem", "match", { label: "Accreditation" }),
        makePriorityField("rankingItem", "match", { label: "Rankings & Accreditations" }),
      ],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    const row = rowFor("Specializations");
    expect(within(row).getByText("Changed")).toBeInTheDocument();
    expect(within(row).getByText(/Operations missing from target/)).toBeInTheDocument();
  });

  it("6. accreditation changed -> Changed, shows the actual summary (not 'Accredited: Yes')", () => {
    const pc = makePriorityComparison({
      priorityFields: [
        makePriorityField("semesterFee", "match", { label: "Semester Fee" }),
        makePriorityField("duration", "match", { label: "Course Duration" }),
        makePriorityField("specializations", "match", { label: "Specializations" }),
        makePriorityField("accreditationItem", "changed", { label: "Accreditation", masterValue: "UGC entitled, NAAC A+", targetValue: "UGC entitled" }),
        makePriorityField("rankingItem", "match", { label: "Rankings & Accreditations" }),
      ],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    const row = rowFor("Accreditation");
    expect(within(row).getByText("Changed")).toBeInTheDocument();
    expect(within(row).getByText("UGC entitled, NAAC A+")).toBeInTheDocument();
    expect(within(row).queryByText(/Accredited: Yes/i)).not.toBeInTheDocument();
  });

  it("7. rankings changed -> Changed", () => {
    const pc = makePriorityComparison({
      priorityFields: [
        makePriorityField("semesterFee", "match", { label: "Semester Fee" }),
        makePriorityField("duration", "match", { label: "Course Duration" }),
        makePriorityField("specializations", "match", { label: "Specializations" }),
        makePriorityField("accreditationItem", "match", { label: "Accreditation" }),
        makePriorityField("rankingItem", "changed", { label: "Rankings & Accreditations", masterValue: "NIRF Rank 45, 2025", targetValue: "NIRF Rank 45, 2024" }),
      ],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    expect(within(rowFor("Rankings & Accreditations")).getByText("Changed")).toBeInTheDocument();
  });

  it("8. missing on one side -> Missing on Target / Missing on Master", () => {
    const pc = makePriorityComparison({
      priorityFields: [
        makePriorityField("semesterFee", "target_missing", { label: "Semester Fee" }),
        makePriorityField("duration", "master_missing", { label: "Course Duration" }),
        makePriorityField("specializations", "match", { label: "Specializations" }),
        makePriorityField("accreditationItem", "match", { label: "Accreditation" }),
        makePriorityField("rankingItem", "match", { label: "Rankings & Accreditations" }),
      ],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    expect(within(rowFor("Semester Fee")).getByText("Missing on Target")).toBeInTheDocument();
    expect(within(rowFor("Course Duration")).getByText("Missing on Master")).toBeInTheDocument();
  });

  it("9. both missing -> Not Available", () => {
    const pc = makePriorityComparison({
      priorityFields: [
        makePriorityField("semesterFee", "both_missing", { label: "Semester Fee" }),
        makePriorityField("duration", "match", { label: "Course Duration" }),
        makePriorityField("specializations", "match", { label: "Specializations" }),
        makePriorityField("accreditationItem", "match", { label: "Accreditation" }),
        makePriorityField("rankingItem", "match", { label: "Rankings & Accreditations" }),
      ],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    expect(within(rowFor("Semester Fee")).getByText("Not Available")).toBeInTheDocument();
  });

  it("10. normalization_issue -> Needs Normalization, review tone (not a confirmed mismatch)", () => {
    const pc = makePriorityComparison({
      secondaryFields: [
        makePriorityField("mode", "normalization_issue", { label: "Mode" }),
        makePriorityField("eligibility", "match", { label: "Eligibility" }),
      ],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    const row = rowFor("Mode");
    expect(within(row).getByText("Needs Normalization")).toBeInTheDocument();
    expect(row.className).toContain("priority-row--review");
  });

  it("11. needs_review on a secondary field renders distinctly from Changed", () => {
    const pc = makePriorityComparison({
      secondaryFields: [makePriorityField("mode", "needs_review", { label: "Mode" }), makePriorityField("eligibility", "match", { label: "Eligibility" })],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    expect(within(rowFor("Mode")).getByText("Needs Review")).toBeInTheDocument();
  });

  it("shows evidence (URL + excerpt) for both sides of a field", () => {
    const pc = makePriorityComparison({
      priorityFields: [
        makePriorityField("semesterFee", "changed", {
          label: "Semester Fee",
          masterEvidence: { url: "https://master.test/mba", excerpt: "Semester Fee: ₹50,000 per semester" },
          targetEvidence: { url: "https://target.test/mba", excerpt: "Semester Fee: ₹55,000 per semester" },
        }),
        makePriorityField("duration", "match", { label: "Course Duration" }),
        makePriorityField("specializations", "match", { label: "Specializations" }),
        makePriorityField("accreditationItem", "match", { label: "Accreditation" }),
        makePriorityField("rankingItem", "match", { label: "Rankings & Accreditations" }),
      ],
    });
    render(<PriorityComparisonTable priorityComparison={pc} />);
    const row = rowFor("Semester Fee");
    expect(within(row).getByText("https://master.test/mba")).toBeInTheDocument();
    expect(within(row).getByText("https://target.test/mba")).toBeInTheDocument();
    expect(within(row).getByText("Semester Fee: ₹50,000 per semester")).toBeInTheDocument();
    expect(within(row).getByText("Semester Fee: ₹55,000 per semester")).toBeInTheDocument();
  });

  it("Others renders as a separate, collapsible section, never above the priority fields", () => {
    const pc = makePriorityComparison({
      others: [makePriorityField("placementSupport", "changed", { label: "Placement Support" })],
    });
    const { container } = render(<PriorityComparisonTable priorityComparison={pc} />);
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBe(2);
    expect(within(tables[0] as HTMLElement).queryByText("Placement Support")).not.toBeInTheDocument();
    expect(within(tables[1] as HTMLElement).getByText("Placement Support")).toBeInTheDocument();
  });
});
