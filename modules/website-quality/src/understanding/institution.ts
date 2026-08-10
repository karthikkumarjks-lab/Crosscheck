import type { Confidence, EntityGuess, EntityMatchSignal, ParsedLandingPage } from "@crosscheck/core";
import { institutionPatterns } from "../data/index.js";
import { escapeRegExp, findWordBounded, normalizeForComparison } from "./util.js";

function getStringProp(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

interface Candidate {
  value: string;
  confidence: Confidence;
  signal: EntityMatchSignal;
}

function findJsonLdCandidates(parsed: ParsedLandingPage): { orgName: string | null; brandName: string | null } {
  let orgName: string | null = null;
  let brandName: string | null = null;

  for (const entry of parsed.structuredData) {
    if (entry.source !== "json-ld") continue;

    const typeRaw = entry["@type"];
    const types = Array.isArray(typeRaw) ? typeRaw : typeRaw ? [typeRaw] : [];
    const isOrg = types.some(
      (t) => typeof t === "string" && /organization|collegeoruniversity|educationalorganization/i.test(t),
    );
    const name = getStringProp(entry, "name");
    if (!orgName && isOrg && name) {
      orgName = name;
    }

    if (!brandName) {
      const brandRaw = entry.brand;
      if (typeof brandRaw === "string" && brandRaw.trim()) {
        brandName = brandRaw.trim();
      } else if (brandRaw && typeof brandRaw === "object") {
        const nested = getStringProp(brandRaw as Record<string, unknown>, "name");
        if (nested) brandName = nested;
      }
    }
  }

  return { orgName, brandName };
}

function findOgSiteName(parsed: ParsedLandingPage): string | null {
  const ogEntry = parsed.structuredData.find((entry) => entry.source === "opengraph");
  return ogEntry ? getStringProp(ogEntry, "og:site_name") : null;
}

function findTitleSuffixCandidate(parsed: ParsedLandingPage): string | null {
  if (!parsed.title) return null;
  // Alternation, not a character class — a class built from these
  // separators risks an unintended range (e.g. "|" to "–").
  const separatorPattern = institutionPatterns.titleSeparators.map(escapeRegExp).join("|");
  const parts = parsed.title
    .split(new RegExp(separatorPattern))
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (institutionPatterns.institutionTypeWords.some((word) => findWordBounded(part, word))) {
      return part;
    }
  }
  return null;
}

function findCopyrightCandidate(parsed: ParsedLandingPage): string | null {
  for (const patternSource of institutionPatterns.copyrightPatterns) {
    const pattern = new RegExp(patternSource, "i");
    const match = pattern.exec(parsed.mainText);
    if (match?.[1]) {
      const candidate = match[1]
        .split(/\ball rights reserved\b/i)[0]
        .replace(/[.,]\s*$/, "")
        .trim();
      if (candidate.length > 0 && candidate.length < 100) return candidate;
    }
  }
  return null;
}

/**
 * Component C — generic institution/brand identification. Deliberately
 * does not use a per-institution registry (that's reserved for Source
 * Resolution — see docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md
 * "Relationship to the Sprint 1 Design"). Combines structured data,
 * meta tags, title structure, and footer copyright text, all generic
 * signals that work on any institution's page.
 */
export function matchInstitutionAndBrand(
  parsed: ParsedLandingPage,
): { institution: EntityGuess | null; brand: EntityGuess | null } {
  const { orgName, brandName } = findJsonLdCandidates(parsed);
  const ogSiteName = findOgSiteName(parsed);
  const titleSuffix = findTitleSuffixCandidate(parsed);
  const copyright = findCopyrightCandidate(parsed);

  const institutionCandidates: Candidate[] = [];
  if (orgName) {
    institutionCandidates.push({
      value: orgName,
      confidence: "high",
      signal: { signalType: "structured_data", matchedText: orgName, location: "structured_data" },
    });
  }
  if (ogSiteName) {
    institutionCandidates.push({
      value: ogSiteName,
      confidence: "medium",
      signal: { signalType: "meta_tag", matchedText: ogSiteName, location: "meta" },
    });
  }
  if (titleSuffix) {
    institutionCandidates.push({
      value: titleSuffix,
      confidence: "medium",
      signal: { signalType: "keyword_heuristic", matchedText: titleSuffix, location: "title" },
    });
  }
  if (copyright) {
    institutionCandidates.push({
      value: copyright,
      confidence: "low",
      signal: { signalType: "keyword_heuristic", matchedText: copyright, location: "body" },
    });
  }

  let institution: EntityGuess | null = null;
  if (institutionCandidates.length > 0) {
    const primary = institutionCandidates[0];
    const agreeing = institutionCandidates.filter(
      (c) => normalizeForComparison(c.value) === normalizeForComparison(primary.value),
    );
    institution = {
      value: primary.value,
      confidence: agreeing.length > 1 ? "high" : primary.confidence,
      matchedSignals: agreeing.map((c) => c.signal),
    };
  }

  let brand: EntityGuess | null = null;
  if (brandName) {
    brand = {
      value: brandName,
      confidence: "high",
      matchedSignals: [{ signalType: "structured_data", matchedText: brandName, location: "structured_data" }],
    };
  } else if (ogSiteName && institution && normalizeForComparison(ogSiteName) !== normalizeForComparison(institution.value)) {
    brand = {
      value: ogSiteName,
      confidence: "medium",
      matchedSignals: [{ signalType: "meta_tag", matchedText: ogSiteName, location: "meta" }],
    };
  }

  return { institution, brand };
}
