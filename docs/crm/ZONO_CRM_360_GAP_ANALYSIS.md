# ZONO CRM 360 — Gap Analysis

Maps required CRM 360 capabilities to current architecture, with the integrity risks the current design can create. Evidence from repo `7096473` + live DB.

## The three structural gaps (root causes of most missing behavior)

### 1. Fragmented identity — no person entity
A person is duplicated across `leads` / `buyers` / `sellers` / `users`, each with its own `full_name/phone/email` (`20260618090300_buyers_sellers.sql`, `..._leads_deals_opps_matching.sql`). Design is fragmented *by intent* (`src/lib/leads/service.ts:8` "stay distinct entities"); a lead with intent `both` becomes **two rows** (`service.ts:128-151`). `notes`/`documents` are multi-FK (`buyer_id/seller_id/lead_id`), so history does not follow the person across roles. Tenant/landlord/lawyer/mortgage-pro/referral-partner/external-agent have **no tables at all**.
**Creates:** duplicate people, split timelines, unreliable reporting, self/cross-role collisions.

### 2. Last-mile disconnect — engines without wiring
Real integrations behind UIs that don't call them: WhatsApp Cloud API + Gmail send are real but the flagship inbox uses `markDraftSent` (manual); Google Calendar client is real but writes to `google_synced_events`, not `meetings`; the entire branded AI suite (BMI/Area Leaders/Winning DNA/Zone Dominance/Coach) computes and persists with **zero UI reader**; the automation subscriber is classify-only and `dispatchTrigger` has zero callers.
**Creates:** "looks complete, isn't" — capabilities that demo but don't function end-to-end.

### 3. Missing transactional spine pieces
No `offers` table (offers are ephemeral). No commissions table (flat 2% + one manual number). No viewings/showings/feedback tables. No CRM import pipeline. These are genuinely unbuilt, not merely unwired.
**Creates:** the A–Z lead→commission lifecycle cannot be completed or migrated into.

## Capability → table map (representative; full list in DATABASE_MAP)

| Capability | Table(s) | State (rows) | Gap |
|---|---|---|---|
| Person identity | leads/buyers/sellers (separate) | 0/2/2 | no unified person; dedup only at conversion |
| Lead lifecycle | leads | **0** | capture+convert real; SLA/response-time/routing missing |
| Deal pipeline | deals(8-enum) + deal_profiles(12) | **0/0** | dual model, lossy bridge; stage duration never set |
| Offers | — | — | **no table** |
| Commissions | — | — | **no table**; deals.commission_amount manual only |
| Viewings/feedback | — | — | **no table** |
| Communication | whatsapp_messages/communication_messages | **0/0** | real API exists; inbox is stub |
| Meetings | meetings | **0** | lifecycle real; not bridged to Google |
| Documents | documents (+versions/requests) | 3 | real upload; **public bucket**; e-sign manual |
| Market intel | external_listings / opportunity_signals | 1363/100 | real; never converts to a person |
| Matching | match_intelligence_profiles | 1 | scores real; no send/feedback/expire |
| Automation | automation_runs / journey_executions | **0/0** | substrate real; never dispatched |
| Import | import_jobs (external only) | 101 | **no CRM import** |
| Audit | audit_log | 9 | best-effort, not wired to most mutations |

## Architecture risks that can create bad data

- **Duplicate people:** social capture inserts lead + buyer/seller twin without dedup (`social/service.ts:102-119`).
- **Duplicate properties:** external dedup exists; internal property dedup absent.
- **Orphan records:** disabling a user never transfers their records; no departure workflow.
- **Conflicting statuses:** dual deal-stage vocabularies bridged lossily.
- **Cross-tenant exposure:** 109 tables no RLS; all writes bypass RLS via service-role and rely on hand-written `org_id`; public document buckets.
- **Lost activity history:** per-role timelines don't converge on a person.
- **Inaccurate reporting:** counts historically drew from independent sources (fixed in QA Stage 3 for two surfaces; pattern remains elsewhere).
- **Non-idempotent automation:** substrate is idempotent, but the un-wired handlers/no-op actions mean the safe path isn't the executing path.

## Additive-only remediation principle
No destructive migration is required to fix identity: a `persons` table + link/alias approach can be additive, preserving existing `leads/buyers/sellers` rows while converging identity and history. See MIGRATION_AND_IMPORT_PLAN.
