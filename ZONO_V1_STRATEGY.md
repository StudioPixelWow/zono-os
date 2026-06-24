# ZONO V1 STRATEGY — The Freeze

_Phase 12 · Product decision document. Not an engineering plan — a "what do customers pay for" plan._
_Lens: SaaS founder + brokerage owner + investor. Question answered: **"What is required for customers to pay?"** — not "what else can we build?"_

---

## The one-sentence thesis

ZONO V1 is **"the AI listing-to-close CRM for Israeli real-estate brokerages"** — get the listing, manage buyers/sellers, generate the marketing, never lose a deal in the pipeline. Everything that doesn't move one of those five needles is cut from V1.

A brokerage owner pays for **fewer lost deals and faster listings**, not for 35 intelligence dashboards. We have built a platform with the surface area of a Series-B product and the paying-feature core of a strong seed product. V1 is the act of **hiding the breadth and selling the core**.

---

## PART A — Feature Inventory (Core / Important / Nice-to-have / Future)

| Module | Route | Classification | Rationale |
|---|---|---|---|
| Properties (listings) | `/properties` | **Core** | The product of a brokerage. Real CRUD, media, marketing kit. |
| Buyers | `/buyers` | **Core** | Demand side of every deal. Real CRUD + matches. |
| Sellers | `/sellers` | **Core** | Listing side. Real 360 + edit. |
| Deals / Pipeline | `/deals` | **Core** | Where money is tracked. Canonical close writer. |
| Matching | `/matches` | **Core** | The "magic": buyer↔property. Differentiator. |
| Creative Studio | `/creative-studio`, `/creative` | **Core** | Marketing generation = daily value, visible ROI. |
| Dashboard (Home) | `/` | **Core** | The daily landing surface; must feel alive. |
| Marketing kit (per property) | within `/properties` | **Core** | Listing → assets in one click. Sells itself. |
| Recommendations | `/recommendations` | **Important** | "What should I do today" — strong retention hook. |
| Command Center | `/command` | **Important** | Owner's cockpit; great for the demo, not day-1 critical. |
| Journeys | `/journeys` | **Important** | Pipeline-adjacent; auto-created, low cost to keep. |
| Communication log | `/communication` | **Important** | Useful, but manual entry today. |
| Documents | `/documents` | **Important** | Deal closing needs docs; manual sign for now. |
| Legal Templates | `/legal-templates` | **Important** | Real Israeli-market value; manual sign. |
| Financing calculators | `/financing` | **Important** | Closing aid; cheap to keep, demos well. |
| Team / agents | `/team`, `/admin/agents` | **Important** | Needed the moment a brokerage (not solo) buys. |
| Distribution (manual) | `/distribution` | **Nice-to-have** | Valuable, but publishing is manual until Meta. |
| Forecast | `/forecast` | **Nice-to-have** | Owner candy; thin without deal volume. |
| Revenue | `/revenue` | **Nice-to-have** | Real but empty until deals close. |
| Transactions (market data) | `/transactions` | **Nice-to-have** | Powerful with Apify key; empty without. |
| Acquisition | `/acquisition` | **Nice-to-have** | Listing-getting engine; depends on transactions/external data. |
| AI Office | `/ai-office` | **Nice-to-have** | Deterministic "brain"; impressive, not paid-for. |
| Routing | `/routing` | **Nice-to-have** | Only matters at multi-agent scale. |
| Territories | `/territories` | **Nice-to-have** | Strategic, not daily. |
| Competitors | `/competitors` | **Nice-to-have** | Interesting, manual data. |
| Reputation | `/reputation` | **Nice-to-have** | Long-tail value. |
| Social Leads | `/social-leads` | **Nice-to-have** | Manual intake today. |
| Relationships ("graph") | `/graph` | **Nice-to-have** | Insight, not a paid job-to-be-done. |
| Office/Agent public sites | `/site`, `/agent` | **Important (sales hook)** | Tangible "you get a website" — strong closer. |
| Portals (client) | `/portals` | **Nice-to-have** | Nice differentiator, not day-1. |
| WhatsApp OS | `/whatsapp` | **Future** | Needs Meta WA API to be real. |
| Communities OS | `/communities` | **Future** | Schema-only; not wired. |
| Broker Intelligence | `/broker-intelligence` | **Future** | Discovery stubs; no provider. |
| Automation | `/automation` | **Future (partial keep)** | Powerful later; keep the rules that fire real tasks. |

---

## PART B — V1 (what must work the day a brokerage pays)

**V1 is the listing-to-close loop + marketing generation. Nine surfaces.**

1. **Properties / Listings** — create, edit, media gallery, publish, per-listing marketing kit.
2. **Sellers** — 360 capture + edit + link to listing.
3. **Buyers** — capture + edit + preferences.
4. **Matching** — buyer↔property matches with the "why", surfaced on buyer & property pages.
5. **Deals / Pipeline** — stages, close (won/lost), real pipeline tracking.
6. **Creative Studio + Marketing Kit** — generate listing creatives/copy (deterministic now; image when a key is added).
7. **Home Dashboard** — real, alive, honest empty states.
8. **Recommendations ("what to do today")** — the daily retention hook.
9. **Team + Auth + Onboarding + Public office/agent site** — multi-agent setup, invites, and the tangible "you get a branded website" closer.

**V1 gating (operational, from Phases 10–11):** apply all migrations, push to `main`, set Supabase env + a labelled demo seed. Without these the V1 surfaces don't reliably load.

**V1 explicitly does NOT promise:** live Facebook/WhatsApp publishing, automated AI agents, e-signature, live market scraping, or live performance analytics. Those are framed as "coming" — never shown as working.

---

## PART C — V1.5 (valuable right after the first paying customers)

Driven by what early customers ask for once the core loop works:

1. **Meta / Facebook API** → real distribution publishing + real impressions/clicks (un-gates Distribution analytics).
2. **WhatsApp Business API** → real inbox/send (Israel runs on WhatsApp — this is the #1 likely request).
3. **Image-generation key wired** → real creative final images (turns Creative Studio from "prompt" to "asset").
4. **Nightly intelligence recompute (scheduled)** → dashboards stay fresh without manual clicks.
5. **Transactions/Apify live data** → real market comps powering Acquisition + Market.
6. **Documents e-signature provider** → close fully inside ZONO.
7. **Advanced automation** (real task firing) → retention + "it works for me overnight".

---

## PART D — V2 (long-term vision / fundraising narrative)

1. **Communities OS** — community discovery + distribution network (the schema exists; the moat story).
2. **Marketplace / cross-brokerage intelligence network** — aggregate signal across orgs (the data-network-effect pitch).
3. **Autonomous agents** — true AI that acts, not just scores (replace deterministic "AI Office" with real agents).
4. **Advanced discovery** — broker/competitor enrichment via external providers.
5. **Deep market intelligence + interactive map/graph visualizations** — the "Bloomberg for Israeli real estate" vision.

---

## PART E — REMOVE / HIDE (be ruthless)

V1 should ship with a **drastically smaller sidebar**. Recommendation: **hide (feature-flag), don't delete** — keep the code, remove it from navigation so the product feels focused and demos tight. Re-expose per tier.

**Hide from V1 navigation (overbuilt for a paying core):**
- **AI Office** — overlaps Command Center + Recommendations; deterministic "brain" sets wrong expectations. (Fold its best output into Recommendations.)
- **Graph / Relationships** — insight, not a job; no visual graph. Hide.
- **Territories, Routing, Competitors, Reputation** — strategic dashboards that are thin without scale/data. Hide until multi-agent customers ask.
- **Communities, Broker Intelligence, WhatsApp, Automation library** — Future/stub; hide entirely until V1.5/V2.
- **Forecast + Revenue** — keep ONE owner KPI strip on the dashboard instead of two separate routes; full pages return when deal volume exists.

**Consolidate (overlapping intelligence — true maintenance burden):**
- Command Center, AI Office, Recommendations, Decision Brain all answer "what should I do." **Pick ONE customer-facing surface: Recommendations** (rename "מה לעשות היום"), feed the others into it. This removes the platform's biggest confusion and maintenance tax.
- Market / Transactions / Acquisition are three doors to "market data." Collapse to one "Market" entry in V1.

**Delete (no customer, pure burden):**
- Legacy dashboard mock components (`components/dashboard/sections/*`) — dead code.
- Any remaining `data/mock.ts` nav skeleton once registry-driven nav is the only source.

Net: from ~35 routes to a **~10-item V1 sidebar**. The other code stays in the repo behind flags — but the customer never sees an empty or "coming soon" screen.

---

## PART F — Revenue Impact Table (1–10: how much does this help ZONO *sell*?)

| Module | Revenue impact | Verdict |
|---|---|---|
| Properties / Listings | **10** | V1 |
| Creative Studio + Marketing Kit | **10** | V1 — most visible "wow", daily ROI |
| Buyers | **9** | V1 |
| Sellers | **9** | V1 |
| Matching | **9** | V1 — the differentiator |
| Deals / Pipeline | **9** | V1 |
| Public office/agent site | **8** | V1 — tangible deliverable, strong closer |
| Recommendations ("today") | **8** | V1 — retention |
| Home Dashboard | **8** | V1 — first impression |
| Team / agents / onboarding | **7** | V1 — required for brokerage (vs solo) |
| Documents + Legal Templates | **6** | V1 (light) — closing trust |
| Financing calculators | **5** | V1 (cheap to keep) |
| WhatsApp (real API) | **9 (when real)** | V1.5 — Israel's channel |
| Distribution + Meta API | **8 (when real)** | V1.5 |
| Transactions / market data | **7 (with key)** | V1.5 |
| Forecast / Revenue | **5** | V1.5 (one KPI strip in V1) |
| AI Office | **4** | Hide → fold into Recommendations |
| Routing / Territories / Competitors / Reputation | **3** | V1.5+ (scale customers) |
| Automation | **5 (when real)** | V1.5 |
| Communities OS | **6 (vision)** | V2 — investor story, not revenue today |
| Broker Intelligence / Graph | **2** | V2 / hide |

---

## PART G — FINAL ANSWER: the 30-day public launch

> **"If ZONO had to launch publicly in 30 days, what would we focus on every single day?"**

**The daily mantra: _"Can a broker get a listing live, marketed, and matched to a buyer — without us in the room?"_** Everything each day serves that sentence.

**Week 1 — Make it deployable & honest (operational, not features).**
Apply all migrations, push `main`, set env, ship a labelled demo seed, hide the non-V1 sidebar behind flags. Every day: pick one V1 surface and prove it loads clean on a fresh DB with seed data.

**Week 2 — Polish the listing-to-marketing loop.**
Properties → media → marketing kit → creative. Every day: run the loop end-to-end as a real broker would; fix the first thing that feels fake, empty, or confusing. Wire one image-gen key so creatives produce real images (biggest "wow").

**Week 3 — Polish buyers/sellers/matching/pipeline.**
Every day: create a buyer + seller + listing, generate matches, move a deal to close, confirm revenue/pipeline reflect it. Tighten empty states and the "what to do today" recommendation.

**Week 4 — Sell it.**
Lock the ~10-item sidebar. Record the demo on the seeded org. Write the one-page pitch: *"List faster, market instantly, never lose a deal."* Onboard 1–3 design-partner brokerages on real data. Every day: watch a real broker use it and remove one point of friction.

**What we do NOT touch in 30 days:** Communities, WhatsApp/Meta APIs, autonomous agents, e-sign, the strategic intelligence dashboards. They are the V1.5/V2 story we *tell*, not the product we *ship*.

**The investor framing:** "ZONO already has the platform breadth of a Series-A roadmap built and data-integrity-clean. V1 monetizes the core listing-to-close loop now; V1.5 lights up the Israeli channel reality (WhatsApp/Facebook); V2 is the cross-brokerage intelligence network." Sell the focused core, demo the depth, fund the network.
