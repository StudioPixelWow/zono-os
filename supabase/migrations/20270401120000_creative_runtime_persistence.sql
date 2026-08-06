-- ============================================================================
-- ZONO Creative Studio — Local Runtime persistence (ADDITIVE, non-destructive).
-- Adds output lineage columns to the EXISTING zono_quick_creative_outputs and
-- two org-scoped linking tables for publication + performance. Reuses existing
-- models (zono_quick_creative_*, organizations, usage_events) — no duplication.
-- Idempotent. Depends on public.current_org_id() / has_min_role() / set_updated_at().
-- ============================================================================

-- ── Output lineage (additive columns on the existing outputs table) ───────────
alter table public.zono_quick_creative_outputs add column if not exists root_output_id uuid;
alter table public.zono_quick_creative_outputs add column if not exists parent_output_id uuid;
alter table public.zono_quick_creative_outputs add column if not exists source_brief_version text;
alter table public.zono_quick_creative_outputs add column if not exists source_brand_version text;
alter table public.zono_quick_creative_outputs add column if not exists refinement_reason text;
alter table public.zono_quick_creative_outputs add column if not exists private_master_path text;
alter table public.zono_quick_creative_outputs add column if not exists publication_ref text;
create index if not exists idx_qco_root on public.zono_quick_creative_outputs (org_id, root_output_id);
create index if not exists idx_qco_parent on public.zono_quick_creative_outputs (parent_output_id);

-- ── Publications (approved output → platform publication) ─────────────────────
create table if not exists public.creative_publications (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  output_id              uuid not null references public.zono_quick_creative_outputs(id) on delete cascade,
  content_item_id        uuid,
  platform               text not null,
  variant_key            text not null,
  status                 text not null default 'processing'
                           check (status in ('processing','published','failed_transient','failed_permanent','cancelled')),
  provider_confirmation_id text,
  idempotency_key        text not null,
  scheduled_at           timestamptz,
  published_at           timestamptz,
  created_by             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (org_id, idempotency_key),
  unique (org_id, output_id, platform)
);
create index if not exists idx_creative_pub_output on public.creative_publications (output_id);
create index if not exists idx_creative_pub_org on public.creative_publications (org_id, status);

-- ── Idempotency keys (generation/publication/etc — no duplicate on retry) ─────
create table if not exists public.creative_idempotency (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  scope      text not null,
  key        text not null,
  ref_id     uuid not null,
  created_at timestamptz not null default now(),
  primary key (org_id, scope, key)
);

-- ── Performance (publication → analytics, linked to output) ───────────────────
create table if not exists public.creative_performance (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  publication_id    uuid not null references public.creative_publications(id) on delete cascade,
  output_id         uuid not null references public.zono_quick_creative_outputs(id) on delete cascade,
  platform          text not null,
  variant_key       text,
  period            text not null,
  freshness         timestamptz,
  impressions       bigint not null default 0,
  reach             bigint not null default 0,
  engagement        bigint not null default 0,
  clicks            bigint not null default 0,
  saves             bigint not null default 0,
  shares            bigint not null default 0,
  leads             bigint not null default 0,
  spend             numeric(14,2),
  created_at        timestamptz not null default now(),
  unique (org_id, publication_id, period)
);
create index if not exists idx_creative_perf_output on public.creative_performance (output_id);
create index if not exists idx_creative_perf_org on public.creative_performance (org_id, period);

-- ── updated_at + RLS ──────────────────────────────────────────────────────────
do $$
begin
  drop trigger if exists trg_creative_publications_updated on public.creative_publications;
  create trigger trg_creative_publications_updated before update on public.creative_publications for each row execute function public.set_updated_at();

  -- publications: org-scoped select/insert/update
  execute 'alter table public.creative_publications enable row level security';
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_publications' and policyname='creative_publications_select') then
    execute 'create policy creative_publications_select on public.creative_publications for select to authenticated using (org_id = public.current_org_id())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_publications' and policyname='creative_publications_insert') then
    execute 'create policy creative_publications_insert on public.creative_publications for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role(''agent''))';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_publications' and policyname='creative_publications_update') then
    execute 'create policy creative_publications_update on public.creative_publications for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent'')) with check (org_id = public.current_org_id())';
  end if;

  -- performance: org-scoped select + insert (append-only analytics)
  execute 'alter table public.creative_performance enable row level security';
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_performance' and policyname='creative_performance_select') then
    execute 'create policy creative_performance_select on public.creative_performance for select to authenticated using (org_id = public.current_org_id())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_performance' and policyname='creative_performance_insert') then
    execute 'create policy creative_performance_insert on public.creative_performance for insert to authenticated with check (org_id = public.current_org_id())';
  end if;

  -- idempotency: org-scoped select + insert
  execute 'alter table public.creative_idempotency enable row level security';
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_idempotency' and policyname='creative_idempotency_select') then
    execute 'create policy creative_idempotency_select on public.creative_idempotency for select to authenticated using (org_id = public.current_org_id())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_idempotency' and policyname='creative_idempotency_insert') then
    execute 'create policy creative_idempotency_insert on public.creative_idempotency for insert to authenticated with check (org_id = public.current_org_id())';
  end if;
end $$;
