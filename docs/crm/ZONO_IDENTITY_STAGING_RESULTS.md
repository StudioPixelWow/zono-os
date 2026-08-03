# ZONO — Identity Staging Results

## Status: BACKFILL NOT RUN (no staging DB; production not mutated).
Option C approved. The persons schema + resolver are ready; the dry-run clustering must execute on a staging copy of the data — not production.

## What runs on staging (ready)
For each org: load buyers+sellers+leads → `resolveIdentity` per row against accumulating persons → report groups: exact_high (auto-link), likely, ambiguous, conflicting, distinct; possible self-matches (actor==person); cross-org collisions (rejected by design — resolver only compares within the caller's org set); migration errors; performance (rows/sec); unresolved risks.

## Expected footprint (from live counts, NOT applied)
buyers 2, sellers 2, leads 0 → the current dataset is tiny; the backfill is low-risk and fast. The VALUE is the write-path gate preventing future fragmentation at scale, not this small backfill.

## Numbers
total analyzed: **pending staging** · exact: — · likely: — · ambiguous: — · conflicting: — · distinct: — · self-matches: — · cross-org rejected: — (structurally 0 — resolver is org-scoped) · errors: — · perf: —.

## Guarantees
No auto-merge of ambiguous/conflicting; no legacy record deleted; no production read switched to persons; Wave 1 NOT claimed complete.
