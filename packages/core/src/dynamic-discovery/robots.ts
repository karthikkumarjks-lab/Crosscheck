interface RobotsGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
}

interface ParsedRobotsRules {
  disallow: string[];
  allow: string[];
}

const WILDCARD_AGENT = "*";

function parseGroups(text: string): RobotsGroup[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);

  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "user-agent") {
      // A fresh "User-agent:" line right after another starts a new
      // group only once that group already has rules — consecutive
      // "User-agent:" lines with no rules between them belong to the
      // same group (the standard "these agents share these rules" form).
      if (!current || current.disallow.length > 0 || current.allow.length > 0) {
        current = { agents: [value], disallow: [], allow: [] };
        groups.push(current);
      } else {
        current.agents.push(value);
      }
    } else if (key === "disallow" && current && value) {
      current.disallow.push(value);
    } else if (key === "allow" && current && value) {
      current.allow.push(value);
    }
  }

  return groups;
}

/**
 * Component: robots.txt parsing (Sprint 5, §6/§11). Extracts the
 * Disallow/Allow rule set for a given user-agent group, falling back to
 * the wildcard "*" group. Malformed input never throws — robots.txt is a
 * courtesy/compliance control, not a security boundary (§11), so parse
 * failures fail open (no rules = allow-all) rather than blocking a
 * legitimate crawl.
 */
export function parseRobotsTxt(text: string, userAgent: string = WILDCARD_AGENT): ParsedRobotsRules {
  const groups = parseGroups(text);
  const exact = groups.find((g) => g.agents.some((a) => a.toLowerCase() === userAgent.toLowerCase()));
  const wildcard = groups.find((g) => g.agents.some((a) => a === WILDCARD_AGENT));
  const match = exact ?? wildcard;
  return { disallow: match?.disallow ?? [], allow: match?.allow ?? [] };
}

/**
 * Longest-matching-rule-wins, the de facto standard robots.txt semantics
 * (an Allow rule only overrides a Disallow rule covering the same path if
 * it is at least as specific). Fails open on any parse error.
 */
export function isAllowedByRobots(text: string, path: string, userAgent: string = WILDCARD_AGENT): boolean {
  let rules: ParsedRobotsRules;
  try {
    rules = parseRobotsTxt(text, userAgent);
  } catch {
    return true;
  }

  const matchingDisallow = rules.disallow.filter((rule) => path.startsWith(rule));
  if (matchingDisallow.length === 0) return true;

  const matchingAllow = rules.allow.filter((rule) => path.startsWith(rule));
  const longestDisallow = Math.max(...matchingDisallow.map((rule) => rule.length));
  const longestAllow = matchingAllow.length > 0 ? Math.max(...matchingAllow.map((rule) => rule.length)) : -1;

  return longestAllow > longestDisallow;
}
