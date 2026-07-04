# ZONO — Master Architecture Map

_Read this to understand ZONO in ~10 minutes. Hebrew RTL real‑estate brokerage
SaaS. Next.js 16 (App Router) + Supabase (Postgres + RLS) + TypeScript._

> **Golden rules for every developer**
> 1. **Audit first, reuse always.** Almost every capability already exists. Search before building.
> 2. **Nothing auto‑executes.** No message is sent, no campaign published, no meeting booked, no CRM lead created without an explicit human approval.
> 3. **Compose, don't recompute.** Higher layers (Daily OS, Executive OS, Automation OS) *consume + explain* lower engines. They never re‑derive a score or duplicate a timeline.
> 4. **Pure core → server service → action → UI.** Business logic lives in pure, unit‑tested modules; services do I/O; actions are the approval surface; UI only renders.

---

## 1. Platform overview
ZONO is an AI operating system for a brokerage office. A thin **engine layer**
(pure logic + Supabase reads/writes) is orchestrated by progressively higher
**OS layers** that assemble one broker‑ or CEO‑facing surface. Everything is
org‑scoped (multi‑tenant) and approval‑gated.

```
Public sites/portals        Broker surfaces            Executive surface
(agent/office/area/landing) (/today /my /calendar…)    (/executive)
        │                          │                         │
        └──────────── consume ─────┴──────── consume ────────┘
                              │
        OS layers: Daily OS · Broker Workspace · Executive OS · Calendar OS ·
                   Automation OS · Territory OS · Marketing/Facebook/WhatsApp OS
                              │  (compose + explain, never recompute)
        Engines: Agents (lead/buyer/seller/listing/office) · Mission Engine ·
                 Workflow Builder · Approval Bundles · Chief‑of‑Staff · Truth/
                 Org‑Memory/Relationship · Digital Twins · Valuation · Distribution
                              │
                         Supabase (Postgres + RLS + Storage + compute cache)
```

## 2. Core domains
CRM (leads/buyers/sellers/properties/deals) · Intelligence (agents, chief‑of‑staff,
decision, truth) · Scheduling (Calendar OS) · Communication (WhatsApp, Facebook,
Draft/Communication Studio) · Marketing/Creative · Distribution (FB groups →
leads) · Public web (websites/landing/portals) · Automation & Approvals ·
Executive intelligence.

## 3. CRM
Tables `leads`, `buyers`, `sellers`, `properties`, `projects`, `deals`, `tasks`,
`meetings`, `notes`, `activities`. Repos under `src/lib/{buyers,sellers,leads…}`.
Entity detail pages: `/buyers/[id]`, `/sellers/[id]`, `/leads/[id]`,
`/properties/[id]` — each composes generic sections (Communication, Relationship,
**EntityCalendarSection**, **ApprovalBundleSection**, Recommendations).

## 4. AI engines
- **Chief‑of‑Staff** (`src/lib/chief-of-staff`): the org‑level brain. Produces
  `organizationScore`, `dashboard.health`, `briefing`, and
  `recommendations.{topPriorities,topRisks,topOpportunities}` from all engines.
  **This is the canonical office score** — do not recompute it elsewhere.
- **Truth Engine / Org‑Memory / Relationship‑Graph** (`src/lib/{truth-engine,…}`):
  evidence, timeline, patterns, CRM graph — consumed by agents & twins.
- **Decision Intelligence**, **Digital Twins** (buyer/seller/lead/customer).

## 5. Agents
`src/lib/{lead,buyer,seller,listing,office}-agent`. Each exposes
`get<Kind>AgentScorecards(orgId)` (health/risk/opportunity/nextBestAction) and is
registered into the Agent Framework. Agents are **read‑only signal producers**;
they never send or write CRM state directly.

## 6. Daily OS (`/today`)
`src/lib/daily-os`. Re‑frames Broker Workspace into a daily timeline + action
feed + briefing. **Consumes** Broker Workspace + Chief‑of‑Staff (cached). Links
to Calendar OS and Automation OS. Owns no scheduling.

## 7. Broker Workspace (`/my`)
`src/lib/broker-workspace`. Aggregates the broker's scorecards, missions, inbox,
workflows, meetings, WhatsApp, Facebook, website, territory, and (46.0)
Automation OS links into one mobile‑first RTL surface.

## 8. Executive OS (`/executive`)
`src/lib/executive-os`. The CEO brain. **Consumes + explains** — never recomputes:
office score/confidence/health/briefing/priorities/risks/opportunities from
Chief‑of‑Staff; calendar health; approval bundles (approval center); Daily OS
timeline; team availability (broker comparison); Automation OS health. Pure
`compose.ts` reuses `cosOverall` verbatim; dimensions with no data source stay
`insufficient` (no fabrication).

## 9. Calendar OS (`/calendar`)
`src/lib/calendar-os`. The **single scheduling engine**. Aggregates existing
sources (meetings, tasks, zono_missions, followups, property_calendar_plans) into
one `CalendarEvent` — no calendar table of its own. Adds: AI day planner, smart
reschedule (proposal only), route optimization, availability, provider
abstraction (Google/Outlook **interface‑only, not connected**), booking
(propose = read; **confirm = explicit action → writes one `meetings` row**),
availability prefs (in `users.settings.calendar`), entity timeline + meeting‑prep
embeds. **Never books automatically.**

## 10. Automation OS (`/automation`)
Already existed as `src/lib/automation` (workflows/runs/analytics/library, runs
stay `pending_review` until `approveRun`). **`src/lib/automation-os` is a thin
unification only** — composes automation health from existing analytics + pending
approval bundles for Executive OS & Broker Workspace. No new engine/table/approval.

## 11. Marketing OS
`src/lib/marketing-core` (+ `market-domination`, `creative-studio`). Campaign
planning/calendar/audiences/budget/analytics. Marketing actions are **proposals/
drafts** — never auto‑published.

## 12. Facebook OS
`src/lib/facebook-home` + `src/lib/distribution` (FB groups → comments → leads).
Manual/assisted import (**no scraping, no Meta‑policy bypass, no auto‑reply**).
Comment→CRM‑lead bridge is approval‑gated with a lifecycle (waiting_for_phone →
phone_received → … → journey_started).

## 13. WhatsApp OS
`src/lib/whatsapp` (inbox, engine, drafts, followups). Unified inbox groups
conversations by CRM entity; AI reply is a **draft that requires approval and is
never auto‑sent**.

## 14. Territory OS
`src/lib/territory-os` + `brokerage-data` (offices/brokers/coverage/competitive).
Territory command center; consumed by Broker Workspace & Executive OS.

## 15. Websites / Portals / Landing
Public (redacted, `noindex` where needed): agent site (`/agent/[slug]`,
`/ai-agent/[slug]`), office site (`/site/[slug]`), area portal (`/area/…`),
landing (`/l/…`). Authenticated portals: **buyer portal** (`/buyer-portal`),
**seller portal** (`/seller-portal`) — session‑scoped, no private CRM leakage.
`src/lib/{agent-site,area-portal,landing,buyer-portal,seller-portal}` all redact.

## 16. Missions / Workflows / Approval Bundles
- **Mission Engine** (`src/lib/mission-engine`): `createMission` defaults to
  `WAITING_FOR_APPROVAL`; `getActionCenter` is the surface.
- **Workflow Builder** (`src/lib/workflow-builder`): `startPersistentWorkflow`
  **dedups** active workflows per entity; steps require approval.
- **Approval Bundle Engine** (`src/lib/approval-bundle`): on an event, composes a
  recommended action bundle (mission/workflow/draft/booking/marketing/fb/landing/
  notification), **deterministic & stateless** (id `event:entityType:entityId`).
  Approval routes to the existing creators; booking/marketing/fb/landing stay
  proposals. Reject cached in compute‑cache. **The only approval system — never build another.**

## 17. Supabase schema groups (see `supabase/migrations/`)
Core/org/roles/users · CRM (leads/buyers/sellers/properties/deals/tasks/meetings)
· Intelligence (agent/brokerage/territory profiles + snapshots) · Distribution
(campaigns/posts/comments/leads/groups) · WhatsApp (`whatsapp_*`) · Automation
(`automation_*`) · Valuation · Documents · Notifications · Websites/portals ·
`zono_missions` / `zono_workflows` · `zono_compute_cache` (derived cache) ·
Storage buckets (documents, property‑media, logos, agent‑photos, office‑assets,
creative‑references, public‑site‑media). **~470 tables; the migrations are
code‑complete** (see `docs/RC_41_9_supabase_verification.sql`). Note: generated
`types.ts` lags (≈85 tables use `as never`) — regenerate from live, don't hand‑edit.

## 18. Public/private boundaries
- **Private** (org‑scoped, RLS): all CRM, agents, calendar, missions, automation.
- **Public** (redacted): agent/office/area/landing sites — no phone/CRM internals.
- **Portal** (auth‑scoped to the linked buyer/seller): only that entity's data.
- Cron routes are secret‑guarded; API keys are scoped; service‑role reads filter by `org_id`.

## 19. Main routes
`/today` Daily OS · `/my` Broker Workspace · `/executive` Executive OS ·
`/calendar` Calendar OS · `/automation` Automation OS · `/action-center` ·
`/notifications` · `/distribution` · `/facebook` · `/whatsapp/inbox` ·
`/marketing-core` · `/territory` · `/properties[/new|/[id]]` · `/buyers[/[id]]` ·
`/sellers[/[id]]` · `/leads/[id]` · `/external-listings/[id]` · `/website` ·
public: `/agent/[slug]`, `/ai-agent/[slug]`, `/site/[slug]`, `/area/…`, `/l/…`,
`/buyer-portal`, `/seller-portal`. All registered in
`src/components/navigation/commandRegistry.ts`.

## 20. Main service folders
`src/lib/<domain>/` with the pattern `types.ts` (+ pure `engine`/`compose`/`core`)
· `service.ts` (server‑only I/O) · `actions.ts` (`"use server"` approval surface)
· `qa.ts` (offline self‑check) · `index.ts` (barrel). UI in
`src/app/(app)/<route>/` and `src/components/<domain>/`.

## 21. Data‑flow diagrams (text)
**New Lead:** `leads` insert → Lead Agent scorecard → Approval Bundle
(`new_lead`) → *approve* → `createMission` + `startPersistentWorkflow` +
WhatsApp draft → surfaces in Daily OS / Broker Workspace / `/leads/[id]`.
**Facebook comment:** manual import → classify → `extractPhone` → **approve** →
`promoteCommentToCrmLead` (writes `leads`, links `distribution_leads`, starts
`lead_qualification` once) → Daily OS.
**External listing:** Yad2/Madlan card → **internal** `/external-listings/[id]` →
acquisition + buyer‑match **WhatsApp drafts** (approval‑gated).
**Calendar booking:** event/free‑slots → `proposeBooking` (read) → **confirm
(explicit)** → one `meetings` row.
**Executive:** Chief‑of‑Staff + calendar health + bundles + daily‑os timeline +
availability + automation health → `composeExecutive` (reuse) → `/executive`.

## 22. Persisted vs derived
- **Persisted:** CRM rows, meetings, tasks, missions (`zono_missions`), workflows
  (`zono_workflows`), distribution comments/leads, whatsapp, notifications,
  automation runs, documents, valuations, website/portal config.
- **Derived (never stored):** Calendar events (aggregated on read), Approval
  Bundles (deterministic, recomputed), Executive OS / Daily OS / Automation‑OS
  view models, agent scorecards. Cached (not owned) in `zono_compute_cache`.

## 23. Approval‑gated
Every write that affects a client or the outside world: promote comment→CRM lead,
create mission, start workflow, WhatsApp/email draft, booking confirm, automation
run approval, bundle approval. Labels in UI: "טיוטה בלבד — לא נשלח אוטומטית",
"דורש אישור", "לא נקבע/מתפרסם אוטומטית".

## 24. Read‑only
Agents, Chief‑of‑Staff, Daily OS, Broker Workspace, Executive OS, Automation OS
health, Calendar aggregation/intelligence, all public sites, portals, territory,
market intelligence. They read + compose; they do not mutate business state.

## 25. What future developers must NEVER duplicate
- **Scheduling** → Calendar OS is the only scheduler.
- **Approvals** → Approval Bundle Engine is the only approval system.
- **Missions / Workflows** → Mission Engine / Workflow Builder only (workflows
  self‑dedup).
- **Office score / health** → Chief‑of‑Staff `organizationScore` only; Executive
  OS reuses it.
- **Automation** → the existing `automation` module; Automation OS only unifies.
- **Notifications** → the `notifications` table + existing insert pattern.
- **Compute cache** → `zono_compute_cache` via `getCache/setCache` only.

_Make ZONO smaller, cleaner, smarter — never bigger through duplication._
