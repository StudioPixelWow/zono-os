# ZONO — Production Readiness Checklist

_Enterprise Reliability Platform™ (Phase 20). This is the gate every release passes before it reaches agents. Run the automated gate first, then confirm the manual items._

## Automated gate

Run the readiness script. It must report **NOT READY → 0 FAIL** before deploy.

```bash
npx tsx scripts/zono-production-readiness.ts
```

It covers: TypeScript (`tsc --noEmit`), ESLint (`--max-warnings 0`), the platform reliability dev-check, presence + uniqueness of migrations, required and recommended environment, and the operational docs.

Also run the platform invariants directly during development:

```bash
npx tsx scripts/platform-dev-check.ts   # must print ALL CHECKS PASSED
```

## Environment

**Required (deploy fails without these):**

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client + auth.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only repositories, cron, audit writes. Never exposed to the browser.

**Recommended for production (system degrades gracefully without them):**

- `CRON_SECRET` — guards every cron route. Without it the Health Center marks Cron `unknown`.
- `APIFY_TOKEN` — real Yad2/Madlan/GovMap providers. Without it sync runs in **mock** mode (clearly labelled).
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` — AI **summaries only**. Without a key, deterministic engines still run; only the optional narrative text is skipped.

The deterministic engines are the source of truth. AI never scores, triggers, approves, or gates anything — a missing AI key is never a functional outage.

## Database

- Apply all migrations in `supabase/migrations/` in timestamp order. Phase 20 adds `20260750120000_enterprise_reliability_platform.sql` (`feature_flags` + `platform_audit_log`).
- All Phase 20 tables are **additive** and org-scoped via `current_org_id()` + `has_min_role()`. No existing table is altered.
- Confirm RLS is enabled on `feature_flags` and `platform_audit_log` (the migration enables it; verify in the Supabase dashboard).
- `platform_audit_log` is **append-only** — there is no app-level UPDATE/DELETE path. Inserts go through the service role.

## Security

- Admin surfaces (`/system-health`, `/platform-admin`) require `admin`+ — enforced server-side in `assertPlatformAdminAccess`, not just by hiding nav.
- Secrets are redacted from all structured logs (`redact()` strips secret-keyed and secret-shaped values).
- Cron routes require `CRON_SECRET`. See `docs/SECURITY_AUDIT.md`.

## Observability

- Confirm `/system-health` loads and the overall status is **Healthy** (DB latency green, no critical alerts).
- Confirm `/platform-admin` lists feature flags and the audit trail.
- Structured logs flow through `createLogger` (no raw `console.log` in production paths).

## Reliability invariants (verified by the dev-check)

- Retries only retryable errors, exponential backoff + jitter, capped at `maxDelayMs`, bounded by `maxAttempts`.
- Circuit breakers (Apify, OpenAI, Anthropic, Email, WhatsApp, Maps): closed → open after N failures → half-open after cooldown → closed after probes.
- Queue: idempotency dedup, DLQ on exhaustion/non-retryable, cancellation + recovery + replay.
- Rate limits enforced per subject (AI 60/min, sync 10, cron 4, reports 20, exports 30, auth 10).
- Graceful degradation under load **always keeps critical workflows running**; only low/non-critical work is shed.

## Rollout

- Use feature flags for risky changes: enable for `admin`+ first, then ramp the rollout % gradually. Every flag change is recorded in the audit log automatically.
- Have the rollback path ready (see `docs/RUNBOOKS.md` → Rollback).

## Sign-off

- [ ] Automated gate: 0 FAIL.
- [ ] Migrations applied, RLS verified.
- [ ] Required env present in the deploy environment.
- [ ] `/system-health` overall Healthy.
- [ ] Runbooks + backup/recovery reviewed by the on-call owner.
