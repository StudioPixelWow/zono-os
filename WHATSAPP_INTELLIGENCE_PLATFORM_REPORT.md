# ZONO — WhatsApp Intelligence Platform (Phase 27)

**Date:** 2026-06-24
**Goal:** a full communication-intelligence layer — every WhatsApp conversation becomes
structured business intelligence. Built **on top of** the existing WhatsApp OS
(`whatsapp_*` tables, engine, command-center UI). **Meta-compliant only: no fake messages,
no unofficial providers.** Intelligence is derived over messages already ingested via the
official WhatsApp Cloud API webhook.

**Gates:** scoped `tsc` → 0 errors · ESLint → 0 errors.

## Requirements coverage (1–15)
1. **WhatsApp Cloud API architecture** — existing `whatsapp_accounts` + webhook ingestion path (official API only).
2. **Connection management** — existing `/settings/whatsapp` + `connectWhatsapp` (sandbox/connected/expired states).
3. **Unified inbox** — existing `/whatsapp` command center (conversations, drafts, approvals).
4. **Conversation intelligence** — NEW `summarizeConversation()` derives role, dominant intent, Hebrew summary + NBA per conversation; persisted via `analyzeConversation()`.
5. **Lead extraction** — `analyzeAllConversations()` analyzes every open conversation; `needs_response` + score persisted.
6. **Buyer detection** — `detectRole` → `buyer`; `syncConversationToCrm()` creates/links a `buyers` row.
7. **Seller detection** — role `seller` → creates/links a `sellers` row.
8. **Property intent detection** — `extractPropertyIntent()` pulls rooms / budget / area from real message text → `property_intent` jsonb.
9. **Follow-up intelligence** — `next_best_action` per conversation (תאם צפייה / השב עם מחיר / צור כרטיס…).
10. **CRM synchronization** — `syncConversationToCrm()` links `buyer_id`/`seller_id` on the conversation + `crm_synced_at`.
11. **Activity timeline integration** — every sync logs an `activity_event` on the new buyer/seller.
12. **AI conversation summaries** — deterministic Hebrew `summary` stored on each conversation.
13. **Missed-response alerts** — `getMissedResponseAlerts()` lists conversations whose last message is inbound, with hours-waiting; surfaced in the panel.
14. **Personal buyer portal generation** — `generateConversationPortal()` → reuses `createClientPortal('buyer')` → public `/portal/[token]`.
15. **Personal seller portal generation** — same path with `portalType: 'seller'`.

## Files
- Migration `supabase/migrations/20260738120000_whatsapp_intelligence.sql` — extends `whatsapp_conversations` (`detected_role`, `intent_score`, `needs_response`, `last_inbound_at`, `analyzed_at`, `property_intent`, `crm_synced_at`, `portal_token`) + indexes.
- `src/lib/whatsapp/engine.ts` — added `summarizeConversation`, `extractPropertyIntent`, `WaRole`, `ConversationAnalysis` (PURE).
- `src/lib/whatsapp/intelligence.ts` — analyze / analyzeAll / syncToCrm / generatePortal / missed-response alerts / overview (server).
- `src/lib/whatsapp/intelligence-actions.ts` — 6 server actions.
- `src/app/(app)/whatsapp/WhatsappIntelligencePanel.tsx` — analyze, overview chips, missed-response alerts with per-conversation "ל-CRM" + "פורטל אישי"; wired into the existing `WhatsappView`.

## Real vs stub
**Real:** all analysis runs over real ingested `whatsapp_messages`; role/intent/summary/NBA/
property-intent are deterministic over that text; CRM sync writes real `buyers`/`sellers`
rows + activity events; portals reuse the real client-portal generator. **Compliant:**
nothing sends or fabricates messages; ingestion stays the official Cloud API webhook; the
draft→approve→send flow (existing) remains human-supervised. **AI summaries** are
deterministic (no LLM dependency) and can later be swapped for an LLM provider behind the
same `summarizeConversation` contract.

## How to use
Apply the migration → open `/whatsapp` → the new **"מודיעין שיחות"** panel shows the
overview; press **"נתח שיחות"** to analyze conversations → missed-response alerts appear
with one-click **ל-CRM** (create buyer/seller + activity) and **פורטל אישי** (generate a
personal portal).
