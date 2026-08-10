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
