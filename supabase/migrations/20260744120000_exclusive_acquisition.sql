-- ============================================================================
-- ZONO — Phase 14: Seller Intelligence™ & Exclusive Opportunity Engine.
-- ----------------------------------------------------------------------------
-- Identifies which MARKET property owners are most likely to sign an exclusive
-- listing, who to contact first, and why. These are NEW org-scoped tables for
-- the acquisition pipeline — they do NOT touch the existing CRM
-- seller_intelligence_profiles / seller_touchpoints (different purpose). Linked
-- to the radar via market_property_source_id and/or properties.linked_property_id.
-- Additive + idempotent. Deterministic engine (no AI). RLS: org reads/updates own.
-- ============================================================================

-- ── A. radar_seller_profiles — one acquisition opportunity per owner/listing ─
create table if not exists public.radar_seller_profiles (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  market_property_source_id uuid references public.market_property_sources(id) on delete cascade,
  linked_property_id        uuid references public.properties(id) on delete set null,
  provider                  text,
  city                      text,
  neighborhood              text,
  address_text              text,
  listing_type              text,
  price                     numeric,
  -- deterministic outputs
  seller_score              int  not null default 0,           -- 0..100
  exclusive_probability     int  not null default 0,           -- 0..100
  exclusive_band            text not null default 'low',        -- very_high | high | medium | low
  score_reasons             jsonb not null default '[]'::jsonb,
  probability_reasons       jsonb not null default '[]'::jsonb,
  recommended_action        text not null default 'wait',
  recommended_action_reason text,
  priority_rank             int  not null default 0,
  -- snapshot features (explainability + fast ranking)
  buyer_match_count         int  not null default 0,
  days_on_market            int,
  price_drop_count          int  not null default 0,
  republished_count         int  not null default 0,
  -- lifecycle
  lifecycle_stage           text not null default 'new_opportunity',
  last_contact_at           timestamptz,
  next_followup_at          timestamptz,
  contact_attempts          int  not null default 0,
  last_evaluated_at         timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (org_id, market_property_source_id)
);
create index if not exists rsp_org_idx              on public.radar_seller_profiles(org_id);
create index if not exists rsp_source_idx            on public.radar_seller_profiles(market_property_source_id);
create index if not exists rsp_property_idx          on public.radar_seller_profiles(linked_property_id);
create index if not exists rsp_city_idx              on public.radar_seller_profiles(city);
create index if not exists rsp_stage_idx             on public.radar_seller_profiles(lifecycle_stage);
create index if not exists rsp_band_idx              on public.radar_seller_profiles(exclusive_band);
create index if not exists rsp_org_prob_idx          on public.radar_seller_profiles(org_id, exclusive_probability);
create index if not exists rsp_org_priority_idx      on public.radar_seller_profiles(org_id, priority_rank);
create index if not exists rsp_next_followup_idx     on public.radar_seller_profiles(next_followup_at);

-- ── B. radar_seller_touchpoints — contact history ───────────────────────────
create table if not exists public.radar_seller_touchpoints (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  profile_id   uuid not null references public.radar_seller_profiles(id) on delete cascade,
  channel      text not null,             -- call | whatsapp | meeting | note | email
  direction    text default 'outbound',   -- outbound | inbound
  outcome      text,                       -- answered | no_answer | positive | negative | scheduled | ...
  notes        text,
  occurred_at  timestamptz not null default now(),
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists rst_profile_idx on public.radar_seller_touchpoints(profile_id);
create index if not exists rst_org_idx       on public.radar_seller_touchpoints(org_id);
create index if not exists rst_occurred_idx  on public.radar_seller_touchpoints(occurred_at);

-- ── C. radar_seller_signals — deterministic scoring inputs (explainability) ──
create table if not exists public.radar_seller_signals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  profile_id   uuid not null references public.radar_seller_profiles(id) on delete cascade,
  signal_type  text not null,             -- price_drop | private_listing | buyer_demand | stale | republished | ...
  weight       numeric not null default 0,
  value        jsonb not null default '{}'::jsonb,
  detected_at  timestamptz not null default now()
);
create index if not exists rss_profile_idx on public.radar_seller_signals(profile_id);
create index if not exists rss_org_idx      on public.radar_seller_signals(org_id);
create index if not exists rss_type_idx     on public.radar_seller_signals(signal_type);

-- ── D. radar_seller_followups — smart follow-up actions (link to tasks) ──────
create table if not exists public.radar_seller_followups (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  profile_id   uuid not null references public.radar_seller_profiles(id) on delete cascade,
  reason       text not null,             -- no_response | price_drop | buyer_found | scheduled_followup
  action       text not null,             -- call | whatsapp | schedule_showing | followup
  due_at       timestamptz,
  status       text not null default 'open', -- open | done | cancelled
  task_id      uuid references public.tasks(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (profile_id, reason, status)
);
create index if not exists rsf_profile_idx on public.radar_seller_followups(profile_id);
create index if not exists rsf_org_idx      on public.radar_seller_followups(org_id);
create index if not exists rsf_status_idx   on public.radar_seller_followups(status);

-- ── E. radar_seller_outcomes — terminal outcomes (signed / lost / ...) ───────
create table if not exists public.radar_seller_outcomes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  profile_id   uuid not null references public.radar_seller_profiles(id) on delete cascade,
  outcome      text not null,             -- exclusive_signed | lost | declined | no_answer | not_interested
  notes        text,
  recorded_by  uuid references public.users(id) on delete set null,
  recorded_at  timestamptz not null default now()
);
create index if not exists rso_profile_idx on public.radar_seller_outcomes(profile_id);
create index if not exists rso_org_idx      on public.radar_seller_outcomes(org_id);

-- ── triggers ─────────────────────────────────────────────────────────────────
drop trigger if exists trg_radar_seller_profiles_updated on public.radar_seller_profiles;
create trigger trg_radar_seller_profiles_updated before update on public.radar_seller_profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_radar_seller_followups_updated on public.radar_seller_followups;
create trigger trg_radar_seller_followups_updated before update on public.radar_seller_followups for each row execute function public.set_updated_at();

-- ── RLS: org reads/updates its own rows; the engine writes via service role ──
do $$
declare t text;
begin
  foreach t in array array[
    'radar_seller_profiles','radar_seller_touchpoints','radar_seller_signals',
    'radar_seller_followups','radar_seller_outcomes'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "%1$s_select" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    execute format($f$drop policy if exists "%1$s_write" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$I for all to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
