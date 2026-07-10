-- ============================================================================
-- ZONO LIVE ACTIVATION GATE · A5 — RLS authorization tests (ai_memory + others).
-- Run in the Supabase SQL editor. Uses set_config to impersonate real auth.uid()
-- and org context WITHOUT service-role bypass, so it exercises the true RLS path.
--
-- HOW: set the JWT claims the RLS helpers read. current_org_id() reads
-- public.users.org_id for auth.uid(); has_min_role() reads the user's role. So
-- pick REAL user ids from two orgs and run each block as `role authenticated`.
--
-- Fill these in from your data first:
--   \set broker_a  '<uuid of broker A in org A>'
--   \set broker_b  '<uuid of broker B in org A>'
--   \set manager_a '<uuid of a manager in org A>'
--   \set user_b    '<uuid of any user in org B>'
--   \set memid     '<uuid of A''s private user-scoped ai_memory row (create one first)>'
-- ============================================================================

-- helper: run a SELECT as a given authenticated user (RLS enforced)
-- Pattern used below:
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', :'broker_a', 'role','authenticated')::text, true);

-- ── TEST 1: Broker A creates + reads own private memory (should be visible) ──
-- (Create via the app OR insert as service-role; then read as A.)
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'broker_a','role','authenticated')::text, true);
  select 'T1 owner reads own private' as test,
         exists(select 1 from public.ai_memory where id = :'memid') as ok_should_be_true;
rollback;

-- ── TEST 2: Broker B (same org) must NOT read A's private memory ─────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'broker_b','role','authenticated')::text, true);
  select 'T2 same-org broker blocked' as test,
         not exists(select 1 from public.ai_memory where id = :'memid') as ok_should_be_true;
rollback;

-- ── TEST 3: Manager (same org) must NOT read A's private memory on SELECT ────
-- (Base policy grants manager only office/org/system OR own; private = owner-only.)
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'manager_a','role','authenticated')::text, true);
  select 'T3 manager blocked from private' as test,
         not exists(select 1 from public.ai_memory where id = :'memid') as ok_should_be_true;
rollback;

-- ── TEST 4: Org B user must NOT read A's memory (cross-org) ──────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'user_b','role','authenticated')::text, true);
  select 'T4 cross-org blocked' as test,
         not exists(select 1 from public.ai_memory where id = :'memid') as ok_should_be_true;
rollback;

-- ── TEST 5: anonymous/public must NOT read any ai_memory ─────────────────────
begin;
  set local role anon;
  select 'T5 anon blocked' as test,
         not exists(select 1 from public.ai_memory) as ok_should_be_true;
rollback;

-- ── TEST 6: effective policy sanity — qa1_read must carry the private gate ───
select 'T6 qa1_read gated (not org-only)' as test,
  (qual ilike '%visibility%' and qual ilike '%auth.uid()%') as ok_should_be_true
from pg_policies where tablename='ai_memory' and policyname='ai_memory_qa1_read';

-- ── Cross-table org isolation spot checks (run each as broker_b, then user_b) ─
-- Expect: broker_b sees org-A rows; user_b (org B) sees ZERO org-A rows.
-- Repeat this block swapping the claims sub between :broker_b and :user_b.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub', :'user_b','role','authenticated')::text, true);
  select 'domain_events'          t, count(*) org_a_rows_visible from public.domain_events          where organization_id = (select org_id from public.users where id = :'broker_a')
  union all select 'activity_events',       count(*) from public.activity_events       where org_id          = (select org_id from public.users where id = :'broker_a')
  union all select 'search_documents',      count(*) from public.search_documents      where organization_id = (select org_id from public.users where id = :'broker_a')
  union all select 'entity_relationships',  count(*) from public.entity_relationships  where org_id          = (select org_id from public.users where id = :'broker_a')
  union all select 'recommendation_events', count(*) from public.recommendation_events where organization_id = (select org_id from public.users where id = :'broker_a')
  union all select 'documents',             count(*) from public.documents             where org_id          = (select org_id from public.users where id = :'broker_a');
  -- ALL counts MUST be 0 for a cross-org user. Any > 0 = GATE FAILURE.
rollback;
