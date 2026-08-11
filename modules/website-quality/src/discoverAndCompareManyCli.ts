#!/usr/bin/env node
import { runMultiTargetDiscoveryAndComparison } from "./discoverAndCompareMany.js";

async function main(): Promise<void> {
  const [masterUrl, ...targetUrls] = process.argv.slice(2);
  if (!masterUrl || targetUrls.length === 0) {
    console.error("Usage: wq-discover-compare-many <master-url> <target-url> [additional-target-url...]");
    process.exitCode = 1;
    return;
  }

  const result = await runMultiTargetDiscoveryAndComparison(masterUrl, targetUrls, {
    onProgress: (snapshot) => {
      process.stderr.write(
        `[${snapshot.phase}] queued=${snapshot.queued} processing=${snapshot.processing} completed=${snapshot.completed}/${snapshot.total} ` +
          `(success=${snapshot.successful} ambiguous=${snapshot.ambiguous} notFound=${snapshot.notFound} failed=${snapshot.failed}) ` +
          `${snapshot.elapsedMs}ms\n`,
      );
    },
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.summary.successful === 0 && result.uniqueTargetCount > 0) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
