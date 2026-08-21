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

/** The URL path as a single space-joined phrase (e.g.
 * `/online-mba-manipal-university-jaipur` -> `"online mba manipal
 * university jaipur"`), for matching a MULTI-word identifier — a full
 * institution name, or a multi-word alias like "Manipal University,
 * Jaipur" — that a single hyphen-split token can never match on its own. */
function urlPathPhrase(url: string): string {
  try {
    const { pathname } = new URL(url);
    return normalizeForComparison(pathname.replace(/[/_.]+/g, " ").replace(/-/g, " "));
  } catch {
    return "";
  }
}

/** 2026-08-20 fix — live-confirmed real bug: a URL that spells an
 * institution's full name out in its slug (e.g.
 * `online-mba-manipal-university-jaipur`) never resolved via
 * `matchSpecificInstitution`, because that function requires exact
 * equality between ONE candidate string and ONE identifier, while
 * `urlPathTokens` hyphen-splits the slug into single words ("manipal",
 * "university", "jaipur") — none of which equals the multi-word identifier
 * "Manipal University Jaipur"/"Manipal University, Jaipur" on its own.
 * This left such a page's institution identity permanently "unresolved",
 * silently falling back to the shared-brand text/logo signals (which
 * carry no discriminating power on a shared multi-university portal) —
 * exactly the gap that let an unrelated institution's course page sit in
 * a target's candidate pool undetected. Checks the full text as one
 * space-joined phrase, word-bounded, against every multi-word
 * name/alias — single-word identifiers stay on the cheaper exact-token
 * path above; this only ever adds a match, never removes one.
 *
 * Not URL-specific despite the original name's history — 2026-08-21
 * reused as-is for free-text page content too (see
 * `resolvePageInstitutionSignal`'s program-text fallback below): the
 * same "multi-word identifier spelled out, not as one exact whole-string
 * match" gap applies equally to a page's own program/title text (e.g.
 * "Online BBA From Manipal University Jaipur"). */
function matchMultiWordPhraseAlias(phrase: string, registry: SourceRegistry): { institution: Institution; matchedText: string } | null {
  if (!phrase) return null;
  const paddedPhrase = ` ${phrase} `;
  for (const institution of registry.institutions) {
    for (const identifier of [institution.name, ...institution.aliases]) {
      const normalizedIdentifier = normalizeForComparison(identifier).replace(/,/g, "");
      if (!normalizedIdentifier.includes(" ")) continue; // single-word identifiers are handled by the exact-token match
      if (paddedPhrase.includes(` ${normalizedIdentifier} `)) {
        return { institution, matchedText: identifier };
      }
    }
  }
  return null;
}

/** Precedence tier 1 — an explicit institution identifier in the target
 * URL's path (e.g. `-mahe`/`-smu`/`-muj` slug tokens, or a multi-word
 * name/alias spelled out across several hyphenated segments). Pure string
 * matching against registry data; no network, no DOM. */
export function resolveUrlInstitutionSignal(targetUrl: string, registry: SourceRegistry): InstitutionSignalResult {
  const tokens = urlPathTokens(targetUrl);
  const match = matchSpecificInstitution(tokens, registry);
  if (match) {
    return { institutionId: match.institution.id, strength: "strong", evidence: `URL token "${match.matchedText}"` };
  }
  const phraseMatch = matchMultiWordPhraseAlias(urlPathPhrase(targetUrl), registry);
  if (phraseMatch) {
    return { institutionId: phraseMatch.institution.id, strength: "strong", evidence: `URL phrase "${phraseMatch.matchedText}"` };
  }
  return { institutionId: null, strength: "none", evidence: "no institution identifier found in the URL path" };
}

/** Precedence tier 2 — the page's own already-extracted institution text
 * (Sprint 2/4b's `understanding.institution`, unchanged extraction). A
 * present-but-generic guess (matches nothing specific — the "Online
 * Manipal" case) is reported as "weak" evidence, not "none": something was
 * genuinely found, it just isn't institution-specific, which matters for
 * legible evidence even though it never resolves anything by itself.
 *
 * 2026-08-21 fix — live-confirmed real bug: a target's narrow institution
 * GUESS field (`understanding.institution`, typically pulled from a meta
 * tag) is often just the generic shared brand ("Online Manipal"), even
 * when that SAME page's own program/title text names the specific
 * institution in full ("Online BBA From Manipal University Jaipur") —
 * a human reading the page would recognize this instantly, but nothing
 * ever checked `programGuess` for institution evidence. Falls back to
 * checking the optional `programGuess` text (exact match, then the same
 * word-bounded multi-word phrase match `resolveUrlInstitutionSignal`
 * uses) only when the institution guess itself didn't resolve — never
 * overrides a genuine institution-guess match. */
export function resolvePageInstitutionSignal(institutionGuess: EntityGuess | null, registry: SourceRegistry, programGuess?: EntityGuess | null): InstitutionSignalResult {
  if (institutionGuess?.value) {
    const match = matchSpecificInstitution([institutionGuess.value], registry);
    if (match) {
      return { institutionId: match.institution.id, strength: "strong", evidence: `page text "${match.matchedText}"` };
    }
  }
  if (programGuess?.value) {
    const exactMatch = matchSpecificInstitution([programGuess.value], registry);
    if (exactMatch) {
      return { institutionId: exactMatch.institution.id, strength: "strong", evidence: `program text "${exactMatch.matchedText}"` };
    }
    const phraseMatch = matchMultiWordPhraseAlias(normalizeForComparison(programGuess.value), registry);
    if (phraseMatch) {
      return { institutionId: phraseMatch.institution.id, strength: "strong", evidence: `program text "${phraseMatch.matchedText}"` };
    }
  }
  if (!institutionGuess || !institutionGuess.value) {
    return { institutionId: null, strength: "none", evidence: "no institution text detected on the page" };
  }
  return {
    institutionId: null,
    strength: "weak",
    evidence: `page text "${institutionGuess.value}" does not specifically name a known institution`,
  };
}

/** Marketing imagery — rankings badges, "as featured in" press strips,
 * awards/accreditation carousels — routinely names the institution it's
 * ABOUT (what earned the ranking/award) in its own filename or alt text,
 * purely to describe the claim, not to identify whose page this is. Live-
 * verified on the real Online Manipal site: a "Rankings & Accreditations"
 * widget is byte-identical across every page regardless of institution
 * (MAHE program pages, a generic multi-university MBA hub page, etc. all
 * embed the exact same three images), yet one of its images —
 * `SMU_Rankings_The-Week.jpg`, alt "Top Private & Deemed Multidisciplinary
 * University (2026)" — happens to name SMU in its filename. On a page
 * with no other logo candidate to cancel it out (the existing
 * multi-institution-disagreement guard below only fires when *several*
 * candidates disagree), that single incidental filename token was being
 * read as this page's own "strong" institution identity, producing a
 * false conflict against a correct, strong MAHE URL signal. A GENERIC,
 * institution-agnostic vocabulary describing what the image is ABOUT
 * (never a specific institution/program/URL) — a candidate whose own
 * text is dominated by this vocabulary is marketing/social-proof
 * imagery, never a page-ownership brand mark, regardless of what
 * institution name it also happens to contain. */
const MARKETING_BADGE_HINT_PATTERN = /\b(ranking|rankings|ranked|rated|rating|award|awards|accreditation|accredited|press|featured)\b/i;

function isMarketingBadgeImage(candidate: LogoCandidateSignal): boolean {
  const texts = [candidate.altText, ...candidate.filenameTokens, candidate.surroundingText, candidate.svgStructuralText];
  return texts.some((t) => !!t && MARKETING_BADGE_HINT_PATTERN.test(t));
}

/** Precedence tier 3 — logo evidence. Only a candidate whose alt text,
 * filename tokens, surrounding link/caption text, or (for SVG) structural
 * metadata *independently* names a known institution ever contributes —
 * an accreditation/regulatory/partner/vendor logo that matches nothing
 * known is recorded (for evidence legibility) but never treated as
 * identity evidence merely for existing on the page. If different logo
 * candidates on the same page identify *different* institutions, that is
 * itself unresolved — never arbitrarily pick the first one. A candidate
 * that is itself a ranking/award/press badge (see
 * `isMarketingBadgeImage`) never contributes a match, even when one of
 * its tokens happens to name a registered institution — that institution
 * is the subject of the claim being made, not necessarily this page's
 * own identity. */
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
    if (isMarketingBadgeImage(candidate)) continue;
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
 * The default institution is likewise derived — whichever known
 * participant actually has a registered `Source` reachable at THIS Master
 * domain — so "MUJ" is a consequence of today's registry data (only MUJ
 * has a Source on `onlinemanipal.com`), never a literal special case in
 * this function. If zero or more than one participant is reachable here,
 * this returns no default rather than guessing.
 *
 * 2026-08-20 fix: the single-participant case used to skip this
 * reachability check entirely and return that one institution
 * unconditionally, regardless of whether it had ANY registered Source at
 * the requested Master domain at all. Live-confirmed real-world harm: a
 * registry program entry for "BBA" whose only registered participant's
 * Source lives at a completely unrelated domain still got asserted as
 * "Institution: Sunrise Valley University" for every BBA target on the
 * real, unrelated `onlinemanipal.com` — a confident, specific, and
 * completely wrong institution name, not an honest "unresolved". The
 * reachability check below is now applied uniformly regardless of
 * participant count; "single_university_default" vs.
 * "multi_university_default" is now purely a label describing how many
 * total participants existed before that filter, never a difference in
 * whether the filter runs.
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
  const method = participantInstitutionIds.length === 1 ? "single_university_default" : "multi_university_default";
  return { institution, method: institution ? method : null };
}

export interface InstitutionIdentityInput {
  targetUrl: string;
  masterUrl: string;
  institutionGuess: EntityGuess | null;
  /** Consumed only by `resolveMultiUniversityDefault`'s fallback tier — a
   * DEGREE-shaped guess (e.g. "BBA"), matched against registry `Program`
   * name/aliases, which are themselves degree-shaped. Distinct from
   * `programTextGuess` below (a longer, free-text program description) —
   * do not conflate the two, they serve different tiers with different
   * text shapes. */
  programGuess: EntityGuess | null;
  /** 2026-08-21 fix — the page's own full program/title text (e.g.
   * "Online BBA From Manipal University Jaipur"), consulted by
   * `resolvePageInstitutionSignal`'s page-identity tier ONLY as a
   * fallback when the narrower `institutionGuess` field didn't resolve.
   * Optional/absent for every pre-fix caller — zero behavior change
   * unless passed. See that function's doc comment for the live-
   * confirmed bug this closes. */
  programTextGuess?: EntityGuess | null;
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
interface SignalTierCombination {
  url: InstitutionSignalResult;
  pageIdentity: InstitutionSignalResult;
  logo: InstitutionSignalResult;
}

/** Shared by `resolveInstitutionIdentity` (targets — layers the
 * multi/single-university-default fallback on top) and
 * `resolveCandidateInstitutionIdentity` (Master candidates — tiers only,
 * see that function's doc comment for why the fallback never applies to
 * a candidate). Combines the three signal tiers exactly once so both
 * callers agree on what counts as "resolved" vs. "conflict": two or more
 * *contributing* (specific, non-null) tiers naming different institutions
 * is always a conflict, one specific tier (or several agreeing) resolves,
 * and zero specific tiers is left to the caller to decide what to do
 * next. */
function combineSignalTiers(
  signals: SignalTierCombination,
): { institutionId: string | null; institutionName: string | null; status: "resolved" | "conflict"; resolutionMethod: InstitutionResolutionMethod; conflictingInstitutionIds?: string[] } | null {
  const contributors = (["url", "pageIdentity", "logo"] as const)
    .map((tier) => ({ tier, result: signals[tier] }))
    .filter((c) => c.result.institutionId !== null);

  const distinctIds = [...new Set(contributors.map((c) => c.result.institutionId as string))];

  if (distinctIds.length > 1) {
    return { institutionId: null, institutionName: null, status: "conflict", resolutionMethod: "conflict", conflictingInstitutionIds: distinctIds };
  }

  if (distinctIds.length === 1) {
    const method: InstitutionResolutionMethod = contributors.length > 1 ? "combined_signals" : METHOD_FOR_TIER[contributors[0].tier];
    return { institutionId: distinctIds[0], institutionName: null, status: "resolved", resolutionMethod: method };
  }

  return null; // no tier named a specific institution — caller decides what happens next
}

export function resolveInstitutionIdentity(input: InstitutionIdentityInput, registry: SourceRegistry): InstitutionResolutionResult {
  const url = resolveUrlInstitutionSignal(input.targetUrl, registry);
  const pageIdentity = resolvePageInstitutionSignal(input.institutionGuess, registry, input.programTextGuess);
  const logo = resolveLogoInstitutionSignal(input.logoCandidates, registry);
  const signals = { url, pageIdentity, logo };

  const combined = combineSignalTiers(signals);

  if (combined?.status === "conflict") {
    return { institutionId: null, institutionName: null, status: "conflict", resolutionMethod: "conflict", signals, fallbackApplied: false, conflictingInstitutionIds: combined.conflictingInstitutionIds };
  }

  if (combined?.status === "resolved") {
    const institution = registry.institutions.find((i) => i.id === combined.institutionId) ?? null;
    return {
      institutionId: combined.institutionId,
      institutionName: institution?.name ?? null,
      status: "resolved",
      resolutionMethod: combined.resolutionMethod,
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

export interface CandidateInstitutionIdentityInput {
  /** The candidate page's own URL — never the target's. */
  url: string;
  institutionGuess: EntityGuess | null;
  logoCandidates: LogoCandidateSignal[];
  /** 2026-08-21 fix — same program-text fallback `resolveInstitutionIdentity`
   * uses (see `resolvePageInstitutionSignal`'s doc comment, and
   * `InstitutionIdentityInput.programTextGuess`). Optional/absent for
   * every pre-fix caller — zero behavior change unless passed. */
  programTextGuess?: EntityGuess | null;
}

/**
 * Component: Fix 1 — the candidate-side counterpart to
 * `resolveInstitutionIdentity`, used to resolve a Master candidate page's
 * own institution identity so `selectAuthoritativePage` can compare it
 * against the target's already-resolved identity for tie-breaking.
 * Deliberately excludes the multi/single-university-default fallback:
 * that fallback answers "which institution should we assume THIS TARGET
 * means, given no direct evidence and only one reachable participant at
 * the Master domain" — applied to a candidate page instead, it would
 * silently default every institution-less candidate (e.g. the homepage,
 * an "About" page, or any page that genuinely represents the shared
 * brand rather than one specific institution) to whichever institution
 * happens to have a registered Source, actively reintroducing the exact
 * D1 bug this resolver family exists to prevent. A candidate with no
 * specific tier evidence is therefore always `status: "unresolved"` here
 * — never guessed, never penalized, simply not used as a tie-break
 * signal (see `scoreCandidate`'s `institutionIdentityMatch` weight).
 * Pure and synchronous: `logoCandidates` must already be extracted from
 * the candidate's already-fetched HTML (no network call here or in any
 * caller of this function — see `buildMasterPageIndex.ts`, which calls
 * this once per candidate at crawl time, reusing the HTML it already
 * fetched for extraction/understanding).
 */
export function resolveCandidateInstitutionIdentity(input: CandidateInstitutionIdentityInput, registry: SourceRegistry): InstitutionResolutionResult {
  const url = resolveUrlInstitutionSignal(input.url, registry);
  const pageIdentity = resolvePageInstitutionSignal(input.institutionGuess, registry, input.programTextGuess);
  const logo = resolveLogoInstitutionSignal(input.logoCandidates, registry);
  const signals = { url, pageIdentity, logo };

  const combined = combineSignalTiers(signals);

  if (combined?.status === "conflict") {
    return { institutionId: null, institutionName: null, status: "conflict", resolutionMethod: "conflict", signals, fallbackApplied: false, conflictingInstitutionIds: combined.conflictingInstitutionIds };
  }

  if (combined?.status === "resolved") {
    const institution = registry.institutions.find((i) => i.id === combined.institutionId) ?? null;
    return {
      institutionId: combined.institutionId,
      institutionName: institution?.name ?? null,
      status: "resolved",
      resolutionMethod: combined.resolutionMethod,
      signals,
      fallbackApplied: false,
    };
  }

  return { institutionId: null, institutionName: null, status: "unresolved", resolutionMethod: "unresolved", signals, fallbackApplied: false };
}
