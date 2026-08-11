/**
 * Runs `fn` over `items` with at most `concurrency` in flight at once —
 * enough to keep a large batch of URL fetches from opening that many
 * simultaneous outbound HTTP requests, without any queue/job-system
 * infrastructure. Extracted from runComparison.ts (Sprint 4) so Sprint 5's
 * crawlCandidates.ts can reuse it without duplicating it — per
 * docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md §18 Decision #3. Pure move,
 * behavior unchanged.
 */
export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await fn(items[current]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
