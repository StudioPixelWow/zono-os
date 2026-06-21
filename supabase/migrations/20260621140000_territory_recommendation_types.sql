-- ============================================================================
-- ZONO — Territory Final Integration Patch
-- Extend the recommendations.recommendation_type CHECK with territory types so
-- the Recommendation OS can carry territory-sourced recommendations.
-- Idempotent: drop + recreate the constraint with the full (existing + new) set.
-- ============================================================================
alter table public.recommendations drop constraint if exists recommendations_type_chk;
alter table public.recommendations add constraint recommendations_type_chk check (recommendation_type in (
  -- existing types
  'buyer_property','buyer_transaction_package','buyer_neighborhood','buyer_street',
  'buyer_financing_check','seller_pricing','seller_buyer_pool','seller_marketing_plan',
  'seller_transaction_package','property_buyer','property_pricing','property_marketing',
  'property_distribution','lead_property','lead_followup','lead_routing',
  'acquisition_seller_outreach','acquisition_property_research','deal_closing_action',
  'deal_negotiation_action','agent_street_focus','agent_locality_focus','office_growth_focus',
  'community_promotion','territory_focus','referral_opportunity','document_required',
  'signature_required','calculator_required','call_summary_required',
  -- new territory types
  'street_focus','building_cluster_focus','territory_acquisition','territory_marketing',
  'territory_revenue','territory_coverage_gap','territory_competitor_threat'
));
