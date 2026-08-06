-- ============================================================================
-- ZONO — SECURITY DEFINER RPC grant hardening (Meta queue dispatch functions).
-- ----------------------------------------------------------------------------
-- The 9 Meta queue/budget RPCs are SECURITY DEFINER, owner=postgres, with a
-- pinned `search_path=public`. They are meant to be called ONLY by the internal
-- server-side dispatcher via the service role. As shipped they carried the
-- default PUBLIC EXECUTE grant plus explicit anon/authenticated EXECUTE, so any
-- signed-in (or anonymous) client could invoke a durable lease-claim / budget
-- mutation. This migration removes that exposure: revoke EXECUTE from
-- public/anon/authenticated and grant it only to service_role. Ownership
-- (postgres) and the pinned search_path are unchanged, so service-role dispatch
-- and the SECURITY DEFINER body are preserved. Idempotent (revoke/grant are
-- naturally idempotent).
--
-- Functions covered:
--   meta_publish_claim_due, meta_reconcile_claim_due, meta_comment_claim_due,
--   meta_insight_claim_due, meta_inbox_claim_due, meta_intelligence_claim_due,
--   meta_listening_claim_due, meta_messaging_claim_due
--     — signature (timestamptz, integer, integer, text, integer)
--   meta_publish_consume_budget
--     — signature (uuid, text, timestamptz, integer, integer)
-- ============================================================================

do $$
declare
  fn text;
  claim_fns text[] := array[
    'meta_publish_claim_due','meta_reconcile_claim_due','meta_comment_claim_due',
    'meta_insight_claim_due','meta_inbox_claim_due','meta_intelligence_claim_due',
    'meta_listening_claim_due','meta_messaging_claim_due'
  ];
begin
  foreach fn in array claim_fns loop
    execute format(
      'revoke execute on function public.%I(timestamptz, integer, integer, text, integer) from public, anon, authenticated;', fn);
    execute format(
      'grant execute on function public.%I(timestamptz, integer, integer, text, integer) to service_role;', fn);
  end loop;

  revoke execute on function public.meta_publish_consume_budget(uuid, text, timestamptz, integer, integer)
    from public, anon, authenticated;
  grant execute on function public.meta_publish_consume_budget(uuid, text, timestamptz, integer, integer)
    to service_role;
exception when insufficient_privilege then
  raise notice 'Skipped meta RPC grant hardening (insufficient privilege).';
end $$;
