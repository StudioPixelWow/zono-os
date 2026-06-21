-- ============================================================================
-- ZONO — Facebook Community Discovery & Execution OS (missing execution layer)
-- ----------------------------------------------------------------------------
-- Most of this domain already exists from the Distribution Workspace OS
-- (social_accounts, community_profiles, community_discovery_runs/candidates,
-- community_lead/deal_attribution, community_metrics/rankings). This migration
-- adds ONLY the missing execution pieces — comment monitoring, Messenger lead
-- capture, and social-account sync logs — and does NOT rebuild anything.
--
-- COMPLIANCE: no scraping, no credential/token storage, no browser automation.
-- social_accounts already stores connection_status only (no token). These
-- tables support MANUAL input now and are Meta-API-ready for the future.
-- Idempotent. Org column: organization_id. Org-scoped RLS.
--
-- Consolidation note: comment_monitoring/comment_intelligence/comment_leads ->
-- community_comments; messenger_threads/messenger_leads/messenger_intelligence
-- -> messenger_threads.
-- ============================================================================

-- ── community_comments (comment monitoring + intelligence + lead) ─────────────
create table if not exists public.community_comments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  community_id     uuid references public.community_profiles(id) on delete set null,
  property_id      uuid references public.properties(id) on delete set null,
  agent_id         uuid references public.users(id) on delete set null,
  source           text not null default 'manual',
  author_name      text,
  comment_text     text,
  intent           text not null default 'unknown',
  intent_score     integer not null default 0,
  lead_created     boolean not null default false,
  social_lead_id   uuid references public.social_leads(id) on delete set null,
  status           text not null default 'new',
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint community_comments_source_chk check (source in ('manual','meta_api')),
  constraint community_comments_intent_chk check (intent in (
    'unknown','question','price_request','viewing_request','buyer_intent','seller_intent','referral_intent','spam')),
  constraint community_comments_status_chk check (status in ('new','reviewed','converted','dismissed'))
);

-- ── messenger_threads (Messenger lead capture; future-ready) ──────────────────
create table if not exists public.messenger_threads (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  community_id     uuid references public.community_profiles(id) on delete set null,
  property_id      uuid references public.properties(id) on delete set null,
  agent_id         uuid references public.users(id) on delete set null,
  source           text not null default 'manual',
  contact_name     text,
  last_message     text,
  intent           text not null default 'unknown',
  intent_score     integer not null default 0,
  lead_created     boolean not null default false,
  social_lead_id   uuid references public.social_leads(id) on delete set null,
  status           text not null default 'new',
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint messenger_threads_source_chk check (source in ('manual','meta_api')),
  constraint messenger_threads_intent_chk check (intent in (
    'unknown','question','price_request','viewing_request','buyer_intent','seller_intent','referral_intent','spam')),
  constraint messenger_threads_status_chk check (status in ('new','active','converted','closed'))
);

-- ── social_account_sync_logs (health + sync audit; graceful-degrade aware) ────
create table if not exists public.social_account_sync_logs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete cascade,
  event             text not null,
  status            text not null default 'ok',
  detail            text,
  created_at        timestamptz not null default now(),
  constraint social_sync_status_chk check (status in ('ok','degraded','failed','manual'))
);

-- ── indexes ───────────────────────────────────────────────────────────────────
create index if not exists community_comments_org_idx   on public.community_comments(organization_id, status);
create index if not exists community_comments_comm_idx    on public.community_comments(community_id);
create index if not exists community_comments_intent_idx  on public.community_comments(organization_id, intent);
create index if not exists messenger_threads_org_idx      on public.messenger_threads(organization_id, status);
create index if not exists messenger_threads_comm_idx     on public.messenger_threads(community_id);
create index if not exists social_sync_logs_acct_idx      on public.social_account_sync_logs(social_account_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
do $$
declare t text;
  tbls text[] := array['community_comments','messenger_threads'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ── RLS (org-scoped; agent may write on their own org rows) ───────────────────
do $$
declare t text;
  tbls text[] := array['community_comments','messenger_threads','social_account_sync_logs'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I;', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I;', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I;', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;
