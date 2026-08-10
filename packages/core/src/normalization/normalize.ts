import type {
  ExtractedClaim,
  NormalizationStatus,
  NormalizedClaim,
  NormalizedType,
} from "../types.js";
import { CURRENCY_REGISTRY } from "./currency-registry.js";
import { DURATION_UNIT_REGISTRY } from "./duration-registry.js";

/**
 * Which normalizer applies to each currently-extracted field
 * (`modules/website-quality/src/data/claim-field-labels.json`'s field
 * set). Unknown field keys default to "text" rather than throwing, so a
 * future new field never crashes normalization — it just gets the most
 * conservative treatment until a more specific normalizer is added.
 */
const FIELD_TYPE_BY_KEY: Record<string, NormalizedType> = {
  duration: "duration_months",
  fees: "currency",
  eligibility: "text",
  mode: "text",
  accreditation: "text",
};

type TextResult = { status: "NORMALIZED"; value: string } | { status: Exclude<NormalizationStatus, "NORMALIZED"> };

function normalizeText(rawValue: string): TextResult {
  const trimmed = rawValue.replace(/\s+/g, " ").trim();
  if (!trimmed) return { status: "NOT_FOUND" };
  // Case-folded for comparison; the original casing remains available via
  // NormalizedClaim.raw for display.
  return { status: "NORMALIZED", value: trimmed.toLowerCase() };
}

type DurationResult =
  | { status: "NORMALIZED"; months: number }
  | { status: Exclude<NormalizationStatus, "NORMALIZED">; notes?: string };

// Generic "is there anything duration-shaped here at all" scanner, used
// only to detect unit words the registry doesn't recognize (e.g.
// "quarters", "trimesters") — independent of DURATION_UNIT_REGISTRY so
// adding a registry entry never changes what counts as "duration-shaped".
const ANY_NUMBER_UNIT_PATTERN = /\d+(?:\.\d+)?\s*-?\s*[A-Za-z]+/g;

function normalizeDuration(rawValue: string): DurationResult {
  const recognizedMonths = new Set<number>();
  let recognizedMatchCount = 0;

  for (const unitDef of DURATION_UNIT_REGISTRY) {
    for (const pattern of unitDef.patterns) {
      const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
      const re = new RegExp(pattern.source, flags);
      for (const match of rawValue.matchAll(re)) {
        recognizedMatchCount += 1;
        recognizedMonths.add(Number(match[1]) * unitDef.monthsPerUnit);
      }
    }
  }

  const anyMatches = [...rawValue.matchAll(ANY_NUMBER_UNIT_PATTERN)];

  if (anyMatches.length === 0) return { status: "NOT_FOUND" };
  if (recognizedMatchCount === 0) {
    return { status: "UNSUPPORTED_FORMAT", notes: `no recognized duration unit in "${rawValue}"` };
  }
  if (recognizedMonths.size > 1 || recognizedMatchCount < anyMatches.length) {
    return { status: "AMBIGUOUS", notes: `multiple candidate durations found in "${rawValue}"` };
  }
  return { status: "NORMALIZED", months: [...recognizedMonths][0] };
}

type CurrencyResult =
  | { status: "NORMALIZED"; amount: number; code: string }
  | { status: Exclude<NormalizationStatus, "NORMALIZED">; notes?: string };

const AMOUNT_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

function symbolAppears(rawValue: string, symbol: string): boolean {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const leadingWordy = /^[A-Za-z]/.test(symbol);
  const trailingWordy = /[A-Za-z]$/.test(symbol);
  const pattern = `${leadingWordy ? "\\b" : ""}${escaped}${trailingWordy ? "\\b" : ""}`;
  return new RegExp(pattern, "i").test(rawValue);
}

function isValidGrouping(raw: string, style: "western" | "indian"): boolean {
  if (!raw.includes(",")) return true;
  const pattern = style === "western" ? /^\d{1,3}(,\d{3})+(\.\d+)?$/ : /^\d{1,2}(,\d{2})*,\d{3}(\.\d+)?$/;
  return pattern.test(raw);
}

function normalizeCurrency(rawValue: string): CurrencyResult {
  const amountMatches = [...rawValue.matchAll(AMOUNT_PATTERN)];
  const matchedCurrencies = CURRENCY_REGISTRY.filter((def) => def.symbols.some((symbol) => symbolAppears(rawValue, symbol)));

  if (amountMatches.length === 0 && matchedCurrencies.length === 0) {
    return { status: "NOT_FOUND" };
  }
  if (matchedCurrencies.length === 0) {
    return { status: "UNSUPPORTED_FORMAT", notes: `no recognized currency symbol/code in "${rawValue}"` };
  }
  if (amountMatches.length === 0) {
    return { status: "NOT_FOUND", notes: `currency recognized but no amount found in "${rawValue}"` };
  }
  if (matchedCurrencies.length > 1) {
    return {
      status: "AMBIGUOUS",
      notes: `multiple currencies referenced (${matchedCurrencies.map((c) => c.code).join(", ")}) in "${rawValue}"`,
    };
  }

  const currency = matchedCurrencies[0];
  const validAmounts = amountMatches.map((m) => m[0]).filter((raw) => isValidGrouping(raw, currency.groupingStyle));

  if (validAmounts.length === 0) {
    return { status: "UNSUPPORTED_FORMAT", notes: `amount format not valid for ${currency.code} in "${rawValue}"` };
  }

  const distinctAmounts = new Set(validAmounts.map((raw) => Number(raw.replace(/,/g, ""))));
  if (distinctAmounts.size > 1) {
    return { status: "AMBIGUOUS", notes: `multiple amounts found for ${currency.code} in "${rawValue}"` };
  }

  return { status: "NORMALIZED", amount: [...distinctAmounts][0], code: currency.code };
}

/**
 * Component: Claim Normalization (Sprint 4). Dispatches by field type —
 * text / registry-driven duration / registry-driven currency — and always
 * reports one of four explicit statuses. A claim that couldn't be
 * normalized is never silently treated as if it didn't exist; see
 * docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md "Normalization Strategy".
 */
export function normalizeClaim(claim: ExtractedClaim): NormalizedClaim {
  const normalizedType = FIELD_TYPE_BY_KEY[claim.fieldKey] ?? "text";
  const base = { fieldKey: claim.fieldKey, raw: claim, normalizedType };

  if (normalizedType === "duration_months") {
    const result = normalizeDuration(claim.rawValue);
    return result.status === "NORMALIZED"
      ? { ...base, status: result.status, normalizedValue: result.months }
      : { ...base, status: result.status, normalizationNotes: result.notes };
  }

  if (normalizedType === "currency") {
    const result = normalizeCurrency(claim.rawValue);
    return result.status === "NORMALIZED"
      ? { ...base, status: result.status, normalizedValue: result.amount, currencyCode: result.code }
      : { ...base, status: result.status, normalizationNotes: result.notes };
  }

  const result = normalizeText(claim.rawValue);
  return result.status === "NORMALIZED"
    ? { ...base, status: result.status, normalizedValue: result.value }
    : { ...base, status: result.status };
}
