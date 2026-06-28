# Brokerage Knowledge Graph & Data Quality — Phase Report

The operational Brokerage Data module is now extended into the permanent
**Knowledge Layer** of ZONO. Strictly additive — no existing table, service,
RLS policy or UI was removed or rewritten. Everything is server-driven,
deterministic, explainable, and exposed as reusable services that future AI
engines query instead of raw tables (single source of truth).

## Database additions (migration `20260804120000_brokerage_knowledge.sql`)
Additive only. Reuses the existing access helpers (`is_zono_owner()`,
`brokerage_city_visible()`).

- `brokerage_offices` **+** `parent_office_id`, `hierarchy_level` (org hierarchy)
- `brokerage_graph_nodes` + `brokerage_graph_edges` — the knowledge graph
  (stable `node_key`; 12 edge types: WORKS_FOR, ACTIVE_IN, PUBLISHED_BY,
  BELONGS_TO, USED_PHONE, HAS_WEBSITE, FOUND_ON_SOURCE, MARKETED_BY,
  CHANGED_OFFICE, COMPETES_WITH, HAS_EMAIL, HAS_SOCIAL)
- `brokerage_completeness` — weighted completeness + missing + suggestions
- `brokerage_duplicate_clusters` + `brokerage_duplicate_cluster_members`
- `brokerage_market_share` (office/network/city/agent/neighborhood scopes)
- `brokerage_data_health_snapshots`
- `brokerage_refresh_diffs`
- `brokerage_coverage` (per city)
- `brokerage_timeline_events`
- `brokerage_relationship_discoveries`

RLS: city-scoped reads for entity-derived knowledge (graph nodes, completeness,
market share, coverage, timeline, clusters, discoveries); owner-only for system
tables (health snapshots, refresh diffs); edges/members visible when their
source node/cluster is. Writes are service-role. Indexes + grants included.

## New pure engines (`src/lib/brokerage-data/knowledge/`, client-safe, no LLM/network)
- `reliability.ts` — source reliability scores + `blendConfidence` (AI factors source trust)
- `completeness.ts` — weighted office/agent completeness, missing fields, enrichment suggestions
- `clusters.ts` — union-find duplicate clustering + master pick + merge recommendation + explanation
- `market-share.ts` — office/network/city share estimate from public-signal volume
- `health.ts` — data-health score + per-city coverage estimate + refresh diff
- `graph.ts` — relational → knowledge graph (deduplicated nodes + edges)
- `explain.ts` — explainable-decision formatter (never a black box)
- **QA: 19/19 pure-engine tests pass.**

## New services / jobs (server-only)
- `knowledge/repository.ts` — RLS-scoped reads + 1-hop `graphAround()` for the explorer
- `knowledge/service.ts` — `recomputeBrokerageKnowledge()` (background job, per-stage
  best-effort) + `getKnowledgeDashboard()` (read model)
- `knowledge/actions.ts` — owner-gated recompute + discovery/cluster review + graph fetch
- Cron `GET /api/cron/brokerage-knowledge` (daily 04:40, CRON_SECRET) → recompute
- Re-exported from `src/lib/brokerage-data/index.ts` (`brokerageKnowledgeEngines`,
  `recomputeBrokerageKnowledge`, `getKnowledgeDashboard`, `knowledgeRepository`).

## Graph architecture
Relational rows → `buildGraph()` → deduplicated nodes (offices, agents, phones,
emails, websites, socials, cities, listings, sources) + typed edges. The
recompute upserts nodes by `node_key`, maps keys→ids, and upserts edges by
(src, dst, type) — idempotent across runs. The explorer reads a 1-hop
neighborhood and expands on office/agent nodes. Future graph queries run on
`brokerage_graph_nodes/edges` without redesign.

## UI (additive, `/brokerage-data`)
`KnowledgeView` renders **below** the existing command center (untouched). Tabs:
Data Health (owner), Completeness (progress bars + missing + tips), Duplicate
Clusters (confidence + merge rec + explanation + member similarity), Market
Share leaders, Coverage (per-city bars), Relationship Discoveries
(accept/dismiss), Graph Explorer (interactive SVG, expand/collapse).

## Performance
- Recompute loads national rows once (capped: 3k offices / 8k agents / 30k
  contacts / 20k links), then streams per-stage with 500-row upsert batches.
- Duplicate clustering is grouped per-city (O(n²) bounded to ≤400 offices /
  ≤600 agents per city) so it scales linearly in the national total.
- Each stage is wrapped best-effort so one failure never aborts the run; a
  refresh-run audit row records the pass. `maxDuration=300s`.

## Files changed
1 migration, 11 new engine/service files, 1 cron route, 1 new UI component,
2 edited files (page.tsx, index.ts), vercel.json. No deletions.

## QA / regressions
- TypeScript: scoped tsc clean on all new + edited files.
- ESLint: clean across `src/lib/brokerage-data/`, the UI, and the cron route.
- Pure engines QA harness: 19/19.
- No existing functionality removed; RLS, owner-vs-city access and audit logging
  preserved; legal-safe public-data model intact (no auto-delete, no overwrite
  without source/confidence/change-log).
- Migration validated by review (sandbox has no Postgres); reuses the exact
  helper/patterns from the already-validated brokerage migration.

## Remaining roadmap (next iterations)
- **Timeline writes**: emit `brokerage_timeline_events` from the sync/identity
  flow and `brokerage_change_log` (currently the timeline reads change history;
  a backfill porter is the next step).
- **Refresh diffs**: persist `brokerage_refresh_diffs` by snapshotting counts
  before/after each refresh (engine `computeDiff` is ready).
- **Materialized views** for the heaviest leaderboards + `graph_nodes.degree`
  maintenance (currently computed on read / left at 0).
- **Project/Developer/Transaction nodes** in the graph (schema supports the node
  types; ingestion hooks pending those data sources).
- **Suggested-master merge execution** (clusters currently recommend + explain;
  one-click merge with full change-log is the follow-up).
- **Org hierarchy auto-build** from `brand_network` + discoveries into
  `parent_office_id` / `hierarchy_level`.
