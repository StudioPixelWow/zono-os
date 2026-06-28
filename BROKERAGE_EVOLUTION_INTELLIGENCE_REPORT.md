# ZONO — Brokerage EVOLUTION INTELLIGENCE™ — Completion Report

The Brokerage Knowledge Layer is now extended with a permanent **historical intelligence engine**. It turns the current-state knowledge graph into a temporal system that tracks how offices, agents, neighborhoods and the market evolve over time. Strictly additive — nothing existing was rewritten.

## What was built (this phase: BEV-1 → BEV-5)

| Layer | File | Role |
|---|---|---|
| Migration | `supabase/migrations/20260805120000_brokerage_evolution.sql` | Temporal backbone — 5 tables, RLS, indexes |
| Pure engines | `src/lib/brokerage-data/evolution/{dna,career,neighborhood,growth}.ts` | Deterministic intelligence (no I/O) |
| Repository | `src/lib/brokerage-data/evolution/repository.ts` | RLS-scoped reads + Time Machine |
| Service | `src/lib/brokerage-data/evolution/service.ts` | `recomputeBrokerageEvolution()` job · `getMarketAtDate()` · `getEvolutionDashboard()` |
| Actions | `src/lib/brokerage-data/evolution/actions.ts` | Owner-gated recompute · RLS-scoped reads |
| Cron | `src/app/api/cron/brokerage-evolution/route.ts` + `vercel.json` | Daily refresh, CRON_SECRET secured |
| UI | `src/app/(app)/brokerage-data/EvolutionView.tsx` | Historical BI dashboard, added below KnowledgeView |

## Architecture

The engine reuses the existing brokerage data + knowledge graph — it adds only the temporal backbone:

- **Snapshots** (`brokerage_entity_snapshots`) are the time axis. Each refresh writes one monthly point-in-time row per office / agent / city (`unique(entity_key, period, period_date)` → idempotent, append-only). History accumulates month over month — that is what makes everything else possible.
- **Evolution events** reuse `brokerage_timeline_events` as the append-only event stream (no new event table).
- Everything flows **raw rows → pure engine → persisted profile**, the same module pattern as the rest of ZONO. UI and future AI agents read the **service**, never raw tables.

## Services added

`recomputeBrokerageEvolution()` — the background job. Loads offices, agents and external-listing links, resolves each linked listing's attributes (property type / price / deal type / city / neighborhood), then, each stage best-effort and isolated:

1. **Snapshots** — monthly metrics per office/agent/city (listings, agents, market share, activity, data quality).
2. **DNA** — `estimateDNA()` per office; per agent it adds `computeCareer()` (experience, stability, growth, expertise) from the agent's monthly activity series.
3. **Neighborhood dominance** — `computeNeighborhoodDominance()` per (city, neighborhood): leader, HHI concentration, competition level, leader share, coverage.
4. **Market DNA** — `computeMarketDNA()` per city: dominant category, competition intensity, luxury concentration, density.
5. **Evolution events** — compares the two most recent snapshots per entity → growth/decline events into the timeline (legal-safe: never asserts "removed").
6. **Predictions** — `predictTrend()` (linear regression + R²) over each entity's accumulated history; emitted only with ≥3 history points and confidence ≥35.
7. **Audit** — records a `brokerage_refresh_runs` row.

`getMarketAtDate(date)` — **Time Machine.** Returns the latest snapshot per entity as of any past date (offices, agents, top offices by inventory). RLS-scoped.

`getEvolutionDashboard()` — read model: growth leaders (office + agent), neighborhood leaders, market DNA, open predictions.

## Historical engine overview

| Capability | Engine | Output |
|---|---|---|
| Office / agent evolution | snapshots + `growth.ts` | rising / declining leaderboards, deltas |
| Agent career | `career.ts` | experience months, career / stability / growth scores, expertise |
| Neighborhood dominance | `neighborhood.ts` (`hhi`) | leader, share, concentration, competition level |
| Office / Agent / Market DNA | `dna.ts`, `neighborhood.ts` | specialization, luxury %, property mix, density |
| Time Machine | `repository.marketAtDate` | market replayed at any past month |
| Prediction layer | `growth.predictTrend` | likelihood + confidence + evidence + explanation |

## QA report

- **TypeScript** — scoped `tsc --noEmit` over all 6 new/changed files: **clean (exit 0)**.
- **ESLint** — all new files: **clean (exit 0)**.
- **Engine QA** — 20/20 deterministic assertions pass: prediction determinism + direction + confidence floor on short series; growth/decline events; HHI bounds (monopoly = 1, duopoly = 0.5, empty = 0); leaderboard split; luxury DNA classification + bounded confidence; empty-DNA floor; career experience/growth; neighborhood leader + share + valid competition level; market DNA dominance + bounded intensity.
- **Regressions** — additive only; no existing file rewritten; new cron registered alongside existing ones.

## Performance & safety

- Bounded reads (offices ≤3k, agents ≤8k, links ≤20k, listing attrs chunked 500/`in()`).
- Batched upserts (500 rows) on unique keys → idempotent, no duplicate growth.
- Per-stage `try/catch` → one failure never aborts the run.
- Background only (cron `50 4 * * *`, `maxDuration=300`, CRON_SECRET bearer auth). No request-path cost.
- **Legal-safe:** public business data only · no auto-delete · no overwrite without source/confidence/change-log · predictions never presented as fact (UI labels every prediction "הערכה בלבד — לא ודאות").
- **RLS preserved:** owner sees national; office/agent users see city-scoped history only (`brokerage_city_visible(city)`).

## Remaining roadmap (optional, future)

- Weekly/daily snapshot granularity (table already supports `period`).
- Office-change / inactive-gap tracking once agent↔office history accrues (career engine already accepts these inputs; currently 0 on first runs — honest).
- Price-trend & volatility once multi-month price history accumulates (fields already in schema, set to 0 until history exists).
- Network-level snapshots (`network` entity type is reserved in the schema).

---

## Supabase SQL — apply this migration

> Apply **after** `20260803120000_brokerage_data.sql` and `20260804120000_brokerage_knowledge.sql` (they create `brokerage_offices`, the timeline events table and the `is_zono_owner()` / `brokerage_city_visible()` helpers this migration depends on).

```sql
-- ZONO — Brokerage EVOLUTION INTELLIGENCE™ (historical layer). Additive.

-- 1) Entity snapshots — periodic point-in-time metrics (the time backbone)
create table if not exists public.brokerage_entity_snapshots (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null,
  entity_id       uuid,
  entity_key      text not null,
  city            text,
  period          text not null default 'month',
  period_date     date not null,
  listings        integer not null default 0,
  agents          integer not null default 0,
  market_share    numeric not null default 0,
  activity        numeric not null default 0,
  data_quality    numeric not null default 0,
  cities_count    integer not null default 0,
  neighborhoods_count integer not null default 0,
  metrics         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (entity_key, period, period_date)
);
create index if not exists bes_key_date_idx  on public.brokerage_entity_snapshots (entity_key, period_date desc);
create index if not exists bes_type_date_idx on public.brokerage_entity_snapshots (entity_type, period, period_date desc);
create index if not exists bes_city_idx      on public.brokerage_entity_snapshots (city);
create index if not exists bes_date_idx      on public.brokerage_entity_snapshots (period_date desc);

-- 2) Entity DNA — dynamic office/agent profile (incl. agent career)
create table if not exists public.brokerage_entity_dna (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,
  entity_id    uuid not null,
  city         text,
  dna          jsonb not null default '{}'::jsonb,
  career       jsonb not null default '{}'::jsonb,
  confidence   numeric not null default 0,
  evidence     jsonb not null default '[]'::jsonb,
  computed_at  timestamptz not null default now(),
  unique (entity_type, entity_id)
);
create index if not exists bedna_city_idx on public.brokerage_entity_dna (city);
create index if not exists bedna_type_idx on public.brokerage_entity_dna (entity_type);

-- 3) Neighborhood dominance
create table if not exists public.brokerage_neighborhood_stats (
  id                uuid primary key default gen_random_uuid(),
  city              text not null,
  neighborhood      text not null,
  leading_office_id uuid,
  leading_agent_id  uuid,
  listing_volume    integer not null default 0,
  avg_price         numeric,
  price_trend       numeric not null default 0,
  activity_trend    numeric not null default 0,
  competition_level text,
  concentration     numeric not null default 0,
  market_share      numeric not null default 0,
  coverage_pct      numeric not null default 0,
  growth            numeric not null default 0,
  dna               jsonb not null default '{}'::jsonb,
  confidence        numeric not null default 0,
  computed_at       timestamptz not null default now(),
  unique (city, neighborhood)
);
create index if not exists bns_city_idx on public.brokerage_neighborhood_stats (city);

-- 4) Market DNA (per city)
create table if not exists public.brokerage_market_dna (
  id                       uuid primary key default gen_random_uuid(),
  city                     text not null,
  dominant_office_category text,
  dominant_property_category text,
  competition_intensity    numeric not null default 0,
  growth_trend             numeric not null default 0,
  luxury_concentration     numeric not null default 0,
  developer_concentration  numeric not null default 0,
  office_density           numeric not null default 0,
  agent_density            numeric not null default 0,
  volatility               numeric not null default 0,
  avg_confidence           numeric not null default 0,
  metrics                  jsonb not null default '{}'::jsonb,
  computed_at              timestamptz not null default now(),
  unique (city)
);
create index if not exists bmd_city_idx on public.brokerage_market_dna (city);

-- 5) Predictions (historical-trend based, never presented as fact)
create table if not exists public.brokerage_predictions (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text,
  entity_id      uuid,
  entity_key     text,
  city           text,
  prediction_type text not null,
  likelihood     numeric not null default 0,
  confidence     numeric not null default 0,
  evidence       jsonb not null default '[]'::jsonb,
  explanation    text,
  horizon_days   integer not null default 90,
  status         text not null default 'open',
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);
create index if not exists bpred_status_idx on public.brokerage_predictions (status);
create index if not exists bpred_type_idx   on public.brokerage_predictions (prediction_type);
create index if not exists bpred_city_idx   on public.brokerage_predictions (city);

-- RLS — owner sees all; office/agent users see city-scoped history only.
alter table public.brokerage_entity_snapshots    enable row level security;
alter table public.brokerage_entity_dna           enable row level security;
alter table public.brokerage_neighborhood_stats   enable row level security;
alter table public.brokerage_market_dna           enable row level security;
alter table public.brokerage_predictions          enable row level security;

drop policy if exists bes_select on public.brokerage_entity_snapshots;
create policy bes_select on public.brokerage_entity_snapshots for select to authenticated using (public.brokerage_city_visible(city));
drop policy if exists bedna_select on public.brokerage_entity_dna;
create policy bedna_select on public.brokerage_entity_dna for select to authenticated using (public.brokerage_city_visible(city));
drop policy if exists bns_select on public.brokerage_neighborhood_stats;
create policy bns_select on public.brokerage_neighborhood_stats for select to authenticated using (public.brokerage_city_visible(city));
drop policy if exists bmd_select on public.brokerage_market_dna;
create policy bmd_select on public.brokerage_market_dna for select to authenticated using (public.brokerage_city_visible(city));
drop policy if exists bpred_select on public.brokerage_predictions;
create policy bpred_select on public.brokerage_predictions for select to authenticated using (public.brokerage_city_visible(city));

grant select on
  public.brokerage_entity_snapshots, public.brokerage_entity_dna, public.brokerage_neighborhood_stats,
  public.brokerage_market_dna, public.brokerage_predictions
to authenticated;
```

After applying: open **דאטה משרדי תיווך** → the new **"מנוע אבולוציה"** panel → click **"חשב אבולוציה מחדש"** to seed the first monthly snapshot. Predictions and growth leaders populate from the **second** monthly run onward (they need ≥2 history points by design).
