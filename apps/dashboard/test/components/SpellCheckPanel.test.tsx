import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SpellCheckPanel } from "../../src/components/SpellCheckPanel.js";

describe("SpellCheckPanel", () => {
  it("renders nothing when spellCheck is null (no successful comparison ran)", () => {
    const { container } = render(<SpellCheckPanel spellCheck={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 0 misspellings for a clean side, with no location list", () => {
    render(<SpellCheckPanel spellCheck={{ master: { count: 0, items: [] }, target: { count: 0, items: [] } }} />);
    expect(screen.getByText("Master: 0 misspellings")).toBeInTheDocument();
    expect(screen.getByText("Target: 0 misspellings")).toBeInTheDocument();
  });

  it("2026-09-03 user request: highlights the exact misspelled word within its own excerpt, red, for identification", () => {
    render(
      <SpellCheckPanel
        spellCheck={{
          master: { count: 0, items: [] },
          target: { count: 1, items: [{ word: "recieve", locations: [{ fieldKey: "eligibility", excerpt: "You will recieve confirmation by email." }] }] },
        }}
      />,
    );
    const highlighted = screen.getByText("recieve", { selector: "mark" });
    expect(highlighted).toHaveClass("spell-check-panel__highlight");
    // The rest of the excerpt still renders, unhighlighted, around it.
    const locationItem = highlighted.closest("li")!;
    expect(within(locationItem).getByText("eligibility")).toBeInTheDocument();
    expect(locationItem.textContent).toContain("You will recieve confirmation by email.");
  });

  it("highlights every occurrence of the word within one excerpt, case-insensitively", () => {
    render(
      <SpellCheckPanel
        spellCheck={{
          master: { count: 1, items: [{ word: "amonst", locations: [{ fieldKey: "accreditationItem", excerpt: "Amonst the best, amonst all universities" }] }] },
          target: { count: 0, items: [] },
        }}
      />,
    );
    expect(screen.getAllByText(/amonst/i, { selector: "mark" })).toHaveLength(2);
  });
});
