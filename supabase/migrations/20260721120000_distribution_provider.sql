-- ============================================================================
-- ZONO — Distribution Phase 6 (Facebook integration infrastructure)
-- ----------------------------------------------------------------------------
-- Additive columns on distribution_posts to support the compliant provider layer
-- and the MANUAL publishing flow (used until an official Meta API connection is
-- approved). No columns are renamed; external_post_url already exists and is
-- reused. Idempotent (IF NOT EXISTS). RLS + updated_at triggers already cover
-- these columns.
-- ============================================================================

alter table public.distribution_posts
  add column if not exists provider                text,                       -- facebook | instagram | whatsapp | null
  add column if not exists provider_status         text not null default 'not_connected', -- not_connected | pending | connected | error
  add column if not exists manual_publish_required boolean not null default true,
  add column if not exists external_destination_url text,                      -- snapshot of the group/page/destination URL
  add column if not exists published_by            uuid references public.users(id) on delete set null,
  add column if not exists published_manually_at   timestamptz;

create index if not exists distribution_posts_provider_idx on public.distribution_posts(org_id, provider);
