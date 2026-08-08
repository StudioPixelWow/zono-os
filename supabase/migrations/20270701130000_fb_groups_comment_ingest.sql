-- ============================================================================
-- ZONO — Facebook Groups: comment INGEST idempotency (additive, idempotent).
-- ----------------------------------------------------------------------------
-- The browser extension reports comments observed on OUR published group posts,
-- so social leads are captured automatically instead of pasted by hand. This
-- makes re-ingest safe: at most one distribution_comments row per
-- (org, external_comment_id). Everything else (classification columns, lead FKs)
-- already exists. No new table, no parallel lead model.
-- ============================================================================
create unique index if not exists uq_dcomments_org_external
  on public.distribution_comments (org_id, external_comment_id)
  where external_comment_id is not null;

create index if not exists idx_dcomments_post
  on public.distribution_comments (org_id, post_id, occurred_at desc);
