import { describe, expect, it } from "vitest";
import { isAllowedByRobots, parseRobotsTxt } from "../src/dynamic-discovery/index.js";

describe("parseRobotsTxt / isAllowedByRobots", () => {
  it("honors Disallow rules for the wildcard agent", () => {
    const text = ["User-agent: *", "Disallow: /admin", "Disallow: /private/"].join("\n");
    expect(isAllowedByRobots(text, "/admin/dashboard")).toBe(false);
    expect(isAllowedByRobots(text, "/private/notes")).toBe(false);
    expect(isAllowedByRobots(text, "/msc-data-science")).toBe(true);
  });

  it("an Allow rule overrides a Disallow rule only when at least as specific", () => {
    const text = ["User-agent: *", "Disallow: /programs/", "Allow: /programs/msc-data-science"].join("\n");
    expect(isAllowedByRobots(text, "/programs/msc-data-science")).toBe(true);
    expect(isAllowedByRobots(text, "/programs/msc-statistics")).toBe(false);
  });

  it("treats a missing robots.txt (empty text) as allow-all", () => {
    expect(isAllowedByRobots("", "/anything")).toBe(true);
  });

  it("fails open on malformed robots.txt rather than blocking a legitimate crawl", () => {
    const garbage = "this is not a robots.txt file at all\n%%%\n???";
    expect(() => isAllowedByRobots(garbage, "/anything")).not.toThrow();
    expect(isAllowedByRobots(garbage, "/anything")).toBe(true);
  });

  it("prefers an exact user-agent match over the wildcard group", () => {
    const text = ["User-agent: *", "Disallow: /", "", "User-agent: crosscheck-bot", "Disallow: /admin", "Allow: /"].join("\n");
    expect(isAllowedByRobots(text, "/programs/x", "crosscheck-bot")).toBe(true);
    expect(isAllowedByRobots(text, "/programs/x", "some-other-bot")).toBe(false);
  });

  it("parses Disallow/Allow lists correctly for the wildcard group", () => {
    const text = ["User-agent: *", "Disallow: /a", "Disallow: /b", "Allow: /c"].join("\n");
    const rules = parseRobotsTxt(text);
    expect(rules.disallow).toEqual(["/a", "/b"]);
    expect(rules.allow).toEqual(["/c"]);
  });

  it("treats an empty Disallow value as no restriction (per the robots.txt spec)", () => {
    const text = ["User-agent: *", "Disallow:"].join("\n");
    expect(isAllowedByRobots(text, "/anything")).toBe(true);
  });

  it("ignores comment lines", () => {
    const text = ["# comment", "User-agent: *", "# another comment", "Disallow: /admin"].join("\n");
    expect(isAllowedByRobots(text, "/admin")).toBe(false);
    expect(isAllowedByRobots(text, "/public")).toBe(true);
  });
});
