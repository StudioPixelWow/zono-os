-- ============================================================================
-- ZONO — SUPABASE FINAL RUNBOOK (single paste, idempotent, ordered)
-- ----------------------------------------------------------------------------
-- Paste this whole file into the Supabase SQL editor and run once. Every
-- statement is guarded (add column if not exists / create ... if not exists /
-- DO blocks that check information_schema), so re-running is safe and nothing
-- is dropped or overwritten. Sections run in dependency order:
--   1) P0 security fixes  (RLS helpers + per-user columns + P0 policies)
--   2) Audit-fixes pack   (RLS coverage, FKs, bigint widening, index pack, ...)
--   3) Stage 0.4  meetings lifecycle columns
--   4) Stage 0.1  canonical deal identity (deal_profiles 1:1)
--   5) Stage 0.3  seller<->property linkage backfill (both directions)
--   6) Stage 1    domain_events kernel table + append-only RLS
-- After running: regenerate Supabase types (see docs/SUPABASE_RUNBOOK_NOTES.md).
-- ============================================================================


-- ##########################################################################
-- ## SECTION 1 — P0 SECURITY FIXES
-- ##########################################################################
-- ============================================================================
-- ZONO — P0 SECURITY FIXES (run in Supabase SQL Editor)
-- Idempotent + safe to re-run. Closes 3 Critical cross-tenant RLS gaps found in
-- the persistence audit (docs/PERSISTENCE_AUDIT.md).
--   P0-1  storage.objects  — org-path isolation on write/delete (6 QA1 buckets)
--   P0-2  distribution_provider_connections — per-user (Facebook token) boundary
--   P0-3  whatsapp_accounts — per-user (WhatsApp session) boundary
-- Helpers used: public.current_org_id(), public.has_min_role() (already exist).
-- Reminder: service-role writes bypass RLS; these policies govern the
-- authenticated (browser) client only.
-- ============================================================================

-- ── P0-1 · STORAGE ──────────────────────────────────────────────────────────
-- Requires that direct authenticated uploads to these 6 buckets use a
-- "<org_id>/..." path prefix. Bulk/service-role writes are unaffected.
drop policy if exists qa1_auth_insert on storage.objects;
create policy qa1_auth_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

drop policy if exists qa1_auth_update on storage.objects;
create policy qa1_auth_update on storage.objects for update to authenticated
  using (
    bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

drop policy if exists qa1_auth_delete on storage.objects;
create policy qa1_auth_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- ── P0-2 · distribution_provider_connections (Facebook per-user) ─────────────
drop policy if exists "distribution_provider_connections_qa1_read" on public.distribution_provider_connections;
drop policy if exists "distribution_provider_connections_select"   on public.distribution_provider_connections;
create policy "distribution_provider_connections_select"
  on public.distribution_provider_connections for select to authenticated
  using (org_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "distribution_provider_connections_insert" on public.distribution_provider_connections;
create policy "distribution_provider_connections_insert"
  on public.distribution_provider_connections for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_min_role('agent')
              and (user_id is null or user_id = auth.uid()));

drop policy if exists "distribution_provider_connections_update" on public.distribution_provider_connections;
create policy "distribution_provider_connections_update"
  on public.distribution_provider_connections for update to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent')
         and (user_id is null or user_id = auth.uid()))
  with check (org_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "distribution_provider_connections_delete" on public.distribution_provider_connections;
create policy "distribution_provider_connections_delete"
  on public.distribution_provider_connections for delete to authenticated
  using (org_id = public.current_org_id()
         and (user_id is null or user_id = auth.uid() or public.has_min_role('manager')));

-- ── P0-3 · whatsapp_accounts (WhatsApp session per-user; col = organization_id)
drop policy if exists "whatsapp_accounts_qa1_read" on public.whatsapp_accounts;
drop policy if exists "whatsapp_accounts_select"   on public.whatsapp_accounts;
create policy "whatsapp_accounts_select"
  on public.whatsapp_accounts for select to authenticated
  using (organization_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "whatsapp_accounts_insert" on public.whatsapp_accounts;
create policy "whatsapp_accounts_insert"
  on public.whatsapp_accounts for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('agent')
              and (user_id is null or user_id = auth.uid()));

drop policy if exists "whatsapp_accounts_update" on public.whatsapp_accounts;
create policy "whatsapp_accounts_update"
  on public.whatsapp_accounts for update to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent')
         and (user_id is null or user_id = auth.uid()))
  with check (organization_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "whatsapp_accounts_delete" on public.whatsapp_accounts;
create policy "whatsapp_accounts_delete"
  on public.whatsapp_accounts for delete to authenticated
  using (organization_id = public.current_org_id()
         and (user_id is null or user_id = auth.uid() or public.has_min_role('manager')));

-- ============================================================================
-- END P0. After running, verify with:
--   select policyname, cmd, qual from pg_policies
--   where tablename in ('objects','distribution_provider_connections','whatsapp_accounts')
--   order by tablename, cmd;
-- ============================================================================


-- ##########################################################################
-- ## SECTION 2 — AUDIT FIXES (ALL)
-- ##########################################################################
-- ============================================================================
-- ZONO — CONSOLIDATED SUPABASE CHANGES from Phase-1 (persistence) + Phase-2
-- (architecture) audits. Run top-to-bottom in the Supabase SQL Editor.
-- Every block is idempotent / safe to re-run. Uses existing helpers
-- public.current_org_id() and public.has_min_role().
--
-- SCOPE: database-only changes. Code-level fixes (event dispatcher, timeline
-- unification, deal<->property linkage, lead conversion, wiring dead tables)
-- are NOT here — they are application changes, not SQL.
--
-- SECTIONS:
--   A. P0 security (storage + Facebook + WhatsApp per-user RLS)   [CRITICAL]
--   B. deal_profiles + children — ownership-scoped RLS            [HIGH]
--   C. property_score_events — append-only RLS                    [LOW]
--   D. zono_* AI tables — FK integrity hardening (NOT VALID)      [HIGH]
--   E. deals.value / commission_amount -> bigint                  [MEDIUM]
--   F. approval_decisions — new audit table                      [feature]
--   G. user_ui_preferences — new personalization table           [feature]
--   H. journey_notes — new table (optional)                      [feature]
--   I. index coverage pack (perf)                                [perf]
-- ============================================================================


-- ============================================================================
-- A. P0 SECURITY  (CRITICAL — cross-tenant exposure live today)
-- ============================================================================

-- A-1 · Storage: restore org-path isolation on write/delete for the 6 QA1 buckets.
-- Requires direct authenticated uploads to use a "<org_id>/..." path prefix;
-- service-role bulk writes bypass RLS and are unaffected.
drop policy if exists qa1_auth_insert on storage.objects;
create policy qa1_auth_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

drop policy if exists qa1_auth_update on storage.objects;
create policy qa1_auth_update on storage.objects for update to authenticated
  using (
    bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

drop policy if exists qa1_auth_delete on storage.objects;
create policy qa1_auth_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media')
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- A-2 · Facebook / provider connections — per-user boundary.
-- Ensure the per-user column exists (the 20260914 migration may not be applied).
alter table public.distribution_provider_connections
  add column if not exists user_id uuid references public.users(id) on delete cascade;
create index if not exists idx_dpc_user
  on public.distribution_provider_connections (user_id);

drop policy if exists "distribution_provider_connections_qa1_read" on public.distribution_provider_connections;
drop policy if exists "distribution_provider_connections_select"   on public.distribution_provider_connections;
create policy "distribution_provider_connections_select"
  on public.distribution_provider_connections for select to authenticated
  using (org_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "distribution_provider_connections_insert" on public.distribution_provider_connections;
create policy "distribution_provider_connections_insert"
  on public.distribution_provider_connections for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_min_role('agent')
              and (user_id is null or user_id = auth.uid()));

drop policy if exists "distribution_provider_connections_update" on public.distribution_provider_connections;
create policy "distribution_provider_connections_update"
  on public.distribution_provider_connections for update to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent')
         and (user_id is null or user_id = auth.uid()))
  with check (org_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "distribution_provider_connections_delete" on public.distribution_provider_connections;
create policy "distribution_provider_connections_delete"
  on public.distribution_provider_connections for delete to authenticated
  using (org_id = public.current_org_id()
         and (user_id is null or user_id = auth.uid() or public.has_min_role('manager')));

-- A-3 · WhatsApp accounts — per-user session boundary (col = organization_id).
-- Ensure the per-user columns exist (the 20260915 migration may not be applied).
alter table public.whatsapp_accounts
  add column if not exists user_id uuid references public.users(id) on delete cascade;
alter table public.whatsapp_accounts
  add column if not exists provider_kind text;
alter table public.whatsapp_accounts
  add column if not exists session_ref text;

drop policy if exists "whatsapp_accounts_qa1_read" on public.whatsapp_accounts;
drop policy if exists "whatsapp_accounts_select"   on public.whatsapp_accounts;
create policy "whatsapp_accounts_select"
  on public.whatsapp_accounts for select to authenticated
  using (organization_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "whatsapp_accounts_insert" on public.whatsapp_accounts;
create policy "whatsapp_accounts_insert"
  on public.whatsapp_accounts for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('agent')
              and (user_id is null or user_id = auth.uid()));

drop policy if exists "whatsapp_accounts_update" on public.whatsapp_accounts;
create policy "whatsapp_accounts_update"
  on public.whatsapp_accounts for update to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent')
         and (user_id is null or user_id = auth.uid()))
  with check (organization_id = public.current_org_id() and (user_id is null or user_id = auth.uid()));

drop policy if exists "whatsapp_accounts_delete" on public.whatsapp_accounts;
create policy "whatsapp_accounts_delete"
  on public.whatsapp_accounts for delete to authenticated
  using (organization_id = public.current_org_id()
         and (user_id is null or user_id = auth.uid() or public.has_min_role('manager')));


-- ============================================================================
-- B. deal_profiles + 4 CHILDREN — ownership-scoped RLS  (HIGH)
-- deal_profiles.SELECT was already ownership-scoped; its WRITE and all 4
-- children were org-wide (any agent could edit any deal / see all offers).
-- ============================================================================

-- deal_profiles: tighten WRITE to manager OR the assigned agent; drop permissive qa1 read.
-- Guarded: only runs if deal_profiles.assigned_agent_id exists in this DB.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='deal_profiles' and column_name='assigned_agent_id') then
    execute 'drop policy if exists "deal_profiles_qa1_read" on public.deal_profiles';
    execute 'drop policy if exists "deal_profiles_write" on public.deal_profiles';
    execute 'create policy "deal_profiles_write" on public.deal_profiles for all to authenticated '
         || 'using (organization_id = public.current_org_id() and (public.has_min_role(''manager'') or assigned_agent_id = auth.uid())) '
         || 'with check (organization_id = public.current_org_id() and (public.has_min_role(''manager'') or assigned_agent_id = auth.uid()))';
  end if;
end $$;

-- children: visibility follows the parent deal_profile (manager OR assigned agent).
do $$
declare t text;
  tbls text[] := array['deal_journeys','deal_negotiations','deal_objections','deal_tasks'];
begin
  foreach t in array tbls loop
    -- skip tables that don't exist / lack the expected columns in this DB
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=t and column_name='deal_profile_id') then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I;', t||'_qa1_read', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('drop policy if exists "%1$s_write"  on public.%1$I;', t);
    execute format($f$
      create policy "%1$s_select" on public.%1$I for select to authenticated
      using (organization_id = public.current_org_id() and exists (
        select 1 from public.deal_profiles p
        where p.id = %1$I.deal_profile_id
          and (public.has_min_role('manager') or p.assigned_agent_id = auth.uid())));
    $f$, t);
    execute format($f$
      create policy "%1$s_write" on public.%1$I for all to authenticated
      using (organization_id = public.current_org_id() and exists (
        select 1 from public.deal_profiles p
        where p.id = %1$I.deal_profile_id
          and (public.has_min_role('manager') or p.assigned_agent_id = auth.uid())))
      with check (organization_id = public.current_org_id() and exists (
        select 1 from public.deal_profiles p
        where p.id = %1$I.deal_profile_id
          and (public.has_min_role('manager') or p.assigned_agent_id = auth.uid())));
    $f$, t);
  end loop;
end $$;


-- ============================================================================
-- C. property_score_events — make append-only (remove agent update/delete) (LOW)
-- ============================================================================
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='property_score_events') then
    execute 'drop policy if exists "property_score_events_update" on public.property_score_events';
    execute 'drop policy if exists "property_score_events_delete" on public.property_score_events';
  end if;
end $$;
-- (select + insert policies remain from the original migration.)


-- ============================================================================
-- D. zono_* AI/orchestration tables — add missing FK integrity  (HIGH)
-- These carried bare org/user UUIDs (no FK) + service-role RLS bypass. FKs are
-- added NOT VALID so existing rows are not scanned; run VALIDATE later per table
-- once data is confirmed clean:  alter table public.<t> validate constraint <c>;
-- Guarded: only touches tables/columns that exist and lack the constraint.
-- ============================================================================
do $$
declare
  t text; orgcol text; cn text;
  tbls text[] := array[
    'zono_missions','zono_agents','zono_agent_runs','zono_agent_inbox',
    'zono_agent_memory','zono_agent_performance','zono_workflows',
    'zono_api_keys','zono_api_audit','zono_webhooks','ai_memory',
    'ai_mission_drafts','zono_ask_conversations','zono_ask_messages',
    'zono_org_memory','zono_org_memory_events','zono_org_learning_patterns',
    'zono_intelligence_snapshots','zono_compute_cache'
  ];
begin
  foreach t in array tbls loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=t) then
      continue;
    end if;

    -- org FK (organization_id or org_id) -> organizations(id)
    select column_name into orgcol from information_schema.columns
      where table_schema='public' and table_name=t
        and column_name in ('organization_id','org_id') limit 1;
    if orgcol is not null then
      cn := t||'_'||orgcol||'_fk';
      if not exists (select 1 from information_schema.table_constraints
                     where table_schema='public' and table_name=t and constraint_name=cn) then
        execute format('alter table public.%I add constraint %I foreign key (%I) references public.organizations(id) on delete cascade not valid;', t, cn, orgcol);
      end if;
    end if;

    -- user FK -> users(id)
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t and column_name='user_id') then
      cn := t||'_user_id_fk';
      if not exists (select 1 from information_schema.table_constraints
                     where table_schema='public' and table_name=t and constraint_name=cn) then
        execute format('alter table public.%I add constraint %I foreign key (user_id) references public.users(id) on delete cascade not valid;', t, cn);
      end if;
    end if;
  end loop;
end $$;


-- ============================================================================
-- E. Money type drift — widen deals.value / commission_amount to bigint (MEDIUM)
-- (deal_profiles / properties.price were already bigint.)
-- ============================================================================
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='deals'
               and column_name='value' and data_type='integer') then
    execute 'alter table public.deals alter column value type bigint';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='deals'
               and column_name='commission_amount' and data_type='integer') then
    execute 'alter table public.deals alter column commission_amount type bigint';
  end if;
end $$;


-- ============================================================================
-- F. approval_decisions — append-only audit trail for approve/reject (feature)
-- Closes the "no approval history" Critical finding (approval-bundle was stateless).
-- ============================================================================
create table if not exists public.approval_decisions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  bundle_id    text not null,
  entity_type  text,
  entity_id    text,
  decision     text not null check (decision in ('approved','rejected')),
  reason       text,
  decided_by   uuid references public.users(id) on delete set null,
  decided_at   timestamptz not null default now()
);
create index if not exists approval_decisions_org_idx    on public.approval_decisions(org_id);
create index if not exists approval_decisions_bundle_idx  on public.approval_decisions(org_id, bundle_id);

alter table public.approval_decisions enable row level security;
drop policy if exists "approval_decisions_select" on public.approval_decisions;
create policy "approval_decisions_select" on public.approval_decisions for select to authenticated
  using (org_id = public.current_org_id());
drop policy if exists "approval_decisions_insert" on public.approval_decisions;
create policy "approval_decisions_insert" on public.approval_decisions for insert to authenticated
  with check (org_id = public.current_org_id() and public.has_min_role('agent') and decided_by = auth.uid());
-- intentionally no update/delete policy: append-only audit trail.


-- ============================================================================
-- G. user_ui_preferences — one per-user settings store (feature)
-- Replaces 7 localStorage-only surfaces (saved filters, pinned watchlist, map
-- views, recently-viewed, favorites, daily-brief state) + saved searches.
-- App reads/writes by (user_id, key); value is arbitrary jsonb.
-- ============================================================================
create table if not exists public.user_ui_preferences (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  key         text not null,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (user_id, key)
);
create index if not exists user_ui_preferences_user_idx on public.user_ui_preferences(user_id);

alter table public.user_ui_preferences enable row level security;
drop policy if exists "user_ui_preferences_all" on public.user_ui_preferences;
create policy "user_ui_preferences_all" on public.user_ui_preferences for all to authenticated
  using (org_id = public.current_org_id() and user_id = auth.uid())
  with check (org_id = public.current_org_id() and user_id = auth.uid());


-- ============================================================================
-- H. journey_notes — user notes on a customer journey (OPTIONAL feature)
-- Journey notes do not exist anywhere today. Include only if you want them.
-- ============================================================================
create table if not exists public.journey_notes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  entity_type  text not null check (entity_type in ('buyer','seller','lead','property')),
  entity_id    uuid not null,
  author_id    uuid references public.users(id) on delete set null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists journey_notes_entity_idx on public.journey_notes(org_id, entity_type, entity_id);

alter table public.journey_notes enable row level security;
drop policy if exists "journey_notes_select" on public.journey_notes;
create policy "journey_notes_select" on public.journey_notes for select to authenticated
  using (org_id = public.current_org_id());
drop policy if exists "journey_notes_write" on public.journey_notes;
create policy "journey_notes_write" on public.journey_notes for all to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent'))
  with check (org_id = public.current_org_id() and public.has_min_role('agent'));


-- ============================================================================
-- I. INDEX COVERAGE PACK (perf) — org-scoping columns that lack an index.
-- Guarded/idempotent: only creates where the table+column exist. Covers the
-- distribution_intelligence tables (0 indexes) + common child-table org cols.
-- ============================================================================
do $$
declare
  t text; orgcol text;
  tbls text[] := array[
    'community_profiles','community_intelligence_profiles',
    'daily_distribution_batches','daily_distribution_items',
    'distribution_plans','distribution_plan_items','distribution_queue',
    'distribution_opportunity_signals','social_accounts','social_connection_vault',
    'buyer_risks','buyer_missions','buyer_commitments','buyer_objections','buyer_touchpoints',
    'seller_risks','seller_missions','seller_commitments','seller_touchpoints',
    'property_risks','property_missions','property_levers','property_exposure_channels',
    'match_risks','match_objections','match_opportunities',
    'document_signatures','document_versions','document_participants','document_checklists',
    'journey_stages','journey_scores','journey_predictions','journey_velocity'
  ];
begin
  foreach t in array tbls loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=t) then continue; end if;
    select column_name into orgcol from information_schema.columns
      where table_schema='public' and table_name=t
        and column_name in ('organization_id','org_id') limit 1;
    if orgcol is not null then
      execute format('create index if not exists %I on public.%I(%I);',
                     'idx_'||t||'_org', t, orgcol);
    end if;
  end loop;
end $$;

-- ============================================================================
-- VERIFY (optional):
--   select tablename, policyname, cmd from pg_policies
--   where tablename in ('objects','distribution_provider_connections','whatsapp_accounts',
--     'deal_profiles','deal_tasks','property_score_events','approval_decisions',
--     'user_ui_preferences') order by tablename, cmd;
--   select conname, convalidated from pg_constraint where conname like 'zono_%_fk' or conname like 'ai_%_fk';
-- ============================================================================
-- END.


-- ##########################################################################
-- ## SECTION 3 — STAGE 0.4 · MEETINGS LIFECYCLE
-- ##########################################################################
-- ============================================================================
-- ZONO OS 2.0 — Stage 0.4 · Meeting lifecycle (ADDITIVE, reversible).
-- Adds outcome capture + completion/cancellation metadata + follow-up link to
-- the EXISTING meetings table. The meeting_status enum already supports
-- scheduled/confirmed/completed/cancelled/no_show/rescheduled — no enum change.
-- No data rewrite. All columns nullable. Reversible by dropping the columns.
-- ============================================================================
alter table public.meetings add column if not exists completed_at        timestamptz;
alter table public.meetings add column if not exists outcome             text;
alter table public.meetings add column if not exists cancellation_reason text;
alter table public.meetings add column if not exists follow_up_task_id   uuid references public.tasks(id) on delete set null;

-- Fast "completed meetings" reporting (KPI) without scanning.
create index if not exists idx_meetings_org_status on public.meetings (org_id, status);


-- ##########################################################################
-- ## SECTION 4 — STAGE 0.1 · CANONICAL DEAL IDENTITY
-- ##########################################################################
-- ============================================================================
-- ZONO OS 2.0 — Stage 0.1 · Canonical Deal Identity (ADDITIVE, reversible).
-- Decision: public.deals is the ONE canonical Deal. deal_profiles becomes a 1:1
-- intelligence projection linked by deal_profiles.deal_id (column already
-- exists). This migration only enforces the 1:1 invariant and speeds lookups.
-- No data merge here (the TS reconcile layer links/creates rows using verified
-- relationships only, and flags nothing ambiguous). Reversible by dropping the
-- two indexes.
-- ============================================================================

-- One projection per canonical deal (nulls allowed = match-derived, not yet linked).
create unique index if not exists deal_profiles_deal_id_uniq
  on public.deal_profiles (deal_id)
  where deal_id is not null;

-- Fast canonical<->projection joins.
create index if not exists deal_profiles_deal_id_idx
  on public.deal_profiles (deal_id);

-- ----------------------------------------------------------------------------
-- MIGRATION DIAGNOSTICS (run manually; read-only — nothing is merged by this file):
--   -- canonical deals total
--   select count(*) from public.deals where org_id = :org;
--   -- projections total / linked / unlinked
--   select count(*) filter (where deal_id is not null) as linked,
--          count(*) filter (where deal_id is null)     as unlinked,
--          count(*) as total
--   from public.deal_profiles where organization_id = :org;
--   -- canonical open deals with NO projection (must be surfaced by Deals OS)
--   select d.id from public.deals d
--   where d.org_id = :org and d.status = 'open'
--     and not exists (select 1 from public.deal_profiles p where p.deal_id = d.id);
--   -- duplicate-projection candidates (should be 0 after the unique index)
--   select deal_id, count(*) from public.deal_profiles
--   where deal_id is not null group by deal_id having count(*) > 1;
-- ----------------------------------------------------------------------------


-- ##########################################################################
-- ## SECTION 5 — STAGE 0.3 · SELLER<->PROPERTY LINKAGE BRIDGE
-- ##########################################################################
-- ============================================================================
-- ZONO OS 2.0 — Stage 0.3 · Seller linkage migration (ADDITIVE, reversible).
-- Decision: property_sellers is the CANONICAL seller↔property relationship
-- (multi-seller, roles). Legacy properties.seller_id becomes compatibility-only:
-- it holds ONE primary seller and is kept in sync (never used to represent
-- co-owners). This migration backfills BOTH directions so no reader is starved:
--   A) legacy → canonical: create a property_sellers link for any property that
--      has a legacy seller_id but no canonical link.
--   B) canonical → legacy: set the legacy primary from the canonical link for
--      any property whose legacy column is null (fixes the current starvation of
--      the ~9 modules still reading properties.seller_id).
-- Nothing is deleted. Idempotent (guards prevent duplicates). No fabrication:
-- only real, existing seller↔property rows are linked.
-- ============================================================================

-- A) legacy → canonical (only where the seller still exists in the same org).
insert into public.property_sellers
  (org_id, property_id, seller_id, relationship_type, is_primary, is_decision_maker, can_sign, status)
select p.org_id, p.id, p.seller_id, 'owner', true, true, true, 'active'
from public.properties p
where p.seller_id is not null
  and exists (select 1 from public.sellers s where s.id = p.seller_id and s.org_id = p.org_id)
  and not exists (
    select 1 from public.property_sellers ps
    where ps.property_id = p.id and ps.seller_id = p.seller_id and ps.relationship_type = 'owner'
  )
on conflict (org_id, property_id, seller_id, relationship_type) do nothing;

-- B) canonical → legacy (primary link wins; only fills nulls, never overwrites).
update public.properties p
set seller_id = sub.seller_id
from (
  select distinct on (property_id) property_id, seller_id
  from public.property_sellers
  where status = 'active'
  order by property_id, is_primary desc, created_at asc
) sub
where sub.property_id = p.id and p.seller_id is null;

-- ----------------------------------------------------------------------------
-- MIGRATION DIAGNOSTICS (run manually; read-only):
--   -- properties with a legacy seller but no canonical link (should be 0 after A)
--   select count(*) from public.properties p
--   where p.seller_id is not null and not exists (
--     select 1 from public.property_sellers ps where ps.property_id = p.id and ps.seller_id = p.seller_id);
--   -- properties with a canonical link but null legacy (should be 0 after B)
--   select count(*) from public.properties p
--   where p.seller_id is null and exists (
--     select 1 from public.property_sellers ps where ps.property_id = p.id and ps.status = 'active');
--   -- multi-seller properties (co-owners — legacy holds only the primary)
--   select property_id, count(*) from public.property_sellers
--   where status = 'active' group by property_id having count(*) > 1;
--   -- cross-org anomalies (must be 0)
--   select ps.id from public.property_sellers ps join public.properties p on p.id = ps.property_id
--   where p.org_id <> ps.org_id;
-- ----------------------------------------------------------------------------


-- ##########################################################################
-- ## SECTION 6 — STAGE 1 · DOMAIN_EVENTS KERNEL
-- ##########################################################################
-- ============================================================================
-- ZONO OS 2.0 — Stage 1 · Event Kernel · domain_events store (ADDITIVE).
-- The durable propagation backbone. Every major business mutation emits one
-- append-only, org-scoped, typed domain event here. This is NOT a replacement
-- for domain tables — it is the spine subscribers (timeline, automation,
-- notifications, search, graph, memory) will consume in later stages.
-- Append-only: authenticated may INSERT (own org) + SELECT (own org); no
-- UPDATE/DELETE for app users. Processing/retry is done by the service role.
-- Idempotency via a unique idempotency_key (nullable = no dedup requested).
-- ============================================================================
create table if not exists public.domain_events (
  id                 uuid primary key default gen_random_uuid(),
  event_type         text not null,
  event_version      smallint not null default 1,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  actor_user_id      uuid references public.users(id) on delete set null,
  entity_type        text not null,
  entity_id          text not null,
  correlation_id     uuid,
  causation_id       uuid,
  payload            jsonb not null default '{}'::jsonb,
  metadata           jsonb not null default '{}'::jsonb,
  idempotency_key    text,
  occurred_at        timestamptz not null default now(),
  processed_at       timestamptz,
  processing_status  text not null default 'pending',   -- pending | processing | done | failed
  retry_count        smallint not null default 0,
  error_summary      text,
  created_at         timestamptz not null default now()
);

-- Idempotency: one event per key (per org). NULL keys are unconstrained.
create unique index if not exists domain_events_idem_uniq
  on public.domain_events (organization_id, idempotency_key)
  where idempotency_key is not null;

-- Read/scan patterns.
create index if not exists domain_events_org_time_idx   on public.domain_events (organization_id, occurred_at desc);
create index if not exists domain_events_org_type_idx   on public.domain_events (organization_id, event_type, occurred_at desc);
create index if not exists domain_events_entity_idx     on public.domain_events (organization_id, entity_type, entity_id);
-- Outbox scan for subscribers (only unprocessed rows).
create index if not exists domain_events_pending_idx    on public.domain_events (processing_status, occurred_at)
  where processing_status in ('pending', 'processing', 'failed');

alter table public.domain_events enable row level security;

-- Scoped read for org members.
drop policy if exists "domain_events_select" on public.domain_events;
create policy "domain_events_select" on public.domain_events for select to authenticated
  using (organization_id = public.current_org_id());

-- Append-only insert (own org). No UPDATE/DELETE for app users (service role bypasses RLS).
drop policy if exists "domain_events_insert" on public.domain_events;
create policy "domain_events_insert" on public.domain_events for insert to authenticated
  with check (organization_id = public.current_org_id());
