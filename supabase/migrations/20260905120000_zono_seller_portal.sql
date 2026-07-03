-- ============================================================================
-- ZONO — Seller Portal (32.4). Link a seller CRM record to the Supabase auth user
-- who IS that seller, so the authenticated Seller Portal can resolve exactly one
-- seller per session. Nullable + optional: existing flows are unaffected, and the
-- portal falls back to email match when the link is not set.
-- ============================================================================
alter table if exists public.sellers
  add column if not exists portal_user_id uuid references auth.users(id) on delete set null;

create index if not exists sellers_portal_user_id_idx
  on public.sellers (portal_user_id)
  where portal_user_id is not null;

comment on column public.sellers.portal_user_id is
  'Auth user who owns this seller''s personal Seller Portal (32.4). Nullable; portal falls back to email match.';
