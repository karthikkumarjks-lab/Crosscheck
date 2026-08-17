/**
 * Expands Indian numbering-system magnitude words ("lakh"/"lac" = 100,000,
 * "crore" = 10,000,000) into a plain digit-grouped amount BEFORE the
 * existing currency normalizer (`normalize.ts`, unchanged) ever sees the
 * text — so "₹1.5 lakh" and "₹1,50,000" resolve to the exact same
 * `normalizeClaim` output and compare as equal. Scoped to the Priority
 * Fee Structure field only (`priorityComparison.ts`'s own call site) —
 * deliberately not applied inside the shared `normalize.ts` used by the
 * legacy Sprint 4 comparison pipeline, to avoid changing behavior nothing
 * asked to change there.
 */

const LAKH_CRORE_PATTERN = /(₹|Rs\.?|INR)?\s*(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|crore|crores)\b/gi;

export function expandIndianMagnitudeWords(text: string): string {
  return text.replace(LAKH_CRORE_PATTERN, (match, currencyPrefix: string | undefined, numStr: string, word: string) => {
    const num = Number(numStr);
    if (!Number.isFinite(num)) return match;
    const multiplier = /crore/i.test(word) ? 10_000_000 : 100_000;
    const amount = Math.round(num * multiplier);
    return `${currencyPrefix ?? "₹"}${amount.toLocaleString("en-IN")}`;
  });
}
