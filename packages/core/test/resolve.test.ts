import { describe, expect, it } from "vitest";
import type { EntityGuess, SourceRegistry } from "../src/types.js";
import { resolveSource } from "../src/source-resolution/index.js";
import { sourceRegistry } from "../src/registry/index.js";

function guess(value: string): EntityGuess {
  return { value, confidence: "medium", matchedSignals: [] };
}

describe("resolveSource — default (real, seeded) registry", () => {
  it("resolves via URL-pattern match with a single candidate", () => {
    const result = resolveSource({
      requestedUrl: "https://example-sunrise.test/bba",
      institutionGuess: null,
      programGuess: null,
    });

    expect(result.success).toBe(true);
    expect(result.source?.id).toBe("sunrise-bba-source");
    expect(result.confidence).toBe("high");
    expect(result.matchedVia).toBe("url_pattern");
    expect(result.matchedSignals.length).toBeGreaterThan(0);
  });

  it("resolves via brand-name alias fallback combined with program disambiguation (the real MUJ MBA scenario)", () => {
    // Mirrors Sprint 2's documented known limitation: institutionGuess is
    // "Online Manipal" (the brand), not "Manipal University Jaipur", and
    // the URL itself doesn't match any registered pattern.
    const result = resolveSource({
      requestedUrl: "https://some-unrelated-lms.test/course/123",
      institutionGuess: guess("Online Manipal"),
      programGuess: guess("MBA"),
    });

    expect(result.success).toBe(true);
    expect(result.source?.id).toBe("muj-mba-source");
    expect(result.confidence).toBe("high");
    expect(result.matchedVia).toBe("institution_alias");
  });

  it("disambiguates MCA correctly when the domain matches both MUJ sources", () => {
    const result = resolveSource({
      requestedUrl: "https://www.onlinemanipal.com/online-mca-degree-muj",
      institutionGuess: guess("Manipal University Jaipur"),
      programGuess: guess("MCA"),
    });

    expect(result.success).toBe(true);
    expect(result.source?.id).toBe("muj-mca-source");
    expect(result.confidence).toBe("high");
    expect(result.matchedVia).toBe("url_pattern");
  });

  it("returns program_not_registered when the institution/domain is known but the program guess matches none of its programs", () => {
    const result = resolveSource({
      requestedUrl: "https://www.onlinemanipal.com/some-other-page",
      institutionGuess: guess("Manipal University Jaipur"),
      programGuess: guess("BBA"),
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("program_not_registered");
    expect(result.source).toBeNull();
  });

  it("returns program_not_registered when multiple candidates exist and no program guess was provided", () => {
    const result = resolveSource({
      requestedUrl: "https://some-unrelated-lms.test/course/123",
      institutionGuess: guess("Online Manipal"),
      programGuess: null,
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("program_not_registered");
  });

  it("returns no_registry_entry when neither the URL nor the institution guess matches anything registered", () => {
    const result = resolveSource({
      requestedUrl: "https://totally-unregistered-college.test/programs/mba",
      institutionGuess: guess("Totally Unregistered College"),
      programGuess: guess("MBA"),
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("no_registry_entry");
    expect(result.source).toBeNull();
  });

  it("returns no_registry_entry (not a fabricated match) when there is no institution guess at all and the URL is unregistered", () => {
    const result = resolveSource({
      requestedUrl: "https://totally-unregistered-college.test/about",
      institutionGuess: null,
      programGuess: null,
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("no_registry_entry");
  });
});

describe("resolveSource — single-program institution (isolates the alias-fallback confidence path)", () => {
  const singleProgramRegistry: SourceRegistry = {
    institutions: [{ id: "solo", name: "Solo Institute", aliases: ["SI"], brandNames: ["Solo Online"] }],
    programs: [{ id: "solo-mba", name: "MBA", aliases: ["Master of Business Administration", "MBA"], institutionId: "solo" }],
    sources: [
      {
        id: "solo-mba-source",
        institutionId: "solo",
        programId: "solo-mba",
        rootUrl: "https://solo.test",
        pages: [{ url: "https://solo.test/mba", role: "primary" }],
        urlPatterns: ["solo.test"],
      },
    ],
  };

  it("resolves via brand-name alias fallback alone (single candidate) at medium confidence", () => {
    const result = resolveSource(
      { requestedUrl: "https://unrelated-domain.test/x", institutionGuess: guess("Solo Online"), programGuess: null },
      singleProgramRegistry,
    );

    expect(result.success).toBe(true);
    expect(result.source?.id).toBe("solo-mba-source");
    expect(result.confidence).toBe("medium");
    expect(result.matchedVia).toBe("institution_alias");
  });
});

describe("resolveSource — crafted registry for ambiguous_match", () => {
  const ambiguousRegistry: SourceRegistry = {
    institutions: [{ id: "amb", name: "Ambiguous University", aliases: [], brandNames: [] }],
    programs: [
      { id: "amb-p1", name: "Program One", aliases: ["Foo", "Shared Label"], institutionId: "amb" },
      { id: "amb-p2", name: "Program Two", aliases: ["Bar", "Shared Label"], institutionId: "amb" },
    ],
    sources: [
      {
        id: "amb-s1",
        institutionId: "amb",
        programId: "amb-p1",
        rootUrl: "https://amb.test",
        pages: [{ url: "https://amb.test/p1", role: "primary" }],
        urlPatterns: ["amb.test"],
      },
      {
        id: "amb-s2",
        institutionId: "amb",
        programId: "amb-p2",
        rootUrl: "https://amb.test",
        pages: [{ url: "https://amb.test/p2", role: "primary" }],
        urlPatterns: ["amb.test"],
      },
    ],
  };

  it("returns ambiguous_match when a program guess matches more than one candidate's aliases", () => {
    const result = resolveSource(
      { requestedUrl: "https://amb.test/x", institutionGuess: null, programGuess: guess("Shared Label") },
      ambiguousRegistry,
    );

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("ambiguous_match");
  });
});
