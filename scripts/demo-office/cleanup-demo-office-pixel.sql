-- ============================================================================
-- ZONO — REALISTIC DEMO OFFICE DATASET  ·  cleanup  ·  marker = zono_demo_office_pixel_v1
-- ----------------------------------------------------------------------------
-- Removes ONLY the demo-seed rows from the target org, dependency-ordered. Uses
-- the demo marker + the deterministic id sets, so it also catches trigger-derived
-- children (tasks/notifications/meetings/activity) that reference demo entities.
-- The org's PRE-EXISTING property (no marker) and any pre-existing rows are kept.
--
--   TARGET ORG : פיקסל         0f1825d2-0ac8-45d1-b03c-50ce9e9366a2  (DEV only)
--
-- Run against the ZONO **DEV** database only. Never production.
-- To preview what WOULD be deleted, run the SELECTs in the final comment block
-- before executing this script.
-- ============================================================================
do $$
declare
  o uuid := '0f1825d2-0ac8-45d1-b03c-50ce9e9366a2';
  mk jsonb := '{"demo_seed":"zono_demo_office_pixel_v1"}';
  props uuid[]  := (select array_agg(md5('zdo1p:prop:'||g)::uuid)   from generate_series(1,20) g);
  leads uuid[]  := (select array_agg(md5('zdo1p:lead:'||g)::uuid)   from generate_series(1,50) g);
  buyers uuid[] := (select array_agg(md5('zdo1p:buyer:'||g)::uuid)  from generate_series(1,35) g);
  sellers uuid[]:= (select array_agg(md5('zdo1p:seller:'||g)::uuid) from generate_series(1,14) g);
  deals uuid[]  := (select array_agg(md5('zdo1p:deal:'||g)::uuid)   from generate_series(1,9)  g);
  dps uuid[]    := (select array_agg(md5('zdo1p:dp:'||g)::uuid)     from generate_series(1,9)  g);
begin
  -- deal sub-tables (by demo deal_profile)
  delete from public.deal_journeys   where organization_id=o and deal_profile_id = any(dps);
  delete from public.deal_objections  where organization_id=o and deal_profile_id = any(dps);
  delete from public.deal_profiles    where organization_id=o and (metadata @> mk or id = any(dps));
  delete from public.deals            where org_id=o and id = any(deals);

  -- derived / linked operational rows (markers + demo-entity references catch triggers)
  delete from public.notifications    where org_id=o and (body='[zono_demo_office_pixel_v1]'
                                          or lead_id = any(leads) or deal_id = any(deals) or property_id = any(props)
                                          or buyer_id = any(buyers) or seller_id = any(sellers));
  delete from public.tasks            where org_id=o and (intelligence_source like 'demo:zdo1p%'
                                          or lead_id = any(leads) or property_id = any(props)
                                          or seller_id = any(sellers) or buyer_id = any(buyers) or deal_id = any(deals));
  delete from public.meetings         where org_id=o and (intelligence_source='demo:zdo1p'
                                          or property_id = any(props) or buyer_id = any(buyers) or seller_id = any(sellers));
  delete from public.activity_events  where org_id=o and (metadata @> mk
                                          or entity_id = any(select unnest(props)::text)
                                          or entity_id = any(select unnest(leads)::text));

  -- marketing (demo markers only — never touches non-demo marketing)
  delete from public.distribution_posts     where org_id=o and metadata @> mk;
  delete from public.distribution_campaigns where org_id=o and metadata @> mk;
  delete from public.marketing_plans        where org_id=o and plan_json @> mk;

  -- support (demo marker)
  delete from public.support_tickets  where org_id=o and (description like '[zdo1p]%');

  -- office roster (office_member_id auto-nulls via ON DELETE SET NULL)
  delete from public.office_members where org_id=o and metadata @> mk;

  -- recommendation ledger (by demo buyer) — powers /my + /r
  delete from public.customer_property_recommendations where org_id=o and contact_type='buyer' and contact_id = any(buyers);

  -- core CRM entities (markers; pre-existing property lacks the marker → kept)
  delete from public.property_sellers where org_id=o and metadata @> mk;
  delete from public.leads            where org_id=o and (message='[zono_demo_office_pixel_v1] פנייה מהדגמה' or id = any(leads));
  delete from public.buyers           where org_id=o and (preferences @> mk or id = any(buyers));
  delete from public.properties       where org_id=o and source_metadata @> mk;
  delete from public.sellers          where org_id=o and (notes='[zono_demo_office_pixel_v1] מוכר הדגמה' or id = any(sellers));
end $$;

-- Note: pre-existing terminal notification_deliveries (in_app 'delivered', email
-- 'skipped') are intentionally left untouched — they are terminal and harmless.
