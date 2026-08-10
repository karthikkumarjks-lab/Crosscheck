export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finds the first case-insensitive, word-bounded occurrence of `needle` in `haystack`. */
export function findWordBounded(haystack: string, needle: string): boolean {
  const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`, "i");
  return pattern.test(haystack);
}

export function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
