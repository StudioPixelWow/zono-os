-- ============================================================================
-- ZONO — Facebook Groups Distribution Engine (Phase 28, additive + idempotent).
-- ----------------------------------------------------------------------------
-- Turns Facebook Groups into a STRUCTURED, user-controlled distribution channel
-- on top of the existing distribution_groups + Chrome-extension architecture.
-- Adds: group classification (property types / region / language), real
-- performance stats, lead attribution, and per-group post history.
--
-- HARD RULES: no fake publishing, no hidden automation. Posting stays a manual,
-- human-confirmed action via the extension. Every stat here is computed from
-- REAL recorded posts + REAL attributed leads. Nothing is invented.
-- Conventions: public.current_org_id(), public.has_min_role(), public.set_updated_at().
-- ============================================================================

-- ── distribution_groups: classification + real performance stats ─────────────
alter table public.distribution_groups
  add column if not exists property_types   text[] not null default '{}',  -- apartment | garden_apartment | ...
  add column if not exists region           text,                          -- north | center | ...
  add column if not exists language         text not null default 'he',
  add column if not exists neighborhoods    text[] not null default '{}',
  add column if not exists total_posts      integer not null default 0,
  add column if not exists total_leads      integer not null default 0,
  add column if not exists last_lead_at      timestamptz,
  add column if not exists avg_response_rate numeric,                       -- 0..1 (engagement, real)
  add column if not exists classification_source text;                      -- manual | auto

create index if not exists distribution_groups_perf_idx on public.distribution_groups(org_id, performance_score desc);

-- ── distribution_group_posts — per-group publish history (human-confirmed) ───
create table if not exists public.distribution_group_posts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  group_id      uuid not null references public.distribution_groups(id) on delete cascade,
  campaign_id   uuid references public.distribution_campaigns(id) on delete set null,
  property_id   uuid references public.properties(id) on delete set null,
  post_url      text,
  status        text not null default 'posted',  -- posted | removed | flagged
  posted_by     uuid references public.users(id) on delete set null,
  posted_at     timestamptz not null default now(),
  reach         integer,
  reactions     integer,
  comments      integer,
  leads_count   integer not null default 0,
  content_hash  text,                            -- duplicate-prevention fingerprint
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists dgp_group_idx on public.distribution_group_posts(group_id, posted_at desc);
create index if not exists dgp_org_idx on public.distribution_group_posts(org_id);
create index if not exists dgp_dupe_idx on public.distribution_group_posts(org_id, group_id, content_hash);

-- ── distribution_group_leads — lead attribution back to a group ──────────────
create table if not exists public.distribution_group_leads (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  group_id       uuid not null references public.distribution_groups(id) on delete cascade,
  post_id        uuid references public.distribution_group_posts(id) on delete set null,
  property_id    uuid references public.properties(id) on delete set null,
  lead_id        uuid references public.leads(id) on delete set null,
  contact_name   text,
  contact_phone  text,
  note           text,
  status         text not null default 'new',     -- new | qualified | converted | lost
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists dgl_group_idx on public.distribution_group_leads(group_id, created_at desc);
create index if not exists dgl_org_idx on public.distribution_group_leads(org_id);

-- ── triggers ─────────────────────────────────────────────────────────────────
drop trigger if exists trg_distribution_groups_updated on public.distribution_groups;
create trigger trg_distribution_groups_updated before update on public.distribution_groups for each row execute function public.set_updated_at();

-- ── RLS — same-org read; agent+ write ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['distribution_group_posts','distribution_group_leads'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$drop policy if exists "%1$s_select" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    execute format($f$drop policy if exists "%1$s_write" on public.%1$I;$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$I for all to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
