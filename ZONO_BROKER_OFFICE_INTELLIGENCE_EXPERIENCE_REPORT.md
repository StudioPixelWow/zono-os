# Phase 26.5.2 — Broker & Office Intelligence Experience™ — Report

Presentation layer only. The Broker Intelligence Engine, MAI, Brokerage Data Platform, Decision Brain, Property Radar, Valuation, AI Coach, database, APIs, realtime and orchestrator were **not** changed, recalculated or duplicated. This phase exposes the intelligence that already exists, beautifully, in a premium "financial terminal" RTL experience.

## What was built

A premium intelligence visual language (`src/components/intelligence/terminal.tsx`) — white surface, dark typography, a single purple accent, luxury spacing — used by three complete profile experiences. Every component is presentational: it renders values the BIE already persisted and never computes. Absent values render as a disclosed em-dash (`—`), never a fake `0`.

### 1. Office Intelligence Profile™ — `/office-intelligence/[officeId]`
Built on the existing per-agency composite `getAgencyIntelligenceAgency(orgId, officeId)` (data categories: `agency_scores`, `agency_territory_stats`, `agency_signals`, `agency_intelligence_reports`, `rain_nodes`). Sections: header + market-status badge (from overall) + confidence; **Office Summary** (performance index, inventory/market share, zone dominance, momentum, growth, market strength, coverage, confidence); **Winning DNA** (market strength / inventory / coverage / luxury / digital / reputation / projects bars + report strengths & weaknesses); **Competition** (threat, threat band, momentum, top signals); **Top Brokers** (graph nodes, click-through to broker profiles); **Coverage** (territory rows → neighborhood links); **AI Coach** (existing report recommendations only — priority, reason, confidence, territory); **Market Activity** (signals); **Historical trend** (report history). 🧠 Why? on the key cards.

### 2. Neighborhood Intelligence™ — `/neighborhood-intelligence/[id]`
Built on the existing `getTerritoryIntelligence(orgId, {city, neighborhood})`; the route id encodes `city|neighborhood`. Shows leader office, competition level, leader dominance/inventory share, active-office count, and the full dominance ranking (per-agency dominance · inventory share · momentum · trend) with office click-through. 🧠 Why?.

### 3. Broker Intelligence Profile™ — `/broker-intelligence/[id]` (enhanced)
The existing functional profile (with its admin actions: enrich / verify / mark-competitor / logo) was **preserved** and enhanced additively with a premium **Intelligence Summary** (data confidence + 🧠 Why?, linked listings, service areas, evidence sources, verification status, type), the office name linked to its Office Intelligence Profile, service areas linked to Neighborhood Intelligence, and **Recent Listings grouped** by lifecycle (active in market vs exited/inactive) — all from existing fields, no recompute.

### 4. Intelligence navigation + hover cards
`EntityLinks` updated: Office → `/office-intelligence/[officeId]`, Neighborhood → `/neighborhood-intelligence/[id]` (never a duplicated screen). `HoverCards` adds premium broker/office quick-profiles on hover (pure CSS, no fetch — the caller passes summary values it already has) with click-through to the full profile.

## Explainability
The 🧠 Why? control everywhere is the existing `WhyButton` (Phase 25.3 explainability infrastructure). It only transports reasons the engines already produced — no new AI, no new reasoning.

## Acceptance criteria
- ✅ Broker profile complete (existing metrics, grouped listings, links, Why).
- ✅ Office profile complete (full BIE composite).
- ✅ Neighborhood profile complete (territory intelligence).
- ✅ Existing BIE data fully visible.
- ✅ No duplicated calculations — every number read from existing repositories/DTOs.
- ✅ No fake values — absent data disclosed as `—`.
- ✅ Explainability available everywhere (existing WhyButton).
- ✅ Full RTL · responsive (grids/tables collapse on mobile).
- ✅ TypeScript clean (scoped `tsc --noEmit`, exit 0).
- ✅ ESLint 0 errors.
- ✅ Zero regressions — engines/DB/APIs/realtime/orchestrator untouched; broker admin actions preserved; profiles read existing RLS-scoped repositories only.

## Nothing to send to Supabase
Presentation-only — no migrations, no SQL, no schema changes.
