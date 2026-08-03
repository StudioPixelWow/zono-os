# ZONO CRM 360 — Security & Permissions Audit

Evidence from migrations, `src/lib/supabase/server.ts`, `src/middleware.ts`, route guards, storage policies.

## Architecture facts (load-bearing)
- **Two clients:** user-scoped `createClient` (RLS enforced) vs `createServiceRoleClient` (BYPASSRLS), used in **173 files**. House rule (`20260907120000_qa1_rls_coverage.sql:1-20`): RLS provides SELECT scoping; **all writes run via service-role and bypass RLS**, relying on hand-written `org_id` filters.
- **Route protection:** `src/middleware.ts` only refreshes the session cookie — **no route guards**. App-group guard (`src/app/(app)/layout.tsx:28-31`) checks onboarding state only.
- **RLS coverage:** ~446 of ~541 created tables enable RLS; **~109 have none**.

## Findings (ranked)

### 🔴 P0-T-1 — Public storage buckets expose private documents
`supabase/migrations/20260726120000_storage_buckets.sql:22-40` creates `documents`, `property-media`, `zono-marketing-assets` with `public=true` and `for select to public`. Writes are org-scoped (`foldername[1] = current_org_id()`) but **reads are world-readable by URL**. Upload uses `getPublicUrl` and `DocumentsView.tsx:204` links `file_url` directly → contracts, IDs, legal docs leak to anyone with the path. **Highest severity.**
Fix: private buckets + signed URLs (short TTL) + RLS-scoped read; migrate existing objects.

### 🔴 P0-T-2 — Tenant isolation rests entirely on hand-written filters
All inserts/updates/deletes run under service-role (BYPASSRLS); **109 tables have no RLS**. Any of the 173 call sites that omits an `org_id` predicate = cross-tenant read/write with no DB backstop. Aggravator: `users.email` is globally `UNIQUE` (`20260618090200_core_org_roles_users.sql`), so one person can't belong to two orgs.
Fix: enable RLS on every tenant table; wrap service-role writes in an org-scoping helper that injects `org_id` and is impossible to call without it; add a build-time lint failing on tenant tables without a policy; add a two-org isolation integration test per entity.

### 🔴 P0-T-3 — Deactivation/departure not enforced
`team-admin/service.ts:setUserStatus` writes `users.status='disabled'`, but the app guard never checks `status` → disabled/departed agents keep full access, and their records are never transferred (no reassignment path).
Fix: enforce status at layout/middleware; departure workflow reassigns records + audits.

### 🟠 P1 — Supporting weaknesses
- **No error tracking / observability** — no Sentry/`captureException`; errors only `console.error`. Add centralized error + job monitoring before external exposure.
- **Server-side validation is ad-hoc** — no schema-validation layer (no zod in actions); relies on scattered field checks. Add a validation layer on all mutating actions.
- **Rate limits only on platform + Meta routes** (`platform/rate-limit`); app server actions unthrottled.
- **Audit log is best-effort and partial** — `logAudit` never throws and is not wired into most mutations; "every sensitive action auditable" is not met.
- **Soft-delete/restore inconsistent** — properties archive; core deletes are hard DELETE; no general restore UI.
- **Sessions** rely on Supabase token TTL; no idle/absolute timeout.

## What is genuinely solid
- RLS design on the ~446 covered tables uses `has_min_role` + `current_org_id()` correctly.
- Migrations are idempotent and additive (privilege-guarded storage DO blocks, `drop policy if exists`).
- Idempotency/dedup primitives (domain-event, notification, matching, journey) are real.
- Auth (signup/in/out) + onboarding gate work.

## Launch security gate (must pass before any external exposure)
1. No public buckets; all documents via signed URLs. 2. RLS on every tenant table + isolation test per entity green. 3. Deactivation enforced + departure transfer. 4. Error tracking + job monitoring live. 5. Server-side validation on all mutations. 6. Audit wired to all sensitive mutations. 7. Two-organization isolation test suite passes.
