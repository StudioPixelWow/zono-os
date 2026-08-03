# ZONO CRM 360 — Database Map

Live inventory (project `tlrefajhyrqnjtmimaos`, 2026-08-03). ~340 tables in `public`, all with `rls_enabled=true` at the flag level — but 109 were created without an actual policy (see SECURITY audit) and **all writes run via the service-role client, bypassing RLS**.

## Reading the row counts (the核心 signal)

**CRM transactional core — EMPTY (proves "skeleton"):**
`leads` 0 · `deals` 0 · `opportunities` 0 · `matching_results` 0 · `meetings` 0 · `notes` 0 · `communication_messages` 0 · `communication_threads` 0 · `whatsapp_messages` 0 · `whatsapp_conversations` 0 · `automation_runs` 0 · `automation_workflows` 0 · `deal_profiles` 0 · `deal_journeys` 0 · `offers` (**no table**) · commissions (**no table**).

**CRM core — tiny (pilot seed):**
`organizations` 2 · `users` 2 · `buyers` 2 · `sellers` 2 · `properties` 9 · `tasks` 29 · `documents` 3 · `activity_events` 92 · `journeys` 9 · `property_media` 20 · `property_valuations` 9.

**Intelligence/external — LARGE and real:**
`external_listings` 1363 · `property_transactions` 751 · `property_broker_matches` 57004 · `broker_profiles` 749 · `broker_aliases` 1497 · `brokerage_offices` 202 · `brokerage_agents` 217 · `brokerage_graph_nodes` 2312 · `israel_localities` 1306 · `neighborhoods` 1333 · `search_documents` 867 · `zono_agent_runs` 833 · `automation_templates` 603 · `legal_template_fields` 445.

**Interpretation:** the platform has ingested and computed a large market-intelligence corpus, but **no agent has actually run their business through it** — the transactional tables that a working CRM fills (leads, deals, meetings, messages, offers, commissions) are empty or absent. Completion cannot be inferred from the 340-table schema; it must be measured by whether these transactional tables can be filled through working workflows.

## Missing tables (must be created for CRM 360)

| Needed entity | Purpose | Priority |
|---|---|---|
| `persons` (+ role links / aliases) | unified identity across buyer/seller/lead/etc. | P1 |
| `offers` (+ `offer_status_history`) | first-class offer/counteroffer records | P1 |
| `commissions` (+ `commission_splits`) | commission calc, splits, VAT, collection | P1 |
| `viewings` (+ `viewing_feedback`) | showings + structured feedback | P1 |
| `import_batches` / `import_rows` | CRM import with preview/validation/rollback | P1 |
| `entity_tags`, `custom_fields`, `consents` | contact essentials | P2 |
| branch/office (internal) | multi-branch org structure | P2 |

## Present-but-empty subsystems (schema exists, unused)

Whole subsystem families exist as tables with 0 rows and little/no wiring: `community_*` (Facebook/community distribution), `zono_marketing_*`/`zono_creative_*` (creative studio, some rows), `radar_*` (seller radar, flag-gated), `territory_*` (0 rows), `automation_*` runtime (0 runs), `journey_workflows/executions` (0), `agency_*` (0), `bi_snapshots/reports` (0), `payments/subscriptions` (0), `feature_flags` (0). These inflate the apparent surface; none should be counted as capability without wiring + data.

## Constraints/indexes/audit fields observed
- Idempotency: `domain_events_idem_uniq`, journey `unique(workflow, dedup_key)`, matching `unique(org_id, buyer_id, property_id)`, notification `uq_notification_delivery(org_id, dedup_key)`.
- Audit fields: `audit_log` (9 rows, best-effort), `document_audit_logs`, `domain_event_deliveries` (220).
- Soft-delete: partial (`status='archived'` on properties; `deleted_at` in some libs); no general restore.
