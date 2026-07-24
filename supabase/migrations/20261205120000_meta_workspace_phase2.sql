-- ============================================================================
-- ZONO — Batch 6.8 · Meta Workspace — Phase 2 schema (Content Studio, Drafts,
-- Media, Approvals). ADDITIVE + IDEMPOTENT. No Phase 1 (or any frozen) table is
-- altered. Every table is org-scoped with RLS via public.current_org_id() and
-- role gating via public.has_min_role(...). NO media bytes are stored (only a
-- storage reference); NO tokens, signed URLs, or raw Graph payloads are stored.
-- Content is provider-neutral. Nothing here publishes — Phase 3 owns publishing.
-- ============================================================================

-- ── Media asset (canonical org media record; bytes live in object storage) ──
create table if not exists public.meta_media_asset (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  storage_ref text not null,                       -- opaque object-storage key (never a public URL)
  original_filename text,
  display_filename text,                           -- sanitized, safe to render
  media_kind text not null default 'image' check (media_kind in ('image','video')),
  mime_type text not null,
  checksum text not null,                          -- server-computed; dedup key
  file_size bigint not null default 0,
  width integer,
  height integer,
  duration_ms integer,
  aspect_ratio numeric,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processing','ready','failed')),
  validation_status text not null default 'pending'
    check (validation_status in ('pending','valid','invalid','warning')),
  validation_errors jsonb not null default '[]'::jsonb,   -- safe codes/messages only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint meta_media_asset_org_checksum_uq unique (org_id, checksum)
);
create index if not exists meta_media_asset_org_kind_idx on public.meta_media_asset (org_id, media_kind);
create index if not exists meta_media_asset_active_idx on public.meta_media_asset (org_id) where archived_at is null;

-- ── Media variant (derived/target-specific representation) ──────────────────
create table if not exists public.meta_media_variant (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  media_asset_id uuid not null references public.meta_media_asset(id) on delete cascade,
  variant_key text not null,                       -- e.g. 'original','fb_feed','ig_square','thumb'
  target_platform text check (target_platform is null or target_platform in ('facebook','instagram')),
  intended_content_kind text,
  storage_ref text not null,                       -- may equal the original when no transform needed
  mime_type text not null,
  file_size bigint,
  width integer,
  height integer,
  duration_ms integer,
  processing_status text not null default 'ready'
    check (processing_status in ('pending','processing','ready','failed','variant_required')),
  created_at timestamptz not null default now(),
  constraint meta_media_variant_uq unique (org_id, media_asset_id, variant_key)
);
create index if not exists meta_media_variant_asset_idx on public.meta_media_variant (org_id, media_asset_id);

-- ── Content draft (canonical org-owned draft) ───────────────────────────────
create table if not exists public.meta_content_draft (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  internal_name text not null default '',
  created_by uuid references public.users(id) on delete set null,
  current_version integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft','in_review','changes_requested','approved','rejected','archived')),
  content_class text not null default 'standard',
  default_caption text not null default '',
  default_hashtags text[] not null default '{}',
  planned_at timestamptz,
  timezone text,
  approval_state text not null default 'not_required'
    check (approval_state in ('not_required','pending','approved','rejected','changes_requested')),
  content_hash text,                               -- deterministic; feeds Phase 3 idempotency
  revision integer not null default 0,             -- optimistic concurrency token
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meta_content_draft_status_idx on public.meta_content_draft (org_id, status);
create index if not exists meta_content_draft_planned_idx on public.meta_content_draft (org_id, planned_at);
create index if not exists meta_content_draft_active_idx on public.meta_content_draft (org_id) where archived_at is null;

-- ── Draft target (one target-specific config per connected asset) ───────────
create table if not exists public.meta_content_draft_target (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  draft_id uuid not null references public.meta_content_draft(id) on delete cascade,
  asset_kind text not null check (asset_kind in ('page','instagram')),
  -- Canonical Phase-1 asset uuid (NOT a raw Meta external id).
  asset_id uuid not null,
  platform text not null check (platform in ('facebook','instagram')),
  content_kind text not null,
  enabled boolean not null default true,
  caption_override text,                           -- null = inherit shared
  hashtags_override text[],                        -- null = inherit shared
  media_order uuid[] not null default '{}',        -- ordered media_asset ids
  capability_snapshot jsonb not null default '{}'::jsonb,
  validation_result jsonb not null default '{}'::jsonb,
  preview_meta jsonb not null default '{}'::jsonb,
  planned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_draft_target_uq unique (org_id, draft_id, asset_id, platform)
);
create index if not exists meta_draft_target_draft_idx on public.meta_content_draft_target (org_id, draft_id);

-- ── Draft version (immutable content-history snapshot) ──────────────────────
create table if not exists public.meta_content_draft_version (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  draft_id uuid not null references public.meta_content_draft(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,                         -- secret-free, provider-neutral, restorable
  content_hash text not null,
  changed_by uuid references public.users(id) on delete set null,
  change_reason text,
  created_at timestamptz not null default now(),
  constraint meta_draft_version_uq unique (draft_id, version_number)
);
create index if not exists meta_draft_version_draft_idx on public.meta_content_draft_version (org_id, draft_id);

-- ── Approval request (bound to a specific immutable draft version) ──────────
create table if not exists public.meta_approval_request (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  draft_id uuid not null references public.meta_content_draft(id) on delete cascade,
  requested_by uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','changes_requested','cancelled')),
  assigned_approver uuid references public.users(id) on delete set null,
  approver_role text,
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  draft_version_number integer not null,           -- the exact version under review
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one PENDING approval request per draft (no duplicate/spam).
create unique index if not exists meta_approval_pending_uq
  on public.meta_approval_request (org_id, draft_id) where status = 'pending';
create index if not exists meta_approval_draft_idx on public.meta_approval_request (org_id, draft_id);

-- ── Approval comment (internal review discussion; never sent to Meta) ───────
create table if not exists public.meta_approval_comment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  approval_request_id uuid references public.meta_approval_request(id) on delete cascade,
  draft_id uuid not null references public.meta_content_draft(id) on delete cascade,
  author_id uuid references public.users(id) on delete set null,
  body text not null,
  target_ref uuid,                                 -- optional draft-target reference
  media_ref uuid,                                  -- optional media reference
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meta_approval_comment_req_idx on public.meta_approval_comment (org_id, approval_request_id);
create index if not exists meta_approval_comment_draft_idx on public.meta_approval_comment (org_id, draft_id);

-- ── RLS — org isolation + role gating ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'meta_media_asset','meta_media_variant','meta_content_draft',
    'meta_content_draft_target','meta_content_draft_version',
    'meta_approval_request','meta_approval_comment'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Read: any authenticated org member may read the org's content-prep rows.
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
    -- Write (insert/update): org members with at least the agent role. Finer
    -- role rules (who may approve, edit others'' drafts, etc.) are enforced in the
    -- service layer against the role model; RLS is the tenant + baseline gate.
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role(''agent''))',
      t || '_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent'')) with check (org_id = public.current_org_id())',
      t || '_update', t);
  end loop;
end $$;
