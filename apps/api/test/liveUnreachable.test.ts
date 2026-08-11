import { describe, expect, it } from "vitest";
import { startRun } from "../src/adapter.js";

/**
 * LIVE test, deliberately: this calls the real, unmocked backend
 * (`runMultiTargetDiscoveryAndComparison`, through the real adapter),
 * proving the actual pipeline -- not a fixture claiming to be one --
 * produces `target_unreachable` for a genuinely unreachable target.
 * Uses `http://127.0.0.1:1/...` (a port nothing listens on) rather than
 * any external domain, so this is deterministic and has no dependency on
 * a real site's uptime -- the same pattern the backend's own
 * `logoHash.test.ts` already uses for "connection refused". No mocking
 * anywhere in this file.
 */
describe("live: adapter.startRun against a genuinely unreachable target", () => {
  it("produces outcome 'target_unreachable' for a target the network cannot reach", async () => {
    const result = await startRun("http://127.0.0.1:1/", ["http://127.0.0.1:1/unreachable-target"], () => {});

    expect(result.perTarget).toHaveLength(1);
    expect(result.perTarget[0].outcome).toBe("target_unreachable");
    expect(result.perTarget[0].resolution.failureReason).toBe("target_unreachable");
    expect(result.perTarget[0].resolution.masterUrlForComparison).toBeNull();
  }, 15000);
});
