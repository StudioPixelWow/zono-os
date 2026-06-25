# ZONO — Operational Runbooks

_Enterprise Reliability Platform™ (Phase 20). Step-by-step responses to the incidents the Health Center surfaces. Start every incident at `/system-health` to see the overall status, per-component health, and active alerts._

## How to triage

1. Open `/system-health` (admin). Note the **overall** status and which components are Warning/Critical.
2. Check the **alerts** panel — they are ranked critical-first and name the component and reason.
3. Find the matching runbook below. Each lists symptom → likely cause → action → verify.

---

## 1. Database unreachable / slow

**Symptom:** `Supabase Database` Critical, or latency in the red; many features failing.
**Likely cause:** Supabase outage, connection pool exhausted, or a slow query.
**Action:**
- Confirm Supabase project status in the Supabase dashboard.
- If latency-only: the system auto-degrades under load (cron/refresh intervals scale up, low-priority jobs pause) — let it shed load; critical workflows keep running.
- If down: no writes will succeed. Avoid manual retries; wait for Supabase recovery, then re-run any failed cron via the cron route.
**Verify:** DB latency returns to green; overall status Healthy.

## 2. Provider circuit OPEN (Apify / OpenAI / Anthropic / Email / WhatsApp / Maps)

**Symptom:** alert `מעגל פתוח: <provider>`; that provider's calls are being short-circuited.
**Likely cause:** the provider returned repeated failures (rate limit, outage, bad token), so the breaker opened to protect the system.
**Action:**
- This is **self-healing**: after the cooldown the breaker half-opens and probes; on success it closes automatically.
- Check the provider's own status page and the relevant token env var.
- For Apify specifically: sync falls back to **mock** mode when unavailable — no data loss, results are labelled.
**Verify:** breaker returns to closed; provider calls succeed again.

## 3. Dead-letter queue (DLQ) growing

**Symptom:** alert `N עבודות ב‑DLQ`.
**Likely cause:** jobs exhausted their retries or hit a non-retryable error (bad payload, downstream 4xx).
**Action:**
- Inspect the failing job type. Non-retryable errors usually mean a data/permissions problem, not a transient one — fix the root cause first.
- Once the cause is resolved, **replay** the DLQ (the queue layer exposes `planReplayDeadLetter`, which resets attempts and requeues).
**Verify:** DLQ count returns to 0; replayed jobs complete.

## 4. Queue depth high / processing lag

**Symptom:** alert `עומק תור גבוה`.
**Likely cause:** a spike in enqueues or slow workers.
**Action:**
- Under sustained pressure the degradation plan pauses low-priority queues (reports, snapshots, notifications) and keeps critical ones (property sync, journeys) running.
- If depth keeps climbing, check the DB and provider runbooks above — the bottleneck is usually downstream.
**Verify:** depth trends down; lag clears.

## 5. Error rate elevated

**Symptom:** alert `שיעור שגיאות N%`.
**Action:**
- Use the structured logs (every record carries `module`, `requestId`, `traceId`, `orgId`) to find the failing module and trace the request.
- Correlate with circuit/DB/provider alerts — the error spike usually has an upstream cause already listed above.
**Verify:** error rate back under threshold.

## 6. Cron not running

**Symptom:** `Cron` Unknown/Warning; scheduled syncs/snapshots stale.
**Likely cause:** `CRON_SECRET` missing/rotated, or the scheduler is disabled.
**Action:**
- Confirm `CRON_SECRET` is set in the deploy environment and matches the value the cron caller sends.
- Manually trigger the affected cron route (with the secret) to catch up; it is idempotent.
**Verify:** cron jobs run on schedule; component Healthy.

## 7. AI summaries unavailable

**Symptom:** `AI Providers` Unknown; narrative summaries missing.
**Likely cause:** no AI key set, or the AI circuit is open.
**Impact:** **none to core function** — deterministic engines still produce all scores, signals, and decisions. Only optional narrative text is skipped.
**Action:** set/rotate the AI key if summaries are wanted; otherwise no action needed.

## 8. Feature-flag kill-switch / rollback

**Use when:** a new behaviour behind a flag is misbehaving.
**Action:**
- Go to `/platform-admin` → Feature Flags → toggle the flag **off** (or drop its rollout % to 0). Takes effect immediately for new evaluations.
- The change is recorded in the audit log automatically (who/when/old→new).
**Full code rollback:** redeploy the previous build. Phase 20 schema is additive, so older code runs cleanly against the newer schema — no down-migration needed.

## 9. Investigating "who changed this?"

**Action:** `/platform-admin` → Audit Trail. Filter by action/resource. Each row shows actor, action, resource, source (app/cron/api/system), timestamp, and (for flags) old→new values, tied together by correlation id.
