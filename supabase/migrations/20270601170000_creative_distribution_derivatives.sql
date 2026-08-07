-- ============================================================================
-- ZONO -- Creative Studio: APPROVED DISTRIBUTION DERIVATIVES (Step 3-4).
-- ----------------------------------------------------------------------------
-- Additive + idempotent. A promotion produces an APPROVED, immutable, versioned
-- distribution derivative in the PRIVATE creative-published bucket -- one per
-- (org, output, creative_version, channel, purpose). The private master is never
-- made public. Groups/WhatsApp/export hand-offs read ONLY an active derivative
-- for their exact job/version; Meta/Instagram is unchanged (own meta-media path).
--
-- Idempotency/concurrency: a partial unique index guarantees at most ONE active
-- derivative per deterministic (org, output, version, channel, purpose); a
-- concurrent burst / retry collapses to that single row (23505 -> re-read).
-- Version invalidation: a new creative_version is a new key, so the old
-- derivative stays as historical evidence and a new promotion is required.
-- ============================================================================

create table if not exists public.creative_distribution_derivatives (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  output_id         uuid not null references public.zono_quick_creative_outputs(id) on delete cascade,
  creative_version  integer not null default 1,
  content_hash      text,
  target_channel    text not null,          -- facebook_groups | whatsapp | export
  purpose           text not null,
  source_master_path text not null,         -- lineage: the private master promoted from
  derivative_path   text not null,          -- object path in creative-published (private)
  state             text not null default 'active',  -- active | revoked
  promoted_by       uuid references public.users(id) on delete set null,
  approval_evidence jsonb,
  metadata          jsonb,
  promoted_at       timestamptz not null default now(),
  revoked_at        timestamptz,
  created_at        timestamptz not null default now()
);

-- ONE active derivative per deterministic key (idempotency + concurrency).
create unique index if not exists uq_cdd_active
  on public.creative_distribution_derivatives (org_id, output_id, creative_version, target_channel, purpose)
  where state = 'active';
create index if not exists cdd_org_output_channel_idx
  on public.creative_distribution_derivatives (org_id, output_id, target_channel, state);

alter table public.creative_distribution_derivatives enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_distribution_derivatives' and policyname='cdd_select') then
    create policy cdd_select on public.creative_distribution_derivatives
      for select using (org_id = public.current_org_id());
  end if;
  -- Promotion + revoke are manager-gated, server-side actions.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_distribution_derivatives' and policyname='cdd_insert') then
    create policy cdd_insert on public.creative_distribution_derivatives
      for insert with check (org_id = public.current_org_id() and public.has_min_role('manager'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_distribution_derivatives' and policyname='cdd_update') then
    create policy cdd_update on public.creative_distribution_derivatives
      for update using (org_id = public.current_org_id() and public.has_min_role('manager'))
      with check (org_id = public.current_org_id());
  end if;
end $$;

-- Link the browser-assisted publish task to the creative output + version so the
-- Groups/WhatsApp hand-off resolves the exact approved derivative (not image_url).
alter table public.distribution_posts
  add column if not exists creative_output_id  uuid,
  add column if not exists creative_version    integer;
create index if not exists dist_posts_creative_output_idx
  on public.distribution_posts (org_id, creative_output_id);
