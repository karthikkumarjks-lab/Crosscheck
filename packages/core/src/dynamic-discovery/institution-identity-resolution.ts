import type {
  EntityGuess,
  Institution,
  InstitutionResolutionMethod,
  InstitutionResolutionResult,
  InstitutionSignalResult,
  LogoCandidateSignal,
  Program,
  SourceRegistry,
} from "../types.js";

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesUrlPattern(hostname: string, pattern: string): boolean {
  const normalizedPattern = pattern.toLowerCase();
  return hostname === normalizedPattern || hostname.endsWith(`.${normalizedPattern}`);
}

/**
 * Checks a list of already-extracted candidate strings (a URL token, a
 * page-text guess, a logo's alt/filename/structural text — any of them)
 * against every registered institution's `name`/`aliases` ONLY.
 *
 * Deliberately excludes `Institution.brandNames`: a brand like "Online
 * Manipal" is, by definition, shared across multiple institutions (D1's
 * root cause) — matching it here would let a generic, non-specific signal
 * masquerade as having identified one particular institution, silently
 * reintroducing the exact bug this resolver exists to close.
 * `brandNames` remains valid for its original purpose
 * (`resolveSource`'s own institution-alias fallback, unrelated/untouched).
 */
export function matchSpecificInstitution(
  candidateTexts: (string | null | undefined)[],
  registry: SourceRegistry,
): { institution: Institution; matchedText: string } | null {
  for (const text of candidateTexts) {
    if (!text) continue;
    const normalized = normalizeForComparison(text);
    if (!normalized) continue;
    for (const institution of registry.institutions) {
      const identifiers = [institution.name, ...institution.aliases];
      if (identifiers.some((identifier) => normalizeForComparison(identifier) === normalized)) {
        return { institution, matchedText: text };
      }
    }
  }
  return null;
}

function urlPathTokens(url: string): string[] {
  try {
    const { pathname } = new URL(url);
    return pathname
      .split("/")
      .filter(Boolean)
      .flatMap((segment) => segment.split(/[-_.]+/))
      .filter((token) => token.length > 0);
  } catch {
    return [];
  }
}

/** Precedence tier 1 — an explicit institution identifier in the target
 * URL's path (e.g. `-mahe`/`-smu`/`-muj` slug tokens). Pure string
 * matching against registry data; no network, no DOM. */
export function resolveUrlInstitutionSignal(targetUrl: string, registry: SourceRegistry): InstitutionSignalResult {
  const tokens = urlPathTokens(targetUrl);
  const match = matchSpecificInstitution(tokens, registry);
  if (match) {
    return { institutionId: match.institution.id, strength: "strong", evidence: `URL token "${match.matchedText}"` };
  }
  return { institutionId: null, strength: "none", evidence: "no institution identifier found in the URL path" };
}

/** Precedence tier 2 — the page's own already-extracted institution text
 * (Sprint 2/4b's `understanding.institution`, unchanged extraction). A
 * present-but-generic guess (matches nothing specific — the "Online
 * Manipal" case) is reported as "weak" evidence, not "none": something was
 * genuinely found, it just isn't institution-specific, which matters for
 * legible evidence even though it never resolves anything by itself. */
export function resolvePageInstitutionSignal(institutionGuess: EntityGuess | null, registry: SourceRegistry): InstitutionSignalResult {
  if (!institutionGuess || !institutionGuess.value) {
    return { institutionId: null, strength: "none", evidence: "no institution text detected on the page" };
  }
  const match = matchSpecificInstitution([institutionGuess.value], registry);
  if (match) {
    return { institutionId: match.institution.id, strength: "strong", evidence: `page text "${match.matchedText}"` };
  }
  return {
    institutionId: null,
    strength: "weak",
    evidence: `page text "${institutionGuess.value}" does not specifically name a known institution`,
  };
}

/** Precedence tier 3 — logo evidence. Only a candidate whose alt text,
 * filename tokens, surrounding link/caption text, or (for SVG) structural
 * metadata *independently* names a known institution ever contributes —
 * an accreditation/regulatory/partner/vendor logo that matches nothing
 * known is recorded (for evidence legibility) but never treated as
 * identity evidence merely for existing on the page. If different logo
 * candidates on the same page identify *different* institutions, that is
 * itself unresolved — never arbitrarily pick the first one. */
export function resolveLogoInstitutionSignal(candidates: LogoCandidateSignal[], registry: SourceRegistry): InstitutionSignalResult {
  if (candidates.length === 0) {
    return { institutionId: null, strength: "none", evidence: "no logo detected on the page" };
  }

  const matchedInstitutionIds = new Set<string>();
  let firstMatch: { institution: Institution; matchedText: string; imageUrl: string | null } | null = null;
  let anyCandidateWithText = false;

  for (const candidate of candidates) {
    const texts = [candidate.altText, ...candidate.filenameTokens, candidate.surroundingText, candidate.svgStructuralText];
    if (texts.some((t) => !!t)) anyCandidateWithText = true;
    const match = matchSpecificInstitution(texts, registry);
    if (match) {
      matchedInstitutionIds.add(match.institution.id);
      if (!firstMatch) firstMatch = { institution: match.institution, matchedText: match.matchedText, imageUrl: candidate.imageUrl };
    }
  }

  if (matchedInstitutionIds.size > 1) {
    return {
      institutionId: null,
      strength: "weak",
      evidence: `multiple logo candidates identify different institutions (${[...matchedInstitutionIds].join(", ")}) — not used`,
    };
  }
  if (firstMatch) {
    return {
      institutionId: firstMatch.institution.id,
      strength: "strong",
      evidence: `logo ${firstMatch.imageUrl ?? "(inline svg)"} identifies "${firstMatch.matchedText}"`,
    };
  }
  if (!anyCandidateWithText) {
    return {
      institutionId: null,
      strength: "none",
      evidence: `${candidates.length} logo candidate(s) found but none had usable alt/filename/structural text`,
    };
  }
  return {
    institutionId: null,
    strength: "weak",
    evidence: "logo candidate(s) found but none matched a known institution (e.g. accreditation/partner/vendor logos)",
  };
}

function programMatches(program: Program, guessValue: string): boolean {
  const normalizedGuess = normalizeForComparison(guessValue);
  return [program.name, ...program.aliases].some((candidate) => normalizeForComparison(candidate) === normalizedGuess);
}

export interface MultiUniversityDefaultResult {
  institution: Institution | null;
  method: "multi_university_default" | "single_university_default" | null;
}

/**
 * Precedence tier 4 (last resort) — the explicit, deliberate business
 * fallback. Whether a program is "multi-university" is *derived* from
 * registry data (how many distinct institutions have a `Program` record
 * matching this name/alias), never hardcoded to any specific program name.
 * The multi-university default institution is likewise derived — whichever
 * known participant actually has a registered `Source` reachable at this
 * Master domain — so "MUJ" is a consequence of today's registry data (only
 * MUJ has a Source on `onlinemanipal.com`), never a literal special case in
 * this function. If zero or more than one participant is reachable here,
 * this returns no default rather than guessing.
 */
export function resolveMultiUniversityDefault(
  programGuess: EntityGuess | null,
  masterUrl: string,
  registry: SourceRegistry,
): MultiUniversityDefaultResult {
  if (!programGuess || !programGuess.value) return { institution: null, method: null };

  const matchingPrograms = registry.programs.filter((program) => programMatches(program, programGuess.value));
  const participantInstitutionIds = [...new Set(matchingPrograms.map((program) => program.institutionId))];
  if (participantInstitutionIds.length === 0) return { institution: null, method: null };

  if (participantInstitutionIds.length === 1) {
    const institution = registry.institutions.find((i) => i.id === participantInstitutionIds[0]) ?? null;
    return { institution, method: institution ? "single_university_default" : null };
  }

  const hostname = hostnameOf(masterUrl);
  if (!hostname) return { institution: null, method: null };

  const reachableInstitutionIds = new Set(
    registry.sources
      .filter((source) => participantInstitutionIds.includes(source.institutionId))
      .filter((source) => source.urlPatterns.some((pattern) => matchesUrlPattern(hostname, pattern)))
      .map((source) => source.institutionId),
  );
  if (reachableInstitutionIds.size !== 1) return { institution: null, method: null };

  const institution = registry.institutions.find((i) => i.id === [...reachableInstitutionIds][0]) ?? null;
  return { institution, method: institution ? "multi_university_default" : null };
}

export interface InstitutionIdentityInput {
  targetUrl: string;
  masterUrl: string;
  institutionGuess: EntityGuess | null;
  programGuess: EntityGuess | null;
  logoCandidates: LogoCandidateSignal[];
}

const METHOD_FOR_TIER: Record<"url" | "pageIdentity" | "logo", InstitutionResolutionMethod> = {
  url: "url_identifier",
  pageIdentity: "page_identity",
  logo: "logo",
};

/**
 * Component: standalone Institution Identity Resolution — the "Institution
 * Identity Resolution" pipeline stage, evaluated before Program Resolution/
 * Authoritative Page Selection, independent of any specific candidate page.
 * Combines the three signal tiers (URL, page text, logo) plus the explicit
 * multi/single-university default. A tier only ever contributes when it
 * names one *specific* institution (`strength: "strong"`, non-null
 * `institutionId`) — "weak"/"none" tiers are recorded as evidence but never
 * resolve or corroborate anything, so a single generic/shared-brand signal
 * (D1's original root cause) can never be silently trusted. Two or more
 * contributing tiers naming *different* institutions is always a conflict,
 * regardless of which tiers they are — never silently resolved.
 */
export function resolveInstitutionIdentity(input: InstitutionIdentityInput, registry: SourceRegistry): InstitutionResolutionResult {
  const url = resolveUrlInstitutionSignal(input.targetUrl, registry);
  const pageIdentity = resolvePageInstitutionSignal(input.institutionGuess, registry);
  const logo = resolveLogoInstitutionSignal(input.logoCandidates, registry);
  const signals = { url, pageIdentity, logo };

  const contributors = (["url", "pageIdentity", "logo"] as const)
    .map((tier) => ({ tier, result: signals[tier] }))
    .filter((c) => c.result.institutionId !== null);

  const distinctIds = [...new Set(contributors.map((c) => c.result.institutionId as string))];

  if (distinctIds.length > 1) {
    return {
      institutionId: null,
      institutionName: null,
      status: "conflict",
      resolutionMethod: "conflict",
      signals,
      fallbackApplied: false,
      conflictingInstitutionIds: distinctIds,
    };
  }

  if (distinctIds.length === 1) {
    const institution = registry.institutions.find((i) => i.id === distinctIds[0]) ?? null;
    const method: InstitutionResolutionMethod = contributors.length > 1 ? "combined_signals" : METHOD_FOR_TIER[contributors[0].tier];
    return {
      institutionId: distinctIds[0],
      institutionName: institution?.name ?? null,
      status: "resolved",
      resolutionMethod: method,
      signals,
      fallbackApplied: false,
    };
  }

  // No tier named a specific institution -- the explicit, evidenced
  // business-policy fallback, never silently reusing a "weak"/generic
  // signal as if it were a detection.
  const fallback = resolveMultiUniversityDefault(input.programGuess, input.masterUrl, registry);
  if (fallback.institution && fallback.method) {
    return {
      institutionId: fallback.institution.id,
      institutionName: fallback.institution.name,
      status: "resolved",
      resolutionMethod: fallback.method,
      signals,
      fallbackApplied: true,
    };
  }

  return {
    institutionId: null,
    institutionName: null,
    status: "unresolved",
    resolutionMethod: "unresolved",
    signals,
    fallbackApplied: false,
  };
}
