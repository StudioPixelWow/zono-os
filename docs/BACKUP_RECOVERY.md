# ZONO — Backup & Recovery

_Enterprise Reliability Platform™ (Phase 20). How ZONO data is protected and how the system recovers after an interruption._

## What holds state

All durable state lives in **Supabase Postgres** (org-scoped tables) and **Supabase Storage** (creative/visual assets). There is no other system of record. The application servers are stateless — they can be redeployed at any time without data loss.

## Backups

- **Database:** rely on Supabase automated backups (point-in-time recovery on supported plans). Confirm the retention window matches your RPO and that PITR is enabled for production.
- **Storage:** Supabase Storage buckets hold uploaded media + generated creatives. Generated creatives are reproducible from their persisted `render_data`/prompts, so they are recoverable even without a bucket backup; original uploads are not, so back the buckets up.
- **Schema:** every schema change is a committed migration in `supabase/migrations/`. The schema is fully reproducible from git — re-applying migrations in order rebuilds an empty database.
- **Configuration:** environment variables are the only out-of-band config; keep them in your deploy platform's secret store, not in the repo.

## Recovery objectives

- **RPO** (max acceptable data loss): bounded by the Supabase backup/PITR interval.
- **RTO** (max acceptable downtime): bounded by Supabase restore time + an application redeploy (stateless, minutes).

## Restore procedure

1. **Database:** restore the Supabase project to the chosen point in time (Supabase dashboard / PITR). If rebuilding from scratch, create a project and apply all migrations in `supabase/migrations/` in timestamp order.
2. **Storage:** restore buckets from the storage backup if originals were lost.
3. **Application:** redeploy the current build. No state to restore on the app tier.
4. **Verify:** open `/system-health` — DB Healthy, no critical alerts. Spot-check a few org dashboards for expected data.

## In-flight work recovery (Phase 20)

The platform is built to resume cleanly after a crash or redeploy without double-processing:

- **Queues:** jobs are durable rows. On restart, `planClaim` re-selects due pending jobs deterministically (priority → runAt → id) so concurrent workers take disjoint batches. Jobs stuck in `claimed`/`running` past the lease window are requeued by `planRecovery`.
- **Idempotency:** enqueues carry an idempotency key; `shouldEnqueue` rejects a duplicate while an equivalent job is pending/claimed/running, so a retry after a crash will not create a second job.
- **Retries & DLQ:** transient failures are retried with backoff; exhausted/non-retryable jobs land in the DLQ and can be replayed once the cause is fixed (`planReplayDeadLetter`).
- **Journeys / snapshots / syncs / reports:** all are resumable — they read current durable state and recompute, rather than depending on in-memory progress. Re-running them is safe (idempotent upserts keyed by org + date/entity).
- **Determinism:** because the engines are deterministic, re-running a recovery step over the same inputs produces the same outputs — recovery never drifts the data.

## Drills

- Periodically restore a backup into a scratch project and run `npx tsx scripts/zono-production-readiness.ts` against it to confirm the restore is usable.
- Test a DLQ replay and a queue-recovery cycle in staging so the on-call team has muscle memory.
