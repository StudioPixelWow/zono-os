# ZONO — Security Audit

_Enterprise Reliability Platform™ (Phase 20). The security posture of the platform, with emphasis on the Phase 20 surfaces (Health Center, Feature Flags, Audit Trail) and the cross-cutting controls they rely on._

## Tenancy & isolation

- **Org scoping everywhere.** Every business table is scoped by `org_id` and protected by Row-Level Security using `public.current_org_id()`. No query can read another org's rows.
- **Role gating.** Write/admin paths use `public.has_min_role(...)`. Role ranks: owner 100, admin 80, manager 60, team_leader 50, agent 40, viewer 20.
- **Phase 20 tables.**
  - `feature_flags` — readable by org members (so flags resolve) plus global defaults (`org_id is null`); writable only by `admin`+ within their org.
  - `platform_audit_log` — readable by `admin`+ within their org; **append-only** (no app UPDATE/DELETE), inserts via service role to preserve integrity even for member-initiated actions.

## Authentication & authorization

- Admin tools (`/system-health`, `/platform-admin`) are gated **server-side** by `assertPlatformAdminAccess` (admin+), not merely hidden in the nav. A non-admin hitting the route by URL gets an authorization error, not data.
- Server actions re-assert access on every call; they never trust client-supplied org/user identity.
- The service-role key is used only in server-only modules (`import "server-only"`) and is never bundled to the browser.

## Secrets handling

- **Log redaction.** All structured logs flow through `createLogger`; `redact()` removes secret-keyed fields (`secret`, `token`, `api_key`, `password`, `authorization`, `service_role`, `bearer`, `cookie`) and secret-shaped values (`sk-…`, JWT `eyJ…`, `bearer …`) — recursively, including nested objects and arrays.
- **No raw `console.log`** in production paths — logging is centralized so redaction can't be bypassed.
- Secrets live only in the deploy platform's secret store and `process.env`; none are committed.

## Cron & automation

- Every cron route requires `CRON_SECRET`; requests without the matching secret are rejected. The Health Center marks Cron `unknown` when the secret is unset so misconfiguration is visible.
- Cron and system actions are attributed in the audit log with `source = cron` / `system` and a null actor, so automated changes are distinguishable from human ones.

## Auditability

- The central audit log captures **who / what / when / old → new / source / correlation id** for sensitive operations (e.g. feature-flag changes). Correlation/request/trace ids tie multi-step operations together for forensics.
- Audit writes are best-effort and isolated: a failure to record an audit entry is logged but never breaks the originating operation, and never silently succeeds without a log.

## Rate limiting & abuse protection

- Per-subject fixed-window limits: AI 60/min, sync 10/min, cron 4/min, reports 20/min, exports 30/min, auth 10/min. Auth limiting blunts credential-stuffing; AI/sync limiting blunts cost-abuse.

## Resilience as a security property

- Circuit breakers prevent a failing/compromised upstream from being hammered and from cascading failures.
- Graceful degradation sheds non-critical load while keeping critical workflows up, reducing the blast radius of a partial outage.

## Data exposure boundaries

- External market data (Yad2/Madlan/GovMap) is **public** data only; no scraping of private or authenticated content, and estimates are labelled as estimates.
- AI providers receive only sanitized, business-level context for summaries — never secrets, credentials, or cross-org data.

## Known limitations / follow-ups

- The nav role tier exposes platform-admin entries to `admin`+; final authority is the server-side gate, which is the control that matters. Nav visibility is convenience only.
- Audit retention/rotation is governed by the database backup policy (see `docs/BACKUP_RECOVERY.md`); define a retention window that matches compliance requirements.
- RLS is verified by re-applying migrations against a real Postgres; confirm policies in the Supabase dashboard after each deploy.
