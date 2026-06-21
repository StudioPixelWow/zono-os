# ZONO — Master System Audit (Codebase Reality Map)

**Audit date:** 2026-06-20
**Scope:** Read-only audit of `/Users/talzatelman/Desktop/zono-os` — actual repository + Supabase migrations only.
**Method:** Repo scan (routes, services, engines, migrations) + live migration replay + `tsc`/`eslint` gates. No features built, no code changed, no migrations added.

> Honesty note: Everything below is grounded in files/tables/routes that exist in the repo. Items that could not be confirmed are marked **unclear / needs manual verification**. Anything not present in code is marked **not found in codebase**.

---

## 1. Executive Summary

ZONO is a **deterministic, Hebrew/RTL, multi-tenant real-estate intelligence SaaS** built on Next.js (App Router, `(app)` route group) + Supabase (`@supabase/ssr`, org-scoped RLS via `current_org_id()` / `has_min_role()`) + Tailwind v4 + TypeScript.

The system is substantially built and internally consistent. There are **45 migrations / 143 tables** (live replay), **~40 page routes**, **6 API/cron routes**, and **~33 library modules**. A central **Decision Brain** aggregates **~32 tables** from every intelligence module, and a **Knowledge Graph** unifies entities/relationships across the CRM. The intelligence layers are deterministic (rule/scoring engines), consistent with the product's "no LLM" principle — **with one exception** (see below).

**Build health:** `tsc --noEmit` clean; `eslint` 0 errors (8 cosmetic unused-var warnings); all 45 migrations replay cleanly against real Postgres.

**Most important honest findings:**
1. **One real LLM call exists** — `src/lib/properties/ai.ts` calls OpenAI `gpt-4o-mini` for *marketing copy only*, gated behind `OPENAI_API_KEY`, server-only, with a deterministic Hebrew template fallback. This is the only real external AI call in the codebase. It does **not** touch any scoring/intelligence engine, but it does contradict a strict reading of "no AI calls."
2. **Several modules are "data + engine + dashboard" complete but depend on manual data entry** (communication, social, distribution) because real connectors (WhatsApp/Meta/Gmail) are intentionally not built.
3. **A cluster of ~12 "future" tables** exists in the distribution/social migration with schema but little/no service logic yet.
4. **Recon table-count discrepancy resolved:** a sub-scan counted 148 `create table` statements; the authoritative live replay yields **143 public tables**. Use 143.

---

## 2. Overall Completion Estimate

These are code-grounded estimates (presence of service + engine + UI + integration), not product-vision estimates.

| Bucket | Approx. share of modules | Notes |
|---|---|---|
| **Built** (service + engine + UI + integrated) | ~70% | Core CRM + most intelligence brains + transactions |
| **Partially built** (works but manual-data-dependent or thin UI) | ~22% | communication, distribution, social-leads, acquisition surfacing |
| **Placeholder / future** (schema present, little/no logic) | ~8% | ~12 distribution/social future tables, broker discovery |
| **Missing** (named in audit prompt, not in codebase) | see §10 | portals, signatures, calculators, automation UI, voice, etc. |

**Headline:** roughly **70% built / 22% partial / 8% placeholder** at the module level, with a meaningful set of audit-prompt concepts simply **not present** in code (these are not "incomplete" — they were never started).

---

## 3. Module Registry

Status legend: **built** / **partial** / **placeholder** / **missing** / **unclear**. Completion % is code-grounded.

### Core CRM / Infrastructure

| Module | Path | Status | % | Tables | Dec.Brain | Graph | Dashboard | Notes |
|---|---|---|---|---|---|---|---|---|
| Supabase/clients | `src/lib/supabase` | built | 100 | — | — | — | — | client/server/service-role/middleware |
| Repositories (org/user/locality/props) | `src/lib/repositories` | built | 100 | organizations, users, roles, *_operating_localities, israel_localities | — | — | — | service-role for privileged writes |
| Auth/session | `src/lib/auth` | built | 100 | users (via auth) | — | — | — | signUp/signIn/session context |
| Onboarding | `src/lib/onboarding` | built | 90 | users, organizations, roles, operating_localities | — | — | — | 8-step wizard |
| Dashboard context | `src/lib/dashboard` | built | 95 | users/orgs/localities | — | — | host | error-safe empty context |
| Properties | `src/lib/properties` | built | 90 | properties, property_media | via intel | yes (node) | yes | **OpenAI optional in ai.ts** |
| Buyers | `src/lib/buyers` | built | 95 | buyers | via intel | yes | yes | |
| Sellers | `src/lib/sellers` (+ service360, propertySellers) | built | 90 | sellers, property_sellers | via intel | yes | yes | 360 profile |
| Tasks | `src/lib/tasks` | built | 95 | tasks | — | — | yes | logs activity |
| Journey | `src/lib/journey` | built | 90 | property_journeys, properties | — | — | yes | stage engine + trigger |
| Localities search | `src/lib/localities` | built | 100 | israel_localities | — | yes (locality nodes) | — | |
| Activity layer | `src/lib/activity` | built | 100 | activity_events, entity_relationships, communication_threads/messages, meetings | writes | feeds edges | — | unified event log |

### Intelligence Brains

| Module | Path | Status | % | Tables | Dec.Brain | Graph | Dashboard | Notes |
|---|---|---|---|---|---|---|---|---|
| Property Intelligence | `src/lib/intelligence` | built | 88 | property_intelligence_profiles + 8 (missions/levers/risks/exposure/touchpoints/calendar/score_events/blueprints) | yes | indirect | yes | + transaction-valuation risks (recent) |
| Seller Intelligence | `src/lib/seller-intelligence` | built | 88 | seller_intelligence_profiles, seller_missions/risks/touchpoints/commitments | yes | indirect | via team | + price-gap risk (recent) |
| Buyer Intelligence | `src/lib/buyer-intelligence` | built | 90 | buyer_intelligence_profiles, buyer_missions/risks/touchpoints/objections/commitments | yes | indirect | via matching | |
| Matching Intelligence | `src/lib/matching-intelligence` | built | 90 | match_intelligence_profiles, match_risks/objections/opportunities, revenue_signals | yes | yes (edges) | yes | |
| Decision Brain | `src/lib/decision-intelligence` | built | 88 | decision_intelligence_profiles, attention_items, opportunity_signals, decision_queue, decision_recommendations | **hub** | yes (signals) | yes | aggregates ~32 tables |
| Communication Intelligence | `src/lib/communication` | partial | 85 | communication_intelligence_profiles, _commitments, _followups, _insights | yes | — | yes | **manual logging only** (no real channels) |
| Knowledge Graph | `src/lib/graph` | built | 90 | graph_entities, graph_relationships, graph_signals | feeds | **hub** | via signals | clusters + opportunity signals |
| Deal Forecast | `src/lib/forecast` | built | 92 | deal_forecasts, pipeline_snapshots, deal_forecast_signals | yes | yes (signals) | yes | + pricing-gap signal (recent) |
| Deal Execution | `src/lib/deals` | built | 90 | deal_profiles, deal_journeys, deal_negotiations, deal_objections, deal_tasks | yes | yes (node) | yes | |
| Team Intelligence | `src/lib/team` | built | 90 | team_intelligence_profiles, team_performance_snapshots, agent_coaching_signals, office_intelligence_profiles, team_opportunity_leaks, management_actions | yes | — | yes | |
| Lead Routing | `src/lib/routing` | built | 90 | agent_intelligence_profiles, agent_locality/property_type_performance, lead_routing_profiles/candidates | indirect | — | own page | agent-own visibility |
| Revenue Intelligence | `src/lib/revenue` | built | 92 | organization_revenue_profiles, revenue_targets, revenue_leakage_events | yes | — | yes | + overpriced-inventory leak (recent) |
| Market Intelligence / Heatmap | `src/lib/market` | built | 95 | market_area_snapshots | yes | yes (localities) | yes | deterministic, org-scoped |
| Transactions Intelligence | `src/lib/transactions` | built | 90 | property_transactions, geo_coverage_targets, transaction_sync_logs, property_research_reports, building_intelligence, street_intelligence, transaction_opportunity_radar_alerts | yes (radar) | yes (research links) | yes | Apify GovMap/Madlan; **pipeline research recompute** drives the recent deep-integration |
| Geo Intelligence | `src/lib/transactions/geo.ts` + `israel_neighborhoods` | partial | 70 | israel_neighborhoods | — | — | coverage page | OSM neighborhood discovery (deterministic) |
| Broker Intelligence | `src/lib/broker` | built | 85 | broker_profiles, broker_aliases/sources/service_areas/discovery_runs/match_reviews, property_broker_matches, broker_logo_assets | yes (reviews) | yes (node) | own page | discovery run = future |
| Competitor Intelligence | `src/lib/competitor` | built | 92 | competitor_profiles, competitor_market_positions, competitor_signals | yes | yes (signals) | own page | |
| Acquisition Intelligence | `src/lib/acquisition` | built | 85 | inventory_acquisition_profiles (+ actions/reviews) | yes | — | own page | + transaction-valuation sub-score (recent) |
| External Listings | `src/lib/external-listings` | built | 90 | external_listing_sources/listings/history/duplicates, import_jobs/logs | yes | — | properties tab + market | real Apify Yad2/Madlan |

### Marketing / Growth

| Module | Path | Status | % | Tables | Notes |
|---|---|---|---|---|---|
| Marketing Intelligence | `src/lib/marketing` | built | 90 | community_profiles, community_intelligence_profiles, property_marketing_profiles, buyer_segments, marketing_opportunity_signals | feeds Decision Brain + dashboard |
| Distribution Workspace | `src/lib/distribution` | partial | 75 | community_dna_profiles, property_community_matches, distribution_plans/items, daily_distribution_batches/items, distribution_opportunity_signals (+ ~12 future tables) | **manual publishing only**, no Meta API |
| Daily Assisted Distribution | `/distribution/daily` | partial | 75 | daily_distribution_* | UI present |
| Social Lead Capture | `src/lib/social-leads` (+ social_* tables) | partial | 75 | social_interactions, social_leads, social_followups | structured leads; capture is manual |
| Community Attribution / ROI / Network | distribution migration | placeholder | 20 | community_lead_attribution, community_deal_attribution, community_rankings, community_network_profiles, community_metrics | schema only — **needs cross-check with services** |
| Content Generation | `src/lib/distribution/content.ts` | built | 85 | — | deterministic post variants (6 angles), **no LLM** |
| Content Performance / Campaigns | — | missing | — | — | **not found in codebase** as a dedicated module |
| WhatsApp/Social Messaging | — | placeholder | 10 | social_accounts, social_connection_vault, distribution_queue | future scaffolding only |
| AI Reply Suggestions | `src/lib/communication` (draftReply) | partial | 60 | — | deterministic draft builder, not an LLM |

### Operations / Presentation / Future (audit-prompt concepts)

| Concept | Status | Evidence |
|---|---|---|
| Digital Signatures | partial (schema only) | `documents` table has signature flow fields; **no signing service/UI found** |
| Document Intelligence / Contract Intelligence / Legal Workflow | missing | **not found in codebase** |
| Mortgage / Real-estate Calculators | missing | **not found in codebase** |
| Call Summary AI / Meeting Intelligence | partial | `meetings` table + activity; no AI summary service |
| Follow-Up Automation / Workflow Automation / Automation Rules | partial (schema only) | `automations` table + `automation_trigger`/`automation_status` enums exist; **no automation engine/UI found** |
| Client/Seller/Buyer/Agent/Manager Portals | missing | **not found in codebase** (single internal app only) |
| Multi-Branch / Branch Manager | partial | roles include manager/admin/owner + `revenue_targets` scope=branch; no dedicated branch UI |
| Office/Agent Website, Public Property Pages, Landing Pages | missing | **not found in codebase** |
| Recommendation Intelligence/Packages/Map, Territory Expansion, Referral Intelligence, Office Growth, Autonomous Office AI, AI Orchestrator, AI Agents, Reinforcement/Learning, Voice AI | missing | **not found in codebase** |

---

## 4. Database Inventory

- **Migrations:** 45 `.sql` files, timestamp-ordered, no ordering violations (every FK target exists before reference; all ALTERs additive/nullable).
- **Tables (live replay):** **143** public tables.
- **Enums:** ~43 (org_plan, region, property_type/status, journey_stage, broker_*, listing_source_type, lead_*, deal_*, etc.).
- **Helper functions:** `role_rank`, `current_org_id`, `current_role_key`, `has_min_role`, `is_org_member`, `set_updated_at`, `journey_stage_for_status`, `journey_progress_for_stage`, `create_property_journey`, `seed_org_default_roles`.
- **Triggers:** ~130 `set_updated_at` triggers; append-only tables (activities, *_touchpoints, *_logs, score_events) intentionally have none.

**Table groups (creating migration noted in detail by recon):**
- **Core/CRM:** organizations, roles, users, buyers, sellers, projects, units, properties, leads, deals, opportunities, matching_results, tasks, notes, meetings, documents, notifications, activities.
- **Reference/National (global, service-role write):** israel_localities, israel_neighborhoods; property_blueprints system rows (org_id NULL).
- **Operating areas:** organization_operating_localities, user_operating_localities.
- **Property intelligence (9):** property_intelligence_profiles, blueprints, missions, levers, risks, exposure_channels, seller_touchpoints, calendar_plans, score_events.
- **Activity/Comm:** activity_events, entity_relationships, communication_threads/messages, communication_intelligence_profiles/commitments/followups/insights.
- **Seller/Buyer/Match/Decision intelligence:** as listed in §3.
- **External/Broker/Competitor/Acquisition:** external_listing_* , import_job_* , broker_* , competitor_* , inventory_acquisition_* .
- **Routing/Team/Forecast/Revenue/Deal:** agent_* , lead_routing_* , team_* , office_intelligence_profiles, management_actions, team_opportunity_leaks, deal_forecasts/pipeline_snapshots/deal_forecast_signals, organization_revenue_profiles/revenue_targets/revenue_leakage_events, deal_profiles/journeys/negotiations/objections/tasks.
- **Marketing/Community/Distribution/Social:** community_* , property_marketing_profiles, buyer_segments, marketing_opportunity_signals, distribution_* , daily_distribution_* , social_* .
- **Transactions/Geo:** property_transactions, geo_coverage_targets, transaction_sync_logs, property_research_reports, building_intelligence, street_intelligence, transaction_opportunity_radar_alerts, israel_neighborhoods.

**RLS:** Org-scoped tables enforce `current_org_id()` + role checks for SELECT/INSERT/UPDATE/DELETE. Reference tables are read-all / service-role-write. `social_connection_vault` is service-role only (authenticated users have no access) — correct for a future token vault.

**Possibly-orphaned / future tables (schema present, thin/no service usage — needs cross-check):** social_accounts, social_connection_vault, community_discovery_runs, community_discovery_candidates, community_metrics, community_lead_attribution, community_deal_attribution, community_rankings, community_network_profiles, distribution_queue, broker_discovery_runs. (~11–12 tables.)

---

## 5. Route / UI Inventory

**~40 page routes** under `src/app/(app)` + `(auth)` + onboarding. All app pages set `dynamic = "force-dynamic"` and read from real services (with empty-state/error fallbacks). No page found that fabricates intelligence data.

**Sidebar-linked (21):** `/`, `/command`, `/market`, `/properties`, `/buyers`, `/sellers`, `/matches`, `/deals`, `/transactions`, `/transactions/streets`, `/transactions/radar`, `/forecast`, `/revenue`, `/acquisition`, `/competitors`, `/marketing`, `/distribution`, `/social-leads`, `/routing`, `/team`, `/graph`.

**Exist but NOT in sidebar (detail/child/admin):** `/properties/[id]`(+/edit,/new), `/buyers/[id]`(+/edit,/new), `/sellers/[id]`(+/new), `/matches/[id]`, `/team/[id]`, `/broker-intelligence`(+/[id]), `/competitors/[id]`, `/external-listings/[id]`, `/transactions/coverage`, `/transactions/debug`, `/distribution/daily`, plus `/login`, `/signup`, `/onboarding`, `/auth/logout`.

> Note: `/broker-intelligence` is a full page with data but is **not in the sidebar** — reachable only via drill-down. Possible navigation gap (not a data gap).

**Key routes → data source (all real):** `/command`→getExecutiveCommandCenter+getTodaysFocus; `/forecast`→getForecastBoard; `/revenue`→getRevenueBoard; `/team`→getTeamBoard; `/routing`→getRoutingBoard; `/market`→getCurrentMarketHeatmap; `/transactions`→getTransactionsBoard; `/transactions/radar`→getRadarBoard (+ "נתח צנרת מול עסקאות" recompute button); `/acquisition`→getAcquisitionBoard+CC; `/graph`→getGraphBoard; `/social-leads`→getSocialLeadsBoard; `/distribution`→getDistributionBoard.

**UI-only / needs verification:** Home `HeroSection` map pins / assistant text may be static — **unclear / needs manual verification**. `JourneysSectionContainer` data source on home — **unclear / needs manual verification**.

**API/cron routes (6):** `/api/external-listings/import-yad2|import-madlan|import-all|debug-provider` (session/role gated), `/api/cron/external-listings-sync`, `/api/cron/transactions-refresh` (both `CRON_SECRET` gated).

---

## 6. Real vs Mock Inventory

| Finding | Detail |
|---|---|
| **`src/data/mock.ts`** | Used only for **navigation items** (and static shell scaffolding), not for business data. |
| **Intentional fallbacks** | Transactions service has a **dev-only, clearly-marked** mock when `APIFY_TOKEN` is missing; boards return empty objects on load failure (safe). |
| **Real external data** | External listings (Apify Yad2/Madlan) and transactions (Apify GovMap/Madlan) are real provider integrations. |
| **Manual-data-dependent (UI+engine real, data entry manual)** | communication (no WhatsApp/Gmail connector), social-leads (manual capture), distribution (manual publishing). |
| **Placeholder tables w/o UI** | the ~12 future community/social tables (§4). |
| **UI without real data** | none confirmed; home hero visuals **unclear / needs manual verification**. |
| **Real data without UI** | `pipeline_snapshots`, parts of `community_*` attribution exist in schema but limited surfacing — **needs manual verification**. |
| **Production accidentally using mock** | low risk — mock transaction fallback is `NODE_ENV !== production` gated; verify `APIFY_TOKEN` is set in prod. |
| **Real LLM** | `properties/ai.ts` → OpenAI `gpt-4o-mini`, **only** when `OPENAI_API_KEY` set, server-only, deterministic fallback. Marketing copy only. |

---

## 7. Integration Matrix

`Y` = integrated, `—` = no, `(i)` = indirect/via another brain.

| Module | Decision Brain | Graph | Home Dashboard | Entity Pages | Revenue | Forecast | Team |
|---|---|---|---|---|---|---|---|
| Property Intelligence | Y | (i) | Y | Y | — | Y(feeds) | — |
| Seller Intelligence | Y | (i) | (i) | Y | — | Y | — |
| Buyer Intelligence | Y | (i) | (i) | Y | — | Y | — |
| Matching | Y | Y | Y | Y | Y | Y | — |
| Communication | Y | — | Y | Y | — | Y(feeds) | — |
| Activity | writes | feeds edges | — | Y | — | — | — |
| Forecast | Y | Y | Y | match page | Y | — | (i) |
| Revenue | Y | — | Y | — | — | uses fc | (i) |
| Deals | Y | Y | Y | deal/match | Y(feeds) | Y(feeds) | — |
| Team | Y | — | Y | /team | (i) | (i) | — |
| Routing | (i) | — | own page | /routing | — | — | (i) |
| Market | Y | Y | Y | — | — | Y(feeds) | — |
| Transactions | Y(radar) | Y(research) | Y | property/acq | Y(feeds) | Y(feeds) | — |
| Acquisition | Y | — | (i) | own page | (i) | — | — |
| Competitor | Y | Y | own page | /competitors | — | — | — |
| Broker | Y(reviews) | Y | (i) | broker page | — | — | — |
| Marketing | Y | — | Y | — | — | — | — |
| Distribution | Y | — | Y | — | — | — | — |
| Social Leads | Y | — | Y | own page | — | — | — |
| External Listings | Y | — | Y(market) | properties tab | — | — | — |

**Decision Brain** is the strongest hub (reads ~32 tables across all brains). **Activity layer** writes everywhere but is not itself read by the Decision Brain (by design). **Routing** is comparatively siloed (own page; not surfaced in Decision Brain/Graph) — possible future integration point, not a defect.

---

## 8. Security / RLS / Server Findings

| Area | Status | Detail |
|---|---|---|
| `createServiceRoleClient` usage | **safe** | 7 files: org/user/locality privileged writes, property archive, transactions batch upsert, market snapshot upsert, external-listings sync. All server-side/batch; none exposed to client routes. |
| Cron auth | **safe** | both `/api/cron/*` require `Bearer ${CRON_SECRET}`; disabled (401) when secret unset. |
| Secret exposure | **safe** | `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `APIFY_TOKEN`, `OPENAI_API_KEY` read from `process.env` server-side only. `NEXT_PUBLIC_*` limited to Supabase URL/anon key + Google Maps key (browser-safe by design). |
| LLM call | **needs review (policy)** | `properties/ai.ts` real OpenAI call — gated + fallback, but contradicts strict "no AI". Decide if acceptable. |
| Social token vault | **safe (unused)** | `social_connection_vault` service-role only; no real OAuth flow implemented yet. |
| RLS / cross-org | **safe** | org-scoped tables filtered by `current_org_id()`; reference tables read-all. No cross-org leakage path found. |
| Agent vs manager visibility | **safe** | routing/deals respect agent-own vs manager-all (e.g., deals "managers see all, agents see own"). |
| APIFY token | **safe** | server-only; service isolates/skips when missing. **Action:** a live Apify token was pasted in chat earlier in development — **rotate/revoke it** if not already done (not stored in repo). |

No critical/build-breaking security issue found. Nothing changed.

---

## 9. Duplication / Overlap Findings

| Pair | Verdict | Rationale |
|---|---|---|
| activity_events vs communication_messages | **healthy** | event log vs threaded message history; comm logging also emits activity events. |
| matching-intelligence vs deals | **healthy** | scored pairs (upstream) vs promoted deals in execution (downstream); `deal_profiles.match_id` links them. |
| revenue vs forecast vs deals | **healthy** | forecast = per-deal probability; revenue = org aggregate/gap; deals = execution. Clear layering. |
| market vs transactions | **healthy** | market = our active supply/demand snapshot; transactions = real closed-deal ground truth feeding market scoring. |
| marketing vs distribution | **unclear / verify** | both emit "opportunity_signals"; marketing is entity/audience-level, distribution is property/community-level. Confirm they don't double-surface the same opportunity. |
| acquisition vs external-listings | **healthy** | raw ingested feed vs acquisition-scoring overlay (`inventory_acquisition_profiles.external_listing_id`). |
| seller touchpoints vs communication commitments | **healthy** | passive contact log vs active promise/obligation tracking. |
| israel_localities vs israel_neighborhoods | **healthy** | parent cities vs child neighborhoods; no `cities`/`neighborhoods` duplicate table found. |

No consolidation recommended now except verifying marketing-vs-distribution signal overlap. **Do not refactor as part of this audit.**

---

## 10. Missing Modules (named in audit prompt, not found in codebase)

**Confirmed not present** as built modules/routes/services:
Client/Seller/Buyer/Agent/Manager **Portals**; Office/Agent **Website**; **Public Property Pages**; **Landing Pages**; **Mortgage/Real-estate Calculators**; **Document Intelligence / Contract Intelligence / Legal Workflow**; **Call Summary AI / Meeting Intelligence (AI)**; **Workflow Automation engine/UI** (only `automations` schema + enums exist); **Campaigns / Content Performance**; **Recommendation Intelligence/Packages/Map**; **Territory Expansion**; **Referral Intelligence**; **Office Growth Intelligence**; **Autonomous Office AI / AI Orchestrator / AI Agents / Reinforcement-Learning / Voice AI**; real **WhatsApp/Meta/Gmail messaging** connectors.

**Partial/scaffolding only:** Digital Signatures (schema in `documents`), Multi-Branch (roles + revenue scope), Social Messaging (vault/queue tables).

---

## 11. Recommended Roadmap (based only on code reality)

1. **Decide the OpenAI policy.** Either (a) formally allow the gated marketing-copy LLM and document it, or (b) remove the OpenAI branch and keep the deterministic template. Today it's an undocumented exception to "no LLM."
2. **Finish the deterministic chain you already started** (transactions deep-integration): expose a single org-wide "recompute everything" path and ensure the radar/acquisition/forecast recompute runs after each transaction sync (currently manual via the radar button).
3. **Surface `/broker-intelligence` (and `/transactions/coverage`) in navigation** if they're meant to be first-class — they exist but are sidebar-hidden.
4. **Verify marketing vs distribution signal overlap** and the home `Journeys`/`Hero` data sources (the only "unclear" UI items).
5. **Convert the ~12 future community/social tables into either (a) real logic or (b) clearly-labeled "coming soon"** so they're not mistaken for built features.
6. **Only then** consider net-new modules (portals, calculators, automation engine) — these are greenfield, not completions.

---

## 12. Immediate Risks

1. **Policy/compliance:** the OpenAI marketing call is the single deviation from "no AI" — clarify before launch.
2. **Operational:** ensure `APIFY_TOKEN` and `CRON_SECRET` are set in production; without `APIFY_TOKEN`, transactions/external sync no-op (and dev mock must never reach prod — it's gated, verify).
3. **Secret hygiene:** rotate the Apify token that was shared in chat during development if not already done.
4. **Manual-data modules can look "empty"** in a fresh org (communication, social, distribution) — expected, but set user expectations.
5. **Navigation gaps** (broker-intelligence, coverage) could make built features appear missing.

---

## 13. What NOT to Build Yet

- Do **not** start portals, public websites, calculators, contract/legal AI, voice, or automation engine until the **partial** modules (communication channels, distribution publishing, social capture, geo neighborhood coverage) are either finished or explicitly deferred — they already have schema + UI waiting for data.
- Do **not** add new "opportunity_signals" producers until marketing-vs-distribution overlap is confirmed.
- Do **not** add more `community_*` future tables; wire up the ~12 that already exist or label them.

---

## 14. Exact Next Recommended Step

**Make a single explicit decision on the OpenAI marketing call in `src/lib/properties/ai.ts`** (allow + document, or remove), because it is the only thing in the codebase that contradicts the product's core "deterministic / no-LLM" claim. Everything else is internally consistent and can proceed on the deterministic roadmap above. This is a 1-file, low-risk decision and unblocks an honest "no-AI" or "AI-assisted-copy-only" positioning.

---

### Build/Quality Gate Results (this audit)
- `npx tsc --noEmit`: **clean** (0 errors)
- `npx eslint src/lib`, `src/app`: **0 errors** (8 cosmetic unused-var warnings, pre-existing)
- Migration replay: **45/45 applied cleanly**, **143 public tables**, all intelligence-stack tables present
- No code, schema, or features changed during this audit.
