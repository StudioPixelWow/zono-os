// ============================================================================
// ZONO — Per-item isolation for bounded background batches (PURE, unit-testable).
// Runs `fn` over each item; a thrown item is caught, counted, and surfaced via
// `onError` — it NEVER aborts the remaining batch, so one failing org/row can't
// starve every tenant after it in a reconcile run. Order of successful results is
// preserved. No IO, no clock.
// ============================================================================
export async function runIsolated<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  onError?: (item: T, err: unknown) => void,
): Promise<{ results: R[]; failed: number }> {
  const results: R[] = [];
  let failed = 0;
  for (const item of items) {
    try {
      results.push(await fn(item));
    } catch (err) {
      failed++;
      onError?.(item, err);
    }
  }
  return { results, failed };
}
