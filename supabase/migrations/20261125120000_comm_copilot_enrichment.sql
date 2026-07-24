-- ============================================================================
-- ZONO — Batch 6.7 · Phase 5 — Copilot LLM enrichment cache + AI audit.
-- Additive + idempotent. Caches enriched outputs (invalidated when the
-- deterministic freshness hash changes) and records the AI audit trail. No
-- frozen table touched. Org-scoped RLS via public.current_org_id().
-- ============================================================================
create table if not exists public.copilot_enrichment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_ref text not null,
  kind text not null check (kind in ('summary','reply','classification')),
  det_hash text not null,                          -- deterministic freshness hash (cache key)
  deterministic text,                              -- the authoritative deterministic output
  enriched text,                                   -- accepted enrichment (or = deterministic on fallback)
  accepted boolean not null default false,
  validation_status text not null,                 -- accepted / rejected_*
  confidence_delta numeric not null default 0,     -- enriched − deterministic confidence
  explanation text,
  -- AI audit: provider, model, latency_ms, est_tokens, est_cost_usd, accepted/rejected.
  audit jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_copilot_enrichment unique (org_id, conversation_ref, kind)
);
create index if not exists copilot_enrichment_conv_idx on public.copilot_enrichment (org_id, conversation_ref);

alter table public.copilot_enrichment enable row level security;
drop policy if exists copilot_enrichment_select on public.copilot_enrichment;
create policy copilot_enrichment_select on public.copilot_enrichment
  for select to authenticated using (org_id = public.current_org_id());
