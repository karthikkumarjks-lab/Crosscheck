import { randomUUID } from "node:crypto";
import type { LandingPageAnalysis } from "@crosscheck/core";
import { ingestUrl } from "./ingestion/index.js";
import { parseLandingPage } from "./extraction/index.js";
import { understandLandingPage } from "./understanding/index.js";

function buildWarnings(understanding: ReturnType<typeof understandLandingPage>): string[] {
  const warnings: string[] = [];
  if (!understanding.institution) {
    warnings.push("institution could not be confidently identified");
  }
  if (!understanding.brand) {
    warnings.push("brand could not be distinguished from institution (or not found)");
  }
  if (!understanding.program || !understanding.degree) {
    warnings.push("program/degree could not be confidently identified");
  }
  if (understanding.pageType && understanding.pageType.confidence === "low") {
    warnings.push("page type identified with low confidence only");
  }
  if (understanding.claims.length === 0) {
    warnings.push("no structured claims were extracted from this page");
  }
  return warnings;
}

/**
 * Component G — the MVP interface: Landing Page URL -> Website Quality
 * analysis result. Orchestrates ingestion (A) -> extraction (B) ->
 * understanding (C), matching docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md.
 * No source resolution or comparison — see that document's "Out of Scope."
 */
export async function analyzeLandingPage(requestedUrl: string): Promise<LandingPageAnalysis> {
  const requestId = randomUUID();
  const analyzedAt = new Date().toISOString();

  const ingestion = await ingestUrl(requestedUrl);
  if (!ingestion.success || !ingestion.html) {
    return {
      requestId,
      analyzedAt,
      input: { requestedUrl },
      ingestion,
      extraction: null,
      understanding: null,
      warnings: [`ingestion failed: ${ingestion.failureReason ?? "unknown"}`],
    };
  }

  const parsed = parseLandingPage(ingestion.html, ingestion.finalUrl);
  const understanding = understandLandingPage(parsed);

  return {
    requestId,
    analyzedAt,
    input: { requestedUrl },
    ingestion,
    extraction: {
      title: parsed.title,
      metaDescription: parsed.metaDescription,
      headings: parsed.headings,
      mainText: parsed.mainText,
      structuredData: parsed.structuredData,
      links: parsed.links,
    },
    understanding,
    warnings: buildWarnings(understanding),
  };
}
