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
}

export interface ExtractedLink {
  url: string;
  text: string | null;
  relation: "internal" | "external";
  linkType: "navigation" | "content" | "cta" | "unknown";
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
  | "url_path";

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

export type ExtractionMethod = "labeled_pattern" | "heading_scoped" | "regex";

export interface ExtractedClaim {
  fieldKey: string;
  rawValue: string;
  sourceLocation: {
    url: string;
    excerpt: string;
  };
  extractionMethod: ExtractionMethod;
  extractedAt: string;
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
}

export interface ComparisonRunResult {
  masterUrl: string;
  /** If false, no target could be meaningfully compared; results is empty. */
  masterIngestionSuccess: boolean;
  generatedAt: string;
  results: PageComparisonResult[];
}
