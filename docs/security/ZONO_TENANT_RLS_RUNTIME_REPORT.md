# ZONO — Tenant RLS Runtime Report

## Delivered
`supabase/migrations/20261001123000_tier1_rls_hardening.sql` — idempotent, additive: enables RLS + `zono_tenant_select (organization_id = current_org_id())` on up to 22 Tier-1 tables. No `USING (true)`. Client-supplied org id is never trusted; org derives from `current_org_id()` (session). Writes stay behind the org-scope boundary (no permissive client write policy).

## Per-table rule (Tier-1)
Ownership = `organization_id`. SELECT: `organization_id = current_org_id()`. INSERT/UPDATE/DELETE: no client policy → via service-role + org-scope boundary (create injects org; update/delete assert cross-tenant deny + ownership). Manager override + owner override handled in the boundary. Inactive member: denied (boundary). Global/reference tables excluded (explicit allow-read/lock-write, per registry).

## Missing organization_id
For records lacking `organization_id` (indirect FK path, e.g. *_intelligence_profiles → parent): do NOT guess. On staging, generate a preview mapping via the parent FK; backfill only high-confidence; mark ambiguous; a row of unknown ownership must NOT become globally visible (default-deny select until scoped).

## Runtime proof: BLOCKED (needs staging)
Applying the pack + running the two-org isolation suite requires a staging DB. The exact set of the ~109 unprotected tables must be enumerated on staging (`pg_tables` minus `pg_policies`) and folded into the pack. Until applied on prod (operator step), cross-tenant write risk on the ~109 tables remains open.
