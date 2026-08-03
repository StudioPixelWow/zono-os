# ZONO — Service-Role Write Migration Report

## Scan (real)
171 files use `createServiceRoleClient`; ~337 distinct write ops (literal-table pattern; repository writes via `const TABLE` are under-counted). Registry: `docs/security/zono-service-role-write-sites.json`.

## Tiers
- **Tier 1 (highest risk — tenant CRM):** persons/lead/buyer/seller/property/deal creation, membership/invitations (`org_invitations`, `users`, `roles`, `organizations`), assignment/ownership changes, deletes/archives (`properties/repository.ts` delete), import writes, exports. Direct sites found: leads (agent-website, office-website), org_invitations (team-admin), properties (repository delete), tasks (multiple), users/organizations (operating-areas, onboarding). Repository-layer buyer/seller/deal writes must be enumerated by AST (const-table indirection).
- **Tier 2:** tasks/meetings, matching, communication/whatsapp, automation, reporting materialization.
- **Tier 3 (safe):** brokerage_*/external_listings/property_transactions ingestion, global reference jobs — non-tenant intelligence data; no CRM exposure.

## Wrapper contract
`scopedWrite(actor, table, op, payload)`: `assertWrite(actor, {targetOrganizationId: actor.organizationId, action, ownerUserId})` then service-role op; injects `organization_id` on create; refuses a payload carrying a foreign org id. **Complete only when a cross-tenant-denial test passes for the site.**

## Status
Boundary + decision: implemented + tested (org-scope 13 tests). Wiring into the 173 sites: **not started** — must be done per-site with actor/tenant context understood (not mechanically), Tier 1 first. Runtime proof needs the two-org suite on staging.
