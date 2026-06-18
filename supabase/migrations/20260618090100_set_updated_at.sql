-- ============================================================================
-- ZONO — 0002 · Shared updated_at trigger function
-- ----------------------------------------------------------------------------
-- A single trigger function reused by every table that carries updated_at.
-- Each table migration attaches a `before update` trigger that calls this.
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger fn: stamps now() into updated_at on every UPDATE.';
