# ZONO Production Readiness Report

_Second full-system audit. Inspection only — no code was modified in this phase._
_Date of audit: 2026-06-24. Scope: every `(app)` route + public routes, services in `src/lib/*`, providers, and DB integration._

> **Method note.** Classifications are grounded in the actual codebase: route inventory under `src/app/(app)/**/page.tsx`, service/repository code under `src/lib/**`, provider stubs, and env-gated integrations. "Real DB" means the route reads/writes Supabase through an RLS-scoped repository. Severity reflects investor/enterprise-demo risk, not engineering effort.

---

## Executive Score

| Dimension | Score |
|---|---|
| **Overall Platform Score** | **6.5 / 10** |
| Frontend Credibility | 8.0 / 10 |
| Backend Readiness | 6.5 / 10 |
| Data Integrity | 8.0 / 10 |
| Investor Demo Readiness | 7.0 / 10 |
| Enterprise Brokerage Readiness | 5.0 / 10 |

**One-line summary:** ZONO is a genuinely real, RLS-scoped, multi-tenant real-estate CRM + deterministic intelligence platform with no fabricated business data remaining in the core surfaces — but it is gated by (a) unrun database migrations, (b) absent external integrations (Meta / WhatsApp / e-signature / image-gen / Apify), and (c) deterministic engines marketed under "AI" language that require manual recompute and seeded data to look alive.

---

## Why the scores are not higher

1. **Several routes will hard-error on a database that hasn't had the latest migrations applied** (legal templates, distribution connections, parts of distribution). This is the single biggest demo risk. Severity: **HIGH**.
2. **Many "AI"/"auto" capabilities are deterministic or manual** — honest, but the naming sets an expectation of live automation that isn't wired (publishing, comms ingestion, image generation). Severity: **MEDIUM**.
3. **Fresh-org experience is empty-state heavy.** Without seeded properties/buyers/deals, the intelligence surfaces correctly show "no data yet" — credible but unimpressive in a cold demo. Severity: **MEDIUM**.
4. **No scheduled recompute for most engines** — intelligence is fresh only after a manual "recompute" click. Severity: **MEDIUM**.

---

## Route-by-Route Classification

| Route | Classification | Evidence / Notes | Severity of gap |
|---|---|---|---|
| `/` (Dashboard) | **PRODUCTION_READY** | `src/lib/dashboard-home/data.ts` real Supabase; mocks removed (PHASE 1). Empty states honest. | — |
| `/properties` (+ `/[id]`, `/new`, `/[id]/edit`) | **PRODUCTION_READY** | Full CRUD, media gallery, seller link, marketing kit, edit=create parity. `src/lib/properties/*`. | — |
| `/buyers` (+ `/[id]`, `/new`, `/[id]/edit`) | **PRODUCTION_READY** | Full CRUD; matches tab wired to real `match_intelligence_profiles` (PHASE 4). `src/lib/buyers/*`. | — |
| `/sellers` (+ `/[id]`, `/new`, `/[id]/edit`) | **PRODUCTION_READY** | Seller 360 CRUD; edit route added (PHASE 5) → `updateSeller360Action`. | — |
| Leads (no `/leads`; `/social-leads`) | **PARTIAL** | Real intent engine + DB (`src/lib/social/service.ts`); but lead intake is manual — no live social ingestion. | MEDIUM |
| `/deals` | **PARTIAL** | `deal_profiles` board real; canonical `deals` writer on close (PHASE 2). Negotiation/objection sub-flows lighter. `src/lib/deals/service.ts`. | MEDIUM |
| `/matches` (+ `/[id]`) | **PARTIAL** | Deterministic match engine over real data (`src/lib/matching-intelligence/service.ts`); requires manual recompute, no scheduler. | MEDIUM |
| `/recommendations` | **PRODUCTION_READY** | Real RecOS engine + DB (`src/lib/recommendations/service.ts`). | — |
| `/recommendations/map` | **PARTIAL** | Real area data, **list not a map** (honestly relabeled "אזורי ביקוש", PHASE 7). | LOW |
| `/command` | **PRODUCTION_READY** | Decision Brain aggregates real property/buyer/seller/match intel. | — |
| `/ai-office` | **PARTIAL** | Deterministic reasoning over a Decision-Brain snapshot; "AI" branding, not an LLM. `src/lib/ai-office/*`. | MEDIUM |
| `/market` | **PARTIAL** | Real `market_area_snapshots` heatmap data; visual is decorative; depends on transactions sync. | MEDIUM |
| `/forecast` | **PRODUCTION_READY** | Deterministic forecast engine over real pipeline. | — |
| `/revenue` | **PARTIAL** | Honest empty states (PHASE 2); realized-revenue KPIs populate only after real deal closes. | LOW |
| `/competitors` (+ `/[id]`) | **PARTIAL** | Real tables + scoring; competitor data entry manual / discovery is a stub. | MEDIUM |
| `/routing` | **PARTIAL** | Real routing engine + agent twins; output sparse without agent/lead data. | MEDIUM |
| `/territories` | **PARTIAL** | Real territory engine; depends on graph + transactions coverage. | MEDIUM |
| `/team` (+ `/[id]`) | **PARTIAL** | Real performance from deals/activity; thin without history. | MEDIUM |
| `/journeys` | **PRODUCTION_READY** | Auto-create on entity creation (PHASE 3); strong empty state; real rows only. | — |
| `/communication` | **PARTIAL** | Real comm logging + intelligence; **no live channel ingestion** — entries are manually logged. | MEDIUM |
| `/reputation` | **PARTIAL** | Real engine; depends on reviews/referrals data that is mostly manual. | MEDIUM |
| `/marketing` | **PARTIAL** | Real marketing engine + DB; some community tables are schema-only. | MEDIUM |
| `/acquisition` | **PARTIAL** | Real acquisition scoring; depends on external-listings sync (Apify = external dependency). | MEDIUM |
| `/transactions` (+ coverage/radar/streets/debug) | **PARTIAL / External Dependency** | Real schema + engines; **live data requires `APIFY_TOKEN`**; dev mock is `NODE_ENV`-gated (`src/lib/transactions/service.ts`). | HIGH (no key) |
| `/distribution` (+ `/daily`) | **PARTIAL** | Real groups/campaigns/queue/comments/leads/automation; **publishing is manual**; Meta analytics gated behind connection (PHASE 6). | MEDIUM |
| `/whatsapp` | **STUB / Honest Manual Flow** | No Meta WhatsApp API; manual assistant; never shows fake "connected/sent". `src/lib/whatsapp/*`. | MEDIUM |
| `/communities` | **COMING_SOON** | ~12 schema-only tables; discovery is a stub. Listed in mock registry. | MEDIUM |
| `/creative`, `/creative-studio`, `/creative-dna` | **PARTIAL / External Dependency** | Full deterministic engines real + persisted; **final image requires provider key** (Nano Banana/OpenAI) else outputs prompt + render object. | MEDIUM |
| `/documents` | **PARTIAL** | Real CRUD + upload + manual sign-lock; **no real e-signature provider**. | MEDIUM |
| `/legal-templates` (+ `/[id]`) | **PARTIAL** | Real verbatim templates + render + audit + manual sign; **depends on a migration that must be run manually**; no e-sign. | HIGH (unrun migration) |
| `/financing` | **PRODUCTION_READY** | Deterministic mortgage/affordability calculators with disclaimers; tax line is a labelled placeholder. | LOW |
| `/admin/system-health` | **PRODUCTION_READY** | Reads real `engine_runs` log; states derived from real timestamps. | — |
| `/admin/data-quality` | **PRODUCTION_READY** | Live Supabase queries; real issue counts. | — |
| `/admin/product-qa` | **Honest Manual Flow** | Manual checklist, relabeled + disclaimer added (PHASE 8). | — |
| `/admin/mock-registry` | **Honest Manual Flow** | Expanded source-of-truth registry (PHASE 8). | — |
| `/admin/permissions` | **PARTIAL / Honest Manual Flow** | Static mirror of RLS policy with runtime disclaimer (PHASE 8); not live access validation. | LOW |
| `/admin/agents` | **PRODUCTION_READY** | Real invites + role management + RLS; auto-join on signup. | — |
| `/broker-intelligence` (+ `/[id]`) | **PARTIAL / STUB** | Real tables + matching; enrichment/discovery/logo are deterministic stubs awaiting external provider. | MEDIUM |
| `/settings/distribution-connections` | **PARTIAL** | Real connection-management table/UI; **depends on a migration that must be run manually**; no real Meta OAuth. | HIGH (unrun migration) |
| `/settings/brand`, `/settings/operating-areas` | **PRODUCTION_READY** | Real brand identity + operating-area persistence. | — |
| Public: `/portal/[token]`, `/site/[slug]`, `/agent/[slug]`, `/w/[slug]`, `/join/[token]` | **PARTIAL → PRODUCTION_READY** | Real assembled public pages from DB; agent/office sites keep the agent's brand. Lead capture real. | LOW |
| Auth: `/login`, `/signup`, `/onboarding` | **PRODUCTION_READY** | Real Supabase auth + 8-step onboarding + org seeding. | — |

---

## Production Ready Features

These are real DB, real CRUD, real workflows, no fabricated data:

- **Authentication & onboarding** — Supabase auth, 8-step wizard, org/role seeding, invite auto-join.
- **Properties** — full lifecycle: create/edit (wizard parity), multi-image media, seller linking, marketing-kit generation, publish.
- **Buyers** — full CRUD + edit; real matched-properties tab.
- **Sellers** — full 360 CRUD + edit flow.
- **Home dashboard** — real intelligence widgets with honest empty states.
- **Journeys** — auto-created from real buyer/seller/lead rows.
- **Recommendations (RecOS)** — real explainable recommendations per entity.
- **Decision Brain (`/command`)** — aggregates real cross-entity intelligence.
- **Forecast** — deterministic pipeline forecast over real deals.
- **Financing calculators** — deterministic, disclaimed.
- **Admin: System Health, Data Quality, Agents** — real engine logs, live data-quality scans, real team management.
- **Multi-tenant RLS isolation** — org scoping enforced at the database layer throughout.

---

## Partial Features (work but missing capabilities)

- **Deals** — pipeline board real; richer negotiation/objection tooling is thin.
- **Matches** — engine real but recompute is manual (no scheduler).
- **Market / Territories / Routing / Team / Competitors / Reputation / Marketing** — real engines, but output quality depends on data volume and manual recompute; thin on a fresh org.
- **AI Office** — deterministic reasoning presented as "AI brain".
- **Communication** — real logging + intelligence, but entries are manually logged (no live channel sync).
- **Distribution** — real group/campaign/queue/comment/lead/automation management; publishing is manual; performance analytics gated on Meta.
- **Creative Studio** — real deterministic creative engines + persistence; final rendered image needs an image-gen key.
- **Documents / Legal Templates** — real document lifecycle + manual signature-lock; no real e-signature; legal templates require an unrun migration.
- **Acquisition / Transactions** — real engines; live external data requires `APIFY_TOKEN`.
- **Social Leads** — real intent scoring + conversion; intake is manual.
- **`/recommendations/map`** — real data, list presentation (no geographic map).

---

## Stubs (honest placeholders awaiting external integration)

- **WhatsApp OS** (`src/lib/whatsapp/*`) — manual assistant; no Meta WhatsApp Business API.
- **Facebook / Meta distribution** (`src/lib/distribution/providers/*`) — manual publish assistant; no Meta Graph/Marketing API.
- **Broker discovery / enrichment / logo** (`src/lib/broker/discovery.ts · enrichment.ts · logo.ts`) — deterministic, evidence-based; no external enrichment provider.
- **Creative final-image generation** (`src/lib/creative-studio/visual-providers/*`) — outputs prompt + render object until an image-gen key is present.
- **Document e-signature** — manual sign-lock; no DocuSign-class provider.
- **OpenAI copy / neighborhood discovery** — optional enhancement over deterministic fallback; gated on `OPENAI_API_KEY`.

---

## Coming Soon (intentional future features)

- **Communities OS** — ~12 schema-only tables (`social_accounts`, `community_metrics`, `community_rankings`, `community_discovery_*`, `distribution_queue`, etc.); UI present, logic future.
- **Visual relationship graph** on `/graph` — currently data/insights; node-link viz labelled "coming later".
- **Interactive map** on `/recommendations/map` and `/market` — currently list/decorative; interactive GIS labelled "coming later".

---

## Remaining Mocks

Per `src/lib/mock-registry/registry.ts` (now the maintained source of truth), there is **no fabricated business data in any production surface**. Remaining items are all gated or schema-only:

- **`txn-dev-mock`** — transactions dev fixtures, `NODE_ENV !== production` gated. Severity: LOW.
- **`nav-mock`** (`src/data/mock.ts`) — legacy nav skeleton, not business data; live nav comes from `navigation/registry`. Severity: LOW.
- **`home-dashboard-legacy`** — legacy `src/components/dashboard/sections/*` (dead code, not wired to `/`). Severity: LOW (code hygiene).
- **`future-social-tables`** — schema-only. Severity: LOW.
- **Visual-provider mock** (`src/lib/creative-studio/visual-providers/index.ts`) — mock image provider, used only when no real key. Severity: LOW.

No `picsum`/`pravatar`/`faker`/random business numbers remain in `src/app` user-facing surfaces.

---

## Broken Flows

These are flows that will not work as a user expects **in an environment where the latest migrations were not applied or keys are absent** — the leading production risk:

- **`/legal-templates`** — depends on `legal_*` tables from a migration that must be run manually in Supabase. If unrun → route errors / empty. Severity: **HIGH**.
- **`/settings/distribution-connections`** — depends on `distribution_provider_connections` (manual migration). If unrun → errors. Severity: **HIGH**.
- **Parts of `/distribution`** — depend on the full distribution migration set being applied. Severity: **MEDIUM-HIGH**.
- **Transactions / Acquisition live data** — non-functional without `APIFY_TOKEN` (falls back to dev mock only in non-prod). Severity: **HIGH** for a live data demo.
- **Creative final image** — no rendered PNG without an image-gen key (returns prompt + render object). Severity: **MEDIUM** (expectation mismatch).

No purely-code BROKEN flows (TypeScript compiles, ESLint clean on touched files); the breakage class here is **environment/migration/keys**, not logic.

---

## Top 10 Remaining Risks (highest → lowest)

1. **Unrun Supabase migrations** (legal, distribution connections, distribution phases). A demo on an un-migrated DB will throw. **HIGH.**
2. **Unpushed commits** — many local commits not pushed to `origin/main`; deploy will not include the fixes. **HIGH.**
3. **External integrations absent** (Meta, WhatsApp, e-sign, image-gen, Apify) — multiple "auto" features are manual/empty without keys. **HIGH.**
4. **Deterministic engines under "AI" branding** — credible but an informed enterprise buyer will probe "is this an LLM?" **MEDIUM-HIGH.**
5. **No scheduled recompute** — intelligence is stale until a manual click; no cron for most engines. **MEDIUM.**
6. **Cold-org emptiness** — without seed data the intelligence surfaces are honest but unimpressive. **MEDIUM.**
7. **No live communication/social ingestion** — comms and social leads are manually entered. **MEDIUM.**
8. **Map/graph expectation gap** — names imply visualization that is list/data (mitigated by PHASE 7 relabeling, but still a gap). **MEDIUM.**
9. **Legal/financial liability surface** — templates + mortgage math + manual "signature" without a certified e-sign provider; needs legal review before enterprise use. **MEDIUM.**
10. **Breadth-over-depth** — ~35 routes; several intelligence modules are thin and overlap, increasing maintenance/QA surface. **LOW-MEDIUM.**

---

## Recommended Next Build Order

### Phase A — Make every route safe to demo (deploy-blocking)
1. Run all pending Supabase migrations (legal, `distribution_provider_connections`, distribution set) and verify each route loads.
2. `git push origin main` — ship the credibility fixes.
3. Add a guarded **demo seed** (clearly labelled, dev/demo-org only) so cold demos show populated intelligence without fabricating production data.
4. Add graceful "feature requires setup" guards to routes that assume a migration/key, so they never hard-error.

### Phase B — Close the highest-value external integrations
1. **Meta Graph/Marketing API** → real distribution publishing + real impressions/clicks (un-gates `/distribution` analytics).
2. **WhatsApp Business API** → real inbox/send.
3. **Image-gen provider key** → real creative final images.
4. **Scheduled recompute** (cron) for the core engines so intelligence stays fresh.

### Phase C — Depth, trust, and enterprise hardening
1. Real e-signature provider for documents/legal.
2. Live communication/social ingestion (replace manual logging).
3. Real interactive map + relationship graph visualizations.
4. Legal/compliance review of templates + financial calculators.
5. Consolidate thin/overlapping intelligence modules; tighten per-module empty/loading states.

---

## Final Verdict

**Can ZONO be safely demonstrated to:**

1. **Individual brokers — YES.** The core daily workflow (properties, buyers, sellers, journeys, recommendations, deals, financing, creative drafts, manual distribution) is real, RLS-isolated, and honest. With a seeded demo org it is compelling. Avoid promising live Facebook/WhatsApp publishing or e-signature.

2. **Small brokerages — YES, with guardrails.** Multi-agent management, invites, roles, and office/agent public sites are real. Demo on a fully-migrated DB with seed data; present distribution/WhatsApp as "manual assistant today, API next", and intelligence as "deterministic engines, recompute on demand".

3. **Large brokerages — NOT YET (conditional).** Enterprise due diligence will surface: unrun-migration fragility, absent integrations, deterministic-vs-LLM "AI" framing, no scheduled automation, and lack of certified e-sign. Safe only as a **roadmap-backed pilot** with explicit "current vs planned" framing — not as a turnkey enterprise platform.

4. **Investors — YES, with honest framing.** The platform genuinely demonstrates real multi-tenant CRM + a broad deterministic intelligence layer + clean RTL UX, and (critically) the credibility fixes mean **nothing fabricates business data**. Pitch it as "real platform, real data integrity, integrations and live-automation are the next funded milestone." Do **not** claim live AI automation, live social publishing, or e-signature are shipped.

**Bottom line:** ZONO is a **real product with strong data integrity and honest surfaces**, sitting at roughly **6.5/10** production readiness. Its credibility risk is no longer fake data — it is **operational readiness** (migrations, pushes, keys, scheduling) and **expectation management** around AI/automation. Resolve Phase A before any external demo.
