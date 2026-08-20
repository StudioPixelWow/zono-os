-- ============================================================================
-- ZONO — office_members public-site visibility (additive).
-- Controls whether a roster member is published on the public office website.
-- Default FALSE so no roster member is ever exposed publicly by accident; the
-- office explicitly opts each intended public agent in. Additive, backfill-safe.
-- ============================================================================
alter table public.office_members
  add column if not exists show_on_website boolean not null default false;

comment on column public.office_members.show_on_website is
  'Public office-website visibility. Default false — enable only for intended public agents.';
