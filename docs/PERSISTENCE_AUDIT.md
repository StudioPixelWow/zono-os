# ZONO — Persistence & Database Audit (Full System)

**Type:** Audit only — no schema, migrations, or code were modified.
**Scope:** All screens/features delivered in the recent Product Experience work + Facebook, WhatsApp, Journey Center, Agent Personal Area, Website Builder, Heatmap, Global Search.
**Method:** 5 parallel deep audits over `supabase/migrations` (179 files, ~470 tables), `src/lib/**` services/actions, and `src/app/**` views. Every claim below is traced to a real read/write call chain or migration file.

---

## Executive summary

The **core CRM spine is genuinely persisted and well-modeled**: buyers, sellers, properties, deals, tasks, activities, meetings, journeys, websites, WhatsApp inbox, automation runs, notification read-state — all write to real Supabase tables with FK integrity and org-scoped RLS. Quick-Create (lead/deal/meeting/task), Automation OS enable/disable + runs, Notification read/dismiss, and the new Agent Personal Area all passed cleanly.

The problems cluster in **four bands**:

1. **Security/RLS regressions** — a "QA1" storage migration and per-user connection migrations left tables open cross-tenant. These are the most urgent findings.
2. **Orphaned real data layers** — several fully-built tables + code paths are never called (Ask ZONO history, org-memory durable store, `public.notifications`, journeys-OS write path). The schema exists; the wiring doesn't.
3. **Duplicate/parallel sources of truth** — two journey systems, two deal systems, two public-site renderer stacks, legacy vs. current seller linkage.
4. **Personalization stored in the browser** — 7 "saved" surfaces live in `localStorage`, not the DB.

**Overall persistence-layer production readiness: 6.5 / 10.** Solid foundation, not yet production-safe due to the RLS regressions and the ephemeral AI/audit surfaces.

---

## 1. Complete persistence coverage (%)

Weighted estimate of features whose *primary* data has a complete, correct persistence lifecycle:

| Cluster | Coverage | Notes |
|---|---|---|
| Core CRM (buyers/sellers/properties/deals/tasks/activities/meetings) | ~90% | Real tables + FKs; gaps are seller linkage + conversion (below) |
| Websites (agent/office/builder/microsite/area/landing) | ~80% | One source of truth; gaps are dual renderers + write-less columns |
| OS layers (Calendar/Executive/Automation/Marketing) | ~70% | Marketing Core™ = 0% persisted; others solid |
| Integrations (Facebook/WhatsApp/Voice) | ~75% | Data persists; RLS + command-center read bugs |
| AI history (Ask/approval/mission/memory/org-memory) | ~40% | Tables exist, mostly unwired |
| Personalization (recent/favorites/pins/saved filters/map) | ~10% | Almost entirely localStorage or absent |

**Blended persistence coverage ≈ 72%.** Read paths score higher (~85% real reads) than write-back/audit paths (~60%).

---

## 2. Missing tables

Features with **no backing table** (currently absent, localStorage-only, or hardcoded):

- **`user_ui_preferences`** (or equiv.) — saved filters (buyers/sellers), pinned watchlist, map/heatmap saved views, recently-viewed, favorites, daily-brief pin/dismiss, dashboard layout. All 7 are `localStorage`-only or hardcoded.
- **`saved_searches` / `pinned_searches`** — Global Search has zero persistence of search terms.
- **`approval_decisions`** (append-only audit) — approve/reject history is not stored (only a 30-day cache boolean for rejections).
- **Marketing campaign persistence** (`marketing_campaigns` + approvals) — Marketing Core™ persists nothing; every reload regenerates campaigns in memory.
- **`journey_notes`** — journey notes do not exist anywhere (always `[]`); no column on any journey table.
- **Featured areas / landing configuration** — no curated table (only `service_areas text[]`).
- **Publish history** — only a single `last_published_at`; no version/publish-history table.
- **Notification preferences** — a one-time onboarding jsonb is captured but never read; no mute/channel-toggle store.
- **Calendar preferences** — backend writes to `users.settings.calendar` jsonb (fine) but *no dedicated table and no UI*.

**Deliberately absent (fine):** dashboard personalization, per-landing analytics (documented as "adds no schema").

---

## 3. Missing write paths (editable UI that does not persist)

| Feature | Symptom | Sev |
|---|---|---|
| **Marketing Core™ campaigns/approvals** | UI implies human-approval workflow; nothing writes; `setApproval` is dead code | Critical |
| **Ask ZONO chat** | `useState` only; `logAskExchange`/`ensureConversation` exist but never called | Critical |
| **Approval bundle decisions** | Stateless by design; no `decided_by`/`decided_at` written | Critical |
| **Journeys-OS `advanceStageAction`** | Fully implemented, **zero callers** — every row frozen at initial stage | Critical |
| **Voice AI capture** | Persists only if both free-text `entityType`+`entityId` filled; blank → lost on refresh | High |
| **WhatsApp preferences** | `auto_reply_allowed`/`default_tone`/`safety_rules` columns exist; no UI writes them | Medium |
| **Agent/Office Website: theme, featured_property_ids, testimonials, seo** | Columns read publicly; no control in `AgentWebsiteView`/`OfficeWebsiteView` (only via Website Builder) | Medium |
| **Office Website `featured_property_ids`/`theme`** | Read by public renderer; no writer in the office view | High/Medium |
| **Lead stage / seller status / seller notes / buyer notes compose** | FKs + RLS ready; no editor UI; leads.stage never updated in codebase | Medium |
| **Marketing community** | Create-only; no update/delete action wired | Low |
| **Calendar availability prefs** | Actions fully wired; no component imports them | Medium |

---

## 4. Missing read paths (written but never read / hardcoded reads)

| Feature | Symptom | Sev |
|---|---|---|
| **`public.notifications`** | Written by automation, approval-bundle, comment-journey; **read by nobody** — those alerts never reach the user | High |
| **Org-memory durable store** | `zono_org_memory*` insert/select code exists, not exported/called; report re-derived fresh each time | High |
| **AI memory** | `ai_memory` CRUD works but `listMemories` never consumed by any AI reasoning module | High |
| **Workflow history** | `zono_workflow_history` written correctly; `WorkflowBuilder` never renders it | Low |
| **`/my-properties` panels** | "AI Copilot", "Smart Opportunities", "Market Intelligence" = hardcoded fake names/addresses/stats | High |
| **`properties.zono_score`** | Never written; every property shows hardcoded fallback `70`; "hot properties" KPI meaningless | Medium |
| **Heatmap mock fallback** | `geo-intelligence/mock.ts` shows 12 fabricated neighborhoods when org has 0 snapshots | Medium |
| **`deal_journeys.entered_at`** | Written each stage change, never read → days-in-stage/velocity logic is dead | Medium |
| **`financing_signals.deal_id`** | Never populated → no financing signal ever appears on a deal | Medium |
| **`property_view` analytics event** | Referenced in aggregation, never inserted → property-view metric permanently 0 | Medium |
| **AI-route website analytics** | `/ai-agent`, `/ai-site` traffic never instrumented (only classic `/agent`, `/site`) | High |

---

## 5. Duplicate sources of truth

| Duplication | Detail | Sev |
|---|---|---|
| **Journey systems (×3)** | Heuristic Journey Center (derived) vs. `property_journeys` (real, used by Property cockpit) vs. `journeys`-OS (persisted but dead). Same entity shows different stages on different screens | Critical |
| **Deal systems (×2)** | `deal_profiles` (+children) powers `/deals`; canonical `public.deals` powers Quick-Create/revenue/legal. **Manually created deals never appear on the cockpit** | Critical |
| **Seller linkage** | Legacy `properties.seller_id` (read by 9+ engines) vs. current `property_sellers` (all real writes). Seller Command Center starved/wrong for normally-linked sellers | Critical |
| **Public site renderers (×2 each)** | `/agent` vs `/ai-agent`, `/site` vs `/ai-site` read the same table but diverge in fidelity; editors preview only one | High |
| **Lead score / stage** | Legacy write-once `leads.score`/`stage` drive routing while cockpit shows a different live Twin score | Medium |
| **Buyer twin (×2 opinions)** | `buyer_intelligence_profiles` (cockpit) vs. ephemeral digital-twin/buyer-agent (separate surface) compute disagreeing scores | Medium |
| **Featured properties (×2)** | Website-builder config `featured_property_ids` vs. brokerage-site's own "top 6 by created_at" | Medium |
| **Notifications (×2)** | `notification_state` (read) vs. orphaned `public.notifications` (written) | High |

Website schema itself is **not** duplicated — `agent_websites`/`office_websites` are a genuine single source; the duplication is at the renderer/route layer.

---

## 6. Missing / broken RLS

| Table(s) | Issue | Sev |
|---|---|---|
| **`storage.objects`** (6 buckets: creative-references, property-media, documents, logos, agent-photos, office-assets, public-site-media) | `20260906120000_qa1_storage_buckets.sql` adds permissive insert/update/delete policies with **no org-path check** → any authenticated user can write/delete any org's files (permissive policies OR together) | **Critical** |
| **`distribution_provider_connections`** (Facebook) | `user_id` added (Sept-14) but RLS still org-only → any org member can read another broker's encrypted FB tokens | **Critical** |
| **`whatsapp_accounts`** | `user_id` added for per-broker QR sessions but RLS still org-only → any org member can read another broker's session_ref/metadata | **Critical** |
| **13 `zono_*` AI tables** (`zono_agents`, `zono_missions`, `zono_workflows`, `zono_api_keys/webhooks`, `ai_memory`, `zono_ask_*`, etc.) | `organization_id`/`org_id`/`user_id` stored as **bare UUIDs, no FK**, combined with service-role RLS-bypass design → a cron bug can read/write the wrong org's AI data/API keys | High |
| **`deal_profiles` write policy + 4 child tables** | SELECT is ownership-scoped; write policy + `deal_journeys/negotiations/objections/tasks` are org-wide → any agent edits any deal, sees all offers | High |
| **Workflow builder** | `listWorkflows`/`loadWorkflow` use service-role and never filter `organization_id` → cross-org IDOR by id | High |
| **`facebook_connection_paths`** | Extension umbrella status is org-global (`onConflict: org_id,path_type`); two brokers' extensions overwrite each other | Medium |
| **`property_score_events`** | Agents have update+delete on an audit-log table (should be insert/select-only) | Low |
| **8 market-cache tables** | RLS enabled, zero policies (deny-all except service_role) — intentional but undocumented | Low |

**Baseline is otherwise strong:** all ~470 tables have RLS enabled (mostly via a `current_org_id()` + `has_min_role()` policy loop); core CRM org-isolation is enforced. The failures above are regressions layered on top, not a missing baseline.

**Note on the "agent owns own record" model:** RLS is org-wide with role-gating (agent+ writes, manager+ deletes). `owner_id`/`assigned_agent_id` exist on buyers/sellers/leads/deals but are **not** enforced at the DB — any agent can edit any colleague's record. This may be intentional; it needs explicit product sign-off, not treated as 5 separate bugs.

---

## 7. Missing indexes

- **29 tables have zero indexes**, most notably the entire `distribution_intelligence.sql` set (15 tables: `community_*`, `daily_distribution_batches`, `distribution_plans/queue`, `social_accounts`, `social_connection_vault`, …) despite carrying `organization_id`/`property_id`/`user_id` — these sequential-scan under RLS as data grows. Also `zi_faq/glossary/tutorials/walkthroughs`, `onboarding_progress`, `org_plans`.
- **81 tables have an org-scoping column with no index on it** — mostly the `_intelligence` child tables (buyer/seller/property/match risks·missions·touchpoints·objections, deal children, journey children). Many are queried by `property_id`/`buyer_id`/`deal_id` (usually indexed) so risk is softened, but it's a systemic gap in an otherwise well-indexed core schema.
- Core (`buyers/sellers/properties/deals`) indexing is good (org_id, owner_id, composite temperature indexes present).

One consolidated "index coverage" migration would close most of this.

---

## 8. Features still running on demo/mock/hardcoded data

| Location | What's fake | Sev |
|---|---|---|
| `/my-properties` — AI Copilot / Smart Opportunities / Market Intelligence panels | 100% hardcoded buyer names, addresses, market stats | High |
| Heatmap (`geo-intelligence/mock.ts`) | 12 fabricated neighborhoods shown when org has 0 snapshots, only a soft Hebrew note distinguishes them | Medium |
| `properties.zono_score` fallback | Hardcoded `70` for every property | Medium |
| Command Center "Favorites" grid | Static default list (honestly presented, no persistence implied) | Low |
| Area Guide `priceReductions` | Hardcoded `0` | Low |
| Seller "document readiness" card + Seller Portal `docs` | Hardcoded "missing" / `[]` stub (explicit TODO) | Medium |

**No fabricated data is presented as real *history* anywhere** — the AI-history issues are ephemeral/unwired real layers, not fake logs.

---

## 9. Features that can lose data

| Feature | Loss condition |
|---|---|
| **Ask ZONO conversations** | Every refresh/logout — never persisted |
| **Voice AI capture** | Any capture without both entity fields filled |
| **Marketing Core™ campaigns/approvals** | Every reload — regenerated in memory |
| **Approval decisions** | Not recorded — no audit trail ever |
| **All personalization** (saved filters, pinned watchlist, map views, recently-viewed, favorites, daily-brief state) | Logout, device switch, clear browser data, private browsing |
| **Command Center recent items** | Shared browser leaks between users (global localStorage key, not user-scoped) |
| **Orphaned uploads (My Profile photo/cover)** | Navigate away before Save → file in bucket, URL never saved |
| **Notifications written to `public.notifications`** | Never surfaced — effectively lost |

---

## 10. Prioritized implementation order

**P0 — Security/data-integrity (ship first, all are live risks):**
1. Fix `qa1_storage_buckets` policies (add `foldername[1] = current_org_id()` or drop the permissive ones) — stops cross-tenant file write/delete.
2. Per-user RLS on `distribution_provider_connections` and `whatsapp_accounts` (`user_id is null or user_id = auth.uid()`) — stops token/session leakage.
3. Add org filters to workflow-builder `listWorkflows`/`loadWorkflow` (code-only) — closes IDOR.

**P1 — Correctness bugs that silently mislead:**
4. Fix WhatsApp command-center query (`.eq(provider,'whatsapp_cloud').is(user_id,null)`) — stops false "not connected".
5. Repoint seller readers from `properties.seller_id` → `property_sellers`.
6. Fix Deals "Create Legal Document" FK + link Quick-Create deals to the cockpit (reconcile the two deal systems).
7. Reconcile journey systems (pick `property_journeys` or `journeys`-OS as canonical; retire the other; repoint Journey Center's property-stage read).
8. Wire `public.notifications` into the Attention Center feed (or migrate its 3 writers) + fix the hardcoded header bell badge.

**P2 — Ephemeral AI/audit surfaces (wire the existing tables):**
9. Ask ZONO history (call `logAskExchange` / fetch on mount).
10. `approval_decisions` audit table + writes.
11. Org-memory durable store + AI-memory consumption (or relabel AI memory as "Notes").
12. Marketing Core™ — either build real persistence or relabel as "AI suggestions" (remove approval-workflow copy).

**P3 — Personalization & polish:**
13. `user_ui_preferences` table; migrate the 7 localStorage surfaces + saved searches.
14. Index-coverage migration (distribution_intelligence + org-column gaps).
15. Consolidate the dual public-site renderers + add analytics to AI routes.
16. Build the missing write UIs (lead stage, seller/buyer notes, website theme/featured in primary views, calendar prefs).

---

## 11. Estimated migration count required

**~8 mandatory + ~6 feature-enabling = ~14 migrations.**

Mandatory (P0–P1 integrity/security):
1. Storage-bucket RLS fix. 2. Facebook per-user RLS (+`facebook_connection_paths.user_id`). 3. WhatsApp per-user RLS. 4. `deal_profiles` child/write RLS ownership. 5. FK/RLS hardening on bare `zono_*` AI tables. 6. `property_score_events` RLS tighten. 7. Widen `deals.value`/`commission_amount` to `bigint`. 8. `legal_documents.deal_profile_id` FK (or code-fix the id).

Feature-enabling (P2–P3):
9. `approval_decisions`. 10. `user_ui_preferences` (+ saved searches). 11. `journey_notes` (if wanted). 12. `marketing_campaigns` + approvals (if built, not relabeled). 13. Index-coverage pack. 14. Optional `stage_override` / `deleted_at` / `tags` columns on buyers/sellers/leads.

Many P1 fixes and all the "unwired table" fixes (Ask ZONO, org-memory, notifications, workflow IDOR) are **code-only — no migration**.

---

## 12. Overall production readiness score (persistence layer)

**6.5 / 10.**

- **Strengths:** genuine, FK-enforced core CRM; org-scoped RLS baseline on all tables; real automation/notification/website/WhatsApp-inbox persistence; the new Agent Personal Area is clean and reuses a single source of truth.
- **Blockers to production:** three Critical cross-tenant RLS regressions (storage + FB/WhatsApp secrets), an approval flow with no audit trail, and AI-facing features (Ask ZONO, Marketing Core™, journeys) that appear functional but persist nothing.
- **Ceiling after P0–P1:** ~8.5/10. After P2–P3: ~9.5/10.

The system is close, but **should not go to production until P0 is closed** — the storage and connection-token RLS gaps are exploitable by any authenticated user today.
