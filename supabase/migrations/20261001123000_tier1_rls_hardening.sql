-- ============================================================================
-- ZONO Wave 0 — Tier-1 tenant RLS hardening (ADDITIVE/IDEMPOTENT, NOT APPLIED).
-- Enables org-scoped RLS on the highest-risk tenant tables. Idempotent: safe to
-- run whether or not a table already has RLS/policies. NO `USING (true)` for
-- tenant records; policies derive the org from current_org_id() (session), never
-- from client input. Writes still route through the org-scope boundary.
--
-- NOTE: the EXACT set of the ~109 unprotected tables must be enumerated on
-- staging via `select tablename from pg_tables t where not exists (select 1 from
-- pg_policies p where p.tablename=t.tablename)`. This file hardens the Tier-1 CRM
-- core; the full pack is generated from that query. Rollback: drop the policies.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'persons','person_identifiers','person_roles','person_merge_log',
    'buyers','sellers','leads','properties','tasks','notes','meetings',
    'documents','deals','opportunities','matching_results',
    'import_batches','import_rows','import_mappings',
    'journeys','activity_events','communication_threads','communication_messages'
  ]
  loop
    -- enable RLS if the table exists
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('alter table public.%I enable row level security', t);
      -- org-scoped SELECT (only if a policy of this name doesn't already exist)
      if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='zono_tenant_select') then
        execute format(
          'create policy zono_tenant_select on public.%I for select using (organization_id = public.current_org_id())', t);
      end if;
    end if;
  end loop;
end $$;

-- Writes deliberately have NO permissive client-side INSERT/UPDATE/DELETE policy:
-- all mutations run through the service-role client behind the app-layer
-- org-scope boundary (src/lib/security/org-scope.ts). If direct client writes are
-- ever enabled for a table, add a with-check policy mirroring current_org_id()
-- here — never `with check (true)`.
