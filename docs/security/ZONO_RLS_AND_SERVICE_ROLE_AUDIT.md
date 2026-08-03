# ZONO — RLS & Service-Role Audit

## The architecture (confirmed)
- Two clients: user-scoped `createClient` (RLS enforced) vs `createServiceRoleClient` (BYPASSRLS), used in **173 files**.
- House rule (`20260907120000_qa1_rls_coverage.sql:1-20`): RLS provides SELECT scoping; **all writes run via service-role and bypass RLS**, relying on hand-written `org_id` filters.
- `src/middleware.ts` only refreshes the session; no route guards. App guard (`(app)/layout.tsx:28-31`) checks onboarding only.
- ~446/541 created tables enable RLS; **~109 have none**.

## Risk
Any of the 173 service-role write sites that omits an `org_id` predicate = cross-tenant write with **no DB backstop**. RLS SELECT scoping does not protect writes. 109 tables have neither.

## Remediation (this phase delivers the boundary; application is operator-side)
1. **Org-scoped write boundary** — `src/lib/security/org-scope.ts` (pure decision, 13 tests): deny-by-default, cross-tenant always denied, inactive members denied, ownership + manager gates. Every service-role write must call `assertWrite(actor, target)` and derive `target.targetOrganizationId` from the authenticated session (never the client).
2. **Wrapper (design):** a `scopedWrite(actor, table, op, payload)` helper that (a) loads the actor's active membership server-side, (b) injects `organization_id = actor.organizationId` on create, (c) asserts on update/delete via `authorizeWrite`, (d) refuses payloads carrying a foreign `organization_id`. Replaces raw `serviceClient.from(x).insert(...)` at the 173 sites incrementally, highest-risk tables first (persons, documents, deals, buyers, sellers, leads).
3. **RLS coverage:** enable org-scoped SELECT RLS on all TENANT/USER/SENSITIVE tables (registry). New Wave-1 tables already ship with RLS (persons/import migrations).
4. **CI lint:** fail build if a tenant-class table lacks a policy.

## Verification (pending runtime on staging)
The two-org isolation suite (`ZONO_TWO_ORG_ISOLATION_MATRIX.md`) exercises SELECT/INSERT/UPDATE/DELETE/search/file/service-role-wrapper isolation per entity. Must be run on a staging DB with both migrations applied — not production.
