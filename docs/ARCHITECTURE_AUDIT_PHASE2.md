# ZONO — Phase 2 Architecture Audit (Operating-System Level)

**Type:** Read-only architecture audit. No code modified.
**Scope:** 26 business entities + 18 business events, traced through services, actions, tables, and propagation chains across `src/lib/**`, `src/app/**`, and 179 migrations.
**Companion:** `docs/PERSISTENCE_AUDIT.md` (Phase 1, persistence lifecycle).

---

## The one finding that frames everything: there is no event bus

ZONO has **no runtime event bus, pub/sub layer, or dispatcher.** Every server action decides inline, for itself, what to do after its primary DB write. "Propagation" therefore takes one of three shapes:

1. **Direct opt-in call** — an action manually calls `logActivityEvent(...)` or `initializeBuyerIntelligence(...)`. Coverage is inconsistent (buyers/sellers do it well; deals/documents/meetings/properties-native/command-center-leads do not).
2. **Recompute-on-read** — a dashboard rebuilds "intelligence" from base tables at request time (executive-os, chief-of-staff, journey-center, universal-graph). The data *appears* eventually, but nothing was pushed.
3. **Scheduled rescan** — a cron job periodically rebuilds a derived store (knowledge graph `graph_*` every 24h).

The **only genuinely event-driven write chain in the entire platform** is `decision-intelligence` (`recalculateOrganizationDecisionBrain`), which 12+ domain actions call after their writes. Everything else is pull or absent. This single architectural gap explains almost every downstream symptom below.

**Automation is manual-run only.** `automation/service.ts::runWorkflow` is called from exactly two places — the "Run" button and a template test. Zero entity-write actions trigger it. The `trigger_type` values (`"lead_created"`, `"property_listed"`, `"price_changed"`) are **inert metadata** never matched against real events. The separate `journey-automation` engine's real dispatch path (`dispatchTrigger`) is orphaned — unreachable from any UI.

---

## 1. Canonical Architecture Map

Legend: **✅ canonical & healthy · ⚠️ canonical but fragmented/partial · ❌ no single canonical / broken**

| Entity | Canonical table | Canonical service | Mutating actions | Status & notes |
|---|---|---|---|---|
| **Organization** | `organizations` (`org_id`) | `repositories/organizationRepository.ts` | `onboarding/actions.ts::completeOnboarding` (create only) | ⚠️ **No update path** — org can't rename/rebrand its core record post-onboarding. No activity log on create. |
| **Office** | = `organizations` row (1 org = 1 office) | `office-website/service.ts` + `brand-identity/service.ts` | `office-website/actions.ts`, `brand-identity/actions.ts` | ❌ Identity fragmented across 3 unsynced stores (below). No office is its own table. |
| **Agent** | `users` (`org_id`, role via `roles.key`) | `repositories/userRepository.ts`, `team-admin/service.ts` | `team-admin/actions.ts`, `profile/actions.ts`, `my-profile/actions.ts`, `agent-website/actions.ts` | ❌ Identity fragmented ×3 + 2 public renderer stacks. No agent lifecycle timeline. |
| **Buyer** | `buyers` (`org_id`,`owner_id`) | `buyers/repository.ts` | `buyers/actions.ts` (+ raw insert in `social/service.ts`) | ✅ Cleanest entity. `updateBuyerAction` is asymmetric (no re-intelligence/log). |
| **Seller** | `sellers` + `property_sellers` (join) | `sellers/{repository,propertySellers,service360}.ts` | `sellers/actions.ts` (`createSeller360Action`, link/role) | ⚠️ **Legacy `properties.seller_id` never written but read by 9+ services.** `createSellerAction` is dead. |
| **Lead** | `leads` (`org_id`) | *(none — actions only)* | `leads/actions.ts` + 4 other insert sites | ❌ Write-once `stage`/`score`, no service, 5 writers, 2 parallel tables (`distribution_leads`, `social_leads`). |
| **Property** | `properties` (`org_id`,`owner_id`) | `properties/repository.ts` | `properties/{actions,wizardActions}.ts` | ⚠️ Solid CRUD but **no `logActivityEvent` on any native write.** |
| **External Property** | `external_listings` (+history/sources) | `external-listings/service.ts` | `external-listings/actions.ts` | ⚠️ Canonical, but a **2nd ingestion pipeline** (`property-radar` → `market_property_sources`) scrapes the same sources with no reconciliation. |
| **Deal** | `public.deals` (`org_id`) — revenue truth | `deals/service.ts` | `deals/create-actions.ts`, `deals/actions.ts` | ❌ **Split-brain**: `deals` (manual, never closes) vs `deal_profiles`+children (cockpit twin from matches). Broken legal-doc FK. |
| **Journey** | `property_journeys` (`org_id`) — property truth | `journey/repository.ts` | `journey/actions.ts` | ❌ **5 "journey" systems** (below). People-journeys are derived read-only; `journeys`-OS is frozen. |
| **Task** | `public.tasks` (`org_id`) | `tasks/repository.ts` | `tasks/actions.ts` | ⚠️ Canonical & propagates, but `deal_tasks` is a silent 2nd task system. |
| **Meeting** | `public.meetings` (`org_id`) | `calendar-os/booking-service.ts` | `confirmBooking` (insert only) | ❌ **No update/completion path exists at all**; status frozen at `scheduled`. |
| **Calendar** | *(no table)* | `calendar-os/service.ts` | *(delegates to `meetings`)* | ✅ Correct as a pure read-aggregate over meetings/tasks/missions/followups. |
| **Activity / Timeline** | `activity_events` (`org_id`) | `activity/service.ts` (`logActivityEvent`) | ~23 opt-in callers | ⚠️ Intended single timeline; **4 parallel logs never unified** (`activities` legacy, `communication_*`, `whatsapp_messages`, `document_audit_logs`). `notes` orphaned (no insert path). |
| **Document** | `documents` (`org_id`) + satellites | `documents/service.ts` | `documents/actions.ts` | ❌ **Two full document stacks** (`documents/*` vs `legal_*`), never cross-referenced. |
| **Signature** | `document_signatures` + `legal_document_signatures` | `documents/service.ts`, `legal/service.ts` | `recordSignature`, `signDocumentManually` | ❌ Two manual-only signature tables, mutually invisible, none on timeline. |
| **WhatsApp** | `whatsapp_accounts`(+inbox tables) (`organization_id`) | `whatsapp/service.ts`, `connection.ts`, `inbox-service.ts` | `whatsapp/{actions,cloud/actions,provider/actions}.ts` | ⚠️ 3 resolve-conversation impls, 2 connection readers; command-center read bug on multi-row. |
| **Facebook** | `distribution_provider_connections` (`org_id`+`user_id`) | `distribution/provider-connections.ts` | `distribution/provider-connections-actions.ts` | ⚠️ Canonical, but `distribution/channels/*` adapter layer is fully dead. |
| **Marketing** | ❌ 3 stacks | `marketing/*`, `marketing-core/*`, `creative-studio/*` | `marketing/actions.ts`, `creative-studio/*` | ❌ Stack 1 (community/segments, real) · Stack 2 (Marketing Core™, persists nothing) · Stack 3 (`zono_campaigns`). Stacks 1↔3 never reconciled. |
| **Website** | `agent_websites` / `office_websites` | `agent-website/service.ts`, `office-website/service.ts` | those two services | ⚠️ Single schema truth, **4 renderer stacks** (`/agent`,`/site`,`/ai-agent`,`/ai-site`); AI stacks capture no leads; analytics only on classic. |
| **Automation** | `automation_workflows`(+runs/actions) (`organization_id`) | `automation/service.ts` | `automation/actions.ts` | ⚠️ Real approval engine but **manual-run only**; `journey_workflows` is a 2nd engine; `automation-os` is a read-only unifier. |
| **Notification** | `notification_state` overlay (`organization_id`+`user_id`) | `notifications/service.ts` | `notifications/actions.ts` | ❌ Overlay over live signals is canonical; `public.notifications` (written by 3 flows) is **orphaned/unread**; header bell hardcoded. |
| **AI Memory** | `ai_memory` (`organization_id`) | `ai-memory/service.ts` | `ai-memory` save action | ❌ Manual notes only; **never read by any reasoning module.** Durable `zono_org_memory*` store fully orphaned. |
| **Knowledge Graph** | `graph_entities/relationships/signals` (`organization_id`) + `entity_relationships` (`org_id`) | `graph/service.ts` | `generateGraphAction` + 24h job | ⚠️ Real & consumed by decisions/UI, but **rebuilt on a 24h rescan** — new buyers/sellers invisible until then. 5 graph systems total. |
| **Executive Intelligence** | ❌ 4 composers | `executive-os`, `chief-of-staff`, `business-intelligence`, `decision-intelligence` | `decision-intelligence/actions.ts` (only persisted one) | ❌ 4 overlapping dashboards on 5 routes; only `decision-intelligence` is event-driven + persisted. |

### Column-naming drift (systemic)
`org_id` vs `organization_id` is split repo-wide and even **within single domains**: `deals.org_id` vs `deal_profiles.organization_id`; `documents.org_id` vs its satellites' `organization_id`; Marketing Stack 1 (`organization_id`) vs Stack 3 (`org_id`); `notification_state` (`organization_id`) vs `public.notifications` (`org_id`). Migrations acknowledge the split in comments rather than reconciling it.

---

## 2. Event Flow Map

**Ideal:** every business event → DB write → timeline → (conditional) automation → notification → AI/twin update → exec KPI → search → calendar/website/marketing side-effects.
**Reality** (✅ wired · ⚠️ partial / lazy-on-read · ❌ missing):

| Event (action file) | DB | Timeline | Autom. | Notif | AI | Exec KPI | Search | Cal | Web | Mktg |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Buyer Created** `buyers/actions.ts::createBuyerAction` | ✅ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| **Seller Created** `sellers/actions.ts::createSeller360Action` | ✅ | ✅ | ❌ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| **Property Created** `properties/actions.ts::createPropertyAction` | ✅ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ |
| **Property Imported** *(no distinct importer — alias of Property Created)* | – | – | – | – | – | – | – | – | – | – |
| **External Property Imported** `external-listings/service.ts::promoteExternalListing` | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ |
| **Lead Created** `leads/actions.ts::createLeadAction` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Lead Converted** `social/service.ts::convertSocialLeadToLead` (social only) | ✅* | ✅* | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ⚠️ |
| **Meeting Created** `calendar-os/booking-service.ts::confirmBooking` | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ |
| **Meeting Completed** — **NO ACTION EXISTS** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Task Completed** `tasks/actions.ts::setTaskStatusAction` (+2 divergent) | ✅ | ⚠️ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| **Document Sent** `documents/actions.ts::createSignatureRequestAction` | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| **Document Signed** `documents/actions.ts::recordSignatureAction` | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| **Deal Created** `deals/create-actions.ts::createDealAction` | ✅ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| **Deal Closed** `deals/service.ts::advanceDealStage→syncCanonicalDealOnClose` | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| **Property Sold** `properties/actions.ts::setPropertyStatusAction` | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ⚠️ | ❌ |
| **Journey Advanced** `journey/actions.ts::setJourneyStageAction` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Facebook Connected** Meta OAuth callback → `distribution_provider_connections` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **WhatsApp Connected** `whatsapp/provider/actions.ts::waConnectAction` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

\* Social-lead conversion only. Generic CRM lead conversion has **no write path** (`leads.converted_buyer_id/_seller_id` are read in 6+ places, never written).

**Column totals:** Automation ❌ 18/18 · Notification ❌ 18/18 · Search ❌ 18/18. Timeline ✅ only 5 (buyer/seller created, external import, task partial, journey advanced). AI-update meaningful only on buyer/seller create. Exec-KPI is ⚠️ almost everywhere = lazy recompute, not pushed.

### Two consistency time-bombs
1. **Property Sold ↔ Deal Closed are independent.** Closing a deal "won" does **not** mark the linked property `sold` (it stays live on the public agent website); marking a property `sold` does **not** advance/close any deal. Both must be done by hand.
2. **Split-brain deal model.** Manually created `deals` rows can **never close** (no path advances them); only `deal_profiles` (derived from matches) reaches the revenue table via `syncCanonicalDealOnClose`. Quick-Create deals are invisible on `/deals`.

---

## 3. Missing Integrations

- **Automation is disconnected from the business.** No entity write triggers any workflow. Wire `createLead/createBuyer/priceChange/dealClosed/...` → automation engine, or the automation product is decorative.
- **Notifications never fire from events.** The 3 real notice-producers write to the orphaned `public.notifications` table that nothing reads; the Attention Center only shows recomputed signals. No event → user notification path exists.
- **Timeline coverage holes:** `deals/*` (zero `logActivityEvent`), `documents/*` + `legal/*` (own `document_audit_logs`), `meetings` (dead `logMeetingScheduled` helper → the "meetings scheduled" KPI is stuck at 0), native `properties` CRUD, and Command-Center `createLeadAction`.
- **AI Memory is not in the loop.** No reasoning/draft/mission module reads `ai_memory`; the durable `zono_org_memory*` store is never written. "Learning" is recomputed and discarded every request.
- **Knowledge Graph is not incremental.** New buyers/sellers don't touch `graph_*`; they appear only after the 24h rescan — so `/graph` and any `graph_signals`-dependent decision is stale between runs.
- **Search index absent.** `src/lib/search` is a live multi-table query; there is no index to keep in sync (fine for now, but means no ranking/history and full-scan cost at scale).
- **Website ← WhatsApp/Facebook disconnected.** `agent_websites.whatsapp` is a hand-typed string; connecting WhatsApp doesn't populate or enable the site widget.
- **Lead → Buyer/Seller conversion missing** for every surface except the social funnel (which only ever creates *buyers*, even for seller-intent leads).
- **Portal identity link unwritten.** `buyers.portal_user_id` / `sellers.portal_user_id` are never set; portals fall back to email matching with no collision guard.

---

## 4. Dead Systems (exist, zero runtime callers)

| System | Evidence |
|---|---|
| **Journey Intelligence OS** (`journeys` + 8 satellites) | `advanceStageAction`/`recomputeAllJourneysAction` have zero UI callers; rows seeded at `stage:'new'` and never advance. |
| **Durable Org-Memory store** (`zono_org_memory*`, `org-memory/persisted.ts`, `platform-persistence/org-memory-store.ts`) | Writer functions never called, not exported from `org-memory/index.ts`. |
| **`public.notifications` table** | Written by automation/approval-bundle/comment-journey; no reader anywhere (only a health `count(*)`). |
| **`distribution/channels/*`** (facebook-group/marketplace/page adapters + registry) | Zero imports; parallel to the used `distribution-provider-registry.ts`. |
| **WhatsApp Cloud send** `cloud/actions.ts::sendApprovedWhatsappDraftAction` | Real Cloud-API send, zero UI callers; only manual "mark sent" (no real send) is wired. |
| **`sellers/actions.ts::createSellerAction`** + `repository.ts::createSeller` | Superseded by `createSeller360Action`; no callers. |
| **`activity/service.ts::logMeetingScheduled`** | Zero callers → "meetings scheduled" KPI silently stuck at 0. |
| **`leads.converted_buyer_id` / `converted_seller_id`** | Read in 6+ places, written by nothing (dead schema). |
| **Ask ZONO conversation logging** (`zono_ask_conversations/messages`, `ask-log.ts`) | Tables + writer exist; live chat path never calls them. |
| **Meeting completion** | No backend action and no UI control at all. |
| **`journey-automation` dispatch** (`dispatchTrigger`, `dispatchManualAction`) | Real execution creators, unreachable from any UI. |
| **`notes` table** | No insert path anywhere; `logNoteCreated` has zero callers. |
| **`org-memory/chief-of-staff.ts`** (Q&A helper) | Zero callers. |

---

## 5. Duplicate Systems (multiple implementations of one concept)

| Concept | Parallel implementations | Canonical / recommended |
|---|---|---|
| **Office identity/branding** | `organizations.logo_url` · `office_websites` (seeded once, diverges) · `brand_identity_profiles` (self-declared "master", never read as such) | Make `brand_identity_profiles` the real master; others read from it. |
| **Agent identity** | `users` · `agent_websites` · `brand_identity_profiles` + renderers `/agent` vs `/ai-agent` | `users` = identity; websites read, don't own, profile fields. |
| **Journey** (×5) | `property_journeys` (real) · `journeys`+satellites (dead) · `journey-center` (derived read) · `deal_journeys` · `journey-automation` (separate engine, name collision) | Keep `property_journeys` + derived `journey-center`; retire `journeys`-OS; rename `journey-automation`. |
| **Deal** (×2) | `public.deals` (revenue) vs `deal_profiles`+children (cockpit) | Unify: one deal identity; `deal_profiles` becomes a projection of `deals`. |
| **Task** (×2) | `public.tasks` (propagates) vs `deal_tasks` (silent) | Fold `deal_tasks` into `tasks` with a `deal_id`. |
| **Timeline** (×5) | `activity_events` (intended) · legacy `activities` · `communication_*` · `whatsapp_messages` · `document_audit_logs` | `activity_events` as the one timeline; bridge the rest. |
| **Document + Signature** (×2) | `documents/*` vs `legal_*` | Pick one stack; the `legal_*` state machine is richer. |
| **Marketing** (×3) | `marketing` (real) · `marketing-core` (no persistence) · `creative-studio`/`zono_campaigns` | Consolidate; make Marketing Core™ persist or relabel. |
| **Website renderer** (×4) | `/agent`,`/site` (classic, capture leads, no theme) vs `/ai-agent`,`/ai-site` (theme + AI, no lead capture) | Merge to one stack per type; keep AI features + real lead capture + analytics. |
| **External-property ingestion** (×2) | `external-listings/*` (org-scoped) vs `property-radar` (shared cache) | Reconcile/dedupe into one pipeline. |
| **Knowledge Graph** (×5) | `entity_relationships` (event-written) · `graph_*` (24h rebuild) · `universal-graph` (on-read) · `relationship-graph` (pure lib) · `agency_entity_relationships` | `entity_relationships` as substrate; make `graph_*` incremental. |
| **Executive Intelligence** (×4) | `executive-os` · `chief-of-staff` · `business-intelligence` · `decision-intelligence` (only persisted/event-driven) on 5 routes | Make `decision-intelligence` the spine; others become views over it. |
| **AI Memory** (×3) | `ai_memory` (manual) · `zono_org_memory*` (dead) · `getOrgMemoryReport()` (on-read) | One memory store, actually read by reasoning. |
| **Connection readers** | WhatsApp Cloud (`connection.ts`) vs QR (`provider/session.ts`); 3 resolve-conversation impls | One connection-state reader; one conversation resolver. |

---

## 6. Recommended Refactor Order

**Stage 0 — Correctness bombs (fix before anything else; user-visible wrong data):**
1. Unify the deal model: link Quick-Create `deals` to the cockpit and give manual deals a close path; fix the `legal_documents.deal_id` FK mismatch.
2. Link **Property Sold ↔ Deal Closed** (advancing a deal to won marks the property sold and pulls it off the public site, and vice versa).
3. Repoint the 9 seller-reading services from legacy `properties.seller_id` to `property_sellers`.
4. Add **Meeting Completion** (backend action + UI) and fix the dead `logMeetingScheduled` so the meetings KPI works.
5. Add generic **Lead → Buyer/Seller conversion** (write `converted_*_id` + create the right entity in one transaction); fix the social funnel's seller-intent-creates-buyer bug.

**Stage 1 — Build the missing spine (the highest-leverage architectural change):**
6. Introduce a **single event dispatcher** — one `emitBusinessEvent(type, entity, ctx)` that every mutating action calls after its write, fanning out to timeline, intelligence, automation, notifications, graph. Retrofit the ~10 actions that skip `logActivityEvent` first.
7. Wire **automation triggers to real events** through that dispatcher (`lead_created`, `deal_closed`, `price_changed`, …). Currently 0/18 events fire automation.
8. Wire **event → notification** so the 3 orphaned notice-producers reach the Attention Center; retire `public.notifications` or make it the feed; fix the hardcoded header bell.

**Stage 2 — Consolidate duplicate systems (one source of truth each):**
9. Journey: retire `journeys`-OS; standardize on `property_journeys` + derived `journey-center`; rename `journey-automation`.
10. Timeline: make `activity_events` the sole log; bridge `activities`/`communication_*`/`whatsapp_messages`/`document_audit_logs` into it (deals + documents especially).
11. Executive Intelligence: make `decision-intelligence` the persisted spine; convert executive-os / chief-of-staff / business-intelligence into views over it; collapse the 5 routes.
12. Identity: designate `brand_identity_profiles` the branding master (Office + Agent) and have websites read from it; add the missing `organizations` update path.
13. Marketing (3→1), Website renderers (4→2), Document stacks (2→1), external-ingestion (2→1), Task (`deal_tasks`→`tasks`).

**Stage 3 — Make intelligence live, not lazy:**
14. Make the Knowledge Graph incremental (update `graph_*` on entity writes via the dispatcher instead of the 24h rescan).
15. Wire `ai_memory` into reasoning/draft/mission modules (or the durable `zono_org_memory*` store); persist Ask ZONO conversations.
16. Normalize `org_id` vs `organization_id` (pick one; add generated columns/views during transition).

**Stage 4 — Close the propagation matrix:** search indexing, website ← WhatsApp/Facebook widget wiring, portal `portal_user_id` linking, per-event marketing/website side-effects.

---

## Production-readiness verdict (architecture)

**Data model:** strong — real tables, FKs, RLS baseline. **Data flow:** weak — no event backbone, so the platform is a set of well-built silos that don't talk except through lazy dashboard recomputes. The system *looks* integrated because dashboards re-derive everything on read; it is *not* integrated at the write layer.

**Architecture maturity: 5.5 / 10.** The single most valuable investment is Stage 1 (a real event dispatcher). It converts ~15 of the ❌/⚠️ cells in the Event Flow Map to ✅ at once and is the precondition for automation, notifications, and live intelligence to mean anything. Stage 0 should ship immediately regardless, because those are wrong-data bugs a user can hit today.
