#!/usr/bin/env node
import { runComparison } from "./runComparison.js";

async function main(): Promise<void> {
  const [masterUrl, ...targetUrls] = process.argv.slice(2);
  if (!masterUrl || targetUrls.length === 0) {
    console.error("Usage: wq-compare <master-url> <target-url> [target-url...]");
    process.exitCode = 1;
    return;
  }

  const result = await runComparison({
    master: { masterUrl },
    targets: targetUrls.map((url) => ({ url })),
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.masterIngestionSuccess) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
