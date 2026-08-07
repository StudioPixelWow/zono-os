-- ============================================================================
-- ZONO -- Creative Studio: PRIVATE master + promoted distribution derivative.
-- Additive + idempotent. Dual-layer creative-asset storage:
--   creative-private   (PRIVATE) -- master: raw output, QA attempts, rejected,
--                       approved master, lineage. Never anon-accessible; read
--                       only via short-lived org-scoped signed URLs.
--   creative-published (PRIVATE) -- approved-only distribution derivatives,
--                       served via bounded-TTL signed URLs (meta-media pattern).
-- Promotion metadata persisted on the EXISTING output entity (no second model).
-- Legacy generated-zono-visuals is NOT touched here (separate legacy slice).
-- Privilege-guarded like 20270402120000_documents_private_storage.sql.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('creative-private',   'creative-private',   false),
  ('creative-published', 'creative-published', false)
on conflict (id) do nothing;

do $$
declare
  b text;
  buckets text[] := array['creative-private', 'creative-published'];
begin
  foreach b in array buckets loop
    if not exists (select 1 from pg_policies where schemaname='storage' and policyname = b || '_org_select') then
      execute format(
        'create policy %I on storage.objects for select to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = public.current_org_id()::text)',
        b || '_org_select', b);
    end if;
  end loop;
exception when insufficient_privilege or undefined_table then
  raise notice 'Skipped creative private-storage buckets/policies (insufficient privilege).';
end $$;

alter table public.zono_quick_creative_outputs
  add column if not exists private_master_path   text,
  add column if not exists distribution_path      text,
  add column if not exists storage_visibility      text not null default 'private',
  add column if not exists promoted_at             timestamptz,
  add column if not exists promoted_by             uuid references public.users(id) on delete set null,
  add column if not exists promotion_purpose       text,
  add column if not exists target_channel          text,
  add column if not exists content_hash            text,
  add column if not exists creative_version         integer not null default 1,
  add column if not exists expires_at              timestamptz,
  add column if not exists revoked_at              timestamptz,
  add column if not exists root_output_id          uuid references public.zono_quick_creative_outputs(id) on delete set null,
  add column if not exists provider_confirmation    jsonb;

create index if not exists zqco_root_output_idx    on public.zono_quick_creative_outputs (org_id, root_output_id);
create index if not exists zqco_content_hash_idx   on public.zono_quick_creative_outputs (org_id, content_hash);
create index if not exists zqco_visibility_idx     on public.zono_quick_creative_outputs (org_id, storage_visibility);

create table if not exists public.creative_promotion_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  output_id     uuid not null references public.zono_quick_creative_outputs(id) on delete cascade,
  action        text not null,
  purpose       text,
  target_channel text,
  distribution_path text,
  content_hash  text,
  actor_id      uuid references public.users(id) on delete set null,
  reason        text,
  metadata      jsonb,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists cpe_org_output_idx on public.creative_promotion_events (org_id, output_id, occurred_at);

alter table public.creative_promotion_events enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_promotion_events' and policyname='cpe_select') then
    create policy cpe_select on public.creative_promotion_events
      for select using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_promotion_events' and policyname='cpe_insert') then
    create policy cpe_insert on public.creative_promotion_events
      for insert with check (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
end $$;
