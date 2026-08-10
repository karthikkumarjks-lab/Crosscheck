#!/usr/bin/env node
import { analyzeLandingPage } from "./analyze.js";

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: wq-analyze <landing-page-url>");
    process.exitCode = 1;
    return;
  }

  const result = await analyzeLandingPage(url);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ingestion.success) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
