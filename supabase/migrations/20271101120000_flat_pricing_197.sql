-- ============================================================================
-- ZONO — Flat pricing migration (197 ₪ / agent, all features, 14-day trial).
-- STATUS: PROPOSED — NOT APPLIED. Requires explicit approval.
--
-- Moves the plan vocabulary from {starter,professional,office,enterprise} to the
-- flat {standard,enterprise}. ADDITIVE + non-destructive: adds the new enum
-- value, backfills legacy rows to 'standard', and adds trial + seat-billing
-- columns. NO table/column drops; NO subscriptions/payments/invoices deleted.
--
-- Production is safe today: 2 orgs (both 'starter'), 0 org_plans, 0 subscriptions,
-- 0 payments, no invoices table. The app also decodes any legacy value to
-- 'standard' at runtime (normalizePlanTier), so this migration is belt-and-suspenders.
--
-- NOTE: `alter type ... add value` cannot run inside a transaction block — apply
-- statement 1 on its own, then the rest.
-- ============================================================================

-- 1) Additive enum value on organizations.plan (org_plan). Keeps legacy values
--    ('starter','pro','team','enterprise') valid — nothing breaks.
alter type public.org_plan add value if not exists 'standard';

-- ── After statement 1 is committed, run the rest ────────────────────────────

-- 2) Backfill legacy plan values → 'standard' (keep 'enterprise' as-is).
--    organizations.plan is the enum column.
update public.organizations set plan = 'standard'
  where plan::text in ('starter','pro','team');

--    org_plans / subscriptions / payments use TEXT — safe string backfill.
update public.org_plans     set plan      = 'standard' where plan      in ('starter','professional','office','pro','team');
update public.subscriptions set plan_tier = 'standard' where plan_tier in ('starter','professional','office','pro','team');
update public.payments      set plan_tier = 'standard' where plan_tier in ('starter','professional','office','pro','team');

-- 3) Trial + seat-billing columns (additive; nullable / safe defaults).
alter table public.subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists seats            integer,
  add column if not exists unit_price_ils   numeric(10,2) default 197,
  add column if not exists billing_cycle    text default 'monthly';

alter table public.org_plans
  add column if not exists trial_started_at timestamptz;

-- 4) (Optional, future) A DB CHECK to constrain new writes to the flat vocab —
--    LEFT OUT deliberately so legacy rows / rollback remain valid. The app layer
--    (normalizePlanTier) is the enforcement point.

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Postgres cannot DROP an enum value; to fully revert, restore from backup.
-- Column rollback:
--   alter table public.subscriptions drop column if exists trial_started_at, drop column if exists seats,
--     drop column if exists unit_price_ils, drop column if exists billing_cycle;
--   alter table public.org_plans drop column if exists trial_started_at;
-- Data rollback is not required (backfill only relabeled legacy tiers to 'standard').
