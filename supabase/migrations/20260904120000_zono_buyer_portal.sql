-- ============================================================================
-- ZONO — Buyer Portal (32.3). Link a buyer CRM record to the Supabase auth user
-- who IS that buyer, so the authenticated Buyer Portal can resolve exactly one
-- buyer per session. Nullable + optional: existing flows are unaffected, and the
-- portal falls back to email match when the link is not set.
-- ============================================================================
alter table if exists public.buyers
  add column if not exists portal_user_id uuid references auth.users(id) on delete set null;

create index if not exists buyers_portal_user_id_idx
  on public.buyers (portal_user_id)
  where portal_user_id is not null;

comment on column public.buyers.portal_user_id is
  'Auth user who owns this buyer''s personal Buyer Portal (32.3). Nullable; portal falls back to email match.';
