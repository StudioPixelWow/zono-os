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
