-- ============================================================================
-- ZONO — office_members public SEO slug + public-query index (additive).
-- public_slug gives office agents a stable, human-readable public URL
-- (/site/[office]/agents/[slug]) instead of a raw UUID. Org-scoped uniqueness for
-- non-null slugs only (a member may have none). Additive + backfill-safe.
-- ============================================================================
alter table public.office_members
  add column if not exists public_slug text;

-- Org-scoped uniqueness for published slugs (null slugs are unconstrained).
create unique index if not exists uq_office_members_public_slug
  on public.office_members (org_id, public_slug) where public_slug is not null;

-- Supports the public-site roster query: org + show_on_website + status.
create index if not exists idx_office_members_public
  on public.office_members (org_id, show_on_website, status);

comment on column public.office_members.public_slug is
  'Public-site URL slug (org-unique when set). Null = fall back to the id in the URL.';
