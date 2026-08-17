-- ============================================================================
-- P9.1 — Distribution lost-ack SWEEP: recover stranded in-flight group posts.
-- ----------------------------------------------------------------------------
-- A post handed to the browser extension (publish_state 'dispatching' or
-- 'awaiting_confirmation') whose LEASE expires without a reported result is
-- AMBIGUOUS: the human may already have posted it to the real Facebook group.
-- Blindly requeueing would DOUBLE-POST. This sweep moves such posts to
-- 'awaiting_reconciliation' — an EXISTING state that is resolved ONLY by an
-- explicit human decision (reconcilePostAction: אכן פורסם / לא פורסם / ביטול).
-- It NEVER returns them to scheduled/queued and NEVER re-posts.
--
-- Safety properties:
--   • idempotent      — a swept row leaves the in-flight states, so re-runs
--                        select nothing (no duplicate transitions/events).
--   • concurrency-safe — FOR UPDATE SKIP LOCKED; a single set-based statement.
--   • tenant-safe      — each row keeps its own org_id; no cross-org mixing.
--   • auditable        — exactly one append-only event per swept post.
--   • deploy-safe      — pure DB function; a mid-run restart just re-sweeps
--                        whatever is still stale on the next tick.
-- p_grace_seconds adds slack beyond lease expiry before a post is considered
-- truly stranded (default 120s), so a briefly-late ack is not swept prematurely.
-- ============================================================================
create or replace function public.reconcile_stale_distribution_posts(p_grace_seconds integer default 120)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cutoff timestamptz := now() - make_interval(secs => greatest(coalesce(p_grace_seconds, 0), 0));
  v_count  integer := 0;
begin
  with stale as (
    select p.id, p.org_id, p.publish_state as from_state
    from public.distribution_posts p
    where p.publish_state in ('dispatching', 'awaiting_confirmation')
      and p.terminal is not true
      and p.lease_expires_at is not null
      and p.lease_expires_at < v_cutoff
    for update skip locked
  ),
  upd as (
    update public.distribution_posts p
       set publish_state    = 'awaiting_reconciliation',
           status           = 'awaiting_reconciliation',
           lease_expires_at = null,
           locked_by        = null,
           reconciled_at    = null,
           updated_at       = now()
      from stale s
     where p.id = s.id
    returning p.id, p.org_id, s.from_state
  )
  insert into public.distribution_publish_events
    (org_id, target_id, from_state, to_state, kind, actor_id, callback_id, reason, occurred_at)
  select u.org_id, u.id, u.from_state, 'awaiting_reconciliation', 'ack_lost', null, null,
         'stale lease auto-swept to reconciliation (P9.1 lost-ack recovery)', now()
  from upd u;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.reconcile_stale_distribution_posts(integer) is
  'P9.1 lost-ack sweep: stranded dispatching/awaiting_confirmation posts (expired lease) -> awaiting_reconciliation. Never re-posts; explicit human decision only.';

-- Executed by the service role from the /api/cron/distribution-reconcile route.
revoke all on function public.reconcile_stale_distribution_posts(integer) from public, anon, authenticated;
