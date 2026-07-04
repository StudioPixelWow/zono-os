# PHASE QA.1 — ZONO Platform Architecture & Persistence Audit™ (Full Production-Readiness Report)

> ⚠️ **Read-only audit.** No code written, no files modified, no migrations created, nothing committed. Every problem below is *described, severity-rated, effort-estimated, and given a recommended solution* — and nothing more.

**Scope:** Phase 1 → 34.1. **Method:** static inspection of 169 migration files, the generated Supabase client (`src/lib/supabase/types.ts`), and all 1,995 source files (service read/write patterns, `as never` casts, auth, RLS, `select("*")`, loops, buckets, views).

---

## 1. Executive Summary

ZONO is a **large, disciplined, broadly-persisted platform** — 463 tables, 1,168 indexes, 1,071 foreign keys, 503 RLS policies (342 org-scoped), 1,995 source files, 183 pages, 110 server-action modules. The transactional core (CRM, Properties, Missions, Agents, Workflows, Platform API, Creative Studio, Distribution, Websites, Portals) is **production-ready**: it writes, is RLS-covered, and survives a refresh.

The platform's defining pattern — and its defining risk — is that **every intelligence and agent module from Phase 27+ is a *derive-on-read* layer that persists nothing of its own** (verified: 0 write calls across 17 modules). This keeps the codebase free of duplicated data (excellent), but means "memory", "learning", scores, and dashboards are recomputed on every request and can never be trended.

Three cross-cutting issues gate production more than any single module:

1. **Type-safety erosion — CRITICAL.** 161 of 463 tables (35%) are absent from the generated client; **85 are queried through `as never` casts** that disable all compile-time checking. A column rename ships silently to runtime.
2. **No persistence/cache tier for the intelligence layer — HIGH.** There are **zero views and zero materialized views** in the entire schema, and no snapshot/cache tables — the natural home for derive-on-read output does not exist.
3. **Security completeness — HIGH.** RLS is strong where present (342 org-scoped policies) but only ~44% of tables carry explicit enablement, the **service-role path bypasses RLS** (org scoping enforced only in app code), and **storage buckets are created manually, not in any migration**.

**Verdict: ~72% production-ready.** The operational spine is launch-grade; the intelligence tier is correct-but-stateless; and three infrastructure gaps (types, persistence tier, security completeness) must close before Phase 35.

---

## 2. Module-by-Module Audit

Status legend — **Prod**=Production Ready · **Part**=Partial · **Proto**=Prototype · **Int**=Internal only.
Persistence — **Full** · **Part** · **Mem**=in-memory/derive-on-read · **Mock**.
Future-block — does it block future development (Y/N).

| Module | Purpose | Status | Persistence | Tables used | Architecture | Security | Perf/Scale concern | Blocks future? |
|---|---|---|---|---|---|---|---|---|
| **CRM (core)** | Contacts/relationships spine | Prod | Full | buyers, sellers, leads, deals, activities | Read/Write | org-RLS | `select("*")` heavy | N |
| **Properties** | Listing inventory | Prod | Full | properties, property_media, property_* | Read/Write | org-RLS | large-table indexes OK | N |
| **Buyers** | Buyer records + profiles | Prod | Full | buyers, buyer_* | Read/Write | org-RLS | none material | N |
| **Sellers** | Seller records + touchpoints | Prod | Full | sellers, seller_* | Read/Write | org-RLS | none | N |
| **Leads** | Lead intake + routing | Prod | Full | leads, lead_routing_* | Read/Write | org-RLS | none | N |
| **Deals** | Pipeline/negotiation | Prod | Full | deals, deal_* | Read/Write | org-RLS | untyped (`as never`) | N |
| **Offices** | Brokerage office registry | Prod | Full | brokerage_offices, brokerage_office_* | Read/Write | org-RLS | untyped; 4 graph models | **Y (dup)** |
| **Brokers** | Broker identity + intel | Part | Full | broker_profiles, broker_* (7 tables) | Read/Write | org-RLS | untyped; fragmented | **Y (dup)** |
| **Digital Twins** (buyer/seller/lead) | Behavioral model per party | Part | **Mem** | derives from base | Read-only | derived | recomputed each load | N |
| **Truth Engine** | Entity-truth scoring | Part | **Mem** | derives | Read-only | derived | no snapshot/trend | N |
| **Relationship Graph** | Entity graph | Part | **Mem** | graph_entities/relationships (reads) | Read-only | org-RLS | 4 overlapping graph models | **Y (dup)** |
| **Organizational Memory** | Durable org learning | **Proto** | **Mem — no store** | none of its own | Read-only | — | **not persisted at all** | **Y** |
| **Chief of Staff** | Org-level exec brief | Part | **Mem** | derives | Read-only | derived | heavy multi-engine assembly | N |
| **Decision Engine** | Prioritized recommendations | Part | Part | decision_queue/recommendations exist | Read-mostly | org-RLS | recompute cost | N |
| **Mission Engine** | Tasks/missions | Prod | Full | zono_missions | Read/Write | org-RLS | untyped | N |
| **Workflow Builder** | Multi-step automations | Prod | Full | zono_workflows/_steps/_history | Read/Write | org-RLS(3) | untyped | N |
| **Agent Framework** | Agent runtime/approval | Prod | Full | zono_agents/_runs/_inbox/_performance/_memory | Read/Write | org-RLS(3) | untyped | N |
| **Listing Agent** | Property scorecards | Part | **Mem** | derives (properties/valuations/matches) | Read-only | derived | recompute per load | N |
| **Buyer Agent** | Buyer scorecards | Part | **Mem** | derives | Read-only | derived | recompute | N |
| **Seller Agent** | Seller scorecards | Part | **Mem** | derives | Read-only | derived | recompute | N |
| **Lead Agent** | Lead scorecards/routing | Part | **Mem** | derives | Read-only | derived | recompute | N |
| **Office Agent** | Office growth scorecard | Part | **Mem** | derives | Read-only | derived | recompute | N |
| **Orchestrator** | Multi-agent coordination | Part | **Mem** | zono_orchestrator_runs/_locks exist but result not stored | Read-only | org-RLS | gathers ALL scorecards live — heaviest read | **Y (perf)** |
| **Ask ZONO** | NL query over engines | Part | **Mem / none** | none | Read-only | inherits | no convo log; live multi-engine | N |
| **AI Workspace** (AI Home) | Unified boards/timeline | Part | **Mem** | assembles all services | Read-only | inherits | heaviest assembler | **Y (perf)** |
| **Communication Studio** (Draft Studio) | Draft generation | Part | Part | reuses whatsapp_drafts/missions | Read-mostly | org-RLS | drafts not always saved | N |
| **Platform API** | External REST + webhooks | Prod | Full | zono_api_keys/_webhooks/_api_audit | Read/Write | API-key gateway | untyped; needs rate-limit store | N |
| **AI Brokerage Website** | Public office site | Prod | Full | office_websites + events/leads | Read/Write | public+redact | untyped | N |
| **AI Agent Website** | Public agent site | Prod | Full | agent_websites + events/leads | Read/Write | public+redact | untyped | N |
| **Buyer Portal** | Auth buyer view | Prod | Full (read) | client_portals + buyers.portal_user_id | Read-mostly | auth (403 unlinked) | untyped (`as never`) | N |
| **Seller Portal** | Auth seller view | Prod | Full (read) | sellers/property (reused) | Read-mostly | auth | untyped | N |
| **Area Portal** | Public neighborhood pages | Prod | n/a (public) | public tables (reused) | Read-only | public by design | ensure no PII leak | N |
| **Marketing Core** | Campaign planning | Part | **Mem** | reuses `marketing` engine | Read-only | derived | plan/calendar not saved | N |
| **Creative Studio** | Ad/creative generation | Prod | Full | zono_creative_*, creative_dna_*, bucket | Read/Write (12) | org-RLS | manual bucket provisioning | N |
| **Distribution** | Multi-channel publishing | Prod | Full | distribution_* (20+ tables) | Read/Write (20) | org-RLS | untyped (14 `as never`) | N |
| **Facebook Groups** | Assisted group posting | Part | Part | distribution_groups/_posts | Read/Write | org-RLS | assisted-manual by design | N |
| **Property Marketing** (Log) | Per-property activity log | Part | Full (read proj.) | reads distribution_* | Read-only | org-RLS | untyped (`as never`) | N |
| **Property Marketing Action Center** | Per-property next actions | Part | **Mem** | derives | Read-only | derived | recompute | N |
| **FB Groups Intelligence** | Group performance insights | Part | **Mem** | derives | Read-only | derived | recompute | N |
| **Market Domination** | Area recruitment view | Part | **Mem** | derives (market heatmap) | Read-only | derived | recompute | N |
| **Inventory Acquisition** | Seller recruitment OS | Prod | Full | inventory_acquisition_* + exclusive-acquisition | Read/Write | org-RLS | untyped | N |
| **Street Intelligence** | Per-street recruitment | Part | **Mem** | reads property_transactions (street_intelligence table exists, unused) | Read-only | org-RLS | needs `(city,street,deal_date)` index | N |
| **Building Intelligence** | Per gush/helka recruitment | Part | **Mem** | reads property_transactions (building_intelligence table exists, unused) | Read-only | org-RLS | recompute | N |
| **Valuation** (foundation) | AVM + comparables | Prod | Full | property_valuations, valuation_* | Read/Write | org-RLS | untyped; heavy provider queries | N |
| **Whatsapp / Comms** | Messaging engine | Part | Full | whatsapp_* (15 tables) | Read/Write | org-RLS | provider-dependent | N |
| **Documents / Legal** | Doc requests/signatures | Part | Full | documents, legal_* | Read/Write | org-RLS | needs storage bucket | N |
| **Journey / Automation** | Lifecycle automations | Part | Full | journey_*, automation_* | Read/Write | org-RLS | many event tables → retention | N |

---

## 3. Database Audit

| Dimension | Finding | Severity |
|---|---|---|
| Tables | 463 defined — broad, generally well-modeled | — |
| **Type coverage** | **302 typed / 161 untyped (35%); 85 untyped tables actively queried via `as never`** | **Critical** |
| Indexes | 1,168 — healthy; a few new derive-on-read paths need targeted indexes | Medium |
| Foreign keys | 1,071 — good referential integrity; verify `on delete` for tenant deletion | Medium |
| **Views** | **0 views, 0 materialized views in the entire schema** | **High** |
| RLS | 503 policies, 342 org-scoped; ~205/463 tables explicitly enabled (~44%) | High |
| **Storage** | **No `storage.buckets` created in any migration**; buckets (`creative-references`, visual/media) provisioned manually | **High** |
| Migration count | 169 sequential files — squash/baseline candidate | Low |

**Missing schema (net):** a durable **organizational-memory** store; **snapshot** tables for derive-on-read intelligence; a **compute-cache** table; an **Ask ZONO conversation** log; **materialized views** for the heaviest aggregations (market/territory/street). **Missing migrations:** bucket-provisioning migrations; RLS-enable statements for the ~258 unenabled tables (confirm intentional-public first).

---

## 4. Persistence Audit

**Overall persistence ≈ 60%.** Source data persistence ≈ 100% (nothing is lost). *Computed-intelligence* persistence ≈ 15%.

- **Fully persistent:** CRM, Properties, Missions, Agents, Workflows, Platform API, Creative, Distribution, Websites, Portals, Valuation, Whatsapp, Documents, Inventory Acquisition.
- **Derive-on-read (in-memory, not stored):** Digital Twins, Truth Engine, Relationship Graph, Chief of Staff, all `*-agent` scorecards, Orchestrator, Ask ZONO, AI Workspace, Marketing Core, FB Groups Intelligence, Property Marketing Action Center, Market Domination, Street/Building Intel.
- **Proto (no store at all):** **Organizational Memory** — named for durability, persists nothing. *(Critical for the roadmap's "learning" promise.)*

---

## 5. Security Audit

| Item | Finding | Severity |
|---|---|---|
| Multi-tenant RLS | 342 `org_id`-scoped policies — strong on covered tables | — |
| **RLS gaps** | ~258 tables lack explicit `enable row level security`; mostly legacy `brokerage_*`/`agency_*`/reference | **High** |
| **Service-role bypass** | `createClient()` uses service-role for cron/background where **RLS is bypassed and org scoping is app-code-only** — one missing `.eq("org_id")` = cross-tenant leak | **High** |
| Public API | `platform/v1` gateway validates `Authorization` (API key) — good | — |
| Portals | Buyer/Seller portals enforce auth (`403 unlinked`) + redaction — good | — |
| Public sites/area | Redaction layer present by design; must be re-verified for PII (owner names/contacts) | Medium |
| Middleware | `src/middleware.ts` present (auth/redirect) | — |
| Secrets | Service-role key referenced in 5 files — confirm never imported into client bundles | Medium |

---

## 6. Performance Audit

| Item | Finding | Severity |
|---|---|---|
| Parallelism | 156 `Promise.all` — good; only 12 `.map(async` (low N+1 risk) | — |
| **Over-fetch** | **418 `select("*")`** — pulls all columns incl. large JSONB; cost grows with rows | **High** |
| Unbounded reads | ~48 read paths select without `.limit()` | Medium |
| **No caching tier** | Derive-on-read assemblers (AI Workspace, Chief of Staff, **Orchestrator gathers ALL scorecards live**) recompute end-to-end each request | **High** |
| No materialized views | Heavy aggregations (market/territory/street/building) computed in app on every load | High |
| Heavy joins | 0 deep nested selects — joins done in code (fine now, watch at scale) | Low |

## 7. Scalability Audit

| Scale | Assessment |
|---|---|
| **10 users** | No concern. |
| **100** | No concern. |
| **1,000** | Fine; watch `select("*")` and unbounded reads on large orgs. |
| **10,000** | **Concern.** Derive-on-read assemblers + no cache/materialized views → latency and DB CPU climb. Event tables (`*_events`, `automation_run_logs`, `zono_api_audit`) need retention/rollup. |
| **100,000** | **Blocking without action.** Requires: compute-cache + snapshot tables, materialized views for aggregations, targeted indexes, column-scoped selects, and event-table partitioning/retention. |

---

## 8. Technical Debt (severity · effort)

1. **85 `as never` table casts** — Critical · Low effort (regen types). Type safety disabled on those paths.
2. **Zero views/materialized views** — High · Medium. No cache/aggregation tier.
3. **Manual storage buckets** — High · Low. Deployment can't reproduce buckets from code.
4. **Service-role RLS bypass reliance** — High · Medium. Correctness depends on every query remembering `org_id`.
5. **418 `select("*")`** — High · Medium. Over-fetch at scale.
6. **Org Memory has no store** — High · Medium. "Learning" is ephemeral.
7. **169 un-squashed migrations** — Low · Medium. Slow cold provisioning; drift risk.
8. **~258 tables without explicit RLS** — High · Medium. Tenant-isolation ambiguity.
9. **No retention on high-volume event tables** — Medium · Medium. Unbounded growth.
10. **Ask ZONO conversations unlogged** — Medium · Low. No audit/learning substrate.

## 9. Duplication Audit

The **service layer is clean** (27+ modules add no parallel engines — reuse discipline held). Remaining duplication is **inherited schema debt** from Phases 20–26:

- **Four overlapping graph models:** `agency_entity_relationships`, `brokerage_graph_nodes/edges`, `rain_nodes/rain_edges`, `graph_entities/graph_relationships`. — High · High effort to consolidate.
- **Broker intelligence fragmented** across 7 tables (`broker_profiles`, `_market_intelligence`, `_competitive_intelligence`, `_winning_dna`, `_gap_analysis`, `_growth_strategy`, `_ai_coaching`). — Medium · Medium.
- **Territory vs Street/Building** overlap (`territory_*`, `street_territory_profiles`, `agency_territory_stats` vs new street/building intel). — Medium · Medium.
- **Per-channel campaign tables** (`distribution_*` / `facebook_*` / `whatsapp_*`) — intentional, but a unified campaign view is warranted. — Low.

## 10. Missing Infrastructure

Materialized views (aggregations) · snapshot tables (trends) · compute-cache table · org-memory store · Ask-ZONO conversation log · bucket-provisioning migrations · RLS-enable migrations for legacy tables · event-table retention/partitioning · a regenerated typed client + CI drift guard.

## 11. Production Readiness

**~72%.** Operational core ~95%. Intelligence tier ~50% (correct but stateless). Infrastructure ~65% (types/views/buckets/RLS-completeness gaps).

Scores (0–10): **Architecture 7.5** · **Database 7** · **Security 7** · **Performance 6** · **Scalability 6** · **Persistence 6**.

---

## 12. Top 50 Issues (before Phase 35)

*Severity in brackets; C=Critical, H=High, M=Medium, L=Low. Effort: S/M/L.*

1. [C·S] Regenerate `types.ts`; remove 85 `as never` casts.
2. [C·S] Add CI check failing build on a queried-but-untyped table.
3. [H·M] Enable RLS on the ~258 unenabled tables (or mark public explicitly).
4. [H·M] Audit every service-role/cron query for a mandatory `org_id` filter.
5. [H·L] Create bucket-provisioning migrations (`creative-references`, media, documents, logos).
6. [H·M] Introduce `intelligence_snapshots(entity_type, entity_id, kind, payload jsonb, computed_at)`.
7. [H·M] Introduce a compute-cache table (TTL) for Ask ZONO / AI Workspace / Orchestrator.
8. [H·M] Build durable `org_memory` store; wire Organizational Memory to it.
9. [H·M] Replace hot-path `select("*")` with column lists (start with properties, valuations, distribution).
10. [H·M] Add materialized views for market/territory/street/building aggregations.
11. [H·M] Refresh strategy (scheduled) for those materialized views.
12. [M·L] Add `.limit()` + pagination to the ~48 unbounded read paths.
13. [H·M] Load-test Orchestrator (gathers all scorecards) at 10k-row orgs.
14. [H·M] Load-test AI Workspace assembler at scale.
15. [M·L] Persist Ask ZONO conversations (audit + learning).
16. [M·M] Add `computed_at`/freshness to every derive-on-read UI surface.
17. [H·H] Decide canonical graph model; deprecate the other three.
18. [M·M] Consolidate 7 broker-intelligence tables behind one profile.
19. [M·M] Reconcile territory vs street/building tables.
20. [M·M] Retention/rollup for `*_events`, `automation_run_logs`, `zono_api_audit`.
21. [M·M] Partition the largest event/audit tables.
22. [M·S] Verify FK `on delete` behavior for tenant deletion (cascade/orphan).
23. [H·S] Confirm `organization_id` present + indexed on every tenant table brains read.
24. [M·S] Add index `property_transactions(city_name, street, deal_date)` for Street Intel.
25. [M·S] Add index on `distribution_*` hot filters (org_id, status, created_at).
26. [M·S] Re-verify PII redaction on public sites/area portal (owner names, phones).
27. [M·S] Confirm service-role key never bundled to client.
28. [L·M] Squash 169 migrations into a clean baseline + incremental tail.
29. [M·S] Add rate-limit persistence for Platform API (currently in-memory).
30. [M·S] Persist Marketing Core plans/calendars (currently derived).
31. [M·S] Persist agent scorecards as snapshots for trending.
32. [M·S] Persist Truth scores as snapshots.
33. [M·S] Persist Chief-of-Staff org score history.
34. [M·S] Persist competitive positions over time.
35. [L·S] Persist Draft Studio generated drafts consistently.
36. [M·S] Add `schema_version` / contract tests to Platform API.
37. [M·M] Standardize error handling across 110 server-action modules.
38. [L·S] Add DB connection pooling / statement-timeout config review.
39. [M·S] Add observability (slow-query logging) before scale test.
40. [L·S] Document "persisted vs derived" map (this audit is the seed).
41. [M·S] Verify buyer/seller portal token expiry + re-link flow.
42. [L·S] Add caching headers to public site/area routes (SSG/ISR).
43. [M·S] Confirm cron routes are auth-protected (not publicly triggerable).
44. [L·S] Deduplicate any overlapping RLS policies for clarity.
45. [M·M] Backfill snapshots for existing orgs after snapshot tables land.
46. [L·S] Add index-usage review (drop unused among 1,168 indexes).
47. [M·S] Add JSONB GIN indexes where payloads are filtered.
48. [L·S] Normalize migration timestamp naming (some cluster on same day).
49. [M·S] Add health/self-check endpoint summarizing persistence coverage.
50. [L·S] Keep the mock-registry (13 entries) synced; assign owners to the 5 needs-provider items.

---

## 13. Recommended Roadmap Before Continuing Development

**Wave 0 — Safety net (days, no schema change).**
Regenerate the typed client (#1), add the CI drift guard (#2), and audit service-role queries for `org_id` (#4). This alone restores compile-time safety and closes the highest-severity risk.

**Wave 1 — Security & infra completeness (1–2 weeks).**
RLS-enable pass (#3), bucket-provisioning migrations (#5), PII re-verification on public surfaces (#26), FK/`org_id` correctness (#22–24). Makes multi-tenant launch defensible.

**Wave 2 — Persistence tier (2–3 weeks).**
`intelligence_snapshots` (#6), compute-cache (#7), `org_memory` store (#8), Ask ZONO log (#15), freshness columns (#16). Turns the intelligence tier from stateless to durable — unlocks memory, learning, and trends.

**Wave 3 — Performance & scale (2–4 weeks).**
Column-scoped selects (#9), materialized views + refresh (#10–11), targeted indexes (#24–25), event-table retention/partitioning (#20–21), and load tests at 10k (#13–14). Clears the path past 10k orgs.

**Wave 4 — Consolidation (opportunistic).**
Canonical graph model (#17), broker-table consolidation (#18), territory reconciliation (#19), migration squash (#28). Pays down inherited schema duplication.

**Bottom line:** don't add Phase 35 features first. Do **Wave 0 and Wave 1** at minimum — they are low-effort, high-severity, and no-regret. Waves 2–3 convert ZONO from "impressive live demo of intelligence" into "durable, trendable, scalable intelligence." The database and the operational core are already strong enough to build on; the gap is type safety, a persistence/cache tier, and security completeness — not features.
