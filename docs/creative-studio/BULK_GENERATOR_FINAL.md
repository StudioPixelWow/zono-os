# Bulk Property Generator — Final

Route: **`/creative-lab/bulk`** (Hebrew, RTL). Same test-runtime guard as the
Single Workspace.

## Behavior
- Lists the **organization's** properties only (org-scoped selection); the seed
  world includes a deliberately **invalid** property (missing required fields).
- Bounded concurrency (worker pool, default 4, capped 1–8).
- **Per-row** result: each property reports success (with output id) or its own
  failure reason.
- **Partial failure** tolerated: an invalid property fails **its own row**
  without aborting the batch; valid properties still succeed.
- **De-duplication / idempotent resume**: a deterministic idempotency key
  (`{org}:bulk:{kind}:{propertyId}`) means a re-run returns the existing output
  for each already-generated property (`deduped: true`) and creates **no
  duplicates** — safe to resume or retry.
- Duplicate property ids in the selection are collapsed before running.
- Cross-org property ids are rejected per row (org scope).

## Files
`src/app/creative-lab/bulk/page.tsx` + `BulkView.tsx`; logic in
`src/lib/creative-runtime/lab-flows.ts` (`doBulk`).

## Verification (headless, in `lab-flows.qa.ts`)
- totals add up (`succeeded + failed === total`);
- all valid rows succeed, all invalid rows fail (partial failure, batch not
  aborted);
- re-run marks every valid row `deduped` and still succeeds (idempotent, no
  duplicates);
- a beta-org run is scoped to beta's property; alpha ids submitted by beta are
  all rejected;
- the `market_stat` kind runs in bulk.
All green within the **36-assertion, 0-failed** headless flow suite.
