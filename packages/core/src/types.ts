/**
 * Shared domain types for CrossCheck.
 *
 * Sprint 2 scope only (ingestion, extraction, understanding) — see
 * docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md. Types for source
 * resolution, comparison, and reporting are documented in
 * docs/design/WEBSITE_QUALITY_DESIGN.md but not implemented here yet;
 * they will be added to this package when the sprint that builds them
 * starts, not speculatively now.
 */

// ---------------------------------------------------------------------------
// Ingestion (component A)
// ---------------------------------------------------------------------------

export type IngestionFailureReason =
  | "invalid_url"
  | "unreachable"
  | "non_html"
  | "empty_body"
  | "http_error"
  | "too_many_redirects";

export interface IngestionResult {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number | null;
  contentType: string | null;
  fetchedAt: string;
  html: string | null;
  success: boolean;
  failureReason?: IngestionFailureReason;
}

// ---------------------------------------------------------------------------
// Extraction (component B)
// ---------------------------------------------------------------------------

export interface Heading {
  level: 1 | 2 | 3 | 4;
  text: string;
}

export interface TextBlock {
  headingContext: string | null;
  text: string;
  /** True only for text captured directly from a `<del>`/`<s>`/`<strike>`
   * element — the HTML-semantic "superseded/original value" marker (e.g.
   * a struck-through pre-discount price). See `feeDiscountRole` below for
   * how this is used downstream. */
  struckOriginal?: boolean;
  /** Set only on a synthesized "Label: Value" pair (`synthesizeLabelValuePairs`)
   * when that label's block of consecutive values contains BOTH a struck
   * and a non-struck entry — i.e. a real "original price / discounted
   * price" pair under one label, a pattern found live on
   * `onlinemanipal.com`'s fee cards (`<del>INR 75,000</del><span>INR
   * 67,500</span>`). `"original"` for the struck value's pair,
   * `"discounted"` for the non-struck value's pair — lets fee
   * classification tell them apart deterministically instead of relying
   * on the word "discount" appearing in the same text block, which real
   * pages routinely render as a separate sibling element. Absent (not
   * `undefined`-checked-as-false) for every ordinary label/value pair,
   * which keeps existing keyword-based classification unchanged. */
  feeDiscountRole?: "original" | "discounted";
}

export interface ExtractedLink {
  url: string;
  text: string | null;
  relation: "internal" | "external";
  linkType: "navigation" | "content" | "cta" | "unknown";
}

/** One `<img>` found on the page, associated with whichever heading it
 * falls under in document order (same `currentHeading` tracking as
 * `TextBlock`) — the input the semantic fact layer's image/OCR path
 * needs to detect "this FEES section's value is inside an image" (§9 of
 * the semantic layer plan) without a second HTML fetch/parse. */
export interface SectionImage {
  headingContext: string | null;
  imageUrl: string;
  altText: string | null;
}

/** One `<table>` found on the page, associated with whichever heading it
 * falls under — headers from `<th>` (or the first row's `<td>`s if no
 * `<th>` exists), then every subsequent row's cell text. Feeds both the
 * semantic classifier's `tableHeaders` signal and table-based fact
 * extraction (§8: "Fee information... inside... Tables"). */
export interface ParsedTable {
  headingContext: string | null;
  headers: string[];
  rows: string[][];
}

export interface ParsedLandingPage {
  sourceUrl: string;
  title: string | null;
  metaDescription: string | null;
  headings: Heading[];
  textBlocks: TextBlock[];
  mainText: string;
  structuredData: Record<string, unknown>[];
  links: ExtractedLink[];
  rawTextLength: number;
  sectionImages: SectionImage[];
  tables: ParsedTable[];
}

// ---------------------------------------------------------------------------
// Understanding (component C)
// ---------------------------------------------------------------------------

export type PageType =
  | "course_specific"
  | "ug"
  | "pg"
  | "combined_course"
  | "institution_page"
  | "other";

export type SignalType =
  | "domain_pattern"
  | "phrase_match"
  | "keyword_heuristic"
  | "meta_tag"
  | "structured_data"
  | "url_path"
  | "institution_identity_match";

export type SignalLocation = "url" | "title" | "meta" | "heading" | "body" | "structured_data";

export interface EntityMatchSignal {
  signalType: SignalType;
  matchedText: string;
  location: SignalLocation;
}

export type Confidence = "high" | "medium" | "low";

export interface EntityGuess<T = string> {
  value: T;
  confidence: Confidence;
  matchedSignals: EntityMatchSignal[];
}

export type ExtractionMethod =
  | "labeled_pattern"
  | "heading_scoped"
  | "regex"
  /** Sprint 4b — adapted from an already-computed EntityGuess (degree/
   * institution/program), not from claim-field-labels-driven text
   * extraction. */
  | "entity_guess";

export interface ExtractedClaim {
  fieldKey: string;
  rawValue: string;
  sourceLocation: {
    url: string;
    excerpt: string;
  };
  extractionMethod: ExtractionMethod;
  extractedAt: string;
  /** Threaded from the source `TextBlock.feeDiscountRole` (see
   * `TextBlock`'s doc comment) when this claim was built from a
   * synthesized label/value pair — undefined for every ordinary claim. */
  feeDiscountRole?: "original" | "discounted";
}

// ---------------------------------------------------------------------------
// Top-level analysis result (component G)
// ---------------------------------------------------------------------------

export interface LandingPageAnalysis {
  requestId: string;
  analyzedAt: string;
  input: { requestedUrl: string };
  ingestion: IngestionResult;
  extraction: {
    title: string | null;
    metaDescription: string | null;
    headings: Heading[];
    mainText: string;
    structuredData: Record<string, unknown>[];
    links: ExtractedLink[];
  } | null;
  understanding: {
    brand: EntityGuess | null;
    institution: EntityGuess | null;
    program: EntityGuess | null;
    degree: EntityGuess | null;
    pageType: EntityGuess<PageType> | null;
    claims: ExtractedClaim[];
    /** Sprint 4b — one ExtractedClaim per detected specialization list
     * item (not a single merged claim); empty if no specialization list
     * was found on this page. */
    specializations: ExtractedClaim[];
  } | null;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Source Registry, Source Resolution, Discovery (Sprint 3) — see
// docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md "Proposed Data Models".
// Asset-type-agnostic per docs/ARCHITECTURE.md's Guiding Constraint, so
// these live here rather than in modules/website-quality.
// ---------------------------------------------------------------------------

export interface Institution {
  id: string;
  name: string;
  aliases: string[];
  /** Matched when an understanding layer's institution guess is actually
   * the brand (e.g. "Online Manipal"), not the formal institution name. */
  brandNames: string[];
}

export interface Program {
  id: string;
  name: string;
  aliases: string[];
  institutionId: string;
}

export interface DiscoveredPage {
  url: string;
  role: "primary" | "supporting";
}

export interface Source {
  id: string;
  institutionId: string;
  programId: string;
  rootUrl: string;
  pages: DiscoveredPage[];
  /** Domain/host patterns checked against the requested URL — the
   * strongest Source Resolution signal. */
  urlPatterns: string[];
}

export interface SourceRegistry {
  institutions: Institution[];
  programs: Program[];
  sources: Source[];
}

export interface SourceResolutionInput {
  requestedUrl: string;
  institutionGuess: EntityGuess | null;
  /** Canonical program/degree identity (e.g. LandingPageAnalysis's
   * `understanding.degree`, not the more free-text `understanding.program`). */
  programGuess: EntityGuess | null;
}

export type SourceResolutionFailureReason =
  | "no_registry_entry"
  | "institution_not_registered"
  | "program_not_registered"
  | "ambiguous_match";

export interface SourceResolutionResult {
  success: boolean;
  source: Source | null;
  confidence: Confidence | null;
  matchedVia: "url_pattern" | "institution_alias" | null;
  matchedSignals: EntityMatchSignal[];
  failureReason?: SourceResolutionFailureReason;
}

export interface DiscoveryResult {
  sourceId: string;
  pages: DiscoveredPage[];
}

// ---------------------------------------------------------------------------
// Claim Normalization, Comparison Engine v1 (Sprint 4) — see
// docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md "Proposed Data Models".
// Asset-type-agnostic, same rationale as the Source Registry above.
// ---------------------------------------------------------------------------

export type NormalizationStatus =
  | "NORMALIZED"          // a single, unambiguous value was parsed
  | "NOT_FOUND"            // no value of the expected type is present
  | "UNSUPPORTED_FORMAT"   // a value is present but outside the current registry
  | "AMBIGUOUS";           // more than one plausible value is present

export type NormalizedType = "text" | "duration_months" | "currency";

export interface NormalizedClaim {
  fieldKey: string;
  raw: ExtractedClaim;
  status: NormalizationStatus;
  /** Present only when status === "NORMALIZED". */
  normalizedValue?: string | number;
  normalizedType: NormalizedType;
  /** Present only for currency claims with status === "NORMALIZED". */
  currencyCode?: string;
  /** Human-readable detail, especially for non-NORMALIZED statuses. */
  normalizationNotes?: string;
}

export type ComparisonStatus =
  | "match"
  | "mismatch"
  | "asset_missing"          // no ExtractedClaim for this field on the asset side
  | "source_missing"         // no ExtractedClaim for this field on the source side
  | "both_missing"
  | "normalization_issue";   // claim(s) extracted but not normalized to a comparable value

export interface ComparisonOutcome {
  fieldKey: string;
  status: ComparisonStatus;
  assetClaim?: NormalizedClaim;
  sourceClaim?: NormalizedClaim;
}

export interface ComparisonRule {
  fieldKey: string;
  compare: (assetClaim: NormalizedClaim | undefined, sourceClaim: NormalizedClaim | undefined) => ComparisonOutcome;
}

/** Extensible registry config — never institution/program-specific. */
export interface CurrencyDefinition {
  /** ISO 4217 code, e.g. "INR". */
  code: string;
  /** Recognized symbols/prefixes, e.g. ["₹", "Rs", "Rs.", "INR"]. */
  symbols: string[];
  /** Digit-grouping convention used to validate/parse a matched amount. */
  groupingStyle: "western" | "indian";
}

/** Extensible registry config — never institution/program-specific. */
export interface DurationUnitDefinition {
  unit: "year" | "month" | "semester";
  /** Recognized textual forms for this unit, each with a leading numeric capture group. */
  patterns: RegExp[];
  /** Conversion factor to canonical months. */
  monthsPerUnit: number;
}

// Orchestration only, not in the Sprint 1 design (fetching wasn't wired up
// yet when it was written). Master + multi-target model per
// docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md Revision 2 §1-2 (Sprint 4
// scope: fact comparison only — no identity/logo, that's Sprint 4b):

/** The one user-designated source of truth for a comparison run. */
export interface MasterSite {
  masterUrl: string;
}

/** One of potentially 100+ pages to check against the Master. */
export interface ComparisonTarget {
  url: string;
}

export interface ComparisonRunRequest {
  master: MasterSite;
  targets: ComparisonTarget[];
}

export interface PageComparisonResult {
  targetUrl: string;
  /** The target page can itself fail to fetch — reported, not thrown. */
  ingestionSuccess: boolean;
  /** Empty if ingestion failed. */
  claims: ComparisonOutcome[];
  /** Sprint 4b — specialization list diff, null if ingestion failed or
   * neither side extracted a specialization list. */
  specializations: ListComparisonOutcome | null;
}

export interface ComparisonRunResult {
  masterUrl: string;
  /** If false, no target could be meaningfully compared; results is empty. */
  masterIngestionSuccess: boolean;
  generatedAt: string;
  results: PageComparisonResult[];
}

// ---------------------------------------------------------------------------
// Dynamic Master-Site Authoritative-Page Discovery (Sprint 5) — see
// docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md "Data Models". Asset-type-
// agnostic, same rationale as the Source Registry/Comparison types above.
// ---------------------------------------------------------------------------

export interface ParsedSitemap {
  urls: string[];
  sitemapIndexUrls: string[]; // present only if this was a <sitemapindex>
  truncated: boolean; // true if the sitemap-URL parse cap was hit
}

/**
 * Centralized, configurable scoring policy (§7-8 of the Sprint 5 plan).
 * `score` values derived from these weights are a deterministic relevance
 * score — the same inputs and config always produce the same score —
 * NEVER a probability. The only externally-meaningful confidence value
 * anywhere in this system remains the `Confidence` type below.
 */
export interface DiscoveryScoringWeights {
  degreeMatch: number;
  programMatch: number;
  institutionMatch: number;
  headingKeywordMatch: number;
  urlKeywordMatch: number;
  pageTypePlausibility: number;
  homepagePenalty: number;
  /** Fix 1 — awarded only when the target's own resolved institution
   * identity (`InstitutionResolutionResult`, URL/page/logo evidence) and
   * this candidate's own resolved institution identity are both
   * `status: "resolved"` and name the exact same institution. Never
   * awarded when either side is unresolved/conflicted — missing evidence
   * is never treated as a match, only a genuine, specific agreement is.
   * This is what lets a candidate from the correct institution beat an
   * otherwise-identical candidate from a different institution, without
   * ever forcing a selection when institution evidence is itself
   * ambiguous (see `scoreCandidate`/`selectAuthoritativePage`). */
  institutionIdentityMatch: number;
}

export interface DiscoveryConfidenceThresholds {
  /** THE selection gate. score < this -> authoritative_page_not_found,
   * regardless of margin. Not a probability. */
  minConfidenceThreshold: number;
  /** Label-only, never a gate: once minConfidenceThreshold AND
   * minWinnerMargin both already pass, score >= this -> "high", else
   * "medium". Cannot by itself cause a failed selection. */
  highConfidenceScore: number;
  /** THE disambiguation gate, independent of the confidence gate — the
   * top score alone is never sufficient. Top score must exceed the
   * runner-up's by at least this much, or the result is
   * ambiguous_candidates even when both scores clear
   * minConfidenceThreshold comfortably. */
  minWinnerMargin: number;
}

/**
 * Program Relevance Gate policy (Sprint 5 Revision 1, §5/§7). Runs
 * strictly before scoring/ranking — a candidate that fails it is never
 * scored and can never be selected. Optional on `DiscoveryScoringConfig`
 * so every existing literal config object (tests, callers) keeps
 * compiling and behaving correctly without modification; defaulted once,
 * inside `selectAuthoritativePage`.
 */
export interface ProgramRelevanceGateConfig {
  enabled: boolean; // default true
  /** Extends DEFAULT_PROGRAM_RELEVANCE_STOPWORDS, never replaces it. */
  additionalStopwords: string[];
  /** Minimum number of overlapping subject keywords required to pass,
   * once the target has a non-empty subject-keyword set. Default 1. */
  minOverlapCount: number;
}

export interface DiscoveryScoringConfig {
  weights: DiscoveryScoringWeights;
  thresholds: DiscoveryConfidenceThresholds;
  programRelevanceGate?: ProgramRelevanceGateConfig;
  /** Sprint 4b — optional, same "every existing literal config object
   * keeps compiling and behaving correctly without modification" pattern
   * as `programRelevanceGate` above; defaulted once, by
   * modules/website-quality's orchestration (packages/core never fetches,
   * so it can't itself default-and-use this the way it does the program
   * gate — see institution-relevance.ts's doc comment). */
  institutionRelevanceGate?: InstitutionRelevanceGateConfig;
}

/**
 * The generic, asset-type-agnostic identity shape scoring compares — the
 * subset of a fetched page's understanding that matters for "does this
 * page represent the same institution/program/degree as the target."
 * Deliberately lighter than the full `LandingPageAnalysis` (no
 * ingestion/raw-extraction internals), since scoring never needs those.
 */
export interface DiscoveryPageIdentity {
  url: string;
  title: string | null;
  headings: string[];
  degree: EntityGuess | null;
  program: EntityGuess | null;
  institution: EntityGuess | null;
  brand: EntityGuess | null;
  pageType: EntityGuess<PageType> | null;
  /** Normalized text of every item under this page's own "Specializations"/
   * "Electives" heading (Sprint 4b's `extractSpecializations`, reused here
   * — see `specialization-resolution.ts`'s Specialization Fallback Search).
   * Null when the page has no such section. Distinct from `program`/
   * `headings`: a generic, unqualified base-program page (e.g. a plain
   * "MBA" page with no subject wording of its own) can still validly list
   * "Healthcare Management" as one of its own specializations here. */
  specializations?: string[] | null;
}

/** The outcome of validating a target's specialization/variant wording
 * (e.g. "Healthcare Management") against a resolved candidate's own
 * authoritative content — never a separate degree/program, always a
 * variant of whichever base program was actually selected. `validated:
 * true` only when the term was found in the candidate's own extracted
 * `specializations` list (structured, heading-scoped evidence); `false`
 * when it's only inferred from generic subject-keyword overlap (title/
 * heading text), so a consumer can distinguish "confirmed against the
 * authoritative program page" from "best-effort guess." */
export interface SpecializationResolution {
  term: string;
  validated: boolean;
  matchedCandidateUrl: string | null;
}

export type CandidateDiscoveryMethod = "sitemap" | "nav_link" | "same_domain_link";

export interface DiscoveredCandidateUrl {
  url: string;
  discoveryMethod: CandidateDiscoveryMethod;
  prefilterScore: number; // cheap URL-keyword score — used for fetch ordering only
}

export interface CandidateScoreBreakdown {
  signal: EntityMatchSignal;
  points: number;
}

export interface CandidateEvaluation {
  url: string;
  discoveryMethod: CandidateDiscoveryMethod;
  ingestionSuccess: boolean;
  /** A deterministic relevance score, NOT a probability. Sum of
   * scoreBreakdown[].points under whichever DiscoveryScoringConfig
   * produced this evaluation (see DynamicDiscoveryResult.scoringConfigUsed
   * for which one that was). Absent when the candidate was rejected by
   * the Program Relevance Gate (Sprint 5 Revision 1) — a rejected
   * candidate is never scored, since it can never be selected regardless
   * of score. */
  score?: number;
  scoreBreakdown?: CandidateScoreBreakdown[];
  /** false if excluded by the Program Relevance Gate before scoring —
   * see `score`'s doc comment above. */
  passedProgramRelevanceGate: boolean;
  /** The overlapping subject keyword(s) that caused a pass; empty if
   * none overlapped, or the gate was a no-op for this pair. */
  subjectKeywordOverlap: string[];
  /** Sprint 4b — Institution Relevance Gate ("Identity Resolution")
   * outcome for this candidate. Undefined when the caller didn't supply
   * institution-gate evaluations at all (e.g. the legacy single-target
   * discovery path, or a caller that hasn't opted in) — distinct from a
   * gate that ran and passed. A candidate can be scored=0/undefined and
   * still show `false` here if the institution gate rejected it before
   * the program gate was even reached. */
  passedInstitutionRelevanceGate?: boolean;
  institutionGateSignals?: InstitutionGateSignalResult;
  /** Base-program-first resolution fix — present only for candidates that
   * were actually scored/selected (never for institution/program-gate-
   * rejected candidates). Null when the target carries no specialization/
   * qualifier wording at all (nothing to validate). See
   * `SpecializationResolution`'s doc comment for what `validated` means. */
  specialization?: SpecializationResolution | null;
}

export interface DiscoveryCandidateInput {
  url: string;
  discoveryMethod: CandidateDiscoveryMethod;
  identity: DiscoveryPageIdentity;
}

// --- SSRF protection for dynamically-fetched URLs (§11) ---
// Applies to every URL Sprint 5's own code decides to fetch (robots.txt,
// sitemap(s), the Master homepage, every candidate page) via safeFetch()
// in modules/website-quality — NOT to the target URL, which stays on
// Sprint 2's existing ingestUrl()/analyzeLandingPage() path unchanged.

export type SafeFetchFailureReason =
  | "invalid_url"
  | "dns_resolution_failed"
  | "resolved_ip_blocked" // every resolved IP was private/loopback/link-local/reserved
  | "redirect_target_blocked" // a redirect hop's resolved IP was blocked
  | "too_many_redirects"
  | "unreachable"
  | "non_html"
  | "empty_body"
  | "http_error";

export interface SafeFetchResult {
  requestedUrl: string;
  finalUrl: string;
  /** The specific IP actually connected to for finalUrl — the pinned
   * address from validation, not a fresh DNS lookup at connect time. */
  resolvedIp: string | null;
  /** Every hop's URL, in order, each independently re-resolved and
   * re-validated before being followed. */
  redirectChain: string[];
  html: string | null;
  success: boolean;
  failureReason?: SafeFetchFailureReason;
}

// --- Top-level dynamic discovery result ---

// "authoritative_page_not_found" is the single, deliberately consolidated
// reason for every case where no candidate cleared the
// minConfidenceThreshold gate (§8) — whether because zero candidates
// survived domain-boundary/robots/SSRF filtering, none matched the
// target's identity at all (score 0), or a top candidate existed but
// simply scored too low. The finer-grained distinction is preserved in
// crawlStats/topCandidates, not lost — just not promoted to a separate
// top-level enum value. crawl_budget_exhausted_no_match and
// ambiguous_candidates remain distinct, operationally different outcomes.
export type DynamicDiscoveryFailureReason =
  | "target_unreachable"
  | "master_domain_unreachable"
  | "authoritative_page_not_found"
  | "ambiguous_candidates"
  | "crawl_budget_exhausted_no_match";

export interface CrawlStats {
  sitemapUrlsFound: number;
  sitemapTruncated: boolean;
  navLinksFound: number;
  sameDomainLinksFollowed: number;
  candidatesFetched: number;
  candidatesMatchedIdentity: number; // scored > 0 on at least one identity signal
  /** Excluded by the Program Relevance Gate before ever being scored
   * (Sprint 5 Revision 1) — distinct from candidatesMatchedIdentity,
   * which counts candidates that scored 0 despite being gate-eligible. */
  candidatesRejectedByProgramRelevanceGate: number;
  robotsDisallowedSkipped: number;
  domainBoundarySkipped: number;
  /** Candidate/robots/sitemap fetches blocked by safeFetch's SSRF
   * validation (initial resolution or a redirect hop) — distinct from
   * domainBoundarySkipped, which is the (pre-fetch) domain-boundary
   * check, not a DNS/IP-level block. */
  ssrfBlockedCount: number;
  budgetExhausted: boolean;
  elapsedMs: number;
}

export interface DynamicDiscoveryResult {
  success: boolean;
  masterDomain: string;
  targetUrl: string;
  /** The URL actually fetched for this target after following any HTTP
   * redirect chain (ingestion's `IngestionResult.finalUrl`), distinct from
   * `targetUrl` (what the user supplied). Null only when the target's URL
   * itself was malformed (never attempted a fetch). Never overwrites
   * `targetUrl` — both are preserved so a redirect is visible, not hidden. */
  targetFinalUrl: string | null;
  /** The specific ingestion-layer reason (`IngestionResult.failureReason`'s
   * taxonomy) when `failureReason` here is `"target_unreachable"` — e.g.
   * `unreachable` (DNS/connection/timeout), `http_error`, `non_html`,
   * `empty_body`, `too_many_redirects`, `invalid_url`. Absent when the
   * target was reachable, or when failure occurred for a reason unrelated
   * to ingestion (e.g. no candidates matched). */
  targetIngestionFailureReason?: IngestionFailureReason;
  selectedUrl: string | null;
  confidence: Confidence | null;
  failureReason?: DynamicDiscoveryFailureReason;
  // Evidence preserved regardless of success/failure — top candidates by
  // score, even on ambiguous/insufficient outcomes, so a human can
  // resolve manually (e.g. by adding a registry entry) without re-running.
  topCandidates: CandidateEvaluation[];
  /** The exact config that produced every score/decision above — so a
   * result stays self-explaining even after the defaults are later
   * tuned. */
  scoringConfigUsed: DiscoveryScoringConfig;
  crawlStats: CrawlStats;
  /** Convenience mirror of `topCandidates.find(c => c.url === selectedUrl)
   * ?.specialization` — the winning candidate's own specialization
   * resolution, so a caller never has to search `topCandidates` just to
   * answer "was this target a specialization of the selected program, and
   * was that validated?" Null/undefined whenever `selectedUrl` is null. */
  specialization?: SpecializationResolution | null;
}

// --- Unified resolution result feeding into Sprint 4 ---

export type AuthoritativePageResolutionMethod = "registry" | "dynamic_discovery";

export interface AuthoritativePageResolutionResult {
  method: AuthoritativePageResolutionMethod | null; // null only if both paths failed
  sourceResolution?: SourceResolutionResult; // present if the registry path was attempted
  discovery?: DiscoveryResult; // present if the registry path succeeded
  dynamicDiscovery?: DynamicDiscoveryResult; // present if the dynamic path was attempted
  masterUrlForComparison: string | null; // non-null only on overall success
  /** E.g. a registry match resolving via institution alias against a
   * domain that differs from the supplied Master URL — a successful
   * result can still carry a warning worth surfacing. */
  warnings: string[];
  /** D1 fix — see `TargetResolutionResult.registryInstitutionGate` (same
   * shape/meaning, single-target equivalent). */
  registryInstitutionGate?: { passed: boolean; signals: InstitutionGateSignalResult };
  /** D1 follow-up — the standalone Institution Identity Resolution result
   * (URL/page/logo signals + the explicit multi-university default),
   * computed independently of any specific candidate page and evaluated
   * before this accept/reject decision. Present whenever the target's own
   * ingestion succeeded, regardless of the outcome. */
  institutionIdentity?: InstitutionResolutionResult;
}

// ---------------------------------------------------------------------------
// Sprint 5B — Master Page Index + Multi-Target Orchestration. See
// docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md. A Master-site crawl is
// performed once per run and reused for every target; each target
// independently resolves to (and, on success, is compared against) its own
// authoritative Master page — never another target's, unless independently
// selected. All types here are asset-type-agnostic, matching the rest of
// this file; the crawling/orchestration functions that produce/consume them
// live in modules/website-quality.
// ---------------------------------------------------------------------------

/** One already-fetched-and-understood Master-site candidate page, reusable
 * across every target matched against the index it belongs to. `claims` is
 * carried alongside the existing `DiscoveryCandidateInput.identity` (both
 * come from the same single `understandLandingPage` call) specifically so a
 * target that resolves to this page never needs a second fetch of it for
 * comparison purposes. */
export interface MasterPageIndexEntry {
  candidate: DiscoveryCandidateInput;
  /** Includes the Sprint 4b extended fact fields (program/degree/
   * institution, via the EntityGuess adapter) alongside Sprint 4's
   * original claim-field-labels-driven fields — computed once here,
   * reused by every target that resolves to this candidate. */
  claims: ExtractedClaim[];
  /** Sprint 4b — one ExtractedClaim per detected specialization list
   * item, kept separate from `claims` (list-diffed, not scalar-compared). */
  specializations: ExtractedClaim[];
  /** Sprint 4b — institution/brand/footer/logo signals for this
   * candidate, computed once at index-build time from its already-
   * fetched HTML (no extra network request). Logo `perceptualHash`
   * starts null and is filled in lazily/cached the first time the
   * Institution Relevance Gate or post-selection IdentityAssessment
   * actually needs it for this candidate. */
  identitySignals: IdentityGateSignals;
  /** Fix 1 — this candidate's own resolved institution identity (URL
   * token / page-text / logo tiers only — never the multi-university-
   * default fallback, which is meaningful only for a target's own
   * ambiguity, not for classifying an already-specific Master candidate
   * page), computed once at index-build time from its already-fetched
   * HTML (no extra network request). Reused by `selectAuthoritativePage`
   * to break ties between otherwise-equivalent candidates from different
   * institutions — see `resolveCandidateInstitutionIdentity`. */
  institutionIdentity: InstitutionResolutionResult;
  /** Semantic fact layer output (see
   * docs/design/SEMANTIC_FACT_LAYER_PLAN.md) for this candidate — computed
   * once at index-build time from its already-fetched HTML (no extra
   * network request). Image-based FEES facts here are still unresolved
   * (`sourceType: "image_ocr"`, empty `value`) — actual OCR only runs, if
   * enabled, for a candidate a target actually resolved to, never for
   * every indexed candidate regardless of whether it's ever selected. */
  semanticFacts: SemanticFact[];
}

/** The reusable output of one Master-site crawl — target-agnostic. Built
 * exactly once per run regardless of target count. */
export interface MasterPageIndex {
  masterDomain: string;
  /** Null only when the crawl itself failed (see `buildFailureReason`) —
   * a target can still succeed via registry resolution even then, since
   * the registry path never depends on this index. */
  masterHomepageUrl: string | null;
  entries: MasterPageIndexEntry[];
  /** Crawl-only stats (sitemap/nav/candidate-fetch counts, SSRF/robots/
   * domain-boundary counters, budget exhaustion) — populated once by the
   * crawl. Per-target match stats live separately, on
   * `TargetResolutionResult.matchStats` below, since matching now happens
   * once per target against this shared index, not once per crawl. */
  crawlStats: CrawlStats;
  scoringConfigUsed: DiscoveryScoringConfig;
  builtAt: string;
  buildFailureReason?: "master_domain_unreachable";
}

/** Per-target evidence for how many of the index's candidates were
 * considered, matched on some identity signal, and rejected by the
 * Program Relevance Gate — the per-target analogue of what
 * `CrawlStats.candidatesMatchedIdentity`/`candidatesRejectedByProgramRelevanceGate`
 * meant when matching happened once per crawl (Sprint 5/5 Revision 1). */
export interface TargetMatchStats {
  candidatesConsidered: number;
  candidatesMatchedIdentity: number;
  candidatesRejectedByProgramRelevanceGate: number;
}

export type TargetResolutionMethod = "registry" | "master_index_match";

/** One target's independent resolution outcome — never influenced by any
 * other target's result. */
export interface TargetResolutionResult {
  targetUrl: string;
  /** Same meaning as `DynamicDiscoveryResult.targetFinalUrl` (the
   * multi-target equivalent) — the URL actually fetched after following
   * any redirect chain, distinct from `targetUrl`. Null only when the
   * target's own ingestion was never attempted or its URL was malformed. */
  targetFinalUrl: string | null;
  /** Same meaning as `DynamicDiscoveryResult.targetIngestionFailureReason`
   * — the specific ingestion-layer reason when `failureReason` is
   * `"target_unreachable"`. */
  targetIngestionFailureReason?: IngestionFailureReason;
  method: TargetResolutionMethod | null; // null only on failure
  masterUrlForComparison: string | null; // non-null only on success
  confidence: Confidence | null;
  failureReason: DynamicDiscoveryFailureReason | "target_unreachable" | null;
  /** Present only when the dynamic-discovery match path was attempted
   * (absent when resolved via registry, or when the target itself was
   * unreachable). */
  topCandidates: CandidateEvaluation[];
  matchStats: TargetMatchStats | null;
  warnings: string[];
  /** Same meaning as `DynamicDiscoveryResult.specialization` (the
   * single-target equivalent) — the selected candidate's own specialization
   * resolution. Undefined when resolved via registry (that path doesn't
   * run the Program Relevance Gate/Specialization Fallback Search), null
   * when dynamic discovery ran but found no specialization wording to
   * validate, or when nothing was selected. */
  specialization?: SpecializationResolution | null;
  /** Sprint 4b — the target's own detected institution/program/degree,
   * surfaced as an explicit, evidenced result rather than only an
   * internal gating input (target architecture's "Identity
   * Resolution"/"Program Resolution" stages must produce a visible
   * answer). Present whenever the target's own ingestion succeeded,
   * independent of whether resolution itself succeeded. */
  identification: TargetIdentification | null;
  /** D1 fix — present whenever the registry path was attempted AND its
   * resolved primary page could itself be fetched/analyzed (absent if the
   * registry path wasn't attempted, or its page was unreachable, which is
   * treated as inconclusive evidence, not a rejection). `passed: true`
   * means the registered page's identity agreed with (or was inconclusive
   * against) the target's — the registry match in `method`/
   * `masterUrlForComparison` above is that same page. `passed: false`
   * means the registered page was rejected on a genuine identity conflict
   * and resolution fell through to dynamic discovery instead — this field
   * then preserves *why*, even though `method`/`masterUrlForComparison`
   * reflect whatever dynamic discovery found (or didn't). */
  registryInstitutionGate?: { passed: boolean; signals: InstitutionGateSignalResult };
  /** D1 follow-up — see `AuthoritativePageResolutionResult.institutionIdentity`
   * (same shape/meaning, multi-target equivalent). */
  institutionIdentity?: InstitutionResolutionResult;
}

/** The categorized final status for one target — the "success,
 * ambiguous_candidates, authoritative_page_not_found, network failure,
 * etc." vocabulary a consolidated batch result must preserve, never
 * collapse into a single pass/fail bit. */
export type TargetOutcomeCategory =
  | "success"
  | "ambiguous_candidates"
  | "authoritative_page_not_found"
  | "target_unreachable"
  | "master_unreachable"
  | "comparison_failed";

export interface TargetRunResult {
  targetUrl: string;
  outcome: TargetOutcomeCategory;
  resolution: TargetResolutionResult;
  comparison: PageComparisonResult | null; // Sprint 4's own type, unmodified; null unless outcome === "success"
  /** Sprint 4b — full two-sided identity evidence for the (selected
   * Master page, target) pair. Null only when no Master page was ever
   * selected (outcome !== "success"), since there is nothing to assess. */
  identityAssessment: IdentityAssessment | null;
  /** Sprint 6 — the new priority-field comparison, additive alongside the
   * legacy `comparison` above (never replacing it). Null exactly when
   * `outcome !== "success"` — never fabricated against an unselected
   * candidate, same discipline as `comparison`/`identityAssessment`. */
  priorityComparison: PriorityComparison | null;
}

export interface MultiTargetRunResult {
  masterUrl: string;
  masterDomain: string;
  generatedAt: string;
  requestedTargetCount: number;
  uniqueTargetCount: number;
  /** Reported explicitly, never silently dropped or silently
   * re-processed — see requirement #9. */
  duplicateTargetUrls: string[];
  masterIndexCrawlStats: CrawlStats;
  /** One entry per unique target, in first-occurrence input order. */
  perTarget: TargetRunResult[];
  summary: {
    successful: number;
    ambiguous: number;
    notFound: number;
    /** target_unreachable + master_unreachable + comparison_failed
     * combined — every outcome that means "could not produce a result",
     * as opposed to ambiguous/notFound, which are explicit, correct,
     * non-guessing safety outcomes, not failures. */
    failed: number;
  };
}

export type RunPhase = "master_discovery" | "target_processing";

/** A full point-in-time snapshot (not a delta) — a consumer can always
 * render the current state from the latest snapshot alone, without
 * needing to accumulate events. Re-emitted on every state change
 * throughout a run (index build start/end, each target starting, each
 * target completing). */
export interface ProgressSnapshot {
  phase: RunPhase;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  successful: number;
  ambiguous: number;
  notFound: number;
  failed: number;
  elapsedMs: number;
}

export type ProgressCallback = (snapshot: ProgressSnapshot) => void;

// ---------------------------------------------------------------------------
// Sprint 4b — Institution Relevance Gate ("Identity Resolution"), Logo/Brand
// Identity, Extended Fact Comparison, Specialization Diff. See
// docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md Revision 2 §3-5 (models) and
// Revision 3 (gate design, integration). Asset-type-agnostic, same
// rationale as every other type in this file — the actual fetching/
// hashing/cheerio work lives in modules/website-quality.
// ---------------------------------------------------------------------------

export type LogoDetectionMethod =
  | "header_logo_selector" // <img> inside header/nav matching common logo heuristics
  | "structured_data_logo" // JSON-LD Organization/CollegeOrUniversity "logo" field
  | "og_image_fallback" // og:image meta tag, lower-confidence fallback
  | "not_found";

export interface LogoEvidence {
  imageUrl: string | null; // resolved absolute URL of the detected logo image
  altText: string | null;
  detectionMethod: LogoDetectionMethod;
  /** Set only once actually fetched+decoded+hashed — detection (finding
   * the URL) and hashing (fetching bytes) are deliberately separate
   * steps; this stays null until the lazy hash step runs for this page. */
  perceptualHash: string | null;
}

/** The generic identity-signal bundle used by the Institution Relevance
 * Gate and post-selection IdentityAssessment — a lighter, identity-
 * specific sibling of DiscoveryPageIdentity. institution/brand are reused
 * directly from the page's own understanding output, never re-derived. */
export interface IdentityGateSignals {
  sourceUrl: string;
  institution: EntityGuess | null;
  brand: EntityGuess | null;
  /** Sprint 2's parseLandingPage strips header/footer/nav as noise before
   * producing its output, so this is extracted separately, directly from
   * the original HTML. Null if no footer/legal text pattern was found. */
  footerLegalText: string | null;
  logo: LogoEvidence;
}

export type SignalVerdict = "agree" | "conflict" | "inconclusive";

export interface InstitutionGateSignalResult {
  institutionOrBrand: SignalVerdict;
  footerLegal: SignalVerdict;
  logo: SignalVerdict;
  /** True only if the lazy logo-hash tiebreak actually ran for this pair
   * (text signals were inconclusive on both sides and both sides had a
   * detected logo) — distinct from `logo` being "inconclusive" because
   * hashing wasn't needed at all. */
  logoHashComputed: boolean;
}

export interface InstitutionRelevanceGateConfig {
  enabled: boolean; // default true
  /** Similarity below this, for two confidently-detected logos, counts
   * as a conflicting signal. Reuses the same 0-1 perceptual-hash
   * similarity scale as LogoAssessment.similarity. Default 0.75. */
  logoSimilarityConflictThreshold: number;
}

export type IdentityStatus =
  | "correct_identity"
  | "wrong_identity"
  | "missing_identity_asset"
  | "possible_variant"
  | "unable_to_determine";

export interface IdentitySignalComparison {
  signalType:
    | "institution_name"
    | "brand_name"
    | "program_name"
    | "domain"
    | "page_title"
    | "heading"
    | "footer_legal"
    | "logo";
  masterValue: string | null;
  targetValue: string | null;
  match: boolean | "uncertain";
  weight: "strong" | "medium" | "weak";
  detail?: string;
}

export interface LogoAssessment {
  status: "match" | "mismatch" | "missing" | "possible_variant" | "unable_to_determine";
  masterLogo: LogoEvidence;
  targetLogo: LogoEvidence;
  similarity: number | null; // 0-1, perceptual-hash-derived; null if not computable
}

export interface IdentityAssessment {
  status: IdentityStatus;
  confidence: Confidence;
  signalComparisons: IdentitySignalComparison[];
  logo: LogoAssessment;
}

/** The target's own detected identity — surfaced as an explicit,
 * evidenced result field (target architecture's "Identity Resolution"/
 * "Program Resolution" stages must produce a visible answer, not just an
 * internal gating input). Reuses EntityGuess values already computed by
 * understandLandingPage (Sprint 2) — zero new extraction. */
export interface TargetIdentification {
  institution: EntityGuess | null;
  program: EntityGuess | null;
  degree: EntityGuess | null;
}

// --- Specialization list comparison (Sprint 4b §6) ---

export type ListComparisonStatus = "match" | "added" | "removed";

export interface ListComparisonItem {
  status: ListComparisonStatus;
  masterValue?: string; // normalized
  targetValue?: string; // normalized
  masterClaim?: ExtractedClaim; // raw + sourceLocation, for evidence
  targetClaim?: ExtractedClaim;
}

export interface ListComparisonOutcome {
  fieldKey: string; // "specializations"
  items: ListComparisonItem[]; // one entry per union of both sides' normalized values
}

// ---------------------------------------------------------------------------
// D1 fix, part 2 — standalone Institution Identity Resolution (URL / page /
// logo signals + the explicit multi-university default business rule). See
// docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md's D1 status block. Resolves
// *who the target is*, independent of any specific candidate page, before
// the registry accept/reject decision or Program Resolution — the
// "Institution Identity Resolution" box in the approved pipeline diagram.
// Asset-type-agnostic, same rationale as every other type in this file.
// ---------------------------------------------------------------------------

/** One candidate logo-like image/SVG found on a page — richer than
 * `LogoEvidence` (which is scoped to "the one primary brand logo, for
 * shared-template comparison"). Multiple of these can exist per page
 * (institution logo, accreditation badges, partner/vendor logos); only the
 * ones whose text independently identifies a known institution ever
 * contribute to institution resolution — see
 * `resolveLogoInstitutionSignal`'s doc comment for why the rest (an
 * accreditation or vendor logo that matches no known institution) must
 * never count as identity evidence merely for existing. */
export interface LogoCandidateSignal {
  imageUrl: string | null;
  altText: string | null;
  /** Last path segment, extension stripped, split on `-`/`_`/`.`,
   * lowercased — e.g. "mahe-logo.png" -> ["mahe", "logo"]. */
  filenameTokens: string[];
  /** Nearby link/caption text (parent `<a>` title/aria-label, or similar) —
   * null if none found. */
  surroundingText: string | null;
  placement: "header_nav" | "body" | "footer";
  /** True if the source is SVG (inline `<svg>` or a `.svg`-referenced
   * `<img>`) — signals that the raster perceptual-hash path
   * (`computeLogoHash`) cannot decode this one; structural/text signals
   * (below) are the only usable evidence, per the approved SVG design. */
  isSvg: boolean;
  /** `<title>`/`<desc>`/`aria-label` text extracted directly from inline
   * `<svg>` markup — free, no fetch. Null for `<img>`-referenced sources
   * (a `.svg` `<img>` needs a lazy, separate fetch — see
   * `fetchSvgStructuralText` in `logoHash.ts` — to obtain this same kind
   * of text, only attempted when cheaper signals are inconclusive). */
  svgStructuralText: string | null;
}

export type InstitutionSignalStrength = "strong" | "weak" | "none";

/** One tier's independent verdict on the target's institution — computed
 * without reference to any specific candidate page. `institutionId` is
 * non-null only when this tier's evidence specifically names one known
 * institution (never a generic/shared brand — see
 * `resolveInstitutionIdentity`'s doc comment on why `Institution.brandNames`
 * is deliberately excluded from this). */
export interface InstitutionSignalResult {
  institutionId: string | null;
  strength: InstitutionSignalStrength;
  /** Human-readable excerpt of what matched (e.g. "URL token \"mahe\"",
   * "logo alt text \"Manipal Academy of Higher Education\""), or a short
   * reason when strength is "none" (e.g. "no institution/brand text
   * found") — always present so a rejected/defaulted result is legible
   * without re-deriving it. */
  evidence: string;
}

export type InstitutionResolutionMethod =
  | "url_identifier"
  | "page_identity"
  | "logo"
  | "combined_signals"
  | "multi_university_default"
  | "single_university_default"
  | "conflict"
  | "unresolved";

export interface InstitutionResolutionResult {
  institutionId: string | null;
  institutionName: string | null;
  status: "resolved" | "conflict" | "unresolved";
  /** Never claim a signal-based method when the institution was actually
   * chosen by the fallback business rule — see the D1-follow-up
   * requirement this type exists to satisfy ("never pretend that MUJ was
   * detected when it was only the business-policy default"). */
  resolutionMethod: InstitutionResolutionMethod;
  signals: {
    url: InstitutionSignalResult;
    pageIdentity: InstitutionSignalResult;
    logo: InstitutionSignalResult;
  };
  /** True only for `multi_university_default`/`single_university_default`
   * — lets a caller/dashboard distinguish "genuinely detected" from
   * "business-policy default" at a glance without parsing
   * `resolutionMethod` strings. */
  fallbackApplied: boolean;
  /** Present only when `status === "conflict"` — the distinct institution
   * ids that disagreed, so the conflict is auditable, not just asserted. */
  conflictingInstitutionIds?: string[];
}

// ---------------------------------------------------------------------------
// Sprint 6 — Priority Fact Comparison & Explainable Reporting. See
// docs/design/SPRINT_6_IMPLEMENTATION_PLAN.md. Fully additive: the legacy
// Sprint 4 ComparisonStatus/ComparisonOutcome/PageComparisonResult types
// above are entirely unmodified (§22 backward-compatibility decision,
// approved) — this is a new, parallel result shape consumed by the new
// Priority Comparison view, alongside (not replacing) the legacy one.
// ---------------------------------------------------------------------------

/** Internal, granular status used only while building each underlying
 * field comparison inside `priorityComparison.ts` — never surfaced to a
 * consumer directly. `buildPriorityComparison`'s final output maps every
 * one of these onto the 5-value `PriorityReportStatus` vocabulary below
 * (see that type's doc comment for the exact mapping and why it's
 * narrower than this one). */
export type PriorityFieldStatus =
  | "match"
  | "changed"
  | "target_missing"
  | "master_missing"
  | "both_missing"
  | "normalization_issue"
  | "needs_review"
  /** Some, but not all, of a field's underlying sub-facts (fee
   * components, eligibility sub-requirements, specialization/curriculum
   * set items) agree — never used for a plain scalar field, only ones
   * built from `aggregatePriorityField`. */
  | "partial_match"
  /** The Specialization field only — a target that resolved directly to
   * a base program page, with no specialization/variant involved at
   * all, so there is nothing to compare (never "missing": nothing was
   * expected to be there). */
  | "not_applicable";

/** One internal, granular field comparison — building-block output of
 * `priorityComparison.ts`'s per-field helpers (`buildSemesterFeeField`,
 * `buildScalarPriorityField`, `buildListPriorityField`,
 * `buildSpecializationField`). `masterValue`/`targetValue` are already
 * display-ready strings (for list-valued fields — accreditation/rankings
 * — a comma-joined summary, not a richer nested per-item structure).
 * Evidence reuses the exact same `{url, excerpt}` shape as
 * `ExtractedClaim.sourceLocation` everywhere else in this file. Not the
 * final report row shape — see `PriorityFactRow` for that. */
export interface PriorityComparisonField {
  fieldKey: string;
  label: string;
  status: PriorityFieldStatus;
  masterValue: string | null;
  targetValue: string | null;
  /** Short, backend-authored explanation — never fabricated, always
   * derived from the actual comparison. Null when the status is self-
   * explanatory (e.g. `match`). */
  notes: string | null;
  masterEvidence: FactEvidence | null;
  targetEvidence: FactEvidence | null;
}

/** The only two values `PriorityComparison.overallStatus` can be — never
 * itself encodes an unresolved-authoritative-page state (ambiguous/not-
 * found/unreachable stay expressed via the existing
 * `TargetRunResult.outcome`/`failureReason`, which the frontend checks
 * first — `priorityComparison` is null whenever `outcome !== "success"`,
 * so this type never needs a third "can't tell" value). */
export type OverallComparisonStatus = "verified_match" | "changes_found";

/**
 * The final, user-facing status vocabulary for the Priority Fact
 * Comparison Report — exactly the 4 values the product requirement
 * specifies (2026-08-14 narrowing — a target/master-missing case is no
 * longer its own status label, only its own sentence in `notes`),
 * deliberately narrower than the internal `PriorityFieldStatus` above.
 * `buildPriorityComparison` maps every internal status onto one of these:
 * `match`/`not_applicable` -> `MATCH`; `partial_match` -> `PARTIAL`;
 * `changed`/`target_missing`/`master_missing` -> `UNMATCH` (a confirmed,
 * concrete difference either way — which side is missing what is still
 * always named explicitly in `notes`, e.g. "MISSING IN TARGET: ...");
 * `both_missing`/`normalization_issue`/`needs_review` -> `NEEDS_REVIEW`
 * (nothing safely comparable was found, or found but not confidently
 * parseable — never guessed into a false match or mismatch).
 */
export type PriorityReportStatus = "MATCH" | "PARTIAL" | "UNMATCH" | "NEEDS_REVIEW";

/** The exact 7 primary rows the Priority Fact Comparison Report shows, in
 * this fixed order — no additional primary fields without explicit
 * approval. Accreditation and Rankings & Accreditations are deliberately
 * NOT primary rows (product decision, 2026-08-14) — they're still fully
 * computed, just relocated to `PriorityComparison.secondaryFields` for
 * the Technical Details section; see `PrioritySecondaryFieldName`.
 * "Discount" (added 2026-08-19, user-requested) is its own row rather
 * than folded into Fee Structure so a Target page that simply never
 * mentions a discount Master offers is immediately visible, not one
 * clause lost inside Fee Structure's other component-by-component
 * notes. */
export type PriorityReportFieldName = "Fee Structure" | "Discount" | "Eligibility" | "Specializations" | "Course Duration" | "Course Curriculum" | "Others";

/** The (only) two fields computed exactly like a primary field but shown
 * only in Technical Details, never the primary table. */
export type PrioritySecondaryFieldName = "Accreditation" | "Rankings & Accreditations";

/** Two-sided evidence for one report row — both sides optional
 * independently (e.g. an UNMATCH row where the target simply doesn't
 * have the field at all only ever has `master` evidence). Reuses
 * `FactEvidence`, the same shape as
 * `ExtractedClaim.sourceLocation` plus the optional semantic-layer
 * provenance fields (confidence/sourceType/heading). */
export interface PriorityFactEvidence {
  master: FactEvidence | null;
  target: FactEvidence | null;
}

/** One row of the Priority Fact Comparison Report — the exact shape the
 * approved report spec calls for (Field | Master | Target | Status |
 * Notes / Evidence). `notes` is always a non-empty, backend-authored
 * sentence (never fabricated, never left for the frontend to infer from
 * the status alone) — for a field built from several sub-facts (Fee
 * Structure, Eligibility, Specializations, Course Curriculum, Others) it
 * explicitly names what's missing/different (e.g. "MISSING IN TARGET:
 * Course Duration, EMI/month"), never just a bare count. */
export interface PriorityFactRow {
  field: PriorityReportFieldName;
  masterValue: string | null;
  targetValue: string | null;
  status: PriorityReportStatus;
  notes: string;
  evidence: PriorityFactEvidence;
}

/** Same shape as `PriorityFactRow`, restricted to the two secondary
 * fields (`PrioritySecondaryFieldName`) — Accreditation and Rankings &
 * Accreditations, computed exactly the same way, shown only in Technical
 * Details, never the primary table. */
export interface PrioritySecondaryFactRow {
  field: PrioritySecondaryFieldName;
  masterValue: string | null;
  targetValue: string | null;
  status: PriorityReportStatus;
  notes: string;
  evidence: PriorityFactEvidence;
}

/** Backend-computed counts over the 7 primary `fields` rows only (never
 * `secondaryFields`) — the frontend's summary banner renders this
 * directly, it never counts statuses itself. A one-sided-missing case is
 * one of the `unmatch` count here (it's `PriorityReportStatus`'s
 * `UNMATCH`, same as any other confirmed difference — `notes` is where
 * it's named as missing, not the status/summary bucket) — `needsReview`
 * stays reserved for genuine extraction/comparison uncertainty. */
export interface PriorityComparisonSummary {
  match: number;
  partial: number;
  unmatch: number;
  needsReview: number;
}

/**
 * The Priority Fact Comparison Report — the backend's single source of
 * truth for `TargetRunResult.priorityComparison`. `masterUrl` is the
 * RESOLVED AUTHORITATIVE PAGE this target was actually compared against
 * (`TargetResolutionResult.masterUrlForComparison`) — deliberately NOT
 * the run's root Master URL the user typed into the New Run form
 * (`MultiTargetRunResult.masterUrl`), which is only the discovery/source
 * website, never the fact source for comparison. `targetUrl` is the
 * originally-requested target URL. The frontend renders `fields`/
 * `secondaryFields`/`summary` as-is; it never computes a status or a
 * count itself.
 */
export interface PriorityComparison {
  masterUrl: string;
  targetUrl: string;
  overallStatus: OverallComparisonStatus;
  /** Exactly 7 entries, in the fixed `PriorityReportFieldName` order —
   * the primary, business-facing report. */
  fields: PriorityFactRow[];
  /** Exactly 2 entries (Accreditation, Rankings & Accreditations) — full
   * detail, shown only in the Technical Details section. */
  secondaryFields: PrioritySecondaryFactRow[];
  /** Counts over `fields` only — see `PriorityComparisonSummary`. */
  summary: PriorityComparisonSummary;
}

// ---------------------------------------------------------------------------
// Semantic Fact Understanding Layer. See
// docs/design/SEMANTIC_FACT_LAYER_PLAN.md. Classifies page sections into a
// small, fixed taxonomy of business concepts by evidence (heading wording +
// nearby content shape/hierarchy), not by literal heading-text equality —
// so differently-worded headings that mean the same thing (e.g.
// "Combinations Available" and "Specializations Offered") are recognized
// as the same concept. Asset-type-agnostic, same rationale as every other
// type in this file: the actual HTML walking/section-building lives in
// modules/website-quality (`understanding/semanticSectionExtraction.ts`);
// this file only holds the shared taxonomy/interface/scoring output shape.
// ---------------------------------------------------------------------------

/** How sure the system is about one extracted fact or classification —
 * never fabricated: an uncertain result is always labeled `LOW`/`MEDIUM`,
 * never silently rounded up to `HIGH`. */
export type ExtractionConfidence = "HIGH" | "MEDIUM" | "LOW";

/** Where a piece of evidence actually came from — lets a `MATCH` built
 * from OCR'd image text never look identical to one built from plain
 * page text. */
export type EvidenceSourceType = "text" | "heading_and_text" | "table" | "structured_data" | "image_ocr";

/** Two-sided evidence shape shared by every fact in this project
 * (`ExtractedClaim.sourceLocation`, `PriorityFactEvidence`). The three
 * new fields are optional and additive — populated only by code that
 * actually went through the semantic fact layer (heading classification
 * or OCR); older, plain labeled-pattern extraction leaves them unset
 * rather than guessing a confidence/source it doesn't know. */
export interface FactEvidence {
  url: string;
  excerpt: string;
  confidence?: ExtractionConfidence;
  sourceType?: EvidenceSourceType;
  /** The actual heading text this fact was found under, when known —
   * lets a user see *why* CrossCheck decided a differently-worded
   * section was the same concept (e.g. "Combinations Available" for a
   * Specialization fact). */
  heading?: string | null;
}

/** The small, fixed taxonomy §2 of the semantic layer plan requires.
 * `OTHER` is the explicit "nothing matched" outcome, never omitted. */
export type SemanticFieldCategory =
  | "SPECIALIZATION"
  | "ACCREDITATION"
  | "RANKINGS"
  | "FEES"
  | "COURSE_DURATION"
  | "ELIGIBILITY"
  | "MODE"
  | "ADMISSION"
  | "PLACEMENT"
  | "CURRICULUM"
  | "PROGRAM_STRUCTURE"
  | "OTHER";

/** One page section's evidence, as input to a `SemanticFactClassifier` —
 * built from a parsed page's heading plus everything under it, before any
 * category has been decided. */
export interface SemanticSectionInput {
  headingText: string;
  headingLevel: 1 | 2 | 3 | 4;
  /** Short list-shaped items under this heading (`<li>`, or short leaf
   * text elements like a card-grid's title `<div>`s) — the content-shape
   * signal that lets a heading with no useful keyword of its own (e.g.
   * "Combinations Available") still be recognized by what's actually
   * listed under it. */
  nearbyListItems: string[];
  /** Longer, sentence-shaped text blocks under this heading — evidence
   * against a list-shaped category, e.g. a marketing paragraph. */
  nearbyParagraphText: string[];
  tableHeaders?: string[];
  hasImage?: boolean;
}

export interface SemanticClassification {
  category: SemanticFieldCategory;
  confidence: ExtractionConfidence;
  /** Human-readable evidence for *why* this category was chosen — e.g.
   * `"heading keyword: \"specializ\""`, `"content shape: 6 short
   * subject-like items"` — always present, so a classification is never
   * an unexplained black box. Empty when `category === "OTHER"`. */
  matchedSignals: string[];
  /** Every non-OTHER category whose score was non-zero besides the
   * winning `category`, sorted descending by score — lets a combined
   * section (e.g. "Rankings & Accreditations") be recognized as relevant
   * to BOTH RANKINGS and ACCREDITATION rather than forcing a single
   * winner, per the explicit requirement to keep those two distinct even
   * when they share a heading. */
  secondaryCategories: SemanticFieldCategory[];
}

/**
 * Provider-neutral classification interface — deliberately the only
 * contract `priorityComparison.ts`/extraction code depends on, so a
 * future AI/embedding-based implementation can be substituted later
 * without rewriting the comparison engine. `RuleBasedSemanticClassifier`
 * (packages/core/src/semantic/ruleBasedClassifier.ts) is the only
 * implementation today: deterministic keyword + content-shape scoring,
 * no ML/paid API calls anywhere in this project.
 */
export interface SemanticFactClassifier {
  classifySection(input: SemanticSectionInput): SemanticClassification;
}

/** One extracted, evidence-backed fact from the semantic layer — the
 * shape `semanticSectionExtraction.ts` (modules/website-quality) produces
 * and `priorityComparison.ts` compares. */
export interface SemanticFact {
  field: SemanticFieldCategory;
  value: string;
  sourceUrl: string;
  sourceType: EvidenceSourceType;
  heading: string | null;
  confidence: ExtractionConfidence;
  imageUrl?: string;
}
