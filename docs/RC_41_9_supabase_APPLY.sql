-- ============================================================================
-- ZONO — PHASE 41.9 · SQL to run on LIVE Supabase (post-phase-34 schema)
-- ----------------------------------------------------------------------------
-- 100% idempotent: create table if not exists / add column if not exists /
-- create index if not exists / every policy preceded by drop policy if exists.
-- Safe to run in full even if some objects already exist. Run in the Supabase
-- SQL editor. Phases 41.x added NO new tables — they reuse existing schema;
-- this bundle is the post-phase-34 schema the live DB must contain.
-- Order matters — do not reorder the blocks below.
-- ============================================================================


-- ============================================================================
-- FILE: 20260720120000_distribution_phase3.sql
-- ============================================================================
-- ============================================================================
-- ZONO — Distribution Phase 3 (additive columns to connect the UI to real data)
-- ----------------------------------------------------------------------------
-- The 9 distribution tables already exist (20260718120000_distribution_engine).
-- This migration ADDITIVELY adds the columns the Phase-3 spec references that
-- did not yet exist, plus their indexes. Existing columns are reused via the
-- repository layer (e.g. spec `url`→group_url, `area`→locality, `target_audience`
-- →audience, `campaign_goal`→objective). Idempotent: every change uses
-- IF NOT EXISTS so re-running is safe. RLS + updated_at triggers already exist
-- on these tables and automatically cover new columns.
-- ============================================================================

-- 3. distribution_campaign_groups — when the group was selected into the campaign.
alter table public.distribution_campaign_groups
  add column if not exists selected_at timestamptz not null default now();

-- 4. distribution_variations — link a variation to the post it produced + the
--    explicit hook line + a dedicated lead score (lead_score in the spec; the
--    table already had prediction_score, which the repo maps to lead_score too).
alter table public.distribution_variations
  add column if not exists post_id    uuid references public.distribution_posts(id) on delete set null,
  add column if not exists hook       text,
  add column if not exists lead_score integer not null default 0 check (lead_score between 0 and 100);
create index if not exists distribution_variations_post_idx on public.distribution_variations(post_id);

-- 6. distribution_comments — external identity of the comment + author profile +
--    a numeric buyer-intent score.
alter table public.distribution_comments
  add column if not exists external_comment_id text,
  add column if not exists author_profile_url  text,
  add column if not exists lead_intent_score   integer not null default 0 check (lead_intent_score between 0 and 100);
create index if not exists distribution_comments_external_idx on public.distribution_comments(org_id, external_comment_id);

-- 8. distribution_analytics — per-post analytics + raw funnel counters + rate.
alter table public.distribution_analytics
  add column if not exists post_id         uuid references public.distribution_posts(id) on delete cascade,
  add column if not exists impressions     integer not null default 0,
  add column if not exists clicks          integer not null default 0,
  add column if not exists conversion_rate numeric(5,2) not null default 0;
create index if not exists distribution_analytics_post_idx on public.distribution_analytics(post_id);

-- 9. distribution_automations — tie an automation to a campaign + unified config +
--    the next scheduled run time.
alter table public.distribution_automations
  add column if not exists campaign_id  uuid references public.distribution_campaigns(id) on delete cascade,
  add column if not exists config_json  jsonb not null default '{}'::jsonb,
  add column if not exists next_run_at  timestamptz;
create index if not exists distribution_automations_campaign_idx on public.distribution_automations(campaign_id);
create index if not exists distribution_automations_next_run_idx on public.distribution_automations(org_id, next_run_at);


-- ============================================================================
-- FILE: 20260722120000_distribution_comments_phase7.sql
-- ============================================================================
-- ============================================================================
-- ZONO — Distribution Phase 7 (comment collector + lead detection)
-- ----------------------------------------------------------------------------
-- Additive columns on distribution_comments for the classification + manual
-- comment-import flow (used until an official Meta API connection exists).
-- distribution_comments already has: author_name, author_profile_url,
-- external_comment_id, comment_text, sentiment, intent, intent_score,
-- lead_intent_score, is_lead, handled. This adds the richer classification +
-- suggested reply + the lead link. Idempotent; RLS + triggers already cover it.
-- ============================================================================

alter table public.distribution_comments
  add column if not exists category           text,    -- asks_for_price | asks_for_details | asks_for_location | asks_for_photos | asks_for_phone | interested | not_relevant | spam | negative | broker_comment
  add column if not exists suggested_reply     text,
  add column if not exists should_create_lead  boolean not null default false,
  add column if not exists analysis_reason     text,
  add column if not exists lead_id             uuid references public.distribution_leads(id) on delete set null;

create index if not exists distribution_comments_category_idx on public.distribution_comments(org_id, category);
create index if not exists distribution_comments_lead_idx     on public.distribution_comments(lead_id);


-- ============================================================================
-- FILE: 20260816120000_zono_missions.sql
-- ============================================================================
-- ============================================================================
-- ZONO — Universal Mission Engine™ (Phase 27.5). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- Persists executable missions derived from AI decisions. ENTITY-AGNOSTIC:
-- entity_type/entity_id can reference ANY business entity (office, broker,
-- property, seller, buyer, lead, territory, valuation, campaign, …). Nothing
-- executes automatically — status gates every mission/task. Justified: an
-- execution system requires durable mission/task/history state that no existing
-- table models. No changes to valuation / discovery / decision-engine schema.
-- ============================================================================

create table if not exists public.zono_missions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid,
  source_decision  text,
  entity_type      text not null,
  entity_id        text,
  entity_name      text,
  mission_type     text not null,
  priority         integer not null default 50,
  business_impact  text not null default 'medium',   -- high | medium | low
  confidence       integer not null default 50,
  reason           text,
  goal             text,
  expected_outcome text,
  status           text not null default 'WAITING_FOR_APPROVAL',
  owner            text,
  tasks            jsonb not null default '[]'::jsonb,
  history          jsonb not null default '[]'::jsonb,
  evidence         jsonb not null default '[]'::jsonb,
  metadata         jsonb not null default '{}'::jsonb,
  due_at           timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  created_by       uuid
);
create index if not exists zm_entity_idx   on public.zono_missions (entity_type, entity_id);
create index if not exists zm_org_idx      on public.zono_missions (organization_id, status);
create index if not exists zm_status_idx   on public.zono_missions (status);
create index if not exists zm_updated_idx  on public.zono_missions (updated_at desc);

alter table public.zono_missions enable row level security;

-- Org members read their org's missions (zono owner sees all). All writes go
-- through the service-role layer (bypasses RLS).
drop policy if exists zm_select on public.zono_missions;
create policy zm_select on public.zono_missions for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());

grant select on public.zono_missions to authenticated;
grant all    on public.zono_missions to service_role;


-- ============================================================================
-- FILE: 20260901120000_zono_agents.sql
-- ============================================================================
-- ============================================================================
-- ZONO — Persistent Agent Operations™ (Phase 29.2). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- Persists the Autonomous AI Agent Framework so agents survive deploys, inbox
-- recommendations persist, approvals/rejections are tracked, and approved
-- recommendations can create missions/tasks. NOTHING auto-executes — every inbox
-- item is 'pending' until a human approves/rejects. Justified: durable agent
-- state (enabled flag, runs, inbox, memory, performance) is not modelled by any
-- existing table. No changes to protected engines.
-- ============================================================================

-- Enabled/disabled state + timings, per org + agent.
create table if not exists public.zono_agents (
  organization_id  uuid not null,
  agent_id         text not null,
  agent_type       text,
  name             text,
  enabled          boolean not null default true,
  schedule_mode    text,
  last_run_at      timestamptz,
  next_run_at      timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (organization_id, agent_id)
);
create index if not exists za_org_idx on public.zono_agents (organization_id);

-- One row per agent run.
create table if not exists public.zono_agent_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  agent_id         text not null,
  ran_at           timestamptz not null default now(),
  proposals        integer not null default 0,
  blocked          integer not null default 0,
  skipped          boolean not null default false,
  skip_reason      text,
  trigger          text not null default 'manual'
);
create index if not exists zar_org_agent_idx on public.zono_agent_runs (organization_id, agent_id, ran_at desc);

-- Persistent inbox — survives refresh/deploy. Dedup on (org, dedupe_key).
create table if not exists public.zono_agent_inbox (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  dedupe_key        text not null,
  agent_id          text not null,
  agent_name        text,
  kind              text not null,          -- recommendation | mission | task | draft
  entity            text,
  recommendation    text not null,
  reason            text,
  evidence          jsonb not null default '[]'::jsonb,
  confidence        integer not null default 0,
  impact            text not null default 'medium',
  urgency           integer not null default 0,
  mission_type      text,
  entity_type       text,
  entity_id         text,
  entity_name       text,
  requires_approval boolean not null default true,
  status            text not null default 'pending',  -- pending | approved | rejected | completed
  blocked           boolean not null default false,
  block_reason      text,
  explain           jsonb not null default '{}'::jsonb,
  created_mission_id uuid,
  decision_reason   text,
  decided_at        timestamptz,
  decided_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);
create index if not exists zai_org_status_idx on public.zono_agent_inbox (organization_id, status, urgency desc);
create index if not exists zai_agent_idx on public.zono_agent_inbox (organization_id, agent_id);

-- Organizational memory log (not LLM memory).
create table if not exists public.zono_agent_memory (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  agent_id         text not null,
  kind             text not null,          -- recommended | approved | rejected | completed | failed | ignored
  detail           text,
  at               timestamptz not null default now()
);
create index if not exists zam_org_agent_idx on public.zono_agent_memory (organization_id, agent_id, at desc);

-- Performance snapshots over time.
create table if not exists public.zono_agent_performance (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  agent_id         text not null,
  captured_at      timestamptz not null default now(),
  recommendations  integer not null default 0,
  approved         integer not null default 0,
  rejected         integer not null default 0,
  completed        integer not null default 0,
  failed           integer not null default 0,
  ignored          integer not null default 0,
  success_rate     integer not null default 0,
  avg_impact       integer not null default 0,
  false_positives  integer not null default 0
);
create index if not exists zap_org_agent_idx on public.zono_agent_performance (organization_id, agent_id, captured_at desc);

-- RLS: org members read their org's rows (zono owner sees all); writes via service_role.
do $$
declare t text;
begin
  foreach t in array array['zono_agents','zono_agent_runs','zono_agent_inbox','zono_agent_memory','zono_agent_performance'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_zono_owner() or organization_id = public.current_org_id());', t, t);
    execute format('grant select on public.%I to authenticated;', t);
    execute format('grant all on public.%I to service_role;', t);
  end loop;
end $$;


-- ============================================================================
-- FILE: 20260902120000_zono_workflows.sql
-- ============================================================================
-- ============================================================================
-- ZONO — Persistent Workflow Execution™ (Phase 30.4.1). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- Persists AI Workflow Builder instances so workflows survive refresh/deploy.
-- ENTITY-AGNOSTIC (entity_type/entity_id can reference any business entity).
-- NOTHING executes automatically — status gates every workflow/step, and an
-- approved action step only creates a mission/draft (which are THEMSELVES
-- approval-gated). No changes to existing tables or protected-engine schema.
-- ============================================================================

create table if not exists public.zono_workflows (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid,
  template_id      text not null,
  name             text not null,
  entity_type      text not null,
  entity_id        text,
  entity_name      text,
  trigger          text not null,
  status           text not null default 'draft',   -- draft|running|waiting_approval|blocked|completed|cancelled
  progress         jsonb not null default '{}'::jsonb,
  explain          jsonb not null default '{}'::jsonb,
  context          jsonb not null default '{}'::jsonb,
  version          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  created_by       uuid
);
create index if not exists zw_org_idx     on public.zono_workflows (organization_id, status);
create index if not exists zw_entity_idx  on public.zono_workflows (entity_type, entity_id);
create index if not exists zw_status_idx  on public.zono_workflows (status);
create index if not exists zw_updated_idx on public.zono_workflows (updated_at desc);

create table if not exists public.zono_workflow_steps (
  id                uuid primary key default gen_random_uuid(),
  workflow_id       uuid not null references public.zono_workflows(id) on delete cascade,
  step_key          text not null,                  -- template-relative step id (s1..sN)
  step_order        integer not null default 0,
  title             text not null,
  kind              text not null,                  -- condition|action|wait
  action            text,                           -- CREATE_MISSION|CREATE_DRAFT|CREATE_TASK|REQUEST_APPROVAL|NOTIFY_USER|SCHEDULE_FOLLOWUP
  mission_type      text,
  requires_approval boolean not null default false,
  status            text not null default 'pending',
  why               text,
  blocked_reason    text,
  outcome           text,
  created_mission_id uuid,
  updated_at        timestamptz not null default now(),
  unique (workflow_id, step_key)
);
create index if not exists zws_wf_idx on public.zono_workflow_steps (workflow_id, step_order);

create table if not exists public.zono_workflow_history (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references public.zono_workflows(id) on delete cascade,
  at           timestamptz not null default now(),
  step_key     text,
  event        text not null,                       -- created|approved|rejected|completed|blocked|cancelled|executed
  note         text
);
create index if not exists zwh_wf_idx on public.zono_workflow_history (workflow_id, at desc);

alter table public.zono_workflows       enable row level security;
alter table public.zono_workflow_steps  enable row level security;
alter table public.zono_workflow_history enable row level security;

-- Org members read their org's workflows (zono owner sees all). All writes go
-- through the service-role layer (bypasses RLS).
drop policy if exists zw_select on public.zono_workflows;
create policy zw_select on public.zono_workflows for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());

drop policy if exists zws_select on public.zono_workflow_steps;
create policy zws_select on public.zono_workflow_steps for select to authenticated
  using (exists (select 1 from public.zono_workflows w where w.id = workflow_id
    and (public.is_zono_owner() or w.organization_id = public.current_org_id())));

drop policy if exists zwh_select on public.zono_workflow_history;
create policy zwh_select on public.zono_workflow_history for select to authenticated
  using (exists (select 1 from public.zono_workflows w where w.id = workflow_id
    and (public.is_zono_owner() or w.organization_id = public.current_org_id())));

grant select on public.zono_workflows        to authenticated;
grant select on public.zono_workflow_steps    to authenticated;
grant select on public.zono_workflow_history  to authenticated;
grant all    on public.zono_workflows         to service_role;
grant all    on public.zono_workflow_steps    to service_role;
grant all    on public.zono_workflow_history  to service_role;


-- ============================================================================
-- FILE: 20260903120000_zono_platform_api.sql
-- ============================================================================
-- ============================================================================
-- ZONO — Platform API™ & Integration Hub (Phase 31.0). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- API keys (personal/org) with scopes + rate limits, an audit log, and webhook
-- subscriptions. Secrets are stored HASHED (sha256); the plaintext is shown once.
-- The API exposes existing engines read-only + approval-gated actions — nothing
-- auto-executes. No changes to existing tables / protected-engine schema.
-- ============================================================================

create table if not exists public.zono_api_keys (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid,
  name               text not null,
  key_type           text not null default 'organization',   -- personal | organization
  public_id          text not null unique,                   -- shown; used for lookup
  secret_hash        text not null,                          -- sha256(secret)
  scopes             jsonb not null default '[]'::jsonb,
  rate_limit_per_min integer not null default 120,
  last_used_at       timestamptz,
  created_at         timestamptz not null default now(),
  revoked_at         timestamptz,
  created_by         uuid
);
create index if not exists zak_org_idx on public.zono_api_keys (organization_id);
create index if not exists zak_pub_idx on public.zono_api_keys (public_id);

create table if not exists public.zono_api_audit (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid,
  key_id           uuid,
  key_name         text,
  method           text not null,
  path             text not null,
  scope            text,
  status           integer not null,
  ip               text,
  at               timestamptz not null default now()
);
create index if not exists zaa_key_at_idx on public.zono_api_audit (key_id, at desc);
create index if not exists zaa_org_at_idx on public.zono_api_audit (organization_id, at desc);

create table if not exists public.zono_webhooks (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid,
  url               text not null,
  events            jsonb not null default '[]'::jsonb,
  secret_hash       text,                                    -- sha256(signing secret)
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  last_delivery_at  timestamptz,
  last_status       integer,
  created_by        uuid
);
create index if not exists zwh_org_idx on public.zono_webhooks (organization_id, active);

alter table public.zono_api_keys  enable row level security;
alter table public.zono_api_audit enable row level security;
alter table public.zono_webhooks  enable row level security;

-- Org members read their org's keys/audit/webhooks (never the secret_hash in UI).
-- All writes + secret lookups go through the service-role layer (bypasses RLS).
drop policy if exists zak_select on public.zono_api_keys;
create policy zak_select on public.zono_api_keys for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());
drop policy if exists zaa_select on public.zono_api_audit;
create policy zaa_select on public.zono_api_audit for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());
drop policy if exists zwh_select on public.zono_webhooks;
create policy zwh_select on public.zono_webhooks for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());

grant select on public.zono_api_keys  to authenticated;
grant select on public.zono_api_audit to authenticated;
grant select on public.zono_webhooks  to authenticated;
grant all    on public.zono_api_keys  to service_role;
grant all    on public.zono_api_audit to service_role;
grant all    on public.zono_webhooks  to service_role;


-- ============================================================================
-- FILE: 20260904120000_zono_buyer_portal.sql
-- ============================================================================
-- ============================================================================
-- ZONO — Buyer Portal (32.3). Link a buyer CRM record to the Supabase auth user
-- who IS that buyer, so the authenticated Buyer Portal can resolve exactly one
-- buyer per session. Nullable + optional: existing flows are unaffected, and the
-- portal falls back to email match when the link is not set.
-- ============================================================================
alter table if exists public.buyers
  add column if not exists portal_user_id uuid references auth.users(id) on delete set null;

create index if not exists buyers_portal_user_id_idx
  on public.buyers (portal_user_id)
  where portal_user_id is not null;

comment on column public.buyers.portal_user_id is
  'Auth user who owns this buyer''s personal Buyer Portal (32.3). Nullable; portal falls back to email match.';


-- ============================================================================
-- FILE: 20260905120000_zono_seller_portal.sql
-- ============================================================================
-- ============================================================================
-- ZONO — Seller Portal (32.4). Link a seller CRM record to the Supabase auth user
-- who IS that seller, so the authenticated Seller Portal can resolve exactly one
-- seller per session. Nullable + optional: existing flows are unaffected, and the
-- portal falls back to email match when the link is not set.
-- ============================================================================
alter table if exists public.sellers
  add column if not exists portal_user_id uuid references auth.users(id) on delete set null;

create index if not exists sellers_portal_user_id_idx
  on public.sellers (portal_user_id)
  where portal_user_id is not null;

comment on column public.sellers.portal_user_id is
  'Auth user who owns this seller''s personal Seller Portal (32.4). Nullable; portal falls back to email match.';


-- ============================================================================
-- FILE: 20260906120000_qa1_storage_buckets.sql
-- ============================================================================
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 STORAGE BUCKETS. STRICTLY ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 finding that storage buckets were provisioned by hand and not
-- reproducible from code. Creates the canonical buckets with `on conflict do
-- nothing` (safe if a bucket was already created in the dashboard) and attaches
-- least-privilege object policies:
--   • public buckets  → public READ, authenticated WRITE
--   • private buckets → authenticated READ + WRITE (org isolation is enforced by
--     an `<org_id>/...` path convention in app code + service-role writes)
-- No public WRITE anywhere. Re-runnable: drop policy if exists guards policies.
-- NOTE: requires the `storage` schema (present on all Supabase projects).
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('creative-references', 'creative-references', false),
  ('property-media',      'property-media',      true),
  ('documents',           'documents',           false),
  ('logos',               'logos',               true),
  ('agent-photos',        'agent-photos',        true),
  ('office-assets',       'office-assets',       true),
  ('public-site-media',   'public-site-media',   true)
on conflict (id) do nothing;

-- ── Public READ for public-facing buckets ───────────────────────────────────
drop policy if exists qa1_public_read on storage.objects;
create policy qa1_public_read on storage.objects for select to public
  using (bucket_id in ('property-media','logos','agent-photos','office-assets','public-site-media'));

-- ── Authenticated READ for private buckets ──────────────────────────────────
drop policy if exists qa1_private_read on storage.objects;
create policy qa1_private_read on storage.objects for select to authenticated
  using (bucket_id in ('creative-references','documents'));

-- ── Authenticated WRITE (insert/update/delete) for all managed buckets ──────
-- Actual bulk writes run under service_role (BYPASSRLS); this allows direct
-- authenticated uploads where the product needs them. No public write.
drop policy if exists qa1_auth_insert on storage.objects;
create policy qa1_auth_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media'));

drop policy if exists qa1_auth_update on storage.objects;
create policy qa1_auth_update on storage.objects for update to authenticated
  using (bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media'));

drop policy if exists qa1_auth_delete on storage.objects;
create policy qa1_auth_delete on storage.objects for delete to authenticated
  using (bucket_id in ('creative-references','property-media','documents','logos','agent-photos','office-assets','public-site-media'));


-- ============================================================================
-- FILE: 20260907120000_qa1_rls_coverage.sql
-- ============================================================================
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 RLS COVERAGE PACK. STRICTLY ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 finding that many private tables lacked an explicit RLS
-- enablement. For every private, org-scoped table this:
--   (1) enables row level security (no-op if already enabled), and
--   (2) adds a UNIQUELY-NAMED "<table>_qa1_read" permissive SELECT policy
--       scoped to the caller's org via public.current_org_id().
-- Permissive policies OR together, so this can NEVER reduce access below an
-- existing policy; it only closes gaps where RLS/read-scoping was missing.
-- Writes continue to run under service_role (BYPASSRLS) per the canonical rule,
-- so NO insert/update/delete policies are added here (matches house pattern).
-- Public reference tables and no-tenant-column tables are intentionally skipped
-- (documented in the phase report and below).
-- Re-runnable: drop policy if exists guards every policy.
-- ============================================================================

do $$
declare r record;
begin
  for r in (
    select * from (values
      ('acquisition_signals','org_id'),
      ('activities','org_id'),
      ('activity_events','org_id'),
      ('agencies','organization_id'),
      ('agency_agents','organization_id'),
      ('agency_ai_feedback','organization_id'),
      ('agency_aliases','organization_id'),
      ('agency_branches','organization_id'),
      ('agency_entity_relationships','organization_id'),
      ('agency_identity_matches','organization_id'),
      ('agency_intelligence_audit_log','organization_id'),
      ('agency_intelligence_job_runs','organization_id'),
      ('agency_intelligence_policies','organization_id'),
      ('agency_intelligence_reports','organization_id'),
      ('agency_intelligence_sources','organization_id'),
      ('agency_profiles','organization_id'),
      ('agency_report_exports','organization_id'),
      ('agency_resolution_candidates','organization_id'),
      ('agency_scores','organization_id'),
      ('agency_signals','organization_id'),
      ('agency_territory_stats','organization_id'),
      ('agency_timeline','organization_id'),
      ('agent_coaching_signals','organization_id'),
      ('agent_intelligence_profiles','organization_id'),
      ('agent_locality_performance','organization_id'),
      ('agent_property_type_performance','organization_id'),
      ('agent_website_events','organization_id'),
      ('agent_website_leads','organization_id'),
      ('agent_websites','organization_id'),
      ('ai_briefs','organization_id'),
      ('ai_copilot_cache','org_id'),
      ('ai_focus_items','organization_id'),
      ('ai_growth_plans','organization_id'),
      ('ai_memory','organization_id'),
      ('ai_mission_drafts','organization_id'),
      ('ai_opportunities','organization_id'),
      ('ai_risks','organization_id'),
      ('ai_simulations','organization_id'),
      ('attention_items','org_id'),
      ('audit_log','organization_id'),
      ('automation_actions','organization_id'),
      ('automation_conditions','organization_id'),
      ('automation_recommendations','organization_id'),
      ('automation_run_logs','organization_id'),
      ('automation_runs','organization_id'),
      ('automation_steps','organization_id'),
      ('automation_triggers','organization_id'),
      ('automation_workflows','organization_id'),
      ('automations','org_id'),
      ('beta_enrollments','org_id'),
      ('bi_reports','org_id'),
      ('bi_snapshots','org_id'),
      ('brand_assets','org_id'),
      ('brand_identity_profiles','org_id'),
      ('broker_ai_coaching','organization_id'),
      ('broker_aliases','org_id'),
      ('broker_competitive_intelligence','organization_id'),
      ('broker_discovery_runs','org_id'),
      ('broker_gap_analysis','organization_id'),
      ('broker_growth_strategy','organization_id'),
      ('broker_logo_assets','org_id'),
      ('broker_market_intelligence','organization_id'),
      ('broker_match_reviews','org_id'),
      ('broker_profiles','org_id'),
      ('broker_service_areas','org_id'),
      ('broker_sources','org_id'),
      ('broker_winning_dna','organization_id'),
      ('brokerage_external_listing_links','organization_id'),
      ('brokerage_office_discovery_runs','organization_id'),
      ('brokerage_research_jobs','organization_id'),
      ('building_cluster_profiles','organization_id'),
      ('building_intelligence','organization_id'),
      ('buyer_commitments','org_id'),
      ('buyer_demand_profiles','org_id'),
      ('buyer_financial_profiles','organization_id'),
      ('buyer_geo_profiles','org_id'),
      ('buyer_intelligence_profiles','org_id'),
      ('buyer_missions','org_id'),
      ('buyer_objections','org_id'),
      ('buyer_property_matches','org_id'),
      ('buyer_risks','org_id'),
      ('buyer_segments','organization_id'),
      ('buyer_touchpoints','org_id'),
      ('buyers','org_id'),
      ('client_advocates','organization_id'),
      ('client_memory','org_id'),
      ('client_portal_items','organization_id'),
      ('client_portal_sections','organization_id'),
      ('client_portal_views','organization_id'),
      ('client_portals','organization_id'),
      ('client_reviews','organization_id'),
      ('communication_commitments','org_id'),
      ('communication_entities','org_id'),
      ('communication_events','org_id'),
      ('communication_followups','org_id'),
      ('communication_insights','org_id'),
      ('communication_intelligence_profiles','org_id'),
      ('communication_intents','org_id'),
      ('communication_messages','org_id'),
      ('communication_objections','org_id'),
      ('communication_opportunities','org_id'),
      ('communication_risks','org_id'),
      ('communication_sentiment','org_id'),
      ('communication_summaries','org_id'),
      ('communication_threads','org_id'),
      ('community_activity_logs','organization_id'),
      ('community_comments','organization_id'),
      ('community_deal_attribution','organization_id'),
      ('community_discovery_candidates','organization_id'),
      ('community_discovery_runs','organization_id'),
      ('community_dna_profiles','organization_id'),
      ('community_intelligence_profiles','organization_id'),
      ('community_lead_attribution','organization_id'),
      ('community_metrics','organization_id'),
      ('community_network_profiles','organization_id'),
      ('community_profiles','organization_id'),
      ('community_rankings','organization_id'),
      ('competitor_market_positions','organization_id'),
      ('competitor_profiles','organization_id'),
      ('competitor_signals','organization_id'),
      ('conversation_memory','org_id'),
      ('creative_dna_analysis_runs','org_id'),
      ('creative_dna_profiles','org_id'),
      ('creative_generation_attempts','org_id'),
      ('creative_generation_references','org_id'),
      ('creative_generations','org_id'),
      ('creative_qa_reports','org_id'),
      ('creative_reference_assets','org_id'),
      ('daily_distribution_batches','organization_id'),
      ('daily_distribution_items','organization_id'),
      ('deal_forecast_signals','organization_id'),
      ('deal_forecasts','organization_id'),
      ('deal_journeys','organization_id'),
      ('deal_negotiations','organization_id'),
      ('deal_objections','organization_id'),
      ('deal_profiles','organization_id'),
      ('deal_tasks','organization_id'),
      ('deals','org_id'),
      ('decision_intelligence_profiles','org_id'),
      ('decision_queue','org_id'),
      ('decision_recommendations','org_id'),
      ('demand_cluster_buyers','org_id'),
      ('demand_clusters','org_id'),
      ('demand_heatmap_cells','org_id'),
      ('distribution_analytics','org_id'),
      ('distribution_automations','org_id'),
      ('distribution_campaign_groups','org_id'),
      ('distribution_campaigns','org_id'),
      ('distribution_channels','org_id'),
      ('distribution_comments','org_id'),
      ('distribution_group_leads','org_id'),
      ('distribution_group_posts','org_id'),
      ('distribution_groups','org_id'),
      ('distribution_leads','org_id'),
      ('distribution_opportunity_signals','organization_id'),
      ('distribution_plan_items','organization_id'),
      ('distribution_plans','organization_id'),
      ('distribution_posts','org_id'),
      ('distribution_provider_connections','org_id'),
      ('distribution_provider_destinations','org_id'),
      ('distribution_publish_jobs','org_id'),
      ('distribution_queue','organization_id'),
      ('distribution_schedules','org_id'),
      ('distribution_variations','org_id'),
      ('document_audit_logs','organization_id'),
      ('document_checklists','organization_id'),
      ('document_folders','organization_id'),
      ('document_participants','organization_id'),
      ('document_requests','organization_id'),
      ('document_requirements','organization_id'),
      ('document_signatures','organization_id'),
      ('document_templates','organization_id'),
      ('document_versions','organization_id'),
      ('documents','org_id'),
      ('engine_runs','organization_id'),
      ('entity_relationships','org_id'),
      ('explainability_events','org_id'),
      ('external_listing_duplicates','org_id'),
      ('external_listing_history','org_id'),
      ('external_listing_sources','org_id'),
      ('external_listings','org_id'),
      ('facebook_connection_paths','org_id'),
      ('facebook_extension_instances','org_id'),
      ('facebook_extension_pairings','org_id'),
      ('financing_signals','organization_id'),
      ('geo_coverage_targets','organization_id'),
      ('graph_entities','organization_id'),
      ('graph_relationships','organization_id'),
      ('graph_signals','organization_id'),
      ('import_job_logs','org_id'),
      ('import_jobs','org_id'),
      ('inventory_acquisition_actions','organization_id'),
      ('inventory_acquisition_profiles','organization_id'),
      ('inventory_acquisition_reviews','organization_id'),
      ('journey_audit_log','org_id'),
      ('journey_blockers','org_id'),
      ('journey_delayed_actions','org_id'),
      ('journey_events','org_id'),
      ('journey_execution_steps','org_id'),
      ('journey_executions','org_id'),
      ('journey_milestones','org_id'),
      ('journey_opportunities','org_id'),
      ('journey_predictions','org_id'),
      ('journey_risks','org_id'),
      ('journey_scores','org_id'),
      ('journey_sla_rules','org_id'),
      ('journey_stages','org_id'),
      ('journey_templates','org_id'),
      ('journey_triggers','org_id'),
      ('journey_velocity','org_id'),
      ('journey_workflow_versions','org_id'),
      ('journey_workflows','org_id'),
      ('journeys','org_id'),
      ('lead_routing_candidates','organization_id'),
      ('lead_routing_profiles','organization_id'),
      ('leads','org_id'),
      ('legal_documents','organization_id'),
      ('mai_model_calibration','organization_id'),
      ('management_actions','organization_id'),
      ('market_acceptance_aggregates','organization_id'),
      ('market_acceptance_scores','organization_id'),
      ('market_area_leaders','organization_id'),
      ('market_area_snapshots','organization_id'),
      ('market_listing_events','organization_id'),
      ('market_listing_lifecycle','organization_id'),
      ('market_listing_signals','organization_id'),
      ('marketing_opportunity_signals','organization_id'),
      ('match_intelligence_profiles','org_id'),
      ('match_objections','org_id'),
      ('match_opportunities','org_id'),
      ('match_risks','org_id'),
      ('matching_results','org_id'),
      ('meetings','org_id'),
      ('messenger_threads','organization_id'),
      ('notes','org_id'),
      ('notification_state','organization_id'),
      ('notifications','org_id'),
      ('office_coaching_items','org_id'),
      ('office_goals','org_id'),
      ('office_intelligence_profiles','organization_id'),
      ('office_intelligence_snapshots','org_id'),
      ('office_reports','org_id'),
      ('office_website_events','organization_id'),
      ('office_website_leads','organization_id'),
      ('office_websites','organization_id'),
      ('onboarding_progress','org_id'),
      ('opportunities','org_id'),
      ('opportunity_signals','org_id'),
      ('org_invitations','org_id'),
      ('org_market_property_links','org_id'),
      ('org_plans','org_id'),
      ('organization_operating_localities','organization_id'),
      ('organization_revenue_profiles','organization_id'),
      ('pipeline_snapshots','organization_id'),
      ('platform_audit_log','org_id'),
      ('projects','org_id'),
      ('properties','org_id'),
      ('property_alerts','org_id'),
      ('property_broker_matches','org_id'),
      ('property_calendar_plans','org_id'),
      ('property_community_matches','organization_id'),
      ('property_exposure_channels','org_id'),
      ('property_intelligence_profiles','org_id'),
      ('property_journeys','org_id'),
      ('property_levers','org_id'),
      ('property_marketing_profiles','organization_id'),
      ('property_media','org_id'),
      ('property_missions','org_id'),
      ('property_opportunity_scores','org_id'),
      ('property_radar_settings','org_id'),
      ('property_research_reports','organization_id'),
      ('property_risks','org_id'),
      ('property_score_events','org_id'),
      ('property_seller_touchpoints','org_id'),
      ('property_sellers','org_id'),
      ('property_sync_runs','org_id'),
      ('property_sync_sources','org_id'),
      ('property_sync_watermarks','org_id'),
      ('property_transactions','organization_id'),
      ('property_valuations','organization_id'),
      ('radar_competitor_alerts','org_id'),
      ('radar_competitor_area_metrics','org_id'),
      ('radar_competitor_listing_links','org_id'),
      ('radar_competitor_profiles','org_id'),
      ('radar_seller_followups','org_id'),
      ('radar_seller_outcomes','org_id'),
      ('radar_seller_profiles','org_id'),
      ('radar_seller_signals','org_id'),
      ('radar_seller_touchpoints','org_id'),
      ('rain_edges','organization_id'),
      ('rain_nodes','organization_id'),
      ('recommendation_events','organization_id'),
      ('recommendation_feedback','organization_id'),
      ('recommendation_map_points','organization_id'),
      ('recommendation_packages','organization_id'),
      ('recommendation_profiles','organization_id'),
      ('recommendations','organization_id'),
      ('referrals','organization_id'),
      ('reputation_scores','organization_id'),
      ('reputation_signals','organization_id'),
      ('revenue_leakage_events','organization_id'),
      ('revenue_signals','org_id'),
      ('revenue_targets','organization_id'),
      ('review_campaigns','organization_id'),
      ('review_requests','organization_id'),
      ('seller_commitments','org_id'),
      ('seller_geo_profiles','org_id'),
      ('seller_intelligence_profiles','org_id'),
      ('seller_missions','org_id'),
      ('seller_risks','org_id'),
      ('seller_touchpoints','org_id'),
      ('sellers','org_id'),
      ('social_account_sync_logs','organization_id'),
      ('social_accounts','organization_id'),
      ('social_connection_vault','organization_id'),
      ('social_followups','organization_id'),
      ('social_interactions','organization_id'),
      ('social_leads','organization_id'),
      ('street_intelligence','organization_id'),
      ('street_territory_profiles','organization_id'),
      ('support_impersonation_log','org_id'),
      ('tasks','org_id'),
      ('team_intelligence_profiles','organization_id'),
      ('team_opportunity_leaks','organization_id'),
      ('team_performance_snapshots','organization_id'),
      ('territory_assignments','organization_id'),
      ('territory_centroids','org_id'),
      ('territory_dna_profiles','organization_id'),
      ('territory_profiles','organization_id'),
      ('territory_signals','organization_id'),
      ('territory_snapshots','organization_id'),
      ('transaction_opportunity_radar_alerts','organization_id'),
      ('transaction_sync_logs','organization_id'),
      ('units','org_id'),
      ('usage_events','org_id'),
      ('user_feedback','org_id'),
      ('users','org_id'),
      ('valuation_accuracy','organization_id'),
      ('valuation_adjustments','organization_id'),
      ('valuation_broker_sold_properties','organization_id'),
      ('valuation_comparables','organization_id'),
      ('valuation_explanations','organization_id'),
      ('valuation_history','organization_id'),
      ('valuation_market_snapshots','organization_id'),
      ('valuation_report_sends','organization_id'),
      ('valuation_reports','organization_id'),
      ('valuation_weight_results','organization_id'),
      ('whatsapp_accounts','organization_id'),
      ('whatsapp_ai_actions','organization_id'),
      ('whatsapp_audit_logs','organization_id'),
      ('whatsapp_call_events','organization_id'),
      ('whatsapp_campaigns','organization_id'),
      ('whatsapp_conversations','organization_id'),
      ('whatsapp_daily_missions','organization_id'),
      ('whatsapp_drafts','organization_id'),
      ('whatsapp_followups','organization_id'),
      ('whatsapp_knowledge_base','organization_id'),
      ('whatsapp_messages','organization_id'),
      ('whatsapp_segments','organization_id'),
      ('whatsapp_smart_link_events','organization_id'),
      ('whatsapp_smart_links','organization_id'),
      ('zi_conversations','organization_id'),
      ('zi_diagnostic_runs','organization_id'),
      ('zi_knowledge_feedback','organization_id'),
      ('zi_learning_progress','organization_id'),
      ('zi_messages','organization_id'),
      ('zono_agent_inbox','organization_id'),
      ('zono_agent_memory','organization_id'),
      ('zono_agent_performance','organization_id'),
      ('zono_agent_runs','organization_id'),
      ('zono_agents','organization_id'),
      ('zono_api_audit','organization_id'),
      ('zono_api_keys','organization_id'),
      ('zono_campaign_assets','org_id'),
      ('zono_campaigns','org_id'),
      ('zono_copy_assets','org_id'),
      ('zono_creative_assets','org_id'),
      ('zono_creative_candidates','org_id'),
      ('zono_creative_concepts','org_id'),
      ('zono_creative_outputs','org_id'),
      ('zono_creative_quality_reviews','org_id'),
      ('zono_marketing_analysis_jobs','org_id'),
      ('zono_marketing_assets','org_id'),
      ('zono_marketing_briefs','org_id'),
      ('zono_marketing_dna_profiles','org_id'),
      ('zono_marketing_feedback','org_id'),
      ('zono_missions','organization_id'),
      ('zono_orchestrator_locks','organization_id'),
      ('zono_orchestrator_runs','organization_id'),
      ('zono_quick_creative_outputs','org_id'),
      ('zono_quick_creative_requests','org_id'),
      ('zono_visual_assets','org_id'),
      ('zono_webhooks','organization_id'),
      ('zono_workflows','organization_id')
    ) as x(tbl, orgcol)
  ) loop
    -- skip tables that do not exist in THIS database (migrations may define more
    -- tables than a given project has applied) — makes the pack safe everywhere.
    continue when to_regclass('public.' || r.tbl) is null;
    -- enable RLS (idempotent)
    execute format('alter table public.%I enable row level security;', r.tbl);
    -- additive, uniquely-named org-scoped read policy
    execute format('drop policy if exists %I on public.%I;', r.tbl||'_qa1_read', r.tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using (%I = public.current_org_id());',
      r.tbl||'_qa1_read', r.tbl, r.orgcol);
  end loop;
end $$;

-- ── Intentionally SKIPPED — no tenant column (require manual review) ─────────
--   automation_templates
--   brokerage_activity_areas
--   brokerage_agents
--   brokerage_broker_identity
--   brokerage_change_log
--   brokerage_completeness
--   brokerage_contact_points
--   brokerage_coverage
--   brokerage_data_conflicts
--   brokerage_data_health_snapshots
--   brokerage_data_sources
--   brokerage_duplicate_cluster_members
--   brokerage_duplicate_clusters
--   brokerage_entity_dna
--   brokerage_entity_snapshots
--   brokerage_graph_edges
--   brokerage_graph_nodes
--   brokerage_identity_matches
--   brokerage_market_dna
--   brokerage_market_share
--   brokerage_neighborhood_stats
--   brokerage_office_candidates
--   brokerage_office_evidence
--   brokerage_office_graph_edges
--   brokerage_office_locations
--   brokerage_office_merge_suggestions
--   brokerage_offices
--   brokerage_predictions
--   brokerage_refresh_diffs
--   brokerage_refresh_runs
--   brokerage_relationship_discoveries
--   brokerage_research_dossier
--   brokerage_timeline_events
--   legal_document_audit_log
--   legal_document_signatures
--   legal_template_fields
--   legal_template_sections
--   legal_templates
--   market_area_cache_state
--   market_property_events
--   market_property_sources
--   market_sync_runs
--   market_sync_watermarks
--   neighborhood_enrichment_cities
--   organizations
--   provider_qa_daily_metrics
--   provider_schema_events
--   provider_schema_fingerprints
--   user_operating_localities
--   zono_workflow_history
--   zono_workflow_steps


-- ============================================================================
-- FILE: 20260908120000_qa1_org_memory.sql
-- ============================================================================
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 DURABLE ORGANIZATIONAL MEMORY. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "Organizational Memory has no store" finding. The existing
-- Org-Memory engine derives on read from mission history; these tables give it a
-- DURABLE substrate so learning/patterns persist and can be trended. The engine
-- keeps derive-on-read as a FALLBACK; the store becomes the primary source.
-- Writes run under service_role (BYPASSRLS); authenticated gets org-scoped READ.
-- ============================================================================

-- ── Durable memory records ──────────────────────────────────────────────────
create table if not exists public.zono_org_memory (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text,                         -- buyer|seller|lead|property|office|org|...
  entity_id     text,
  memory_type   text not null,                -- fact|pattern|preference|outcome|lesson
  title         text not null,
  summary       text,
  evidence      jsonb not null default '[]'::jsonb,
  confidence    numeric,                       -- 0..1
  impact        text,                          -- low|medium|high
  source_module text,
  occurred_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists zom_org_idx     on public.zono_org_memory (org_id);
create index if not exists zom_entity_idx  on public.zono_org_memory (org_id, entity_type, entity_id);
create index if not exists zom_type_idx    on public.zono_org_memory (org_id, memory_type);
create index if not exists zom_occurred_idx on public.zono_org_memory (org_id, occurred_at desc);

-- ── Append-only event stream feeding memory ─────────────────────────────────
create table if not exists public.zono_org_memory_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text,
  entity_id     text,
  event_type    text not null,                 -- mission_completed|price_changed|deal_won|...
  title         text not null,
  summary       text,
  evidence      jsonb not null default '[]'::jsonb,
  impact        text,
  source_module text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists zome_org_idx      on public.zono_org_memory_events (org_id);
create index if not exists zome_entity_idx   on public.zono_org_memory_events (org_id, entity_type, entity_id);
create index if not exists zome_type_idx     on public.zono_org_memory_events (org_id, event_type);
create index if not exists zome_occurred_idx on public.zono_org_memory_events (org_id, occurred_at desc);

-- ── Learned patterns (aggregated lessons) ───────────────────────────────────
create table if not exists public.zono_org_learning_patterns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text,
  memory_type   text not null default 'pattern',
  title         text not null,
  summary       text,
  evidence      jsonb not null default '[]'::jsonb,
  confidence    numeric,
  impact        text,
  occurrences   integer not null default 1,
  source_module text,
  first_seen_at timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists zolp_org_idx    on public.zono_org_learning_patterns (org_id);
create index if not exists zolp_entity_idx on public.zono_org_learning_patterns (org_id, entity_type);
create index if not exists zolp_conf_idx   on public.zono_org_learning_patterns (org_id, confidence desc);

alter table public.zono_org_memory            enable row level security;
alter table public.zono_org_memory_events     enable row level security;
alter table public.zono_org_learning_patterns enable row level security;

drop policy if exists zom_select on public.zono_org_memory;
create policy zom_select on public.zono_org_memory for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists zome_select on public.zono_org_memory_events;
create policy zome_select on public.zono_org_memory_events for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists zolp_select on public.zono_org_learning_patterns;
create policy zolp_select on public.zono_org_learning_patterns for select to authenticated
  using (org_id = public.current_org_id());


-- ============================================================================
-- FILE: 20260909120000_qa1_intelligence_snapshots.sql
-- ============================================================================
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 INTELLIGENCE SNAPSHOTS. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "derive-on-read intelligence cannot be trended" finding. One
-- generic table stores point-in-time computed intelligence (Truth scores, CoS
-- org score, listing/buyer/seller/lead health, office growth, market domination,
-- street/building intel, competitive position, ...). Modules are NOT forced to
-- write immediately — a reusable repository (src/lib/intelligence-store) offers
-- opt-in snapshot writes/reads. Writes run under service_role; authenticated
-- gets org-scoped READ.
-- ============================================================================

create table if not exists public.zono_intelligence_snapshots (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text not null,                 -- property|buyer|seller|lead|office|org|street|building|area
  entity_id     text,
  kind          text not null,                 -- truth|cos_org|listing_health|buyer_health|... (namespaced)
  score         numeric,
  confidence    numeric,
  truth_score   numeric,
  payload       jsonb not null default '{}'::jsonb,
  source_module text,
  computed_at   timestamptz not null default now(),
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists zis_org_idx      on public.zono_intelligence_snapshots (org_id);
create index if not exists zis_entity_idx   on public.zono_intelligence_snapshots (org_id, entity_type, entity_id);
create index if not exists zis_kind_idx     on public.zono_intelligence_snapshots (org_id, kind);
create index if not exists zis_computed_idx on public.zono_intelligence_snapshots (org_id, kind, computed_at desc);
create index if not exists zis_expires_idx  on public.zono_intelligence_snapshots (expires_at);

alter table public.zono_intelligence_snapshots enable row level security;

drop policy if exists zis_select on public.zono_intelligence_snapshots;
create policy zis_select on public.zono_intelligence_snapshots for select to authenticated
  using (org_id = public.current_org_id());


-- ============================================================================
-- FILE: 20260910120000_qa1_compute_cache.sql
-- ============================================================================
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 COMPUTE CACHE. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "no cache tier for heavy assemblers" finding. A generic,
-- org-scoped, TTL'd key/value cache for expensive multi-engine assemblies
-- (AI Home, Ask ZONO, Chief of Staff, Orchestrator, Market Domination, Area
-- Portal aggregates). Helpers live in src/lib/compute-cache
-- (getCache/setCache/invalidateCache). Every key is org-scoped — no cross-org
-- or unscoped public caching. Writes run under service_role; authenticated gets
-- org-scoped READ.
-- ============================================================================

create table if not exists public.zono_compute_cache (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  namespace   text not null,                   -- ai_home|ask_zono|cos|orchestrator|market_domination|area_aggregates
  cache_key   text not null,
  payload     jsonb not null default '{}'::jsonb,
  version     text,
  computed_at timestamptz not null default now(),
  expires_at  timestamptz,
  unique (org_id, namespace, cache_key)
);
create index if not exists zcc_lookup_idx  on public.zono_compute_cache (org_id, namespace, cache_key);
create index if not exists zcc_expires_idx on public.zono_compute_cache (expires_at);

alter table public.zono_compute_cache enable row level security;

drop policy if exists zcc_select on public.zono_compute_cache;
create policy zcc_select on public.zono_compute_cache for select to authenticated
  using (org_id = public.current_org_id());


-- ============================================================================
-- FILE: 20260911120000_qa1_ask_conversations.sql
-- ============================================================================
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 ASK ZONO CONVERSATION LOG. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "Ask ZONO conversations are not persisted" finding. Durable
-- log for audit, follow-up continuity, learning and future analytics. Private
-- to the org — never exposed on public routes. Writes run under service_role;
-- authenticated gets org-scoped READ (a user reads their own org's threads).
-- ============================================================================

create table if not exists public.zono_ask_conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  user_id     uuid,
  session_id  text not null,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists zac_org_idx     on public.zono_ask_conversations (org_id);
create index if not exists zac_session_idx on public.zono_ask_conversations (org_id, session_id);
create index if not exists zac_updated_idx on public.zono_ask_conversations (org_id, updated_at desc);

create table if not exists public.zono_ask_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  conversation_id uuid references public.zono_ask_conversations(id) on delete cascade,
  session_id      text,
  user_id         uuid,
  question        text,
  answer          text,
  intent          text,
  source_engines  jsonb not null default '[]'::jsonb,
  evidence        jsonb not null default '[]'::jsonb,
  confidence      numeric,
  limitations     text,
  created_at      timestamptz not null default now()
);
create index if not exists zam_org_idx     on public.zono_ask_messages (org_id);
create index if not exists zam_conv_idx    on public.zono_ask_messages (conversation_id, created_at);
create index if not exists zam_created_idx on public.zono_ask_messages (org_id, created_at desc);

alter table public.zono_ask_conversations enable row level security;
alter table public.zono_ask_messages      enable row level security;

drop policy if exists zac_select on public.zono_ask_conversations;
create policy zac_select on public.zono_ask_conversations for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists zam_select on public.zono_ask_messages;
create policy zam_select on public.zono_ask_messages for select to authenticated
  using (org_id = public.current_org_id());


-- ============================================================================
-- FILE: 20260912120000_qa1_performance_indexes.sql
-- ============================================================================
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 PERFORMANCE INDEX PACK. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Hot-path composite indexes for the derive-on-read read patterns identified in
-- QA.1. Each index is created only if BOTH the table exists in this database
-- (to_regclass guard) — so the pack is safe on any project — and the index does
-- not already exist. Real column names verified against the live migrations
-- (property_transactions.organization_id / neighborhood_name; distribution_posts
-- .org_id; community_comments.organization_id). No table rewrites, no drops.
-- ============================================================================

do $$
declare s record;
begin
  for s in (
    select * from (values
      ('property_transactions', 'qa1_ptx_city_street_date_idx',       'property_transactions (city_name, street, deal_date desc)'),
      ('property_transactions', 'qa1_ptx_city_hood_date_idx',         'property_transactions (city_name, neighborhood_name, deal_date desc)'),
      ('distribution_posts',    'qa1_dpost_org_status_sched_idx',     'distribution_posts (org_id, status, scheduled_at)'),
      ('distribution_posts',    'qa1_dpost_org_prop_created_idx',     'distribution_posts (org_id, property_id, created_at desc)'),
      ('community_comments',    'qa1_ccomment_org_prop_created_idx',  'community_comments (organization_id, property_id, created_at desc)'),
      ('zono_agent_inbox',      'qa1_zai_org_status_created_idx',     'zono_agent_inbox (organization_id, status, created_at desc)'),
      ('zono_workflows',        'qa1_zw_org_entity_status_idx',       'zono_workflows (organization_id, entity_type, entity_id, status)'),
      ('zono_missions',         'qa1_zm_org_entity_status_idx',       'zono_missions (organization_id, entity_type, entity_id, status)')
    ) as x(tbl, idx, def)
  ) loop
    continue when to_regclass('public.' || s.tbl) is null;
    execute format('create index if not exists %I on public.%s;', s.idx, s.def);
  end loop;
end $$;

-- NOTE: zono_api_audit already has (organization_id, at desc) [zaa_org_at_idx];
-- the API audit hot path is already covered — no new index needed.

