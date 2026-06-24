# ZONO System Reality Audit

> Read-only audit. Nothing was changed, fixed, or refactored. Every claim below was traced through `page.tsx → view → server action → service → repository → Supabase`. Findings distinguish three very different things:
> 1. **REAL** — reads/writes real Supabase rows (including *deterministic engines* that compute scores over real rows — that is real, not mock).
> 2. **STUB-BY-DESIGN** — an honest, clearly-labeled placeholder for a third-party integration that isn't connected yet (Facebook / WhatsApp / Meta). Not dishonest.
> 3. **MOCK / HARDCODED** — fabricated, random, or hardcoded data presented to the user as if it were live. This is the category that damages credibility.

---

## Executive Summary

- **Total app routes reviewed:** ~70 authenticated routes under `src/app/(app)/` + 10 public routes. Plus shared views, drawers, forms, and the two dashboard systems.
- **Total mock / hardcoded areas found:** ~14 distinct surfaces. The big ones are concentrated in **two places**: the **home dashboard** and the **⌘K command center**. The rest of the app is far more real than it looks at first glance.
- **Total non-functional / cosmetic actions found:** ~12 (mostly `href="#"` "show all" links, decorative map filters, and a few real server actions with no UI control to trigger them).
- **Biggest credibility risks (the "looks done, isn't" list):**
  1. **The home page (`/`) is mostly fabricated demo data.** KPIs ("23 deals, ₪246K, 142 buyers"), the "needs attention today" list (with fake names + phone numbers), market trends, seller/buyer intelligence cards, the opportunity map, activity timeline, and missions are all hardcoded in `src/lib/dashboard-home/data.ts`. Only 4 surfaces are real (your properties, the featured private-owner opportunity, "deals you can't miss", and competitor threats).
  2. **The ⌘K global command center shows hardcoded business stats** ("142 active properties", "38 active buyers", etc.) in `zono-command-center.tsx`. These are literal strings, never read from the database.
  3. **The `deals` table has no writer.** Nothing in the app ever creates a row in the canonical `deals` table. This silently zeroes out `/revenue` (realized revenue, revenue-by-agent/locality), `/ai-office` deal counts, and weakens `/command` revenue signals. (Note: `deal_profiles` — the deal *execution* board at `/deals` — is a different, fully-real table.)
  4. **`/journeys` is empty by design.** The engine is correct and deterministic, but the `journeys` table is never seeded (`ensureJourneyAction` is called from no UI), so the page renders empty for everyone.
- **What is genuinely real and trustworthy:** Properties (full CRUD + media + AI copy), Buyers, Sellers, Social Leads, Deals execution board, Matches, Documents, Legal Templates, Acquisition, Transactions (Apify GovMap/Madlan), Competitors, Market heatmap, Forecast, Territories, Routing, Recommendations, Decision/Executive Command Center, and the Distribution + Creative engines. These compute over real Supabase data.
- **What is an honest "not connected yet" stub (don't mistake for fake):** Facebook publishing, WhatsApp sending, Meta connection center, comment/lead auto-collection. These are explicitly manual-only and clearly labeled. No code ever fakes a "published" or "sent" success, fabricates analytics, or fakes an AI image.
- **Recommended next 7-day focus:** (1) Replace home-page mock with real intelligence or gate it behind an honest empty state; (2) make the ⌘K stats real or remove the numbers; (3) decide the `deals` ingestion story (either write `deals` rows on deal close, or stop surfacing realized-revenue KPIs); (4) seed `journeys` on property/buyer creation or hide the page; (5) fix the small UX dead-ends (buyer "matches" tab, seller edit, distribution Overview 0-tiles).

**Bottom line:** ZONO's *core CRM and intelligence backend is real and solid.* The credibility risk is almost entirely in the **presentation layer of two pages** (home + ⌘K) plus a handful of empty-by-design tables. Fix those and the product is demonstrably honest.

---

## Page-by-Page Audit

### Home / Dashboard
**Route:** `/` (`src/app/(app)/page.tsx` → `DashboardHomeView`, data from `src/lib/dashboard-home/data.ts`)
**Current Status:** Looks like a fully-populated executive cockpit; is mostly demo content.
**Real Data Status:** **PARTIAL.** Real: your `properties` (woven into hot/journey cards, but padded with `MOCK_PROPERTIES` if fewer than 5 real rows), `featuredProperty` (`externalListingRepository.randomPrivateOpportunity()`), "עסקאות שאסור לפספס" (`getAcquisitionBoard()`), "מי מאיים עליך כרגע?" (`getCompetitorBoard()`). Everything else is hardcoded.
**Mock / Placeholder Items (`src/lib/dashboard-home/data.ts`):** Hero KPI strip `KPIS` (lines ~165); "מה דורש טיפול היום" `ATTENTION` with fake PII like "יוסי לוי 050-1234567" (~125, code has a TODO admitting it); opportunity map `HEAT_ZONES` (~75); radar `OPPORTUNITIES` (~84); in-grid `COMPETITORS` with pravatar avatars (~91); `MARKET_TRENDS` sparkline points (~99); `SELLERS`/`BUYERS` intelligence cards (~107/114); `MISSIONS` (~133); `ACTIVITY` timeline (~141); AI Command Center ring + `dealProbabilityPct:81`; `cityNow` literals (~198). Images via `picsum.photos` / `i.pravatar.cc` (~18-19).
**Non-Functional Actions:** Opportunity-map filter checkboxes (sale/buy/rent/price) and zoom buttons are decorative; AI FAB only deep-links to routes (no AI).
**Missing Backend:** Wire `ATTENTION`/KPIs to the existing real `decision-intelligence` / `seller-intelligence` / `buyer-intelligence` boards (they exist and are real).
**Risk Level:** **P1.** **Priority:** P1.
**Recommended Fix:** Replace each mock section with the real engine output (most already exist on `/command`, `/sellers`, `/buyers`), or show an honest empty state until data exists. Remove fake names/phones immediately.

### Legacy dashboard sections (dead code)
**Route:** none — `src/components/dashboard/sections/*` import `@/data/mock` but are **not rendered by any route**.
**Real Data Status:** MOCK, but **unused** (not shipped to users).
**Risk Level:** P3 (code hygiene). **Recommended Fix:** delete the dead `sections/*` + unused `@/data/mock` business arrays to prevent confusion.

### Sidebar
**Route:** `src/components/dashboard/Sidebar.tsx`
**Real Data Status:** **REAL / clean.** Pure nav config + role gating; no badge counts. **Risk:** P3.

### ⌘K Command Center (global navigator)
**Route:** `src/components/navigation/zono-command-center.tsx`
**Real Data Status:** **HARDCODED.** `SECTIONS` stats are literal strings ("נכסים פעילים 142", "קונים פעילים 38", "עסקאות פעילות 23", "מוכרים בסיכון 3"…) and `AI_INSIGHTS` ("12 הזדמנויות חדשות…"). Navigation links themselves work.
**Risk Level:** **P1** (fabricated counts in the primary global UI). **Recommended Fix:** fetch real counts (cheap `count` queries) or drop the numbers and keep only labels.

### Properties (list)
**Route:** `/properties` (`PropertiesOSView.tsx`)
**Real Data Status:** **PARTIAL.** Inventory list, filters, tabs, pipeline, and the at-risk / needs-marketing counts are REAL (`listProperties`, `property_media`, external listings). The "OS" decoration is hardcoded.
**Mock Items:** `OPPORTUNITIES` (fake buyer-match cards), `MAP_PINS` + "מפת השוק החיה" stats, `MARKET_INTEL` (6 fake insight cards), the `StickyAICopilotPanel` "recent activity" + "2 buyers ready" — all in `PropertiesOSView.tsx`.
**Non-Functional Actions:** `ViewAll` "הצג הכל" links use `href="#"`; "שאל את ZONO" button has no handler.
**Risk Level:** **P2.** **Recommended Fix:** swap decorative widgets for the real buyer-match/market data (exists in `matching-intelligence` / `market`) or label them clearly.

### Property detail / create / edit
**Routes:** `/properties/[id]`, `/properties/new`, `/properties/[id]/edit`
**Real Data Status:** **REAL** (incl. Supabase Storage media + AI copy with deterministic fallback). Create draft → autosave → publish → discard all hit real rows; status/archive actions real. **Risk:** P3.

### Buyers (list / detail / create / edit)
**Routes:** `/buyers`, `/buyers/[id]`, `/buyers/new`, `/buyers/[id]/edit`
**Real Data Status:** **REAL**, except one detail tab. List, board, match counts, command-center writes (touchpoints/commitments/objections/risks/stage/action→task) are all real.
**Non-Functional Actions:** The "התאמות" (Matches) tab in `BuyerDetailView.tsx` (~271) is a hardcoded "בקרוב" placeholder, and the "send properties" CTA + `NextActionButton` deep-link to `?tab=matches`, dead-ending there.
**Risk Level:** **P2.** **Recommended Fix:** wire the Matches tab to the existing recommendation/match data, or remove the CTA that points at it.

### Sellers (list / detail / create)
**Routes:** `/sellers`, `/sellers/[id]`, `/sellers/new`
**Real Data Status:** **REAL** reads + command-center writes.
**Missing UX:** `updateSeller360Action` exists and writes real rows, but **no component imports it and there is no `/sellers/[id]/edit` route** — editing a seller's core 360 profile is unreachable.
**Risk Level:** **P2.** **Recommended Fix:** add a seller edit route/form wired to the existing action.

### Leads
**Route:** `/social-leads` (the "Leads" surface)
**Real Data Status:** **REAL.** Reads `social_leads` + agent intel + followups; recompute/review/convert/followup actions all write real rows. Conversion writes to the canonical `leads` + `buyers` + intel + attribution tables. The real `leads` table is used across office-website, agent-website, portals, routing, team, graph. **Risk:** P3.

### Deals
**Route:** `/deals` (`DealsView.tsx`)
**Real Data Status:** **REAL** (uses the `deal_profiles` / `deal_negotiations` / `deal_objections` / `deal_tasks` / `deal_journeys` family). Board read + recompute + advance-stage + resolve-objection + task-status all wired.
**Non-Functional Actions:** `logNegotiationAction` and `addObjectionAction` are real DB inserts but have **no UI control** in `DealsView.tsx` (unreachable).
**Note:** This is distinct from the **canonical `deals` table**, which has no writer (see DB gap table) and feeds revenue.
**Risk Level:** **P2.** **Recommended Fix:** add UI for log-negotiation / add-objection, or remove the dead actions.

### Matches
**Routes:** `/matches`, `/matches/[id]`
**Real Data Status:** **REAL.** `match_intelligence_profiles` generated deterministically over real buyer/property/seller intelligence; risks/objections/opportunities/stage/action→task all wired. AI summary is a deterministic template (labeled "יתווסף בשלב הבא" for deeper LLM). **Risk:** P3.

### Tasks
**Route:** none (embedded `TasksPanel.tsx` on property + `BuyerTasksPanel.tsx` on buyer)
**Real Data Status:** **REAL** — real `tasks` table + activity log. No global task inbox/list view exists. **Risk:** P3 (functional, but no central task page).

### Calendar
**Route:** **does not exist.** No calendar route, component, or nav entry. **Risk:** **P2** if a calendar is expected in scope; otherwise N/A. **Recommended Fix:** decide if it's in scope; if so it's a net-new build.

### Documents & Legal Templates
**Routes:** `/documents`, `/legal-templates`, `/legal-templates/[id]`
**Real Data Status:** **REAL** incl. Supabase Storage. Documents: create/template/signature-request/record-signature/cancel all real. Legal templates are DB rows (not hardcoded) with create/edit/finalize/sign/duplicate. Signing is intentionally manual (no external e-sign — documented). **Risk:** P3.

### Executive Command Center
**Route:** `/command`
**Real Data Status:** **REAL.** Deterministic `attention_items` + `opportunity_signals` over real property/seller/buyer/match/deal/forecast/comm/market rows, persisted. Inherits the `deals` gap (revenue signals sparse). **Risk:** P3.

### AI Office
**Route:** `/ai-office`
**Real Data Status:** **PARTIAL.** Reasons over real attention/opportunity rows, but `OfficeMetrics.openDeals/wonDeals/lostDeals` count the unfed `deals` table → always 0. **Risk:** **P2.**

### Market Heatmap
**Route:** `/market`
**Real Data Status:** **REAL.** `market_area_snapshots` computed over real external listings/properties/buyers; no `MapMock`, no random. The "map" is a card grid by design; recompute is manual (not scheduled). **Risk:** P3 (P2 only if a geographic map is expected).

### Forecast / Revenue
**Routes:** `/forecast`, `/revenue`
**Forecast:** **REAL** (`deal_forecasts` / `pipeline_snapshots` from real matches/intel; empty until matches exist + recompute).
**Revenue:** **PARTIAL.** Forecast/at-risk/pipeline columns are real, but **realized-revenue KPIs** (current month/quarter/year revenue, recovered revenue, growth rate, revenue-by-agent/locality/type) all derive from the **unfed `deals` table → permanently 0.**
**Risk Level:** Revenue **P1** (headline "הכנסות החודש" always empty).

### Competitors
**Route:** `/competitors`, `/competitors/[id]`
**Real Data Status:** **REAL.** Computed over real `external_listings` (cron-ingested) + brokers + market snapshots. **Risk:** P3.

### Graph (relationship map)
**Route:** `/graph`
**Real Data Status:** **REAL data, PARTIAL viz.** Edges from real FKs + `entity_relationships` (not random). But `GraphView` renders **no node-link graph** — only stats + a table. `localityDna[].buyers` hardcoded `0`; `topAgent` always `null`.
**Risk Level:** **P2.** **Recommended Fix:** build the actual graph viz or rename the page to "relationship insights".

### Recommendations
**Routes:** `/recommendations`, `/recommendations/map`
**Real Data Status:** **REAL data.** `recommendations` / `recommendation_packages` from real match profiles + transactions; comparables gated to real transactions. `/recommendations/map` is a list/table ("מפה גרפית בהמשך"), and `demand_score = count*10` is a synthetic proxy.
**Risk Level:** P3 (list) / **P2** for the "map" label + proxy score.

### Territories / Routing
**Routes:** `/territories`, `/routing`
**Real Data Status:** **REAL** over real transactions/properties/listings/competitors (territories) and real users/leads/deals (routing). `avg_response_minutes` null (no response-time ingestion; degrades gracefully). **Risk:** P3.

### Team
**Route:** `/team`, `/team/[id]`
**Real Data Status:** **REAL data, P2 caveat.** Profiles computed over real users/leads/deals/forecasts/comm. But `lost_revenue_impact` / `expected_revenue_impact` use **hardcoded ₪ coefficients** (`team/service.ts` ~297-320: `count*6000`, `10000`, `8000`…). Leak detection is real; the ₪ figures are heuristic constants presented as money. **Risk:** **P2.**

### Journeys
**Route:** `/journeys`
**Real Data Status:** **MOCK (empty-by-design).** Correct deterministic engine, but the `journeys` table is **never seeded** — `ensureJourneyAction`/`advanceStageAction` exist but are called from no UI/creation hook. Page renders empty. (`deal_journeys`, auto-created by deals, is a different table.) **Risk:** **P1.** **Recommended Fix:** seed a journey on property/buyer creation, or hide the page until wired.

### Communication
**Route:** `/communication`
**Real Data Status:** **REAL** but manual ingestion (agent pastes a message → `ingestCommunication`). No automatic channel feed (by design). Empty until used. `communication_summaries` AI-summary writer — *needs manual verification*. **Risk:** P2 (empty until manual entry).

### Reputation
**Route:** `/reputation`
**Real Data Status:** **PARTIAL/REAL.** Aggregates real reviews/referrals/advocates; recompute wired. Caveats: reviews/referrals are manual-entry only; recompute is not in the engine cron registry; `computeAdvocateScore` uses placeholder constants (`satisfaction:65, relationshipStrength:55`). **Risk:** P2.

### Marketing
**Route:** `/marketing`
**Real Data Status:** **REAL** over real buyers/properties/market snapshots; engine scheduled. Community engagement rests on manually/CSV-seeded values; `growthProxy = log10(members)` heuristic. **Risk:** P2.

### Acquisition
**Route:** `/acquisition`
**Real Data Status:** **REAL.** `inventory_acquisition_profiles` joined to cron-ingested `external_listings`; status/task/promote actions real. **Risk:** P3.

### Transactions
**Routes:** `/transactions` (+ `/radar`, `/streets`, `/coverage`, `/debug`)
**Real Data Status:** **REAL.** `property_transactions` ingested via Apify GovMap/Madlan. `devMockRaws` is gated to dev and **throws in production**; mock rows badged "הדגמה". Needs `APIFY_TOKEN` in prod (UI warns when absent). **Risk:** P3.

### Distribution Center
**Route:** `/distribution`, `/distribution/daily` (+ `_center/*` tabs)
**Real Data Status:** **REAL** for groups, builder, variations, schedule, queue, comments, leads, analytics, automation (9 real `distribution_*` tables, deterministic engines, no random). **STUB-BY-DESIGN** for Publish Assistant (manual, honest amber banner). **PARTIAL** for Overview.
**Non-Functional Actions:** `OverviewSection.tsx` impressions/clicks/CTR tiles read columns **nothing ever writes** → permanently 0 (reads as broken rather than "not connected"). `AiVariationsSection` in-grid "בחר גרסה" is local state only.
**Risk Level:** **P2** (Overview 0-tiles). Rest P3.
**Recommended Fix:** label the Overview tiles "ממתין לחיבור Meta" or hide until the API exists.

### Facebook Connection Center
**Route:** `/settings/distribution-connections`
**Real Data Status:** **STUB-BY-DESIGN (honest).** Connection-management only; stores rows; `validate()` only returns `manual_publish_required`/`not_connected`; "Connect Facebook · בקרוב" button intentionally disabled. **Risk:** P3.

### WhatsApp
**Routes:** `/whatsapp`, `/admin/whatsapp-os/coverage`, public `/w/[slug]`
**Real Data Status:** **STUB-BY-DESIGN (honest).** Full UI + `whatsapp_*` tables; **no real WhatsApp API** — outbound is draft → approval → "סמן כנשלח ידנית". `/w/[slug]` smart-link is real read-only (click tracking). Coverage matrix is a static 86-feature list (~28 marked "built" are deterministic/manual; disclaimed footer). **Risk:** P3 (slightly optimistic "built" labels).

### Communities
**Route:** `/communities`
**Real Data Status:** **PARTIAL (real UI + live tables; outbound manual stub).** Reads/writes real `community_*` / `social_accounts` rows; `connectSocialAccount` stores `manual` status with no token. **Note:** the mock-registry's "future-social-tables / no active UI" claim is now **stale** for the tables this page uses. **Risk:** **P2** (the project's own transparency artifact is inaccurate — update it).

### Creative Studio / Creative DNA / Image Generation
**Routes:** `/creative`, `/creative/new`, `/creative-studio`, `/creative-studio/[entityType]/[entityId]`, `/creative-dna`
**Real Data Status:** **REAL (env-gated, honest deterministic fallback).** Image gen really calls OpenAI `gpt-image-1` (and Gemini "Nano Banana") when `OPENAI_API_KEY` / `GEMINI_API_KEY` + `ZONO_IMAGE_PROVIDER` are set. With no key: an amber banner explains the deterministic fallback, mock visuals are badged "הדגמה", and the **property-ad flow throws an explicit error rather than saving a non-AI "ad"** — no fake success anywhere. Marketing-analysis/concept/copy/Style-DNA are real-AI-with-honest-fallback.
**Missing env:** `OPENAI_API_KEY` and/or `GEMINI_API_KEY` (+ `ZONO_IMAGE_PROVIDER`, `ZONO_MARKETING_ANALYSIS_PROVIDER`). **Risk:** P3.

### Admin pages
- **`/admin/system-health`** — REAL (real `engine_runs` log + live counts). P3.
- **`/admin/data-quality`** — REAL (counts real issues across 8 real tables). P3.
- **`/admin/product-qa`** — **HARDCODED.** `product-qa/status.ts` is 26 hand-authored `status:"pass"` items with a fixed date; presented as a live QA report. **P2.**
- **`/admin/mock-registry`** — REAL render of a **static, under-reporting** registry (5 entries; omits the home-page mock, ⌘K stats, `deals` gap, journeys gap; "future-social-tables" note is stale). **P2.**
- **`/admin/permissions`** — HARDCODED mirror of RLS (no runtime parity check → silent drift). **P2.**
- **`/admin/agents`** — REAL (`users`/`roles`/`org_invitations`). P3.

---

## Mock Inventory Table

| Area | Page | What is Mock | Where in Code | Risk | Priority | Recommended Fix |
|---|---|---|---|---|---|---|
| Home KPI strip | `/` | "23 deals / ₪246K / 142 buyers…" hardcoded | `src/lib/dashboard-home/data.ts` `KPIS` (~165) | High | P1 | Wire to real decision/seller/buyer boards |
| Home "needs attention" | `/` | Fake people + phone numbers | `dashboard-home/data.ts` `ATTENTION` (~125) | High | P1 | Use real `decision-intelligence` attention items; remove fake PII |
| Home opportunity map | `/` | Hardcoded bubbles, not a map | `dashboard-home/data.ts` `HEAT_ZONES` (~75) | Med | P1 | Use real `market_area_snapshots` |
| Home market trends | `/` | Hardcoded sparkline points | `dashboard-home/data.ts` `MARKET_TRENDS` (~99) | Med | P1 | Real market series or remove |
| Home sellers/buyers/missions/activity | `/` | Hardcoded cards + timeline | `dashboard-home/data.ts` `SELLERS/BUYERS/MISSIONS/ACTIVITY` | High | P1 | Real intel boards or empty state |
| Home AI command/forecast rings | `/` | `dealProbabilityPct:81`, `cityNow` literals | `dashboard-home/data.ts` (~198/208) | Med | P1 | Compute from real data |
| ⌘K command stats | global | "142/38/23/3…" literal strings | `navigation/zono-command-center.tsx` `SECTIONS` (~28) | High | P1 | Real `count` queries or drop numbers |
| Properties "OS" widgets | `/properties` | Fake matches/map/market cards | `PropertiesOSView.tsx` `OPPORTUNITIES/MAP_PINS/MARKET_INTEL` | Med | P2 | Real match/market data or label |
| Buyer Matches tab | `/buyers/[id]` | "בקרוב" placeholder | `BuyerDetailView.tsx` (~271) | Med | P2 | Wire to recommendations |
| Graph DNA columns | `/graph` | `buyers:0`, `topAgent:null` | `graph/service.ts` (~185) | Low | P2 | Compute or hide columns |
| Team revenue impact | `/team` | Hardcoded ₪ coefficients | `team/service.ts` (~297-320) | Med | P2 | Derive from real closed deals |
| Reputation advocate score | `/reputation` | Placeholder `satisfaction:65` | `reputation` service (~181) | Low | P2 | Derive from real signals |
| Product-QA report | `/admin/product-qa` | 26 hand-set `status:"pass"` | `lib/product-qa/status.ts` | Low | P2 | Generate from real checks or relabel |
| Permissions matrix | `/admin/permissions` | Static mirror of RLS | `lib/permissions/registry.ts` | Low | P2 | Runtime parity check |
| Mock registry | `/admin/mock-registry` | Under-reports; stale social note | `lib/mock-registry/registry.ts` | Low | P2 | Update to list home/⌘K/deals/journeys |
| Legacy dashboard sections | none | `@/data/mock` business arrays | `components/dashboard/sections/*` | Low | P3 | Delete dead code |
| `MapMock` | none | Fake map component | `components/domain/MapMock.tsx` | Low | P3 | Delete (unused) |
| Distribution Overview tiles | `/distribution` | impressions/clicks/CTR always 0 | `_center/OverviewSection.tsx` | Med | P2 | Label "awaiting Meta" or hide |

## Non-Functional Actions Table

| Action | Page | Button / Feature | Expected Behavior | Current Behavior | Missing Work | Priority |
|---|---|---|---|---|---|---|
| "הצג הכל" links | `/properties` | ViewAll (attention/hot/pipeline) | Navigate to full list | `href="#"` no-op | Real hrefs | P2 |
| "שאל את ZONO" | `/properties` | AI copilot button | Open AI assistant | No onClick | Wire or remove | P2 |
| Send properties / Matches | `/buyers/[id]` | CTA + tab | Show matched properties | Dead-ends on "בקרוב" tab | Wire matches tab | P2 |
| Edit seller 360 | `/sellers/[id]` | (no control) | Edit seller profile | Action exists, no UI/route | Add edit route | P2 |
| Log negotiation / add objection | `/deals` | (no control) | Record negotiation/objection | Actions exist, no UI | Add controls | P2 |
| Map filters / zoom | `/` | Opportunity map controls | Filter/zoom map | Decorative only | Wire or remove | P2 |
| AI FAB | `/` | Floating AI button | AI command | Deep-links only | Real AI or relabel | P3 |
| In-grid "בחר גרסה" | `/distribution` | Variation select | Persist selection | Local state only | Use Schedule Builder | P3 |
| "חבר Facebook" | `/settings/distribution-connections` | Connect button | Connect Meta | Intentionally disabled "בקרוב" | (by design) Meta API | P3 |
| "סמן כנשלח" | `/whatsapp` | Mark-sent | Manual send confirm | Real DB flip (honest) | (by design) WhatsApp API | P3 |
| Global task list | — | (no page) | Central task inbox | Only embedded panels | New page (optional) | P3 |
| Calendar | — | (no page) | Calendar view | Does not exist | New build (if in scope) | P2 |

## Supabase / DB Gap Table

| Feature | Required Tables | Existing Tables | Missing Columns / Policies / Actions | Priority |
|---|---|---|---|---|
| Realized revenue (`/revenue`, `/ai-office`, `/command` revenue signals) | `deals` (canonical) | `deals` exists | **No writer** — nothing inserts `deals` rows; add a "close deal" action that writes `deals` (or repoint revenue at `deal_profiles`) | **P1** |
| Customer journeys (`/journeys`) | `journeys` | `journeys` exists; engine + `ensureJourneyAction` exist | **No seeding trigger** — call `ensureJourneyAction` on property/buyer/lead creation | **P1** |
| Home attention/KPIs | (none new) | `decision-intelligence`, `seller/buyer-intelligence`, `market_area_snapshots` all real | Just **wire the UI** to existing real services | P1 |
| ⌘K stats | (none new) | all entity tables exist | Add `count` queries; no schema change | P1 |
| Distribution impressions/clicks/CTR | `distribution_analytics` | exists | **No writer** for impressions/clicks (needs Meta Insights API) | P2 |
| Communication AI summaries | `communication_summaries` | exists | Verify a writer exists for AI summaries | P2 (verify) |
| Reputation / referrals ingestion | `client_reviews`, `referrals`, `client_advocates` | exist | Manual-entry only; no automated ingestion; recompute not in cron registry | P2 |
| Schema-only social tables | `social_connection_vault`, `community_metrics`, `community_rankings`, `community_network_profiles`, `distribution_queue`, `community_discovery_*`, `broker_discovery_runs` | exist (empty) | No UI/ingestion — keep as "coming soon" or remove | P3 |

## Recommended Build Order

**1. Fix first (P1 — credibility blockers):**
- Replace the **home page** mock sections with real engine output (the engines already exist) or honest empty states; delete the fake names/phone numbers immediately.
- Make the **⌘K command center** stats real (`count` queries) or remove the numbers.
- Decide the **`deals` ingestion** story: add a "close/mark-won deal" action that writes the canonical `deals` table, then `/revenue` + `/ai-office` light up. Until then, hide realized-revenue KPIs.
- Seed **`journeys`** on entity creation (call the existing `ensureJourneyAction`) or hide `/journeys`.

**2. Remove temporarily / relabel (stop showing empty-as-broken):**
- Distribution **Overview** impressions/clicks/CTR tiles → "ממתין לחיבור Meta".
- `/graph` and `/recommendations/map` → rename from "map/graph" to "insights" until the visualization exists.
- `/admin/product-qa` → relabel as a manual checklist, not a live report.

**3. Keep as honest "Coming soon" (already correct — leave as-is):**
- Facebook publishing, WhatsApp sending, Meta connection center, comment/lead auto-collection. These are correctly stubbed and labeled. Just keep the labels.
- The "בקרוב" markers on buyer-matches, creative campaign builder, broker logo auto-detect, financing tax-bracket calculator.

**4. Must connect to real data immediately (highest trust impact):**
- Home dashboard, ⌘K stats, revenue KPIs. These are the three things a first-time viewer sees and judges the product by.

**5. Can stay visual-only for now (low risk):**
- Team/reputation heuristic ₪ coefficients (label them "אומדן"), the marketing growth proxy, recommendations demand proxy — acceptable as estimates if labeled as estimates.

## Final Recommendation

**Be brutally honest:** ZONO is **much more real than a first click suggests, and much faker than it looks on the home screen.** The backend — properties, buyers, sellers, leads, deals execution, matches, documents, legal, acquisition, transactions, competitors, market, forecast, territories, routing, recommendations, the decision/command engines, distribution, and the creative/AI pipeline — is genuinely wired to Supabase with deterministic engines computing over real rows. There is **no dishonest faking** in the integration layer: nothing fakes a Facebook "published", a WhatsApp "sent", fabricated analytics, or a fake AI image. The third-party stubs are honest and clearly labeled.

The damage is concentrated and fixable. **The home page and the ⌘K command center — the two surfaces a new user sees first — are largely fabricated demo data, including fake names and phone numbers.** That single fact will undermine trust faster than anything else in the app, because everything *behind* those pages is real. Add two empty-by-design data gaps (`deals` has no writer → revenue is always 0; `journeys` is never seeded → the page is blank) and you have the complete list of things that will make a sharp viewer doubt the product.

**If you do nothing else before showing this to real users:** de-mock the home page, fix the ⌘K stats, hide or wire the revenue KPIs, and seed or hide journeys. That's roughly a week of focused work against a backend that already exists — and it converts ZONO from "impressive demo with fake numbers" into "honest product that shows real data and clearly marks what's coming soon."

*Items marked "needs manual verification": the `communication_summaries` AI-summary writer, and whether `referrals` has any automated ingestion feeding `/ai-office` and `/reputation`. These were not confirmable from code alone.*
