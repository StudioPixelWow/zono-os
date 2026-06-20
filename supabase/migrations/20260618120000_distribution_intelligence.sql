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
