import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { InstitutionResolutionMethod } from "@crosscheck/core";
import { ResolutionMethodBadge } from "../../src/components/ResolutionMethodBadge.js";
import { IDENTITY_METHOD_META } from "../../src/lib/identityMeta.js";

const ALL_METHODS: InstitutionResolutionMethod[] = [
  "url_identifier",
  "page_identity",
  "logo",
  "combined_signals",
  "multi_university_default",
  "single_university_default",
  "conflict",
  "unresolved",
];

describe("ResolutionMethodBadge", () => {
  it.each(ALL_METHODS)("renders a distinct label for resolutionMethod '%s'", (method) => {
    render(<ResolutionMethodBadge method={method} fallbackApplied={false} />);
    expect(screen.getByText(new RegExp(IDENTITY_METHOD_META[method].label))).toBeInTheDocument();
  });

  it("shows a 'Fallback applied' flag when fallbackApplied is true, never when false", () => {
    const { rerender } = render(<ResolutionMethodBadge method="multi_university_default" fallbackApplied={true} />);
    expect(screen.getByText(/Fallback applied/)).toBeInTheDocument();

    rerender(<ResolutionMethodBadge method="url_identifier" fallbackApplied={false} />);
    expect(screen.queryByText(/Fallback applied/)).not.toBeInTheDocument();
  });

  it("D1/detected-vs-defaulted requirement: a generic-URL MUJ default and an explicit-URL MUJ detection render with different CSS tones, never identically", () => {
    const { container: defaultContainer } = render(<ResolutionMethodBadge method="multi_university_default" fallbackApplied={true} />);
    const { container: detectedContainer } = render(<ResolutionMethodBadge method="url_identifier" fallbackApplied={false} />);

    const defaultBadge = defaultContainer.querySelector(".badge");
    const detectedBadge = detectedContainer.querySelector(".badge");
    expect(defaultBadge?.className).not.toEqual(detectedBadge?.className);
    expect(defaultBadge?.className).toContain("badge--method-default");
    expect(detectedBadge?.className).toContain("badge--method-detected");
  });
});
