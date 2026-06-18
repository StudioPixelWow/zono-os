-- ============================================================================
-- ZONO — 0014 · Widen price columns to bigint
-- ----------------------------------------------------------------------------
-- `integer` caps at ~2.14B ₪, which is too low for high-end / commercial deals.
-- Widen the money columns to bigint (still whole shekels). Rooms stay
-- numeric(3,1) (realistic max 99.9). Existing >= 0 checks remain valid.
-- ============================================================================

alter table public.properties
  alter column price type bigint,
  alter column monthly_rent type bigint,
  alter column price_before_discount type bigint,
  alter column price_per_sqm type bigint;
