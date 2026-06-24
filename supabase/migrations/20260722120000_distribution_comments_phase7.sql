-- ============================================================================
-- ZONO — Distribution Phase 7 (comment collector + lead detection)
-- ----------------------------------------------------------------------------
-- Additive columns on distribution_comments for the classification + manual
-- comment-import flow (used until an official Meta API connection exists).
-- distribution_comments already has: author_name, author_profile_url,
-- external_comment_id, comment_text, sentiment, intent, intent_score,
-- lead_intent_score, is_lead, handled. This adds the richer classification +
-- suggested reply + the lead link. Idempotent; RLS + triggers already cover it.
-- ============================================================================

alter table public.distribution_comments
  add column if not exists category           text,    -- asks_for_price | asks_for_details | asks_for_location | asks_for_photos | asks_for_phone | interested | not_relevant | spam | negative | broker_comment
  add column if not exists suggested_reply     text,
  add column if not exists should_create_lead  boolean not null default false,
  add column if not exists analysis_reason     text,
  add column if not exists lead_id             uuid references public.distribution_leads(id) on delete set null;

create index if not exists distribution_comments_category_idx on public.distribution_comments(org_id, category);
create index if not exists distribution_comments_lead_idx     on public.distribution_comments(lead_id);
