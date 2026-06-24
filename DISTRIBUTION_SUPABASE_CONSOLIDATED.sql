-- ============================================================================
-- ZONO — CONSOLIDATED DISTRIBUTION-ARC SQL (Supabase handover)
-- Generated: 2026-06-24T11:38:44Z
-- Run in order in the Supabase SQL editor. All statements are IDEMPOTENT
-- (create table if not exists / add column if not exists / policy guards),
-- so re-running is safe. Covers: distribution posts/queue/analytics/comments,
-- provider connections, Facebook connection paths, Meta destinations, Chrome
-- extension instances/pairings, and Phase 21 group-destination columns.
-- ============================================================================


-- ████████████████████████████████████████████████████████████████████████
-- [1/11] supabase/migrations/20260618120000_distribution_intelligence.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — 0037 · Social Community Intelligence + Assisted Distribution Workspace
-- ----------------------------------------------------------------------------
-- Builds the community/distribution foundation. EXTENDS community_profiles +
-- community_intelligence_profiles (additive). New: community DNA, property↔
-- community matches, distribution plans/items, the Daily Assisted Distribution
-- Workspace, plus FUTURE foundation tables (social accounts/vault, discovery,
-- metrics, attribution, rankings, queue, social interactions/leads, network,
-- opportunity signals). NO publishing, NO Meta API, NO passwords. Org-scoped RLS.
-- ============================================================================

-- ── Extend community_profiles (additive) ────────────────────────────────────
alter table public.community_profiles
  add column if not exists normalized_name      text,
  add column if not exists community_type        text not null default 'unknown',
  add column if not exists source_type           text not null default 'manual',
  add column if not exists external_community_id  text,
  add column if not exists source_url             text,
  add column if not exists privacy_level          text not null default 'unknown',
  add column if not exists locality_id            uuid,
  add column if not exists neighborhood           text,
  add column if not exists service_areas          text[] not null default '{}',
  add column if not exists language               text not null default 'hebrew',
  add column if not exists description            text,
  add column if not exists rules_summary          text,
  add column if not exists admin_names            text[] not null default '{}',
  add column if not exists tags                   text[] not null default '{}',
  add column if not exists metadata               jsonb not null default '{}'::jsonb,
  add column if not exists approval_status        text not null default 'suggested',
  add column if not exists approved_by            uuid,
  add column if not exists approved_at            timestamptz,
  add column if not exists rejection_reason       text;
create index if not exists community_profiles_approval_idx on public.community_profiles(approval_status);

-- ── Extend community_intelligence_profiles (additive) ───────────────────────
alter table public.community_intelligence_profiles
  add column if not exists reach_score           smallint not null default 0,
  add column if not exists trust_score           smallint not null default 0,
  add column if not exists influence_score       smallint not null default 0,
  add column if not exists spam_risk_score       smallint not null default 0,
  add column if not exists compliance_risk_score smallint not null default 0,
  add column if not exists intelligence_level    text not null default 'unknown',
  add column if not exists leads_generated       integer not null default 0,
  add column if not exists buyers_created        integer not null default 0,
  add column if not exists sellers_created       integer not null default 0,
  add column if not exists matches_created       integer not null default 0,
  add column if not exists deals_created         integer not null default 0,
  add column if not exists estimated_revenue     bigint not null default 0,
  add column if not exists estimated_commission  bigint not null default 0,
  add column if not exists last_distribution_at  timestamptz,
  add column if not exists strengths             jsonb not null default '[]'::jsonb,
  add column if not exists weaknesses            jsonb not null default '[]'::jsonb,
  add column if not exists recommended_use       text,
  add column if not exists risk_summary          text;

-- ── Community DNA ────────────────────────────────────────────────────────────
create table if not exists public.community_dna_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid not null references public.community_profiles(id) on delete cascade,
  audience_mix jsonb not null default '{}'::jsonb,
  property_type_fit jsonb not null default '{}'::jsonb,
  budget_ranges jsonb not null default '{}'::jsonb,
  preferred_localities text[] not null default '{}',
  preferred_neighborhoods text[] not null default '{}',
  best_content_types text[] not null default '{}',
  best_posting_times jsonb not null default '[]'::jsonb,
  communication_style text,
  community_strengths jsonb not null default '[]'::jsonb,
  community_weaknesses jsonb not null default '[]'::jsonb,
  confidence_score smallint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint community_dna_profiles_uniq unique (organization_id, community_id)
);

-- ── Property ↔ Community matches ─────────────────────────────────────────────
create table if not exists public.property_community_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  community_id uuid not null references public.community_profiles(id) on delete cascade,
  match_score smallint not null default 0, audience_score smallint not null default 0, location_score smallint not null default 0,
  property_type_score smallint not null default 0, budget_score smallint not null default 0, engagement_score smallint not null default 0,
  historical_score smallint not null default 0, lead_potential_score smallint not null default 0, deal_potential_score smallint not null default 0,
  compliance_score smallint not null default 0, confidence_score smallint not null default 0, recommended_rank integer,
  reason text, expected_reach integer not null default 0, expected_leads integer not null default 0,
  expected_deals integer not null default 0, expected_revenue bigint not null default 0,
  status text not null default 'suggested',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint property_community_matches_uniq unique (organization_id, property_id, community_id)
);
create index if not exists property_community_matches_prop_idx on public.property_community_matches(property_id);

-- ── Distribution plans + items ───────────────────────────────────────────────
create table if not exists public.distribution_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  marketing_profile_id uuid,
  status text not null default 'draft',
  distribution_score smallint not null default 0, expected_reach integer not null default 0, expected_leads integer not null default 0,
  expected_matches integer not null default 0, expected_deals integer not null default 0, expected_revenue bigint not null default 0,
  recommended_strategy text, recommended_frequency text, recommended_time_window text, summary text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint distribution_plans_uniq unique (organization_id, property_id)
);
create table if not exists public.distribution_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  distribution_plan_id uuid not null references public.distribution_plans(id) on delete cascade,
  community_id uuid not null references public.community_profiles(id) on delete cascade,
  property_community_match_id uuid references public.property_community_matches(id) on delete set null,
  channel text, recommended_order integer, recommended_posting_time text, recommended_frequency text,
  expected_reach integer not null default 0, expected_leads integer not null default 0, expected_deals integer not null default 0, expected_revenue bigint not null default 0,
  status text not null default 'suggested', reason text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists distribution_plan_items_plan_idx on public.distribution_plan_items(distribution_plan_id);

-- ── Daily Assisted Distribution Workspace ────────────────────────────────────
create table if not exists public.daily_distribution_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  batch_date date not null default current_date,
  status text not null default 'ready',
  total_items integer not null default 0, published_items integer not null default 0, skipped_items integer not null default 0, failed_items integer not null default 0,
  expected_reach integer not null default 0, expected_leads integer not null default 0, expected_deals integer not null default 0, summary text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint daily_distribution_batches_uniq unique (organization_id, user_id, batch_date)
);
create table if not exists public.daily_distribution_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null references public.daily_distribution_batches(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  community_id uuid references public.community_profiles(id) on delete set null,
  distribution_plan_id uuid references public.distribution_plans(id) on delete set null,
  distribution_plan_item_id uuid references public.distribution_plan_items(id) on delete set null,
  platform text, community_url text, property_title text, community_name text, recommended_time text,
  priority_score smallint not null default 0, expected_reach integer not null default 0, expected_leads integer not null default 0, expected_deals integer not null default 0,
  post_text text, post_title text, suggested_cta text, suggested_hashtags text[] not null default '{}',
  creative_url text, image_url text, copy_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending', manual_post_url text, manual_published_at timestamptz, skipped_reason text, failure_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists daily_distribution_items_batch_idx on public.daily_distribution_items(batch_id);
create index if not exists daily_distribution_items_status_idx on public.daily_distribution_items(status);

-- ── FUTURE foundation tables (created now; wired later) ──────────────────────
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  provider text not null default 'manual', account_name text, external_account_id text, profile_url text, avatar_url text,
  connection_status text not null default 'manual_only', permissions jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.social_connection_vault (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete cascade,
  provider text not null, external_user_id text,
  access_token_encrypted text, refresh_token_encrypted text, token_expiry timestamptz, scopes text[] not null default '{}',
  status text not null default 'manual_only', last_refresh_at timestamptz, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.community_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null, social_account_id uuid references public.social_accounts(id) on delete set null,
  provider text not null default 'manual', status text not null default 'completed', mode text not null default 'manual_import',
  total_found integer not null default 0, created_communities integer not null default 0, updated_communities integer not null default 0, rejected_duplicates integer not null default 0,
  error_message text, raw_sample jsonb not null default '{}'::jsonb, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.community_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  discovery_run_id uuid references public.community_discovery_runs(id) on delete cascade,
  provider text not null default 'manual', external_community_id text, name text not null, source_url text, platform text,
  city_guess text, neighborhood_guess text, audience_guess text, community_type_guess text, members_count integer not null default 0,
  confidence_score smallint not null default 0, raw_payload jsonb not null default '{}'::jsonb, status text not null default 'pending',
  suggested_existing_community_id uuid references public.community_profiles(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.community_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid not null references public.community_profiles(id) on delete cascade, date date not null default current_date,
  reach integer not null default 0, impressions integer not null default 0, posts_count integer not null default 0, comments_count integer not null default 0,
  reactions_count integer not null default 0, clicks_count integer not null default 0, leads_count integer not null default 0, qualified_leads_count integer not null default 0,
  tours_count integer not null default 0, deals_count integer not null default 0, estimated_revenue bigint not null default 0, estimated_commission bigint not null default 0,
  roi_score smallint not null default 0, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.community_activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.community_profiles(id) on delete cascade, activity_type text not null,
  entity_type text, entity_id text, title text, description text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.community_lead_attribution (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.community_profiles(id) on delete set null, lead_id uuid references public.leads(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null, campaign_id uuid, distribution_item_id uuid, source_interaction_id uuid,
  attribution_confidence smallint not null default 0, attribution_reason text, created_at timestamptz not null default now()
);
create table if not exists public.community_deal_attribution (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.community_profiles(id) on delete set null, deal_id uuid references public.deals(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null, lead_id uuid references public.leads(id) on delete set null, distribution_item_id uuid,
  estimated_revenue bigint not null default 0, estimated_commission bigint not null default 0, attribution_confidence smallint not null default 0, attribution_reason text, created_at timestamptz not null default now()
);
create table if not exists public.community_rankings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  community_id uuid references public.community_profiles(id) on delete cascade, ranking_type text not null, scope_type text not null default 'organization', scope_value text,
  rank_position integer, score smallint not null default 0, reason text, calculated_at timestamptz not null default now()
);
create table if not exists public.distribution_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  distribution_plan_id uuid references public.distribution_plans(id) on delete set null, distribution_plan_item_id uuid references public.distribution_plan_items(id) on delete set null,
  daily_distribution_item_id uuid references public.daily_distribution_items(id) on delete set null, property_id uuid references public.properties(id) on delete set null,
  community_id uuid references public.community_profiles(id) on delete set null, content_id uuid, platform text, publish_mode text not null default 'assisted_manual',
  scheduled_at timestamptz, status text not null default 'pending', external_post_url text, external_post_id text, failure_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.social_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform text, community_id uuid references public.community_profiles(id) on delete set null, property_id uuid references public.properties(id) on delete set null,
  distribution_queue_id uuid, daily_distribution_item_id uuid, external_post_url text, external_post_id text, external_comment_id text,
  person_name text, profile_url text, interaction_type text not null default 'comment', message_text text, detected_intent text default 'unknown', sentiment text,
  lead_score smallint not null default 0, status text not null default 'new', raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.social_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null, social_interaction_id uuid references public.social_interactions(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null, community_id uuid references public.community_profiles(id) on delete set null, distribution_item_id uuid, campaign_id uuid,
  platform text, source_url text, profile_url text, person_name text, intent text, lead_score smallint not null default 0, ai_summary text, ai_next_action text, created_at timestamptz not null default now()
);
create table if not exists public.community_network_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cluster_name text not null, cluster_type text not null default 'mixed', community_ids uuid[] not null default '{}', city text, locality_id uuid,
  shared_audience_score smallint not null default 0, network_strength smallint not null default 0, dominance_score smallint not null default 0, influence_score smallint not null default 0,
  recommended_strategy text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.distribution_opportunity_signals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signal_type text not null, community_id uuid references public.community_profiles(id) on delete set null, property_id uuid references public.properties(id) on delete set null,
  user_id uuid references public.users(id) on delete set null, locality text, title text not null, description text, impact_score smallint not null default 50,
  expected_leads integer not null default 0, expected_deals integer not null default 0, expected_revenue bigint not null default 0,
  urgency_score smallint not null default 50, confidence_score smallint not null default 60, status text not null default 'new',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ── updated_at triggers ──────────────────────────────────────────────────────
do $$
declare t text;
  tbls text[] := array['community_dna_profiles','property_community_matches','distribution_plans','distribution_plan_items',
    'daily_distribution_batches','daily_distribution_items','social_accounts','social_connection_vault','community_network_profiles',
    'distribution_queue','social_interactions','distribution_opportunity_signals'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ── RLS + grants (org-scoped; read all members, write agent+) ────────────────
do $$
declare t text;
  tbls text[] := array['community_dna_profiles','property_community_matches','distribution_plans','distribution_plan_items',
    'daily_distribution_batches','daily_distribution_items','social_accounts','social_connection_vault',
    'community_discovery_runs','community_discovery_candidates','community_metrics','community_activity_logs',
    'community_lead_attribution','community_deal_attribution','community_rankings','distribution_queue',
    'social_interactions','social_leads','community_network_profiles','distribution_opportunity_signals'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$I;', t);
    execute format('create policy "%1$s_write" on public.%1$I for all to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;

-- social_connection_vault: tokens are server-only — revoke from authenticated.
revoke all on public.social_connection_vault from authenticated;
drop policy if exists "social_connection_vault_select" on public.social_connection_vault;
drop policy if exists "social_connection_vault_write" on public.social_connection_vault;
grant all privileges on public.social_connection_vault to service_role;


-- ████████████████████████████████████████████████████████████████████████
-- [2/11] supabase/migrations/20260718130000_distribution_engine.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — Distribution Engine (Facebook groups distribution OS)
-- ----------------------------------------------------------------------------
-- Full production schema: groups, campaigns, campaign↔group join, posts,
-- AI content variations, comments, leads, schedules, analytics, automations.
-- Conventions (match existing migrations):
--   • org_id uuid -> public.organizations(id) on every table (org isolation)
--   • public.set_updated_at() updated_at trigger
--   • RLS: SELECT = same org; INSERT/UPDATE/DELETE = same org + has_min_role('agent')
--   • grants to authenticated + service_role
-- One-time migration. Assisted-manual posting model (no Meta API writes).
-- ============================================================================

-- ── 1. distribution_groups — Facebook groups / communities to distribute to ──
create table public.distribution_groups (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  name               text not null,
  platform           text not null default 'facebook',
  category           text,
  city               text,
  locality           text,
  members_count      integer not null default 0 check (members_count >= 0),
  group_url          text,
  external_group_id  text,
  privacy_level      text not null default 'public',          -- public | closed | private
  status             text not null default 'active',          -- active | inactive | blocked | pending
  performance_score  integer not null default 0 check (performance_score between 0 and 100),
  lead_score         integer not null default 0 check (lead_score between 0 and 100),
  spam_risk_score    integer not null default 0 check (spam_risk_score between 0 and 100),
  last_post_at       timestamptz,
  rules_notes        text,
  created_by         uuid references public.users(id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_groups_org_idx       on public.distribution_groups(org_id);
create index distribution_groups_status_idx    on public.distribution_groups(org_id, status);
create index distribution_groups_city_idx       on public.distribution_groups(org_id, city);
create index distribution_groups_perf_idx       on public.distribution_groups(org_id, performance_score desc);

-- ── 2. distribution_campaigns — a distribution campaign (per property/audience) ─
create table public.distribution_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  property_id        uuid references public.properties(id) on delete set null,
  name               text not null,
  objective          text,
  audience           text,                                    -- families | investors | young | luxury | commercial | sellers
  cities             text[] not null default '{}',
  status             text not null default 'draft',           -- draft | scheduled | active | paused | completed | archived
  frequency          text,                                    -- once | 2x_week | 3x_week | daily
  preferred_time     text,
  total_posts        integer not null default 0,
  total_groups       integer not null default 0,
  total_leads        integer not null default 0,
  success_rate       numeric(5,2) not null default 0,
  starts_at          timestamptz,
  ends_at            timestamptz,
  created_by         uuid references public.users(id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_campaigns_org_idx      on public.distribution_campaigns(org_id);
create index distribution_campaigns_status_idx   on public.distribution_campaigns(org_id, status);
create index distribution_campaigns_property_idx on public.distribution_campaigns(property_id);

-- ── 3. distribution_campaign_groups — campaign ↔ group selection (join) ───────
create table public.distribution_campaign_groups (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  campaign_id        uuid not null references public.distribution_campaigns(id) on delete cascade,
  group_id           uuid not null references public.distribution_groups(id) on delete cascade,
  status             text not null default 'selected',        -- selected | posted | skipped
  recommended_order  integer,
  expected_reach     integer not null default 0,
  expected_leads     integer not null default 0,
  reason             text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (campaign_id, group_id)
);
create index distribution_campaign_groups_org_idx      on public.distribution_campaign_groups(org_id);
create index distribution_campaign_groups_campaign_idx on public.distribution_campaign_groups(campaign_id);
create index distribution_campaign_groups_group_idx    on public.distribution_campaign_groups(group_id);

-- ── 4. distribution_posts — a planned / published post (campaign × group) ─────
create table public.distribution_posts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  campaign_id        uuid references public.distribution_campaigns(id) on delete cascade,
  group_id           uuid references public.distribution_groups(id) on delete set null,
  property_id        uuid references public.properties(id) on delete set null,
  variation_id       uuid,                                    -- FK added after variations table
  platform           text not null default 'facebook',
  status             text not null default 'pending',         -- pending | scheduled | in_progress | published | failed | skipped
  post_title         text,
  post_text          text,
  hashtags           text[] not null default '{}',
  cta                text,
  image_url          text,
  scheduled_at       timestamptz,
  published_at       timestamptz,
  external_post_url  text,
  failure_reason     text,
  skipped_reason     text,
  reach              integer not null default 0,
  engagement         integer not null default 0,
  leads_count        integer not null default 0,
  priority_score     integer not null default 0 check (priority_score between 0 and 100),
  created_by         uuid references public.users(id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_posts_org_idx       on public.distribution_posts(org_id);
create index distribution_posts_campaign_idx  on public.distribution_posts(campaign_id);
create index distribution_posts_group_idx     on public.distribution_posts(group_id);
create index distribution_posts_status_idx    on public.distribution_posts(org_id, status);
create index distribution_posts_scheduled_idx on public.distribution_posts(org_id, scheduled_at);

-- ── 5. distribution_variations — AI content variations (per campaign/property) ─
create table public.distribution_variations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  campaign_id        uuid references public.distribution_campaigns(id) on delete cascade,
  property_id        uuid references public.properties(id) on delete set null,
  angle              text,                                    -- family | investment | local | urgent | luxury | seller
  tone               text,
  headline           text,
  body               text,
  cta                text,
  hashtags           text[] not null default '{}',
  wow_score          integer not null default 0 check (wow_score between 0 and 100),
  engagement_score   integer not null default 0 check (engagement_score between 0 and 100),
  prediction_score   integer not null default 0 check (prediction_score between 0 and 100),
  is_selected        boolean not null default false,
  created_by         uuid references public.users(id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_variations_org_idx      on public.distribution_variations(org_id);
create index distribution_variations_campaign_idx on public.distribution_variations(campaign_id);
create index distribution_variations_property_idx on public.distribution_variations(property_id);

-- now that variations exists, link posts.variation_id
alter table public.distribution_posts
  add constraint distribution_posts_variation_fkey
  foreign key (variation_id) references public.distribution_variations(id) on delete set null;
create index distribution_posts_variation_idx on public.distribution_posts(variation_id);

-- ── 6. distribution_comments — comments collected on published posts ──────────
create table public.distribution_comments (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  post_id            uuid references public.distribution_posts(id) on delete cascade,
  group_id           uuid references public.distribution_groups(id) on delete set null,
  author_name        text,
  author_external_id text,
  comment_text       text,
  sentiment          text,                                    -- positive | neutral | negative
  intent             text,                                    -- buyer | seller | question | spam | none
  intent_score       integer not null default 0 check (intent_score between 0 and 100),
  is_lead            boolean not null default false,
  handled            boolean not null default false,
  occurred_at        timestamptz not null default now(),
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_comments_org_idx     on public.distribution_comments(org_id);
create index distribution_comments_post_idx    on public.distribution_comments(post_id);
create index distribution_comments_lead_idx    on public.distribution_comments(org_id, is_lead);

-- ── 7. distribution_leads — leads generated from distribution ─────────────────
create table public.distribution_leads (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  campaign_id        uuid references public.distribution_campaigns(id) on delete set null,
  post_id            uuid references public.distribution_posts(id) on delete set null,
  comment_id         uuid references public.distribution_comments(id) on delete set null,
  group_id           uuid references public.distribution_groups(id) on delete set null,
  property_id        uuid references public.properties(id) on delete set null,
  buyer_id           uuid references public.buyers(id) on delete set null,
  name               text,
  phone              text,
  email              text,
  source             text not null default 'comment',         -- comment | message | click | manual
  intent_score       integer not null default 0 check (intent_score between 0 and 100),
  status             text not null default 'new',             -- new | contacted | qualified | converted | lost
  assigned_to        uuid references public.users(id) on delete set null,
  notes              text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_leads_org_idx       on public.distribution_leads(org_id);
create index distribution_leads_status_idx    on public.distribution_leads(org_id, status);
create index distribution_leads_campaign_idx  on public.distribution_leads(campaign_id);
create index distribution_leads_property_idx  on public.distribution_leads(property_id);
create index distribution_leads_assigned_idx  on public.distribution_leads(assigned_to);

-- ── 8. distribution_schedules — scheduled posting slots ───────────────────────
create table public.distribution_schedules (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  campaign_id        uuid references public.distribution_campaigns(id) on delete cascade,
  post_id            uuid references public.distribution_posts(id) on delete cascade,
  group_id           uuid references public.distribution_groups(id) on delete set null,
  scheduled_for      timestamptz not null,
  recommended_time   text,
  recurrence         text not null default 'none',            -- none | daily | weekly
  status             text not null default 'planned',         -- planned | queued | done | skipped | failed
  created_by         uuid references public.users(id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_schedules_org_idx       on public.distribution_schedules(org_id);
create index distribution_schedules_when_idx      on public.distribution_schedules(org_id, scheduled_for);
create index distribution_schedules_status_idx    on public.distribution_schedules(org_id, status);
create index distribution_schedules_campaign_idx  on public.distribution_schedules(campaign_id);

-- ── 9. distribution_analytics — per-period aggregated metrics ─────────────────
create table public.distribution_analytics (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  campaign_id        uuid references public.distribution_campaigns(id) on delete cascade,
  group_id           uuid references public.distribution_groups(id) on delete cascade,
  period_date        date not null default current_date,
  posts_count        integer not null default 0,
  reach              integer not null default 0,
  engagement         integer not null default 0,
  comments_count     integer not null default 0,
  leads_count        integer not null default 0,
  deals_count        integer not null default 0,
  success_rate       numeric(5,2) not null default 0,
  top_angle          text,
  top_cta            text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_analytics_org_idx       on public.distribution_analytics(org_id);
create index distribution_analytics_period_idx    on public.distribution_analytics(org_id, period_date desc);
create index distribution_analytics_campaign_idx  on public.distribution_analytics(campaign_id);
-- one row per (campaign, group, day); NULLS NOT DISTINCT so campaign/group-less
-- org-wide rollups also dedupe (Postgres 15+ / Supabase).
create unique index distribution_analytics_unique_idx
  on public.distribution_analytics(org_id, campaign_id, group_id, period_date) nulls not distinct;

-- ── 10. distribution_automations — automation rules (human-supervised) ────────
create table public.distribution_automations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  name               text not null,
  automation_type    text not null,                           -- auto_repost | comment_reply | whatsapp_route | lead_routing
  description        text,
  trigger_config     jsonb not null default '{}'::jsonb,
  action_config      jsonb not null default '{}'::jsonb,
  status             text not null default 'draft',           -- draft | active | paused
  is_enabled         boolean not null default false,
  last_run_at        timestamptz,
  run_count          integer not null default 0,
  created_by         uuid references public.users(id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_automations_org_idx     on public.distribution_automations(org_id);
create index distribution_automations_type_idx    on public.distribution_automations(org_id, automation_type);
create index distribution_automations_enabled_idx on public.distribution_automations(org_id, is_enabled);

-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger trg_distribution_groups_updated          before update on public.distribution_groups          for each row execute function public.set_updated_at();
create trigger trg_distribution_campaigns_updated       before update on public.distribution_campaigns       for each row execute function public.set_updated_at();
create trigger trg_distribution_campaign_groups_updated before update on public.distribution_campaign_groups for each row execute function public.set_updated_at();
create trigger trg_distribution_posts_updated           before update on public.distribution_posts           for each row execute function public.set_updated_at();
create trigger trg_distribution_variations_updated      before update on public.distribution_variations      for each row execute function public.set_updated_at();
create trigger trg_distribution_comments_updated        before update on public.distribution_comments        for each row execute function public.set_updated_at();
create trigger trg_distribution_leads_updated           before update on public.distribution_leads           for each row execute function public.set_updated_at();
create trigger trg_distribution_schedules_updated       before update on public.distribution_schedules       for each row execute function public.set_updated_at();
create trigger trg_distribution_analytics_updated       before update on public.distribution_analytics       for each row execute function public.set_updated_at();
create trigger trg_distribution_automations_updated     before update on public.distribution_automations     for each row execute function public.set_updated_at();

-- ── RLS — org isolation; reads = same org, writes = same org + agent role ─────
do $$
declare t text;
begin
  foreach t in array array[
    'distribution_groups','distribution_campaigns','distribution_campaign_groups',
    'distribution_posts','distribution_variations','distribution_comments',
    'distribution_leads','distribution_schedules','distribution_analytics',
    'distribution_automations'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    execute format($f$create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format($f$create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id());$f$, t);
    execute format($f$create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;


-- ████████████████████████████████████████████████████████████████████████
-- [3/11] supabase/migrations/20260719120000_distribution_infrastructure.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — Distribution INFRASTRUCTURE (channels + publish-job queue)
-- ----------------------------------------------------------------------------
-- Production-scalable foundation for multi-channel Facebook distribution.
-- Adds the two pieces the Distribution Engine schema was missing:
--   • distribution_channels    — a generic publish TARGET (group / page /
--                                marketplace / future), so pages & marketplace
--                                are first-class alongside the existing groups.
--   • distribution_publish_jobs — a durable work QUEUE with leasing, retry,
--                                 back-off, priority and idempotency, so a worker
--                                 fleet can publish at scale exactly-once.
-- Conventions match existing migrations:
--   • org_id uuid -> public.organizations(id) on every table (org isolation)
--   • public.set_updated_at() updated_at trigger
--   • RLS: SELECT = same org; INSERT/UPDATE/DELETE = same org + has_min_role('agent')
--   • grants to authenticated + service_role
-- NO external API writes. Channels start 'disconnected'; jobs are enqueued and
-- transitioned by the in-app services. Real Meta integration is future work.
-- ============================================================================

-- ── 1. distribution_channels — a publish target (group / page / marketplace) ──
create table public.distribution_channels (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  kind               text not null,                            -- facebook_group | facebook_page | facebook_marketplace | (future)
  name               text not null,
  -- Link back to group intelligence when this channel is a Facebook group.
  group_id           uuid references public.distribution_groups(id) on delete set null,
  external_ref       text,                                     -- external id / url (NO tokens stored here)
  connection_status  text not null default 'disconnected',     -- disconnected | pending | connected | error
  capabilities       jsonb not null default '{}'::jsonb,       -- {publish, schedule, comments, marketplace_listing}
  is_enabled         boolean not null default true,
  daily_post_limit   integer not null default 0 check (daily_post_limit >= 0),  -- 0 = unlimited / unset
  posts_today        integer not null default 0,
  health_score       integer not null default 0 check (health_score between 0 and 100),
  last_published_at  timestamptz,
  last_error         text,
  created_by         uuid references public.users(id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_channels_org_idx     on public.distribution_channels(org_id);
create index distribution_channels_kind_idx     on public.distribution_channels(org_id, kind);
create index distribution_channels_status_idx   on public.distribution_channels(org_id, connection_status);
create index distribution_channels_group_idx    on public.distribution_channels(group_id);

-- ── 2. distribution_publish_jobs — durable work queue (lease + retry + dedupe) ─
create table public.distribution_publish_jobs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  post_id            uuid references public.distribution_posts(id) on delete cascade,
  channel_id         uuid references public.distribution_channels(id) on delete set null,
  campaign_id        uuid references public.distribution_campaigns(id) on delete set null,
  schedule_id        uuid references public.distribution_schedules(id) on delete set null,
  channel_kind       text not null default 'facebook_group',
  status             text not null default 'queued',           -- queued | claimed | running | succeeded | failed | canceled | dead
  priority           integer not null default 0,               -- higher runs first
  run_after          timestamptz not null default now(),       -- earliest execution time (back-off target)
  attempts           integer not null default 0,
  max_attempts       integer not null default 3,
  -- Worker lease — a claimed job is invisible to others until the lease expires.
  locked_by          text,
  locked_at          timestamptz,
  lease_expires_at   timestamptz,
  -- Exactly-once: an org may only enqueue one live job per idempotency key.
  idempotency_key    text,
  last_error         text,
  result             jsonb not null default '{}'::jsonb,
  created_by         uuid references public.users(id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index distribution_publish_jobs_org_idx     on public.distribution_publish_jobs(org_id);
create index distribution_publish_jobs_post_idx     on public.distribution_publish_jobs(post_id);
create index distribution_publish_jobs_channel_idx  on public.distribution_publish_jobs(channel_id);
-- The hot CLAIM path: ready jobs ordered by priority then run_after.
create index distribution_publish_jobs_claim_idx
  on public.distribution_publish_jobs(status, run_after, priority desc);
-- Lease recovery sweep.
create index distribution_publish_jobs_lease_idx
  on public.distribution_publish_jobs(status, lease_expires_at);
-- Idempotency: one live job per (org, key).
create unique index distribution_publish_jobs_idem_idx
  on public.distribution_publish_jobs(org_id, idempotency_key)
  where idempotency_key is not null;

-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger trg_distribution_channels_updated      before update on public.distribution_channels      for each row execute function public.set_updated_at();
create trigger trg_distribution_publish_jobs_updated   before update on public.distribution_publish_jobs   for each row execute function public.set_updated_at();

-- ── RLS — org isolation; reads = same org, writes = same org + agent role ─────
do $$
declare t text;
begin
  foreach t in array array['distribution_channels','distribution_publish_jobs'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    execute format($f$create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format($f$create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id());$f$, t);
    execute format($f$create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;


-- ████████████████████████████████████████████████████████████████████████
-- [4/11] supabase/migrations/20260720120000_distribution_phase3.sql
-- ████████████████████████████████████████████████████████████████████████

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


-- ████████████████████████████████████████████████████████████████████████
-- [5/11] supabase/migrations/20260721120000_distribution_provider.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — Distribution Phase 6 (Facebook integration infrastructure)
-- ----------------------------------------------------------------------------
-- Additive columns on distribution_posts to support the compliant provider layer
-- and the MANUAL publishing flow (used until an official Meta API connection is
-- approved). No columns are renamed; external_post_url already exists and is
-- reused. Idempotent (IF NOT EXISTS). RLS + updated_at triggers already cover
-- these columns.
-- ============================================================================

alter table public.distribution_posts
  add column if not exists provider                text,                       -- facebook | instagram | whatsapp | null
  add column if not exists provider_status         text not null default 'not_connected', -- not_connected | pending | connected | error
  add column if not exists manual_publish_required boolean not null default true,
  add column if not exists external_destination_url text,                      -- snapshot of the group/page/destination URL
  add column if not exists published_by            uuid references public.users(id) on delete set null,
  add column if not exists published_manually_at   timestamptz;

create index if not exists distribution_posts_provider_idx on public.distribution_posts(org_id, provider);


-- ████████████████████████████████████████████████████████████████████████
-- [6/11] supabase/migrations/20260722120000_distribution_comments_phase7.sql
-- ████████████████████████████████████████████████████████████████████████

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


-- ████████████████████████████████████████████████████████████████████████
-- [7/11] supabase/migrations/20260725090000_distribution_provider_connections.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — Distribution provider CONNECTIONS (Phase 10.3, additive).
-- ----------------------------------------------------------------------------
-- Connection MANAGEMENT only. There is NO live Meta API integration yet: rows
-- here track each provider's connection state per org (default not_connected /
-- manual_mode). Tokens are nullable and only ever set once an official, approved
-- API connection exists — until then they stay NULL and publishing is MANUAL via
-- the Publish Assistant. No publishing, no scraping, no faked "connected".
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

create table if not exists public.distribution_provider_connections (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  provider                text not null,                          -- facebook | instagram | whatsapp | facebook_pages | facebook_groups | facebook_marketplace
  status                  text not null default 'not_connected',  -- not_connected|manual_mode|pending_approval|connected|expired|error|disconnected
  connection_mode         text not null default 'manual',         -- manual | api
  display_name            text,
  external_account_id     text,
  access_token_encrypted  text,                                   -- NULL until an approved API connection exists
  refresh_token_encrypted text,                                   -- NULL until an approved API connection exists
  token_expires_at        timestamptz,
  scopes                  text[] not null default '{}',
  metadata                jsonb  not null default '{}'::jsonb,
  last_validated_at       timestamptz,
  created_by              uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, provider)
);

create index if not exists distribution_provider_connections_org_idx
  on public.distribution_provider_connections(org_id);
create index if not exists distribution_provider_connections_status_idx
  on public.distribution_provider_connections(org_id, status);

-- updated_at trigger
drop trigger if exists trg_distribution_provider_connections_updated on public.distribution_provider_connections;
create trigger trg_distribution_provider_connections_updated
  before update on public.distribution_provider_connections
  for each row execute function public.set_updated_at();

-- ── RLS — org isolation; reads = same org, writes = same org + agent role ─────
alter table public.distribution_provider_connections enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_connections' and policyname='distribution_provider_connections_select') then
    create policy "distribution_provider_connections_select" on public.distribution_provider_connections
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_connections' and policyname='distribution_provider_connections_insert') then
    create policy "distribution_provider_connections_insert" on public.distribution_provider_connections
      for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_connections' and policyname='distribution_provider_connections_update') then
    create policy "distribution_provider_connections_update" on public.distribution_provider_connections
      for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'))
      with check (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_connections' and policyname='distribution_provider_connections_delete') then
    create policy "distribution_provider_connections_delete" on public.distribution_provider_connections
      for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
end $$;

grant select, insert, update, delete on public.distribution_provider_connections to authenticated;
grant all privileges on public.distribution_provider_connections to service_role;


-- ████████████████████████████████████████████████████████████████████████
-- [8/11] supabase/migrations/20260727120000_facebook_connection_paths.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — Facebook connection PATHS (Phase 17, additive).
-- ----------------------------------------------------------------------------
-- Two PARALLEL, DISTINCT connection types (not the same connection):
--   1. meta_oauth       → official Meta Graph API path (Pages, Instagram,
--                         Lead Ads, Analytics, WhatsApp Business). When real,
--                         per-provider OAuth tokens live in
--                         distribution_provider_connections.access_token_encrypted
--                         — NOT here. This row only tracks the umbrella state.
--   2. chrome_extension → user-assisted publishing path (Facebook Groups,
--                         Marketplace, browser flows). The extension runs in the
--                         USER's own browser/session.
--
-- SECURITY: this table NEVER stores a Facebook password, Facebook cookies, or a
-- session token for the chrome_extension path. `metadata` holds only
-- non-sensitive signals (extension version, last heartbeat, detected-session
-- boolean). No publishing logic here — connection state only.
-- ============================================================================

create table if not exists public.facebook_connection_paths (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  path_type       text not null,                         -- 'meta_oauth' | 'chrome_extension'
  status          text not null default 'not_connected', -- meta: not_connected|connected|expired|error
                                                          -- ext:  not_installed|installed|facebook_session_detected|ready|error
  metadata        jsonb not null default '{}'::jsonb,     -- non-sensitive only (version, heartbeat, flags)
  last_checked_at timestamptz,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, path_type),
  constraint facebook_connection_paths_type_chk check (path_type in ('meta_oauth', 'chrome_extension'))
);

create index if not exists facebook_connection_paths_org_idx
  on public.facebook_connection_paths(org_id);

drop trigger if exists trg_facebook_connection_paths_updated on public.facebook_connection_paths;
create trigger trg_facebook_connection_paths_updated
  before update on public.facebook_connection_paths
  for each row execute function public.set_updated_at();

alter table public.facebook_connection_paths enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_connection_paths' and policyname='facebook_connection_paths_select') then
    create policy "facebook_connection_paths_select" on public.facebook_connection_paths
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_connection_paths' and policyname='facebook_connection_paths_insert') then
    create policy "facebook_connection_paths_insert" on public.facebook_connection_paths
      for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_connection_paths' and policyname='facebook_connection_paths_update') then
    create policy "facebook_connection_paths_update" on public.facebook_connection_paths
      for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_connection_paths' and policyname='facebook_connection_paths_delete') then
    create policy "facebook_connection_paths_delete" on public.facebook_connection_paths
      for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
end $$;

grant select, insert, update, delete on public.facebook_connection_paths to authenticated;


-- ████████████████████████████████████████████████████████████████████████
-- [9/11] supabase/migrations/20260728120000_distribution_provider_destinations.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — Distribution provider DESTINATIONS (Phase 19, additive).
-- ----------------------------------------------------------------------------
-- A destination is a concrete publishing target discovered under a connected
-- provider — e.g. a Facebook Page the user manages (GET /me/accounts). This is
-- DISCOVERY ONLY: rows record what targets exist. NOTHING here publishes.
--
-- Page access tokens, when Meta returns them, are stored ENCRYPTED in
-- access_token_encrypted (same AES-256-GCM scheme as provider connections) and
-- are NEVER returned to the client.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

create table if not exists public.distribution_provider_destinations (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  provider                text not null,                          -- 'facebook' (others later)
  destination_type        text not null,                          -- 'facebook_page' (others later)
  external_id             text not null,                          -- Meta Page id
  name                    text,
  category                text,
  status                  text not null default 'available',      -- available | unavailable | error
  access_token_encrypted  text,                                   -- encrypted Page token (nullable)
  metadata                jsonb not null default '{}'::jsonb,      -- non-sensitive (tasks/perms, etc.)
  last_synced_at          timestamptz,
  created_by              uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, provider, destination_type, external_id)
);

create index if not exists distribution_provider_destinations_org_idx
  on public.distribution_provider_destinations(org_id);
create index if not exists distribution_provider_destinations_lookup_idx
  on public.distribution_provider_destinations(org_id, provider, destination_type);

drop trigger if exists trg_distribution_provider_destinations_updated on public.distribution_provider_destinations;
create trigger trg_distribution_provider_destinations_updated
  before update on public.distribution_provider_destinations
  for each row execute function public.set_updated_at();

-- ── RLS — same-org read; manager/agent write ─────────────────────────────────
alter table public.distribution_provider_destinations enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_destinations' and policyname='distribution_provider_destinations_select') then
    create policy "distribution_provider_destinations_select" on public.distribution_provider_destinations
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_destinations' and policyname='distribution_provider_destinations_insert') then
    create policy "distribution_provider_destinations_insert" on public.distribution_provider_destinations
      for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_destinations' and policyname='distribution_provider_destinations_update') then
    create policy "distribution_provider_destinations_update" on public.distribution_provider_destinations
      for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'))
      with check (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='distribution_provider_destinations' and policyname='distribution_provider_destinations_delete') then
    create policy "distribution_provider_destinations_delete" on public.distribution_provider_destinations
      for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
end $$;

grant select, insert, update, delete on public.distribution_provider_destinations to authenticated;
grant all privileges on public.distribution_provider_destinations to service_role;


-- ████████████████████████████████████████████████████████████████████████
-- [10/11] supabase/migrations/20260729120000_facebook_extension_instances.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — Chrome Extension handshake (Phase 20, additive).
-- ----------------------------------------------------------------------------
-- The Chrome extension publishes to Facebook GROUPS / MARKETPLACE from the
-- USER's own browser session, with human approval. ZONO NEVER receives Facebook
-- passwords, cookies, or browser session tokens. These tables hold only:
--   • pairing codes (hashed, short-lived, one-time) to bind an extension install
--     to an org/user
--   • extension instances (hashed secret only — never the raw secret)
-- No Facebook credentials are stored anywhere here. No publishing logic here.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

-- ── Pairing codes — short-lived, one-time, bind install → org/user ────────────
create table if not exists public.facebook_extension_pairings (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  code_hash   text not null,                       -- sha256 of the pairing code (never the raw code)
  expires_at  timestamptz not null,                -- 10 minutes from creation
  used_at     timestamptz,                         -- set once on complete (one-time use)
  created_at  timestamptz not null default now()
);
create index if not exists facebook_extension_pairings_lookup_idx
  on public.facebook_extension_pairings(code_hash);
create index if not exists facebook_extension_pairings_org_idx
  on public.facebook_extension_pairings(org_id);

-- ── Extension instances — hashed secret only ─────────────────────────────────
create table if not exists public.facebook_extension_instances (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  instance_id   text not null,                     -- public id the extension presents
  secret_hash   text not null,                     -- sha256 of the extension secret (NEVER the raw secret)
  status        text not null default 'installed', -- installed | facebook_session_detected | ready | revoked | error
  version       text,
  last_seen_at  timestamptz,
  metadata      jsonb not null default '{}'::jsonb, -- non-sensitive only (fb display name/id, session flag)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (instance_id)
);
create index if not exists facebook_extension_instances_org_idx
  on public.facebook_extension_instances(org_id);

drop trigger if exists trg_facebook_extension_instances_updated on public.facebook_extension_instances;
create trigger trg_facebook_extension_instances_updated
  before update on public.facebook_extension_instances
  for each row execute function public.set_updated_at();

-- ── RLS — same-org read; writes happen server-side via service-role only ──────
alter table public.facebook_extension_pairings  enable row level security;
alter table public.facebook_extension_instances enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_extension_pairings' and policyname='facebook_extension_pairings_select') then
    create policy "facebook_extension_pairings_select" on public.facebook_extension_pairings
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_extension_instances' and policyname='facebook_extension_instances_select') then
    create policy "facebook_extension_instances_select" on public.facebook_extension_instances
      for select to authenticated using (org_id = public.current_org_id());
  end if;
  -- Allow managers to revoke their org's instances from the ZONO UI.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='facebook_extension_instances' and policyname='facebook_extension_instances_update') then
    create policy "facebook_extension_instances_update" on public.facebook_extension_instances
      for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'))
      with check (org_id = public.current_org_id());
  end if;
end $$;

grant select on public.facebook_extension_pairings to authenticated;
grant select, update on public.facebook_extension_instances to authenticated;
grant all privileges on public.facebook_extension_pairings  to service_role;
grant all privileges on public.facebook_extension_instances to service_role;


-- ████████████████████████████████████████████████████████████████████████
-- [11/11] supabase/migrations/20260730120000_destination_group_columns.sql
-- ████████████████████████████████████████████████████████████████████████

-- ============================================================================
-- ZONO — Group/Marketplace destination columns (Phase 21, additive).
-- ----------------------------------------------------------------------------
-- Extends distribution_provider_destinations so the user can MANUALLY add
-- Facebook GROUP / MARKETPLACE destinations (destination_type already free-text):
--   • destination_url — the group/marketplace URL the user opens in their browser
--   • last_used_at    — when a post was last sent to this destination
-- No Facebook credentials, cookies, or session data are stored. Discovery of
-- groups is NOT automated — these rows are created by hand in the ZONO UI.
-- ============================================================================
alter table public.distribution_provider_destinations
  add column if not exists destination_url text,
  add column if not exists last_used_at    timestamptz;

-- external_id was NOT NULL (it carried the Meta Page id for discovered Pages).
-- Manually-added groups/marketplace destinations have no external id, so make it
-- nullable. The unique key (org_id, provider, destination_type, external_id)
-- still holds — Postgres treats NULL external_id rows as distinct, so multiple
-- hand-added groups never collide.
alter table public.distribution_provider_destinations
  alter column external_id drop not null;

