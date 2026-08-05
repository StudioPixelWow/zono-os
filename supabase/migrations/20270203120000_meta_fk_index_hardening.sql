-- ============================================================================
-- ZONO — Foreign-key index hardening for newly deployed families.
-- ----------------------------------------------------------------------------
-- Adds covering indexes for the HIGH-VALUE unindexed foreign keys identified by
-- the performance advisor after the reconciliation deploy. Selection is
-- deliberate, not blanket: we index every ON DELETE CASCADE lifecycle / queue /
-- join FK (where an unindexed child forces a sequential scan on parent delete and
-- on lifecycle joins), the two child org_id FKs (RLS + org-scoped filtering), and
-- the inbox assignee filter path ("my assigned conversations"). The ~30 low-value
-- audit columns (created_by / requested_by / decided_by / … with ON DELETE SET
-- NULL to users) and a few small set-null links are intentionally DEFERRED — see
-- docs/performance/FK_INDEX_HARDENING.md. All indexes are additive + idempotent
-- (create index if not exists). On a production-size table these should later be
-- created CONCURRENTLY; on staging (empty) a plain create is instant and lock-free.
-- ============================================================================

-- ── Connection → assets (disconnect cascades to all connection children) ─────
create index if not exists idx_meta_business_connection_id           on public.meta_business (connection_id);
create index if not exists idx_meta_instagram_account_connection_id  on public.meta_instagram_account (connection_id);
create index if not exists idx_meta_page_connection_id               on public.meta_page (connection_id);
create index if not exists idx_meta_permission_snapshot_connection_id on public.meta_permission_snapshot (connection_id);
create index if not exists idx_meta_sync_cursor_connection_id        on public.meta_sync_cursor (connection_id);
create index if not exists idx_meta_token_health_connection_id       on public.meta_token_health (connection_id);

-- ── Content draft → targets / versions / approvals / publish ─────────────────
create index if not exists idx_meta_approval_comment_draft_id        on public.meta_approval_comment (draft_id);
create index if not exists idx_meta_approval_request_draft_id        on public.meta_approval_request (draft_id);
create index if not exists idx_meta_content_draft_target_draft_id    on public.meta_content_draft_target (draft_id);
create index if not exists idx_meta_publish_operation_draft_id       on public.meta_publish_operation (draft_id);
create index if not exists idx_meta_approval_comment_request_id      on public.meta_approval_comment (approval_request_id);
create index if not exists idx_meta_publish_target_draft_target_id   on public.meta_publish_target (draft_target_id);
create index if not exists idx_meta_media_variant_media_asset_id     on public.meta_media_variant (media_asset_id);

-- ── Comments / engagement / inbox lifecycle ──────────────────────────────────
create index if not exists idx_meta_comment_ingest_target_comment_id on public.meta_comment_ingestion_job (target_comment_id);
create index if not exists idx_meta_engagement_action_target_comment on public.meta_engagement_action (target_comment_id);
create index if not exists idx_meta_comment_ingest_action_id         on public.meta_comment_ingestion_job (engagement_action_id);
create index if not exists idx_meta_inbox_assignment_conversation_id on public.meta_inbox_assignment (conversation_id);
create index if not exists idx_meta_inbox_conv_label_label_id        on public.meta_inbox_conversation_label (label_id);
create index if not exists idx_meta_inbox_conversation_assignee      on public.meta_inbox_conversation (assignee_user_id);

-- ── provider_object children (cascade) ───────────────────────────────────────
create index if not exists idx_meta_object_insight_provider_object   on public.meta_object_insight (provider_object_id);
create index if not exists idx_meta_provider_object_state_object      on public.meta_provider_object_state (provider_object_id);
create index if not exists idx_meta_reconciliation_job_provider_obj   on public.meta_reconciliation_job (provider_object_id);
create index if not exists idx_meta_comment_ingest_provider_object    on public.meta_comment_ingestion_job (provider_object_id);

-- ── publish_operation children (cascade) ─────────────────────────────────────
create index if not exists idx_meta_provider_object_publish_op        on public.meta_provider_object (publish_operation_id);
create index if not exists idx_meta_publish_attempt_publish_op        on public.meta_publish_attempt (publish_operation_id);
create index if not exists idx_meta_publish_dead_letter_publish_op    on public.meta_publish_dead_letter (publish_operation_id);
create index if not exists idx_meta_publish_discrepancy_publish_op    on public.meta_publish_discrepancy (publish_operation_id);
create index if not exists idx_meta_reconciliation_job_publish_op     on public.meta_reconciliation_job (publish_operation_id);

-- ── publish_target children (cascade) ────────────────────────────────────────
create index if not exists idx_meta_provider_object_publish_target    on public.meta_provider_object (publish_target_id);
create index if not exists idx_meta_publish_discrepancy_publish_tgt   on public.meta_publish_discrepancy (publish_target_id);
create index if not exists idx_meta_reconciliation_job_publish_target on public.meta_reconciliation_job (publish_target_id);

-- ── Feature-family cascade / RLS / join FKs ──────────────────────────────────
create index if not exists idx_broker_growth_strategy_broker_id      on public.broker_growth_strategy (broker_id);
create index if not exists idx_creative_qa_reports_attempt_id        on public.creative_qa_reports (attempt_id);
create index if not exists idx_creative_gen_attempts_org_id          on public.creative_generation_attempts (org_id);
create index if not exists idx_creative_qa_reports_org_id            on public.creative_qa_reports (org_id);
create index if not exists idx_copilot_feedback_user_id              on public.copilot_feedback (user_id);
create index if not exists idx_zi_learning_progress_user_id          on public.zi_learning_progress (user_id);
