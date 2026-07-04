# PHASE QA.1 — ZONO Platform Architecture Audit™

**Type:** Pure inspection. No code written, no files modified, no migrations created.
**Scope:** Phases ~28.0 → 34.1 (and the DB foundation they sit on).
**Method:** Static inspection of `supabase/migrations/*` (169 files), the generated client types (`src/lib/supabase/types.ts`), and every `src/lib/<module>` service layer (read/write call patterns, `as never` casts, mock markers).

---

## Headline measurements

| Metric | Value |
|---|---|
| Migration files | 169 |
| Tables defined in migrations | **463** |
| Tables present in the generated TypeScript client | **302** |
| **Schema-vs-types drift** (defined but untyped) | **161 tables (35%)** |
| Drifted tables **actively queried in code** via `as never` | **85** |
| `enable row level security` statements | 205 (~44% of tables carry explicit RLS) |
| `create policy` statements | 503 |
| Indexes (`create index`) | 1,168 |
| Foreign keys (`references …`) | 1,071 |
| Storage bucket references (migrations + code) | 11 (`creative-references` + media) |
| Self-declared mock/stub registry entries | 13 (5 need-provider, 1 schema-only, 7 production-safe) |
| 28.0+ "brain"/agent modules that persist their own output | **0** |

---

## The single most important finding

Every intelligence and agent module built from **28.0 onward is a *derive-on-read* layer**: it computes its output fresh from already-persisted base tables on every request and **writes nothing of its own**. Verified — 0 write calls in each of: Truth Engine, Relationship Graph, Org Memory, Chief of Staff, Digital Twins (buyer/seller/lead), Customer Journey, Agent Orchestrator, Ask ZONO, Draft Studio (generation), Marketing Core, Market Domination, Street/Building Intel, Geo Intelligence, and all `*-agent` scorecard modules.

This is architecturally clean (it's the "reuse-first, no duplication" discipline paying off — no parallel copies of data) but it has three consequences that are *not yet addressed*:

1. **No durable memory / learning.** "Organizational Memory", "learning", and twin "profiles" are recomputed each load. They are memory-*shaped* but not memory-*persisted* unless they route through `zono_missions` / `ai_memory` / `zono_agent_*`.
2. **No snapshots / history.** Scores, health, competitive positions, and dashboards can't be trended over time because yesterday's computation was never stored.
3. **Cost & latency scale with every page load.** Heavy multi-engine assembly (Ask ZONO, AI Home, Chief of Staff, Orchestrator) reruns end-to-end each request; there is no cache table.

The base *is* persisted (properties, buyers, sellers, leads, missions, activities, valuations, distribution_*, transactions, agencies/brokerage_*). So the platform loses no source data — it loses *computed intelligence over time*.

---

## Per-module answers

Legend for the compact matrix (points 1–12 of the brief):
**Persist?** = needs DB persistence · **DB?** = does the DB support it (Y/Partial/N) · **Own tables** = has its own tables · **Writes** = service actually writes · **RLS** = tables RLS-covered · **Typed** = tables in generated client · **In-mem/Mock** = relies on transient or mock logic · **Read-only** = derive-on-read layer · **Not truly persistent** = feature looks saved but isn't.

| Module (phase) | Persist? | DB? | Own tables | Writes | RLS | Typed | In-mem/Mock | Read-only | Not truly persistent |
|---|---|---|---|---|---|---|---|---|---|
| **CRM** (buyers/sellers/leads/deals) | YES | **Y** | buyers, sellers, leads, deals, activities | via base repos | Y | mixed (`buyers`,`deals` untyped) | no | no | no |
| **Digital Twins** buyer/seller/lead (28.1–28.3) | Optional | Partial | — (derives) | **no** | n/a | n/a | derived | **YES** | twin profile not stored |
| **CRM Graph / Customer** (28.4–28.5) | Optional | Partial | reuses graph tables | no | Y | partial | derived | YES | identity resolution recomputed |
| **Truth Engine** (27.7) | Optional | Partial | — | **no** | n/a | n/a | derived | **YES** | truth scores not snapshotted |
| **Relationship Graph** (27.9) | Optional | Partial | graph_entities/relationships exist | no | Y | partial | derived | YES | edges harvested live, not persisted by module |
| **Organizational Memory** (27.8) | **YES (to be real)** | **N (own)** | **none** | **no** | — | — | harvests mission history | **YES** | **"memory" is not persisted** |
| **Chief of Staff** (27.6) | Optional | Partial | — | no | n/a | n/a | derived | **YES** | org score not trended |
| **Agent Framework** (29.1–29.2) | YES | **Y** | zono_agents, _runs, _inbox, _performance, _memory | **yes** | **Y (3 policies)** | untyped (`as never`) | no | no | no |
| **Agent Orchestrator** (29.8) | Optional | Partial | zono_orchestrator_runs/_locks exist | no | Y | partial | gathers scorecards live | **YES** | orchestration result not stored |
| **`*-agent` scorecards** (29.3–29.7) | Optional | Partial | — | no | n/a | n/a | derived | **YES** | scorecards recomputed each load |
| **Workflow Builder** (30.4) | YES | **Y** | zono_workflows, _steps, _history | **yes** | **Y** | untyped | no | no | no |
| **Mission Engine** (27.5) | YES | **Y** | zono_missions | **yes** | Y | untyped | no | no | no |
| **Draft Studio** (30.3) | Partial | Partial | reuses whatsapp_drafts/missions | no | Y | partial | generation in-memory | mostly | generated drafts not always saved |
| **Platform API** (31.0) | YES | **Y** | zono_api_keys, zono_webhooks, zono_api_audit | **yes** | **Y** | untyped | no | no | no |
| **AI Websites** (32.1) | YES | **Y** | agent_websites, office_websites + events/leads | via base | Y | untyped | no | no | no |
| **Agent Site** (32.2) | YES | Y | agent_websites (reused) | via base | Y | untyped | no | partial | no |
| **Buyer Portal** (32.3) | YES | **Y** | client_portals/items + buyers.portal_user_id | reads (auth-scoped) | Y | untyped (`as never`) | no | mostly read | no |
| **Seller Portal** (32.4) | YES | Y | reuses sellers/property tables | reads | Y | untyped | no | mostly read | no |
| **Area Portal** (32.5) | NO (public) | Y | reuses public tables | no | public-read | partial | no | YES (public read) | no |
| **Marketing Core** (33.0) | Optional | Partial | — (reuses `marketing` engine) | **no** | n/a | n/a | derived | **YES** | plan/calendar not persisted |
| **Creative Studio** (pre-33) | YES | **Y** | zono_creative_*, creative_dna_*, `creative-references` bucket | **yes (12)** | Y | untyped | no | no | no |
| **Distribution** (33.x) | YES | **Y** | distribution_* (20+ tables) | **yes (20)** | Y | untyped (14 `as never`) | no | no | no |
| **Facebook Groups** (33.2) | YES | Partial | distribution_groups/_posts (reused) | via distribution | Y | untyped | no | wizard = read+assist | assisted-publish is manual by design |
| **FB Groups Intelligence** (33.4) | Optional | Partial | — | no | n/a | n/a | derived | **YES** | insights recomputed |
| **Property Marketing (Log + Action Center)** (33.1/33.3) | YES | Y | reads distribution_* | no (reads) | Y | untyped (`as never`) | no | YES | log is a read projection |
| **Market Domination** (34.0) | Optional | Partial | — | no | n/a | n/a | derived | **YES** | domination view recomputed |
| **Inventory Acquisition / Street-Building** (34.1) | Optional | Y (reads property_transactions) | inventory_acquisition_* + street/building_intelligence exist | no | Y | partial | derived | **YES** | street/building scores not cached |
| **Ask ZONO** (30.1) | NO | n/a | — | no | n/a | n/a | orchestrates live | **YES** | conversation not persisted by module |
| **Geo Intelligence** | Optional | Partial | reuses market heatmap | no | n/a | n/a | derived + mock fallback | **YES** | layers recomputed |

> Points **13 (technical debt)** and **14 (future migration recommendations)** are answered globally in Sections F, G and J below, since they are cross-cutting rather than per-module.

---

## SECTION A — Database health

**Solid foundation, healthy relational hygiene.** 463 tables, 1,168 indexes and 1,071 foreign keys means the schema is broad and generally well-indexed and referentially linked — this is not a thin prototype DB. RLS exists (503 policies) and every phase-28+ operational table (`zono_missions`, `zono_agents/_runs/_inbox`, `zono_workflows/_steps`, `zono_api_keys/_webhooks`, `client_portals`, `ai_memory`) ships with RLS enabled. The weakness is not the SQL — it's the **client/type layer and the derive-on-read persistence gap**, not the database engine itself.

## SECTION B — Schema completeness

**~90–95%.** The tables the platform needs almost all exist in migrations (including ones the current code doesn't even use yet: `street_intelligence`, `building_intelligence`, `inventory_acquisition_*`, `org_memory`-adjacent structures). The true schema *gaps* are narrow: a dedicated durable **organizational-memory** store, **snapshot/history** tables for the derive-on-read brains, and a **compute cache** table. Call it **92% schema-complete**.

## SECTION C — Persistence completeness

**~60%.** Transactional/operational modules persist correctly (CRM, Missions, Agents, Workflows, Platform API, Creative, Distribution, Websites, Portals). But the **entire 28.0+ intelligence tier persists nothing of its own** (0 writes across 17 modules). Weighted by module count, roughly 40% of the newer surface area is computed-but-not-stored. Source data persistence is ~100%; *computed-intelligence* persistence is ~15%.

## SECTION D — Modules fully production ready

CRM · Mission Engine · Agent Framework (persistence + approval gate) · Workflow Builder · Platform API · Creative Studio · Distribution · AI Websites / Agent Site · Buyer Portal · Seller Portal. These write, are RLS-covered, and survive a refresh.

## SECTION E — Modules partially ready (work as live views, but stateless)

Digital Twins · CRM Graph / Customer · Truth Engine · Relationship Graph · **Organizational Memory (no store at all)** · Chief of Staff · Agent Orchestrator · all `*-agent` scorecards · Marketing Core · FB Groups Intelligence · Property Marketing Log/Action Center · Market Domination · Street/Building Intel · Ask ZONO · Geo Intelligence · Draft Studio. All correct and honest, but recomputed every load and un-trendable.

## SECTION F — Critical missing database pieces

1. **Regenerate the typed client — 161 tables (35%) are invisible to TypeScript; 85 are queried through `as never` casts** that bypass all compile-time safety. This is the #1 risk: a column rename or drop won't be caught by `tsc`.
2. **No `org_memory` persistence table** actually wired — "memory" is ephemeral.
3. **No snapshot/history tables** for Truth scores, Chief-of-Staff org score, competitive positions, twin profiles, street/building recruitment scores → no trending, no "what changed since last week".
4. **No compute-cache table** for expensive multi-engine assemblies (Ask ZONO, AI Home, Orchestrator).
5. **RLS gap:** ~258 tables (mostly older `brokerage_*`, `agency_*`, and reference tables) lack an explicit `enable row level security`; confirm each is intentionally public before launch.
6. **Ask ZONO conversations not persisted** (no audit trail of what the AI was asked/answered).

## SECTION G — Recommended migration order (when development resumes)

1. **Regenerate `types.ts` from the live schema** (removes 85 `as never` casts, restores type safety). *Highest ROI, lowest risk — no schema change.*
2. **RLS audit pass** over the ~258 unenabled tables; enable + policy or explicitly mark public.
3. **`org_memory` durable store** + wire Organizational Memory to write/read it.
4. **Snapshot tables** (`*_snapshots`) for Truth, Chief-of-Staff, competitive, twins, street/building — one generic `intelligence_snapshots(entity_type, entity_id, kind, payload jsonb, computed_at)` can serve most.
5. **Compute-cache table** for Ask ZONO / AI Home / Orchestrator results (with TTL).
6. **Ask ZONO conversation log** table.

## SECTION H — Architecture risks

- **Type-safety erosion (highest):** 85 tables accessed via `as never` — refactors are unguarded; a schema drift ships silently to runtime.
- **"Memory/learning" is a promise, not a fact:** modules named for durability don't persist. A user expecting the system to "remember" will be surprised.
- **Recompute cost/latency** grows with data and with each new engine an assembler pulls in.
- **RLS ambiguity** on legacy tables — multi-tenant isolation must be provably complete before commercial launch.
- **Migration sprawl:** 169 sequential migrations with overlapping intelligence tables (`brokerage_*`, `agency_*`, `broker_*`, `graph_*`, `rain_*`) risk conceptual duplication (see Section I).

## SECTION I — Duplication risks

The reuse-first discipline held well at the *service* layer (28.0+ modules add no parallel engines). The duplication risk is now in the **schema**, from earlier phases:

- **Three overlapping brokerage/agency graphs:** `agency_*` (agencies/branches/agents), `brokerage_*` (offices/agents/graph_edges/graph_nodes), and `rain_nodes/rain_edges` + `graph_entities/graph_relationships`. Four graph representations coexist.
- **Broker intelligence spread across** `broker_profiles`, `broker_market_intelligence`, `broker_competitive_intelligence`, `broker_winning_dna`, `broker_gap_analysis`, `broker_growth_strategy`, `broker_ai_coaching` — candidates for consolidation.
- **Territory tables** (`territory_profiles`, `territory_snapshots`, `territory_dna_profiles`, `street_territory_profiles`, `agency_territory_stats`) overlap with the new street/building intel.
- **Distribution vs facebook_groups vs whatsapp** each carry their own campaign/post/lead tables — intentional per-channel, but worth a unifying view.

No *new* duplication was introduced 28.0+; the debt is inherited from the 20–26 brokerage-intelligence era.

## SECTION J — Top 20 to fix BEFORE continuing development

1. **Regenerate `types.ts`** from the live DB — eliminate all 85 `as never` table casts.
2. Add a CI check that **fails the build if a queried table isn't in the generated types** (prevents drift returning).
3. **RLS audit** the ~258 tables without explicit enablement; document every intentionally-public one.
4. Create a durable **`org_memory`** store and wire Organizational Memory to it.
5. Add a generic **`intelligence_snapshots`** table; snapshot Truth, Chief-of-Staff, competitive, twins, street/building on a schedule.
6. Add a **compute-cache** table (TTL) for Ask ZONO / AI Home / Orchestrator.
7. Persist **Ask ZONO conversations** (audit + learning substrate).
8. Decide and document the **canonical graph model** (collapse `rain_*` / `graph_*` / `brokerage_graph_*` / `agency_entity_relationships` into one).
9. Consolidate the **broker intelligence** tables behind one profile + typed sub-records.
10. Reconcile **territory vs street/building** tables to avoid two answers to "who owns this street".
11. Verify **foreign-key `on delete` behavior** on the 1,071 FKs (orphan/cascade correctness for tenant deletion).
12. Confirm **`organization_id` is present and indexed** on every tenant table the brains read (multi-tenant correctness).
13. Wire the **7 `production-safe` mock-registry** entries toward real providers on a tracked schedule; the 5 `needs-provider` items should each have an owner.
14. Add **`computed_at` / freshness columns** wherever a derive-on-read surface is shown, so the UI can say "as of X".
15. Load-test the **heaviest assemblers** (AI Home, Chief of Staff, Orchestrator) against realistic row counts before launch.
16. Add **indexes for the new derive-on-read read paths** (e.g. `property_transactions(city_name, street, deal_date)` for Street Intel; confirm it exists).
17. Establish a **migration-consolidation checkpoint** — 169 files is a squash candidate for a clean baseline.
18. Define **retention/rollup** for high-volume event tables (`*_events`, `automation_run_logs`, `distribution_*` logs, `zono_api_audit`).
19. Add **`schema_version` / contract tests** for the Platform API so external consumers don't break on internal schema changes.
20. Write a **one-page "what is persisted vs derived" map** (this audit is the seed) and keep it current — it's the missing mental model for anyone extending the platform.

---

### Bottom line

The **database is broad, indexed, and referentially healthy (~92% schema-complete)** and the operational core (CRM, Missions, Agents, Workflows, API, Creative, Distribution, Websites, Portals) is **production-ready**. The gap before continuing is **not more features — it's (a) regenerating the typed client to kill 85 unsafe casts, (b) an RLS completeness pass, and (c) giving the 28.0+ "intelligence brains" a place to persist so memory, learning, and trends become real rather than recomputed.** Fix those three and the platform is genuinely production-grade; add features first and the type-safety and persistence debt compounds.
