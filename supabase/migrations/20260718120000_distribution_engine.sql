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
