# ZONO CRM 360 — Staging Monitoring & Operational Readiness (Phase 10)

**Date:** 2026-08-05 · **Target:** staging `zono-dev` (`tlrefajhyrqnjtmimaos`)

Two parts: **queryable operational checks** (ready now, against the reconciled schema) and **external alerting wiring** (requires the deployed app + an observability backend — open).

## Part A — Ready-to-run operational checks (SQL)

These run today against staging and become meaningful as the queues take traffic. Wire each into a scheduled check / dashboard.

**Stuck / overdue queue jobs (any lease expired while still claimed):**
```sql
select 'publish' q, count(*) from meta_publish_job
  where status in ('claimed','executing') and lease_expires_at < now()
union all select 'reconcile', count(*) from meta_reconciliation_job
  where status in ('claimed','executing') and lease_expires_at < now()
union all select 'comment', count(*) from meta_comment_ingestion_job
  where status in ('claimed','executing') and lease_expires_at < now();
```

**Due but unclaimed backlog (dispatcher not keeping up):**
```sql
select count(*) from meta_publish_job
  where status in ('scheduled','available','retry_wait') and run_after < now() - interval '10 minutes';
```

**Repeated retries / near-exhaustion:**
```sql
select id, job_kind, attempt_count, max_attempts from meta_publish_job
  where attempt_count >= max_attempts - 1 and status <> 'succeeded';
```

**Dead-letter growth / unacknowledged:**
```sql
select count(*) filter (where acknowledged_at is null) as unacked,
       count(*) filter (where created_at > now() - interval '24 hours') as last_24h
from meta_publish_dead_letter;
```

**Open critical publish discrepancies:**
```sql
select severity, count(*) from meta_publish_discrepancy
  where status='open' group by severity;
```

**Unmatched webhooks (org_id null, aging):**
```sql
select count(*) from meta_webhook_event
  where org_id is null and received_at < now() - interval '1 hour';
```

**Overdue collections (CRM finance):**
```sql
select count(*) from collections where payment_status in ('pending','partial') and due_date < current_date;
```

## Part B — External alerting & app observability (⛔ open, needs deployed app)

Not wired in this session. To satisfy the phase, once deployed connect the app + Postgres logs to an observability backend and create alerts for:

- application server errors / failed server actions
- failed queue jobs, dead-letter growth, orphaned publishing jobs, overdue dead-letter records
- failed Copilot jobs, failed Creative-QA persistence, signed-document failures
- authorization/RLS-denial spikes, provider-failure spikes, repeated retries, queue stuck
- slow queries, cron freshness

**Log hygiene (must hold):** never log tokens, ciphertext plaintext, document/message bodies beyond necessity, or secrets. The schema already keeps bodies encrypted (`*_ciphertext`) and tokens as `token_ref`; alerting must not decrypt or dump them.

## Status

| Item | Status |
|---|---|
| Queryable operational checks (Part A) | ✅ provided, run against staging today |
| External alerting / app observability (Part B) | ⛔ open — needs deployed app + backend |
