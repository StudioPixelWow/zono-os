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
