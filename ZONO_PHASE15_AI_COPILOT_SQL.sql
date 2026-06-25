-- ============================================================================
-- ZONO — Phase 15: AI Copilot & Communication Intelligence — output cache.
-- ----------------------------------------------------------------------------
-- Cost control: cache AI outputs (briefs, summaries, messages) per org keyed by
-- (org, cache_key). `data_hash` is a fingerprint of the structured context used
-- to build the prompt — when the underlying data changes the hash changes, the
-- cache misses, and the copilot regenerates. AI is an AUGMENTATION layer only;
-- this table never stores deterministic engine outputs. Additive + idempotent.
-- ============================================================================
create table if not exists public.ai_copilot_cache (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  cache_key   text not null,
  kind        text not null,            -- seller_call_brief | morning_brief | whatsapp | ...
  entity_id   text,                      -- profile/source/buyer id this output is about
  data_hash   text not null,            -- fingerprint of the structured context
  content     text not null,            -- generated text
  source      text not null default 'ai', -- ai | fallback
  model       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, cache_key)
);
create index if not exists acc_org_idx       on public.ai_copilot_cache(org_id);
create index if not exists acc_kind_idx        on public.ai_copilot_cache(kind);
create index if not exists acc_entity_idx      on public.ai_copilot_cache(entity_id);
create index if not exists acc_org_kind_entity on public.ai_copilot_cache(org_id, kind, entity_id);

drop trigger if exists trg_ai_copilot_cache_updated on public.ai_copilot_cache;
create trigger trg_ai_copilot_cache_updated before update on public.ai_copilot_cache for each row execute function public.set_updated_at();

-- ── RLS: org reads its own cached outputs; the copilot writes via service role ─
alter table public.ai_copilot_cache enable row level security;
drop policy if exists "acc_select" on public.ai_copilot_cache;
create policy "acc_select" on public.ai_copilot_cache for select to authenticated using (org_id = public.current_org_id());
grant select on public.ai_copilot_cache to authenticated;
grant all privileges on public.ai_copilot_cache to service_role;
