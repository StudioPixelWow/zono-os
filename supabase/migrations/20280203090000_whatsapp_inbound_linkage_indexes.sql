-- ============================================================================
-- ZONO — Inbound WhatsApp → CRM linkage: hot-path indexes (Slice 2C).
-- The webhook resolves a conversation by (organization_id, contact_phone_hash)
-- on every inbound message; this was unindexed. Additive; no data change.
-- ============================================================================
create index if not exists idx_whatsapp_conversations_phone_hash
  on public.whatsapp_conversations (organization_id, contact_phone_hash);

-- The CRM-identity resolver reads recently-linked conversations for the agent's
-- brief / ZI; index the org + recency + link so those stay bounded.
create index if not exists idx_whatsapp_conversations_org_last_message
  on public.whatsapp_conversations (organization_id, last_message_at desc);
