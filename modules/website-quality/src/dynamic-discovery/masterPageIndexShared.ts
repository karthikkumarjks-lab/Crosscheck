import type {
  DiscoveryPageIdentity,
  EntityGuess,
  IdentityGateSignals,
  InstitutionRelevanceGateConfig,
  InstitutionResolutionResult,
  LandingPageAnalysis,
  ParsedLandingPage,
} from "@crosscheck/core";
import {
  evaluateInstitutionTextSignals,
  needsLogoTiebreak,
  passesInstitutionRelevanceGate,
  resolveInstitutionIdentity,
  sourceRegistry,
  type InstitutionGateEvaluation,
} from "@crosscheck/core";
import type { Understanding } from "../understanding/index.js";
import { detectLogoCandidates } from "../identity/extractIdentitySignals.js";
import { hashSimilarity, type LogoHashResolver, type SvgStructuralTextResolver } from "../identity/logoHash.js";

/** Extracted from Sprint 5's original `crawlCandidates.ts` so
 * `buildMasterPageIndex.ts`, `crawlCandidates.ts`, and
 * `discoverAndCompareMany.ts` can all share the exact same URL
 * normalization / identity-construction logic without duplicating it or
 * importing from each other. */

export function toDiscoveryPageIdentity(url: string, parsed: ParsedLandingPage, understanding: Understanding): DiscoveryPageIdentity {
  return {
    url,
    title: parsed.title,
    headings: parsed.headings.map((h) => h.text),
    degree: understanding.degree,
    program: understanding.program,
    institution: understanding.institution,
    brand: understanding.brand,
    pageType: understanding.pageType,
    specializations: understanding.specializations.length > 0 ? understanding.specializations.map((c) => c.rawValue) : null,
  };
}

/** Extracted verbatim from Sprint 5's `resolveAuthoritativePage.ts` so
 * `discoverAndCompareMany.ts` (Sprint 5B) can build a target's identity
 * for index matching the exact same way single-target resolution already
 * does, without duplicating the logic. */
export function targetIdentityFromAnalysis(analysis: LandingPageAnalysis): DiscoveryPageIdentity {
  // Callers only reach this point once analysis.understanding is known
  // non-null (checked by the caller, right after ingestion succeeds).
  const understanding = analysis.understanding!;
  return {
    url: analysis.ingestion.finalUrl,
    title: analysis.extraction?.title ?? null,
    headings: (analysis.extraction?.headings ?? []).map((heading) => heading.text),
    degree: understanding.degree,
    program: understanding.program,
    institution: understanding.institution,
    brand: understanding.brand,
    pageType: understanding.pageType,
    specializations: understanding.specializations.length > 0 ? understanding.specializations.map((c) => c.rawValue) : null,
  };
}

/** Shared by every caller that needs a best-effort hostname for
 * display/evidence purposes (never for security decisions — SSRF/domain-
 * boundary checks use their own, more specific logic). Extracted here so
 * `buildMasterPageIndex.ts`, `crawlCandidates.ts`, and
 * `resolveAuthoritativePage.ts` don't each define their own copy. */
export function hostnameOrEmpty(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Same subdomain-inclusive comparison as Sprint 3's `matchesUrlPattern`
 * (packages/core/src/source-resolution/resolve.ts) — independent of, and
 * checked separately from, safeFetch's IP-level SSRF protection. */
export function isWithinDomainBoundary(url: string, masterHostname: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hostname === masterHostname || hostname.endsWith(`.${masterHostname}`);
}

/** D1 fix — the single-pair Institution Relevance Gate evaluation: text
 * signals first (free), the lazy/cached logo tiebreak only when both text
 * signals are inconclusive and both sides have a detected logo. Extracted
 * here so both the dynamic-discovery candidate loop
 * (`discoverAndCompareMany.ts`) and the registry path (`resolveAuthoritativePage.ts`,
 * `discoverAndCompareMany.ts`) evaluate one (target, candidate) pair
 * exactly the same way — the registry's pre-recorded page is now treated
 * as a single candidate that must also pass Identity Resolution, never a
 * bypass. */
export async function evaluateInstitutionGateForPair(
  target: IdentityGateSignals,
  candidate: IdentityGateSignals,
  gateConfig: InstitutionRelevanceGateConfig,
  resolveLogoHash: LogoHashResolver,
): Promise<InstitutionGateEvaluation> {
  const text = evaluateInstitutionTextSignals(target, candidate);
  let similarity: number | null = null;
  if (needsLogoTiebreak(text, target, candidate) && target.logo.imageUrl && candidate.logo.imageUrl) {
    const [targetHash, candidateHash] = await Promise.all([resolveLogoHash(target.logo.imageUrl), resolveLogoHash(candidate.logo.imageUrl)]);
    if (targetHash && candidateHash) similarity = hashSimilarity(targetHash, candidateHash);
  }
  return passesInstitutionRelevanceGate(target, candidate, gateConfig, similarity);
}

/**
 * Component: D1 follow-up — standalone "Institution Identity Resolution"
 * for one target, combining the URL/page/logo signal tiers plus the
 * explicit multi-university default (`packages/core`'s
 * `resolveInstitutionIdentity`, pure). This is *who the target is*,
 * resolved independently of any specific candidate page — evaluated before
 * the registry accept/reject decision and before Program Resolution,
 * matching the approved pipeline order literally.
 *
 * The SVG-structural-text network fetch is spent lazily and only when it
 * could actually change the outcome: never when the URL or page-text tier
 * already resolved a specific institution (the common case for explicit
 * `-mahe`/`-muj`/`-smu` URLs), and only for the specific SVG candidates
 * that don't already carry usable text — never every logo on the page,
 * never unconditionally per target.
 */
export async function resolveTargetInstitutionIdentity(
  targetUrl: string,
  masterUrl: string,
  html: string,
  understanding: { institution: EntityGuess | null; degree: EntityGuess | null },
  resolveSvgStructuralText: SvgStructuralTextResolver,
): Promise<InstitutionResolutionResult> {
  const logoCandidates = detectLogoCandidates(html, targetUrl);

  const cheapResult = resolveInstitutionIdentity(
    { targetUrl, masterUrl, institutionGuess: understanding.institution, programGuess: understanding.degree, logoCandidates },
    sourceRegistry,
  );

  const urlOrPageAlreadyResolved = cheapResult.signals.url.institutionId !== null || cheapResult.signals.pageIdentity.institutionId !== null;
  const logoAlreadyResolved = cheapResult.signals.logo.institutionId !== null;
  if (urlOrPageAlreadyResolved || logoAlreadyResolved) {
    return cheapResult;
  }

  const svgCandidatesNeedingFetch = logoCandidates.filter((c) => c.isSvg && c.imageUrl && !c.svgStructuralText);
  if (svgCandidatesNeedingFetch.length === 0) {
    return cheapResult;
  }

  const enrichedCandidates = await Promise.all(
    logoCandidates.map(async (candidate) => {
      if (candidate.isSvg && candidate.imageUrl && !candidate.svgStructuralText) {
        const svgStructuralText = await resolveSvgStructuralText(candidate.imageUrl);
        return { ...candidate, svgStructuralText };
      }
      return candidate;
    }),
  );

  return resolveInstitutionIdentity(
    { targetUrl, masterUrl, institutionGuess: understanding.institution, programGuess: understanding.degree, logoCandidates: enrichedCandidates },
    sourceRegistry,
  );
}
