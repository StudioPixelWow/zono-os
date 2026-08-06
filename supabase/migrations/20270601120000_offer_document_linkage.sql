-- ============================================================================
-- ZONO — Offer ⇄ Deal linkage (additive, idempotent).
-- Adds the reverse pointer deals.offer_id and the DB-level guarantees that make
-- offer→deal conversion deterministic: at most ONE deal per offer, and at most
-- ONE deal per offer_id even under concurrent conversion (race-safe unique index).
-- Safe to re-run: every statement is guarded with IF NOT EXISTS.
-- ============================================================================

-- Reverse pointer: which offer a deal was converted from (nullable — most deals
-- are created directly and have no originating offer).
alter table public.deals
  add column if not exists offer_id uuid references public.offers(id) on delete set null;

-- Fast lookup of the deal for a given offer (used by the race-safe re-read path).
create index if not exists idx_deals_offer on public.deals(offer_id);

-- RACE-SAFE: at most one deal per offer. A concurrent second conversion hits this
-- and fails with SQLSTATE 23505, which the service catches and resolves to the
-- already-created deal (never throws to the caller).
create unique index if not exists uq_deals_offer on public.deals(offer_id) where offer_id is not null;

-- Symmetric guarantee on the forward pointer: at most one offer per deal_id.
create unique index if not exists uq_offers_deal on public.offers(deal_id) where deal_id is not null;
