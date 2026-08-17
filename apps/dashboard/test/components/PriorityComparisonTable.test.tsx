import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PriorityComparisonTable } from "../../src/components/PriorityComparisonTable.js";
import { makePriorityComparison, makePriorityRow } from "../fixtures/factories.js";

function rowFor(label: string) {
  const cell = screen.getByText(label, { selector: "td.priority-row__field" });
  return cell.closest("tr")!;
}

describe("PriorityComparisonTable", () => {
  it("renders exactly the 6 approved primary rows, in the approved order, with MATCH for every row when everything matches", () => {
    const pc = makePriorityComparison();
    render(<PriorityComparisonTable rows={pc.fields} />);
    const fieldCells = screen.getAllByText(/.*/, { selector: "td.priority-row__field" }).map((c) => c.textContent);
    expect(fieldCells).toEqual(["Fee Structure", "Eligibility", "Specializations", "Course Duration", "Course Curriculum", "Others"]);
    for (const label of fieldCells) {
      expect(within(rowFor(label!)).getByText("MATCH")).toBeInTheDocument();
    }
  });

  it("J. table has exactly the required columns: Field, Master, Target, Status, Notes / Evidence", () => {
    const pc = makePriorityComparison();
    render(<PriorityComparisonTable rows={pc.fields} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Field", "Master / Reference", "Target", "Status", "Notes / Evidence"]);
  });

  it("fee structure UNMATCH -> both values shown, red tone", () => {
    const pc = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "UNMATCH", { masterValue: "Semester Fee: ₹50,000", targetValue: "Semester Fee: ₹55,000", notes: "Target semester fee is 5,000 INR higher than Master." }),
        makePriorityRow("Eligibility", "MATCH"),
        makePriorityRow("Specializations", "MATCH"),
        makePriorityRow("Course Duration", "MATCH"),
        makePriorityRow("Course Curriculum", "MATCH"),
        makePriorityRow("Others", "MATCH"),
      ],
    });
    render(<PriorityComparisonTable rows={pc.fields} />);
    const row = rowFor("Fee Structure");
    expect(within(row).getByText("UNMATCH")).toBeInTheDocument();
    expect(within(row).getByText("Semester Fee: ₹50,000")).toBeInTheDocument();
    expect(within(row).getByText("Semester Fee: ₹55,000")).toBeInTheDocument();
    expect(row.className).toContain("priority-row--unmatch");
  });

  it("D. fee structure NEEDS_REVIEW -> never rendered as a confirmed UNMATCH", () => {
    const pc = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "NEEDS_REVIEW", {
          masterValue: "Semester Fee: ₹50,000",
          targetValue: "Full Fee Payment",
          notes: "Semester Fee found, but a numerical value could not be reliably extracted.",
        }),
        makePriorityRow("Eligibility", "MATCH"),
        makePriorityRow("Specializations", "MATCH"),
        makePriorityRow("Course Duration", "MATCH"),
        makePriorityRow("Course Curriculum", "MATCH"),
        makePriorityRow("Others", "MATCH"),
      ],
    });
    render(<PriorityComparisonTable rows={pc.fields} />);
    const row = rowFor("Fee Structure");
    expect(within(row).getByText("NEEDS REVIEW")).toBeInTheDocument();
    expect(within(row).queryByText("UNMATCH")).not.toBeInTheDocument();
    expect(row.className).not.toContain("priority-row--unmatch");
    expect(row.className).toContain("priority-row--review");
    expect(within(row).getByText(/could not be reliably extracted/i)).toBeInTheDocument();
  });

  it("C. course duration equivalent (2 years / 24 months) -> MATCH with an explanatory note", () => {
    const pc = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "MATCH"),
        makePriorityRow("Eligibility", "MATCH"),
        makePriorityRow("Specializations", "MATCH"),
        makePriorityRow("Course Duration", "MATCH", { masterValue: "2 Years", targetValue: "24 Months", notes: "Equivalent duration: 2 Years / 24 Months." }),
        makePriorityRow("Course Curriculum", "MATCH"),
        makePriorityRow("Others", "MATCH"),
      ],
    });
    render(<PriorityComparisonTable rows={pc.fields} />);
    const row = rowFor("Course Duration");
    expect(within(row).getByText("MATCH")).toBeInTheDocument();
    expect(within(row).getByText(/Equivalent duration/)).toBeInTheDocument();
  });

  it("A. specializations MATCH -> identical Master/Target values shown", () => {
    const pc = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "MATCH"),
        makePriorityRow("Eligibility", "MATCH"),
        makePriorityRow("Specializations", "MATCH", { masterValue: "Healthcare Management", targetValue: "Healthcare Management", notes: "1/1 specialization matched." }),
        makePriorityRow("Course Duration", "MATCH"),
        makePriorityRow("Course Curriculum", "MATCH"),
        makePriorityRow("Others", "MATCH"),
      ],
    });
    render(<PriorityComparisonTable rows={pc.fields} />);
    const row = rowFor("Specializations");
    const values = within(row).getAllByText("Healthcare Management");
    expect(values.length).toBe(2);
    expect(within(row).getByText("MATCH")).toBeInTheDocument();
  });

  it("F. specializations PARTIAL -> names exactly what's missing on which side, not a bare count", () => {
    const pc = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "MATCH"),
        makePriorityRow("Eligibility", "MATCH"),
        makePriorityRow("Specializations", "PARTIAL", {
          masterValue: "Finance, HR, Marketing",
          targetValue: "Finance, Marketing",
          notes: "2/3 specializations matched. MISSING IN TARGET: HR.",
        }),
        makePriorityRow("Course Duration", "MATCH"),
        makePriorityRow("Course Curriculum", "MATCH"),
        makePriorityRow("Others", "MATCH"),
      ],
    });
    render(<PriorityComparisonTable rows={pc.fields} />);
    const row = rowFor("Specializations");
    expect(within(row).getByText("PARTIAL")).toBeInTheDocument();
    expect(row.className).toContain("priority-row--partial");
    expect(within(row).getByText(/MISSING IN TARGET: HR/)).toBeInTheDocument();
  });

  it("E. course curriculum UNMATCH -> shows the actual subject list, not a generic yes/no", () => {
    const pc = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "MATCH"),
        makePriorityRow("Eligibility", "MATCH"),
        makePriorityRow("Specializations", "MATCH"),
        makePriorityRow("Course Duration", "MATCH"),
        makePriorityRow("Course Curriculum", "UNMATCH", { masterValue: "Financial Accounting, Marketing Management", targetValue: "Financial Accounting", notes: "1/2 subjects matched. MISSING IN TARGET: Marketing Management." }),
        makePriorityRow("Others", "MATCH"),
      ],
    });
    render(<PriorityComparisonTable rows={pc.fields} />);
    const row = rowFor("Course Curriculum");
    expect(within(row).getByText("UNMATCH")).toBeInTheDocument();
    expect(within(row).getByText("Financial Accounting, Marketing Management")).toBeInTheDocument();
  });

  it("B. missing on one side -> UNMATCH, with Notes naming which side is missing it (2026-08-14: no longer a separate status label)", () => {
    const pc = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "MATCH"),
        makePriorityRow("Eligibility", "MATCH"),
        makePriorityRow("Specializations", "MATCH"),
        makePriorityRow("Course Duration", "UNMATCH", { targetValue: null, notes: "Course Duration not found on target page." }),
        makePriorityRow("Course Curriculum", "UNMATCH", { masterValue: null, notes: "Course Curriculum not found on master (authoritative) page." }),
        makePriorityRow("Others", "MATCH"),
      ],
    });
    render(<PriorityComparisonTable rows={pc.fields} />);
    expect(within(rowFor("Course Duration")).getByText(/not found on target page/)).toBeInTheDocument();
    expect(within(rowFor("Course Curriculum")).getByText(/not found on master/)).toBeInTheDocument();
  });

  it("H. Others renders as exactly one row -- never a per-sub-field dump, and names the specific attribute", () => {
    const pc = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "MATCH"),
        makePriorityRow("Eligibility", "MATCH"),
        makePriorityRow("Specializations", "MATCH"),
        makePriorityRow("Course Duration", "MATCH"),
        makePriorityRow("Course Curriculum", "MATCH"),
        makePriorityRow("Others", "UNMATCH", { masterValue: null, targetValue: null, notes: 'Placement / Career Support differs (Master: "Dedicated cell" / Target: "None mentioned").' }),
      ],
    });
    render(<PriorityComparisonTable rows={pc.fields} />);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(7); // header + 6
    const row = rowFor("Others");
    expect(within(row).getByText("UNMATCH")).toBeInTheDocument();
    expect(within(row).getByText(/Placement \/ Career Support differs/)).toBeInTheDocument();
    const cells = row.querySelectorAll(":scope > td");
    expect(cells[1].textContent).toBe("—"); // Master stays blank
    expect(cells[2].textContent).toBe("—"); // Target stays blank
  });

  it("shows semantic-layer provenance (confidence, source type, heading) in evidence when present, never fabricated when absent", () => {
    const pc = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "MATCH"),
        makePriorityRow("Eligibility", "MATCH"),
        makePriorityRow("Specializations", "MATCH", {
          masterValue: "Healthcare Management",
          targetValue: "Healthcare Management",
          evidence: {
            master: { url: "https://master.test/mba", excerpt: "Healthcare Management", confidence: "MEDIUM", sourceType: "heading_and_text", heading: "Combinations Available" },
            target: { url: "https://target.test/mba-healthcare", excerpt: "Healthcare Management" },
          },
        }),
        makePriorityRow("Course Duration", "MATCH"),
        makePriorityRow("Course Curriculum", "MATCH"),
        makePriorityRow("Others", "MATCH"),
      ],
    });
    render(<PriorityComparisonTable rows={pc.fields} />);
    const row = rowFor("Specializations");
    expect(within(row).getByText(/under "Combinations Available"/)).toBeInTheDocument();
    expect(within(row).getByText("heading + list")).toBeInTheDocument();
    expect(within(row).getByText("medium confidence")).toBeInTheDocument();
    expect(within(row).getAllByText(/under "/).length).toBe(1);
    expect(within(row).queryByText("high confidence")).not.toBeInTheDocument();
  });

  it("shows evidence (URL + excerpt) for both sides of a row", () => {
    const pc = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "UNMATCH", {
          evidence: {
            master: { url: "https://master.test/mba", excerpt: "Semester Fee: ₹50,000 per semester" },
            target: { url: "https://target.test/mba", excerpt: "Semester Fee: ₹55,000 per semester" },
          },
        }),
        makePriorityRow("Eligibility", "MATCH"),
        makePriorityRow("Specializations", "MATCH"),
        makePriorityRow("Course Duration", "MATCH"),
        makePriorityRow("Course Curriculum", "MATCH"),
        makePriorityRow("Others", "MATCH"),
      ],
    });
    render(<PriorityComparisonTable rows={pc.fields} />);
    const row = rowFor("Fee Structure");
    expect(within(row).getByText("https://master.test/mba")).toBeInTheDocument();
    expect(within(row).getByText("https://target.test/mba")).toBeInTheDocument();
    expect(within(row).getByText("Semester Fee: ₹50,000 per semester")).toBeInTheDocument();
    expect(within(row).getByText("Semester Fee: ₹55,000 per semester")).toBeInTheDocument();
  });

  it("renders the secondary Accreditation/Rankings rows too, when given secondaryFields -- same component, different row set", () => {
    const pc = makePriorityComparison();
    render(<PriorityComparisonTable rows={pc.secondaryFields} />);
    const fieldCells = screen.getAllByText(/.*/, { selector: "td.priority-row__field" }).map((c) => c.textContent);
    expect(fieldCells).toEqual(["Accreditation", "Rankings & Accreditations"]);
  });
});
