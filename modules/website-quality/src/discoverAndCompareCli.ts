#!/usr/bin/env node
import { discoverAndCompare } from "./discoverAndCompare.js";

async function main(): Promise<void> {
  const [masterUrl, targetUrl, ...additionalTargetUrls] = process.argv.slice(2);
  if (!masterUrl || !targetUrl) {
    console.error("Usage: wq-discover-compare <master-url> <target-url> [additional-target-url...]");
    process.exitCode = 1;
    return;
  }

  const { resolution, comparison } = await discoverAndCompare(masterUrl, [targetUrl, ...additionalTargetUrls]);

  console.log(JSON.stringify({ resolution, comparison }, null, 2));
  if (!resolution.masterUrlForComparison || !comparison?.masterIngestionSuccess) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
