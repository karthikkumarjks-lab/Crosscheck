/**
 * Value-level normalization for the semantic fact layer (§5 of the plan):
 * "Data Science & Analytics" and "Data Science and Analytics" should
 * compare equal; "Cloud Computing Specialization" should compare equal to
 * "Cloud Computing". Deliberately narrower than a general text
 * normalizer — it removes decorative/structural noise only, never a
 * meaningful word, and never attempts spelling correction or synonym
 * substitution (that's the classifier's job, not this one's).
 */

const LEADING_BULLET_PATTERN = /^[\s•◦▪➤●○*\-–—]+/;
const TRAILING_BULLET_PATTERN = /[\s•◦▪➤●○*\-–—]+$/;

/** Trailing qualifier words that add no distinguishing meaning once a
 * value has already been scoped to a specific semantic field (e.g. inside
 * a Specializations section, "Cloud Computing Specialization" and "Cloud
 * Computing" name the same thing) — stripped only from the END of a
 * value, never the middle, so "Specialization in Data Science" (a
 * meaningfully different phrasing, word not at the end) is untouched. */
const BOILERPLATE_SUFFIXES = [/\s*\(optional\)\s*$/i, /\s*specialization\s*$/i, /\s*specialisation\s*$/i, /\s*elective\s*$/i, /\s*track\s*$/i];

function stripBullets(value: string): string {
  return value.replace(LEADING_BULLET_PATTERN, "").replace(TRAILING_BULLET_PATTERN, "");
}

function stripBoilerplateSuffix(value: string): string {
  let result = value;
  for (const pattern of BOILERPLATE_SUFFIXES) {
    const stripped = result.replace(pattern, "");
    // Never strip down to nothing -- a value that IS just "Specialization"
    // stays as-is rather than becoming an empty string.
    if (stripped.trim().length > 0) result = stripped;
  }
  return result;
}

/**
 * Normalizes one extracted value for semantic comparison: collapses
 * whitespace, strips decorative bullets/leading-trailing punctuation,
 * folds "&" to "and" (so both spellings compare equal), strips a
 * trailing boilerplate qualifier word, then lowercases. The result is a
 * COMPARISON key, not a display value -- callers keep the original raw
 * text for display/evidence.
 */
export function normalizeSemanticValue(rawValue: string): string {
  let value = rawValue.replace(/\s+/g, " ").trim();
  value = stripBullets(value);
  value = value.replace(/\s*&\s*/g, " and ");
  value = stripBoilerplateSuffix(value);
  value = value.replace(/[.,;:]+$/g, "");
  value = value.replace(/\s+/g, " ").trim();
  return value.toLowerCase();
}

/** Strips a known leading program/degree phrase (e.g. "MBA") from a
 * specialization value before comparison, so "MBA Healthcare Management"
 * and "Healthcare Management" are recognized as the same specialization
 * once the comparison already knows this run's program is MBA. Only
 * strips the EXACT resolved program text for this comparison — never a
 * static dictionary of degree names — so it can never mis-fire on an
 * unrelated program. */
export function stripProgramPrefix(value: string, programHint: string | null): string {
  if (!programHint) return value;
  const trimmedHint = programHint.trim();
  if (!trimmedHint) return value;
  const pattern = new RegExp(`^${trimmedHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
  return value.replace(pattern, "").trim();
}
