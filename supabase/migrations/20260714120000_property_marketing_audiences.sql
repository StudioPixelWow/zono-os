-- ZONO QA Pack — Issue 3: structured target audiences on properties.
-- Replaces the free-text "קהל יעד" with a structured, multi-select array of
-- audience keys (see src/lib/properties/audiences.ts). The legacy
-- target_audience text column is kept for backward-compat / free-text "other".
alter table public.properties
  add column if not exists marketing_audiences jsonb not null default '[]'::jsonb;

comment on column public.properties.marketing_audiences is
  'Structured target-audience keys (jsonb array). See lib/properties/audiences.ts.';
