-- ============================================================================
-- ZONO — Batch 6.7 · Phase 3 — expand copilot_timeline_milestone vocabulary.
-- Additive + idempotent. Replaces the milestone_kind CHECK with the full 19-kind
-- taxonomy. No data change, no other table touched.
-- ============================================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'copilot_timeline_milestone') then
    alter table public.copilot_timeline_milestone drop constraint if exists copilot_timeline_milestone_milestone_kind_check;
    alter table public.copilot_timeline_milestone
      add constraint copilot_timeline_milestone_milestone_kind_check
      check (milestone_kind in (
        'first_contact','qualification','active_buyer','active_seller','property_shared',
        'viewing_scheduled','viewing_completed','negotiation_started','offer_submitted','counter_offer',
        'documents_requested','documents_sent','financing_started','financing_approved',
        'reservation','contract_signed','closed','lost_lead','reactivated'
      ));
  end if;
end $$;
