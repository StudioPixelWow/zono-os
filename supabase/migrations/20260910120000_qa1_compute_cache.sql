-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 COMPUTE CACHE. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "no cache tier for heavy assemblers" finding. A generic,
-- org-scoped, TTL'd key/value cache for expensive multi-engine assemblies
-- (AI Home, Ask ZONO, Chief of Staff, Orchestrator, Market Domination, Area
-- Portal aggregates). Helpers live in src/lib/compute-cache
-- (getCache/setCache/invalidateCache). Every key is org-scoped — no cross-org
-- or unscoped public caching. Writes run under service_role; authenticated gets
-- org-scoped READ.
-- ============================================================================

create table if not exists public.zono_compute_cache (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  namespace   text not null,                   -- ai_home|ask_zono|cos|orchestrator|market_domination|area_aggregates
  cache_key   text not null,
  payload     jsonb not null default '{}'::jsonb,
  version     text,
  computed_at timestamptz not null default now(),
  expires_at  timestamptz,
  unique (org_id, namespace, cache_key)
);
create index if not exists zcc_lookup_idx  on public.zono_compute_cache (org_id, namespace, cache_key);
create index if not exists zcc_expires_idx on public.zono_compute_cache (expires_at);

alter table public.zono_compute_cache enable row level security;

drop policy if exists zcc_select on public.zono_compute_cache;
create policy zcc_select on public.zono_compute_cache for select to authenticated
  using (org_id = public.current_org_id());
