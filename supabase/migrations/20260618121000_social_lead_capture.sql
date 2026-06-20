-- ============================================================================
-- ZONO — 0038 · Social Lead Capture OS
-- ----------------------------------------------------------------------------
-- Turns social interactions into structured, reviewable business opportunities.
-- EXTENDS social_interactions + social_leads (from the distribution phase) and
-- adds social_followups. Deterministic. NO LLM, NO auto-replies, NO auto-send,
-- NO auto-contact-creation (conversion is an explicit reviewed action).
-- Org-scoped, RLS. Idempotent.
-- ============================================================================

-- ── Extend social_interactions ──────────────────────────────────────────────
alter table public.social_interactions
  add column if not exists interaction_score smallint not null default 0,
  add column if not exists intent_score      smallint not null default 0,
  add column if not exists lead_probability  smallint not null default 0,
  add column if not exists engagement_level  text not null default 'low',  -- low|medium|high
  add column if not exists intent_confidence smallint not null default 0,
  add column if not exists lead_quality      smallint not null default 0,
  add column if not exists urgency_score     smallint not null default 0,
  add column if not exists source_platform   text,
  add column if not exists source_post_url   text,
  add column if not exists source_post_id    text,
  add column if not exists source_user_name  text,
  add column if not exists source_profile_url text;
create index if not exists social_interactions_org_idx    on public.social_interactions(organization_id);
create index if not exists social_interactions_status_idx on public.social_interactions(status);

-- ── Extend social_leads ──────────────────────────────────────────────────────
alter table public.social_leads
  add column if not exists status                 text not null default 'new',  -- new|reviewed|qualified|rejected|converted
  add column if not exists lead_quality_score     smallint not null default 0,
  add column if not exists priority_score         smallint not null default 0,
  add column if not exists intent_confidence      smallint not null default 0,
  add column if not exists urgency_score          smallint not null default 0,
  add column if not exists recommended_next_action text,
  add column if not exists assigned_agent_id      uuid references public.users(id) on delete set null,
  add column if not exists reviewed_by            uuid references public.users(id) on delete set null,
  add column if not exists reviewed_at            timestamptz,
  add column if not exists converted_buyer_id     uuid references public.buyers(id) on delete set null,
  add column if not exists rejection_reason       text,
  add column if not exists updated_at             timestamptz not null default now();
create index if not exists social_leads_org_idx    on public.social_leads(organization_id);
create index if not exists social_leads_status_idx on public.social_leads(status);
create index if not exists social_leads_community_idx on public.social_leads(community_id);

drop trigger if exists trg_social_leads_updated on public.social_leads;
create trigger trg_social_leads_updated before update on public.social_leads
  for each row execute function public.set_updated_at();

-- ── social_followups ─────────────────────────────────────────────────────────
create table if not exists public.social_followups (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  social_lead_id    uuid references public.social_leads(id) on delete cascade,
  lead_id           uuid references public.leads(id) on delete set null,
  community_id      uuid references public.community_profiles(id) on delete set null,
  property_id       uuid references public.properties(id) on delete set null,
  user_id           uuid references public.users(id) on delete set null,
  due_at            timestamptz,
  priority          text not null default 'medium',  -- low|medium|high
  reason            text,
  title             text,
  status            text not null default 'open',     -- open|done|dismissed
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists social_followups_org_idx     on public.social_followups(organization_id);
create index if not exists social_followups_lead_idx    on public.social_followups(social_lead_id);
create index if not exists social_followups_status_idx  on public.social_followups(status);

drop trigger if exists trg_social_followups_updated on public.social_followups;
create trigger trg_social_followups_updated before update on public.social_followups
  for each row execute function public.set_updated_at();

-- ── RLS + grants ─────────────────────────────────────────────────────────────
alter table public.social_followups enable row level security;
drop policy if exists "social_followups_select" on public.social_followups;
create policy "social_followups_select" on public.social_followups for select to authenticated
  using (organization_id = public.current_org_id());
drop policy if exists "social_followups_write" on public.social_followups;
create policy "social_followups_write" on public.social_followups for all to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'))
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));
grant select, insert, update, delete on public.social_followups to authenticated;
grant all privileges on public.social_followups to service_role;
