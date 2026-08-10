#!/usr/bin/env node
import { analyzeLandingPage } from "./analyze.js";
import { resolveForAnalysis } from "./resolveForAnalysis.js";

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: wq-analyze <landing-page-url>");
    process.exitCode = 1;
    return;
  }

  const analysis = await analyzeLandingPage(url);
  const { sourceResolution, discovery } = resolveForAnalysis(analysis);

  console.log(JSON.stringify({ analysis, sourceResolution, discovery }, null, 2));
  if (!analysis.ingestion.success) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
