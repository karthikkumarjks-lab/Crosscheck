import type { CurrencyDefinition } from "../types.js";

/**
 * Sprint 4 MVP currency set (docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md
 * "Decisions Requiring Approval" #9): INR, USD, EUR, GBP. Adding a
 * currency later is a new entry here — normalizeCurrency and every
 * ComparisonRule are unaffected by how many entries this table holds.
 */
export const CURRENCY_REGISTRY: CurrencyDefinition[] = [
  { code: "INR", symbols: ["₹", "Rs.", "Rs", "INR"], groupingStyle: "indian" },
  { code: "USD", symbols: ["$", "USD"], groupingStyle: "western" },
  { code: "EUR", symbols: ["€", "EUR"], groupingStyle: "western" },
  { code: "GBP", symbols: ["£", "GBP"], groupingStyle: "western" },
];
