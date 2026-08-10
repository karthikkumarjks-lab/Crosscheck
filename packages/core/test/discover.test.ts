import { describe, expect, it } from "vitest";
import { discoverPages } from "../src/discovery/index.js";
import { sourceRegistry } from "../src/registry/index.js";

describe("discoverPages", () => {
  it("returns exactly the resolved Source's registry-defined pages, unchanged", () => {
    const source = sourceRegistry.sources.find((s) => s.id === "muj-mba-source");
    if (!source) throw new Error("fixture registry is missing muj-mba-source");

    const result = discoverPages(source);

    expect(result.sourceId).toBe("muj-mba-source");
    expect(result.pages).toEqual(source.pages);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].role).toBe("primary");
  });

  it("does not fetch or modify page content — only returns the registered URL list", () => {
    const source = sourceRegistry.sources.find((s) => s.id === "muj-mca-source");
    if (!source) throw new Error("fixture registry is missing muj-mca-source");

    const result = discoverPages(source);

    expect(result.pages.map((p) => p.url)).toEqual(["https://www.onlinemanipal.com/online-mca-degree-muj"]);
  });
});
