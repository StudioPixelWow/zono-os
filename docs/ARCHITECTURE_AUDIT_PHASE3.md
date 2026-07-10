# ZONO — Phase 3: Domain Operating-System Audit & Target Architecture

**Author's stance:** written as Chief Software Architect, treating ZONO as a Real-Estate Operating System — not a CRM with features bolted on. Built on the verified findings of Phase 1 (persistence) and Phase 2 (architecture). No code; architecture only.

**The one-sentence diagnosis:** ZONO has excellent *organs* (rich per-domain tables, twins, engines, dashboards) but no *nervous system* — there is no event kernel, so entities are silos that only appear connected because dashboards recompute everything on read. Phase 3 designs the missing kernel and the domain model that would exist if ZONO were built today.

---

## Part I — Per-Entity Operating-System Audit

Each entity is scored on the 10 requested dimensions. Legend: ✅ present · ◐ partial · ✗ missing. "Lifecycle" = create → read → update → state-transition → terminal (close/sold/archived) → delete.

### Property (internal listing)
- **Lifecycle:** ✅ create/draft/publish/status/archive (`properties/*`). ✗ **"Sold" is a bare status flip** with no side-effects and no link to Deal.
- Missing capabilities: no price-history, no listing-version history, no showings log tied to the listing. Missing integrations: not linked to Deal on sale; `zono_score` never computed (shows 70). Missing UI: microsite content not editable. Missing actions: none major beyond sold-linkage. Missing automations: `property_listed`/`price_changed` triggers defined but never fire. Missing AI: listing twin exists (good). Missing reports: per-listing performance report. Missing notifications: price-drop/stale alerts not pushed. Missing persistence: no activity_events on native CRUD.

### External Property (market ingestion)
- **Lifecycle:** ✅ ingest → dedupe → promote-to-Property. ✗ two ingestion pipelines (`external-listings` vs `property-radar`) never reconciled.
- Missing: promotion creates a Property but never a Lead/acquisition pipeline entry; no cross-pipeline dedupe; matches surfaced read-only, never written back to Buyer/Lead.

### Buyer
- **Lifecycle:** ✅ best-modeled entity — create logs timeline + inits intelligence + journey. ◐ `updateBuyerAction` is asymmetric (no re-intelligence/log). ✗ no delete/soft-delete; `portal_user_id` never written.
- Missing: tags; notes compose UI (read-only today); marketing per buyer; buyer-facing reports; conversion-from-lead path.

### Seller
- **Lifecycle:** ◐ create/update rich (Seller-360). ✗ **legacy `properties.seller_id` read by 9+ services but never written** → seller intelligence starved; no status/tags; no notes; no delete.
- Missing: document readiness is a hardcoded stub; no seller acquisition automation; no social-funnel equivalent.

### Lead
- **Lifecycle:** ✗ **write-once** — `stage`/`score` set at insert, never updated (no service, no update UI). 5 independent insert sites, 2 parallel tables (`distribution_leads`, `social_leads`).
- Missing: generic Lead→Buyer/Seller conversion (only social funnel, buyer-only, with an intent bug); re-scoring; stage automation; timeline on Command-Center creation.

### Deal
- **Lifecycle:** ✗ **split-brain** — `deals` (manual, never closes) vs `deal_profiles` (cockpit twin from matches). Manual deals invisible on `/deals`; broken legal-doc FK; no timeline anywhere in `deals/`.
- Missing: unified deal identity; Deal↔Property "sold" linkage; financing signals; days-in-stage (written, never read); notification on close.

### Agent (human user)
- **Lifecycle:** ◐ invite → provision → role/status change (`team-admin`). ✗ no lifecycle timeline (join/deactivate/role-change); deactivation orphans `agent_websites`/leads (no reassignment).
- Missing: unified profile (identity split across `users`/`agent_websites`/`brand_identity_profiles`); offboarding automation; performance reports tied to real events.

### Office (= organization row)
- **Lifecycle:** ◐ create at onboarding. ✗ **no update path for the org core record** (can't rename/rebrand); branding fragmented across 3 unsynced stores.
- Missing: reconciled branding master; publish/activity trail; office-level reporting beyond recomputed dashboards.

### Meeting
- **Lifecycle:** ✗ create only (`confirmBooking`). **No completion/cancel/reschedule action exists at all**; status frozen at `scheduled`; the "meetings scheduled" KPI is stuck at 0 (dead helper).
- Missing: outcome capture, meeting→timeline, meeting→task/followup automation, no-show handling.

### Task
- **Lifecycle:** ✅ create/complete propagates to timeline + journey freshness (best-instrumented after Journey). ◐ `deal_tasks` is a silent 2nd task system.
- Missing: recurring tasks, SLA/escalation automation, assignment notifications.

### Journey
- **Lifecycle:** ✗ **5 systems named "journey"**: `property_journeys` (real) · `journeys`-OS (frozen, advance never called) · `journey-center` (derived read) · `deal_journeys` · `journey-automation` (separate engine). People-journeys never advance from ground truth.
- Missing: single journey spine; journey notes (don't exist); stage overrides; automation on stage change.

### Timeline
- **Lifecycle:** ◐ `activity_events` is the intended spine but **5 parallel logs never unified** (`activities` legacy, `communication_*` unpopulated, `whatsapp_messages`, `document_audit_logs`, `notes` orphaned).
- Missing: unified read model that merges all channels; deals/documents/meetings never write to it.

### Document
- **Lifecycle:** ◐ two full stacks (`documents/*` and `legal_*`), both with real list-back. ✗ never on the unified timeline; mutually invisible.
- Missing: one document spine; e-sign provider; document events → notifications/exec KPIs.

### Signature
- **Lifecycle:** ◐ two manual signature tables (`document_signatures`, `legal_document_signatures`), mutually invisible, none on timeline. ✗ no e-signature provider.
- Missing: unified signature ledger; signed→deal/journey propagation; audit surfaced to user.

### Website
- **Lifecycle:** ✅ single schema truth (`agent_websites`/`office_websites`); publish works. ✗ **4 renderer stacks** (`/agent`,`/site`,`/ai-agent`,`/ai-site`); AI stacks capture no leads; analytics only on classic; theme/featured editable only via the separate builder.
- Missing: one renderer per type; lead capture + analytics on all; website ← WhatsApp/Facebook wiring.

### Marketing
- **Lifecycle:** ✗ **3 stacks** — `marketing` (real community/segments) · `marketing-core` (persists nothing behind an "approval" UI) · `creative-studio`/`zono_campaigns`. Stacks 1↔3 never reconciled.
- Missing: campaign persistence + approval audit; per-entity marketing (buyer/seller nurture); attribution back to Deals.

### Automation
- **Lifecycle:** ◐ real approval engine (`automation_workflows`, runs, reversible) but **manual-run only** — 0 entity events trigger it; `trigger_type` values inert. 2nd engine (`journey_workflows`) with orphaned dispatch.
- Missing: event→trigger wiring; scheduling; one automation engine.

### WhatsApp
- **Lifecycle:** ✅ rich (accounts/conversations/messages/drafts/campaigns). ◐ 3 conversation-resolvers, 2 connection readers; command-center read bug on multi-row; real Cloud send action unwired.
- Missing: unified conversation resolver; raw history → unified timeline; connection → website widget; message events → automation/notifications.

### Facebook
- **Lifecycle:** ◐ connect/scan/import persists; disconnect works. ✗ extension umbrella status org-global (brokers overwrite each other); `distribution/channels/*` adapter layer fully dead.
- Missing: per-user extension status; connect event → timeline; comment→lead is one bridge only.

### Calendar
- **Lifecycle:** ✅ correct as a pure read-aggregate over meetings/tasks/missions/followups. ✗ no external calendar sync (Noop connectors); no availability UI (backend exists).
- Missing: two-way Google/Outlook sync; booking pages; reminders.

### AI (memory + twins + reasoning)
- **Lifecycle:** ◐ twins recompute on read (fine); `ai_memory` manual-only, never read by reasoning; durable `zono_org_memory*` orphaned; Ask ZONO never persisted.
- Missing: a memory actually consumed by reasoning; event→memory ingestion; conversation persistence; a single "AI context" assembler.

### Knowledge Graph
- **Lifecycle:** ◐ `entity_relationships` written from deals/transactions/social (live); `graph_*` rebuilt on a **24h rescan** → new buyers/sellers invisible until then. 5 graph systems.
- Missing: incremental graph updates on entity events; one graph substrate; graph as a first-class query surface for AI.

---

## Part II — Capability Matrix (Entity × Platform Capability)

Does each entity support each of the 12 platform capabilities today? ✅ real · ◐ partial/lazy · ✗ missing. The **Why** column after the matrix explains the systemic causes.

| Entity | Timeline | Docs | Comms | Calendar | Autom. | Mktg | AI | Graph | Notif | Reports | Search | Website |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Property | ◐ | ✅ | ◐ | ◐ | ✗ | ◐ | ✅ | ◐ | ✗ | ◐ | ✅ | ✅ |
| External Property | ◐ | ✗ | ✗ | ✗ | ✗ | ◐ | ◐ | ◐ | ✗ | ◐ | ✅ | ◐ |
| Buyer | ✅ | ◐ | ◐ | ◐ | ✗ | ✗ | ✅ | ◐ | ✗ | ◐ | ✅ | ✗ |
| Seller | ✅ | ◐ | ◐ | ◐ | ✗ | ✗ | ◐ | ◐ | ✗ | ◐ | ✅ | ✗ |
| Lead | ✗ | ✗ | ◐ | ✗ | ✗ | ◐ | ◐ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Deal | ✗ | ✅ | ✗ | ◐ | ✗ | ✗ | ◐ | ◐ | ✗ | ◐ | ✗ | ✗ |
| Agent | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ◐ | ◐ | ✗ | ◐ | ✅ | ✅ |
| Office | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ | ◐ | ◐ | ✗ | ◐ | ✗ | ✅ |
| Meeting | ✗ | ✗ | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Task | ✅ | ✗ | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Journey | ✅ | ✗ | ✗ | ✗ | ◐ | ✗ | ◐ | ◐ | ✗ | ◐ | ✗ | ✗ |
| Timeline | — | ✗ | ◐ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Document | ◐ | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Signature | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Website | ◐ | ✗ | ◐ | ✗ | ✗ | ◐ | ✅ | ✗ | ✗ | ◐ | ✗ | — |
| Marketing | ✗ | ✗ | ◐ | ◐ | ◐ | — | ◐ | ✗ | ✗ | ◐ | ✗ | ◐ |
| Automation | ◐ | ✗ | ✗ | ✗ | — | ✗ | ✗ | ✗ | ◐ | ◐ | ✗ | ✗ |
| WhatsApp | ◐ | ✗ | ✅ | ◐ | ✗ | ◐ | ◐ | ✗ | ✗ | ◐ | ✗ | ✗ |
| Facebook | ✗ | ✗ | ◐ | ✗ | ✗ | ✅ | ◐ | ✗ | ✗ | ◐ | ✗ | ✗ |
| Calendar | ◐ | ✗ | ✗ | — | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ |
| AI | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ | — | ◐ | ✗ | ◐ | ✗ | ✅ |
| Knowledge Graph | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✅ | — | ✗ | ◐ | ✗ | ✗ |

### Why capabilities are missing (systemic root causes, not per-cell accidents)

1. **Notifications column is ✗ almost everywhere** — because there is no event→notification path. The 3 real notice producers write to an orphaned table; the Attention Center only recomputes signals. *Root cause: no event kernel.*
2. **Automation column is ✗ almost everywhere** — `trigger_type` metadata is never matched to real events; the engine is manual-run. *Root cause: no event kernel.*
3. **Search column is ✗ for Lead/Deal/Document/Meeting/Task** — search is a live multi-table query hard-wired to properties/buyers/sellers/broker/competitor/external/users; anything not in that query is unsearchable. *Root cause: no search-index projection; search is an ad-hoc union, not a capability every entity plugs into.*
4. **Comms column is ◐/✗** — WhatsApp has raw history but it never lands in the unified `communication_*`/timeline; email/SMS don't exist; comms are per-channel silos. *Root cause: no communications spine; channels write their own tables.*
5. **Timeline ✗ for Deal/Meeting/Document** — those domains simply never call `logActivityEvent`. *Root cause: timeline is opt-in per action, not a kernel guarantee.*
6. **Reports column is ◐ everywhere** — reporting exists only as recomputed executive/decision dashboards; there is no per-entity report surface or export. *Root cause: no reporting/read-model layer; "reports" = whatever a dashboard recomputes.*
7. **Docs/Calendar/Marketing/Website are entity-specific, not universal** — each was built for the entity that needed it first (Docs for Deals, Website for Agent/Office, Marketing for Property/Community), so other entities can't reuse them. *Root cause: capabilities were implemented as features, not as horizontal services every entity subscribes to.*

**The matrix is mostly a picture of two missing horizontal layers: an Event Kernel and a set of Capability Services** (Timeline, Comms, Notifications, Search, Reports, Automation) that every entity plugs into. Where a capability is ✅, it's because that one entity got a bespoke build.

---

## Part III — Lifecycle Matrix

Per entity: is each lifecycle phase present, and does it **propagate**? (C=create, R=read, U=update, S=state-transitions, T=terminal/close, X=delete/archive, P=propagation on change)

| Entity | C | R | U | S | T | X | P (propagates?) |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Property | ✅ | ✅ | ✅ | ✅ | ◐ sold=flip | ✅ archive | ✗ no events |
| External Property | ✅ | ✅ | ✅ | ✅ | ✅ promote | ✗ | ◐ on promote |
| Buyer | ✅ | ✅ | ◐ | ✗ no stages | ✗ | ✗ | ◐ create only |
| Seller | ✅ | ✅ | ✅ | ✗ | ✗ | ✗ | ◐ create/update |
| Lead | ✅ | ✅ | ✗ frozen | ✗ | ✗ convert (social only) | ✗ | ✗ |
| Deal | ✅ | ✅ | ✅ | ✅ | ✅ close | ✗ | ✗ no timeline |
| Agent | ✅ | ✅ | ✅ | ✅ role/status | ✗ offboard | ✗ | ✗ |
| Office | ✅ | ✅ | ✗ core | n/a | n/a | ✗ | ✗ |
| Meeting | ✅ | ✅ | ✗ | ✗ frozen | ✗ complete | ✗ | ✗ |
| Task | ✅ | ✅ | ✅ | ✅ | ✅ complete | ✗ | ✅ |
| Journey | ✅ | ✅ | ◐ | ◐ (property only) | ✗ | ✗ | ◐ property only |
| Document | ✅ | ✅ | ✅ | ✅ | ✅ signed | ✗ | ✗ own log only |
| Signature | ✅ | ✅ | n/a | n/a | ✅ | ✗ | ✗ |

**Pattern:** creation is universally present; **update/state-transition/terminal/propagation degrade sharply** the further an entity is from the core CRM. Lead and Meeting are the worst — effectively insert-only. Propagation is ✅ for exactly two entities (Task, and Property-journey).

---

## Part IV — Event Matrix (condensed from Phase 2)

18 business events × the propagation they *should* trigger. ✅ wired · ◐ lazy-on-read · ✗ missing.

| Event | DB | Timeline | Autom. | Notif | AI | Exec KPI | Search | Calendar | Website | Mktg |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Buyer Created | ✅ | ✅ | ✗ | ✗ | ✅ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Seller Created | ✅ | ✅ | ✗ | ✗ | ✅ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Property Created | ✅ | ✗ | ✗ | ✗ | ◐ | ◐ | ✗ | ✗ | ◐ | ◐ |
| External Imported | ✅ | ✅ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ◐ | ◐ |
| Lead Created | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Lead Converted | ◐ | ◐ | ✗ | ✗ | ◐ | ◐ | ✗ | ✗ | ✗ | ◐ |
| Meeting Created | ✅ | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✅ | ✗ | ✗ |
| Meeting Completed | ✗ no action | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Task Completed | ✅ | ◐ | ✗ | ✗ | ◐ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Document Sent | ✅ | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Document Signed | ✅ | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Deal Created | ✅ | ✗ | ✗ | ✗ | ◐ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Deal Closed | ✅ | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Property Sold | ✅ | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ◐ | ✗ |
| Journey Advanced | ✅ | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Facebook Connected | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| WhatsApp Connected | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

Columns Automation / Notification / Search are ✗ for **every** event. This is the single clearest argument for the kernel.

---

## Part V — Target Architecture (if built today)

### V.1 Canonical Domain Model

Three concentric rings. Everything below is *one* canonical concept — no duplicates.

**Ring 0 — Tenancy & Identity**
- `Organization` (the tenant; = Office). One record; must be updatable; owns branding via a single `BrandProfile`.
- `User` (= Agent; role-based). One identity; website/brand are *projections*, not copies.

**Ring 1 — Core Business Entities** (each an aggregate root with a lifecycle state machine)
- `Property` (internal) ← projection/promotion from `ExternalListing` (ingestion source, kept distinct).
- `Contact` — **one person table** with roles {Buyer, Seller, Lead}. A person can be buyer *and* seller; role is an attribute + a `Party` link, not three duplicate rows. (Today Buyer/Seller/Lead are separate tables with broken conversions — the single biggest domain-model fix.)
- `Deal` — **one** deal aggregate (merges today's `deals` + `deal_profiles`), linked to Property + Parties, with a real stage machine and a terminal `won/lost` that syncs Property→sold.
- `Journey` — **one** lifecycle-stage aggregate per Party/Property (merges `property_journeys` + people-journeys), advanced by events.

**Ring 2 — Interaction & Artifact Entities** (attach to Ring 1 via polymorphic `subject_ref`)
- `Activity` (the timeline event — the spine), `Task`, `Meeting`, `Document` (+ `Signature` as a sub-ledger), `Communication` (channel-agnostic: WhatsApp/Email/SMS/FB), `Note`.

**Ring 3 — Horizontal Capability Services** (not entities — services every entity subscribes to)
- Timeline · Communications · Calendar · Documents · Automation · Marketing · Notifications · Search · Reports · Website · AI/Knowledge-Graph.

### V.2 Entity-Relationship Model (target, essential edges)

```
Organization 1───* User
Organization 1───* Property ─── promoted_from ─ ExternalListing
Organization 1───* Contact (roles: buyer|seller|lead)     Contact *─── Party ───* Deal
Property *──── Party (seller side) ───* Contact
Deal *──1 Property        Deal 1───* Document ──1 Signature-ledger
Deal 1───* Journey-stage-events        Party 1───* Journey (per contact)
{Property|Contact|Deal|Party}  1───*  Activity        (polymorphic subject_ref)
{...same...}                    1───*  Task | Meeting | Communication | Note
User 1───1 BrandProfile ──1 Website(agent)     Organization 1───1 BrandProfile ──1 Website(office)
KnowledgeGraph  ◄── projected from ── Activity + Party + Deal (incrementally)
```

Key differences vs today: **one Contact instead of Buyer/Seller/Lead**; **one Deal**; **one Journey**; **BrandProfile as the single branding master**; artifacts attach polymorphically so every entity gets Timeline/Docs/Comms "for free."

### V.3 Recommended Kernel Architecture

The missing nervous system. Five layers:

**1. Command layer (write side).** Every mutation goes through a typed *command* (`CreateBuyer`, `CloseDeal`, `CompleteMeeting`). Server actions become thin adapters over commands. This is where validation, RLS, and transactions live.

**2. Event kernel (the core).** Every command, after its transactional write, emits a typed **domain event** (`buyer.created`, `deal.closed`, `property.sold`, `meeting.completed`) to a single dispatcher — `emitBusinessEvent(event)`. Events are persisted to an append-only `domain_events` log (also the audit trail and the timeline source). This is the one thing ZONO does not have and needs most.

**3. Subscriber/capability layer.** Horizontal services subscribe to event types and react:
- **Timeline** ← every event (append `Activity`).
- **Automation** ← events matched against `trigger_type` (finally live).
- **Notifications** ← events → per-user feed (retire the orphaned table).
- **Search index** ← upsert a projection row per entity.
- **Knowledge Graph** ← incremental edge upsert (no more 24h rescan).
- **AI Memory** ← ingest salient events into a memory reasoning actually reads.
- **Journey** ← advance stage on qualifying events.
- **Marketing/Website/Calendar** ← side-effects (nurture, revalidate, reminders).

Subscribers run inline for critical ones (timeline, journey) and async (queue) for the rest — but the *contract* is uniform.

**4. Read-model / projection layer.** Dashboards (Executive, Journey Center, Command Center) read from **projections** maintained by subscribers, not from live recomputation. `decision-intelligence` (already event-driven) becomes the template for all of them; executive-os/chief-of-staff/business-intelligence collapse into views over it.

**5. Capability SDK.** A small interface each entity implements once (`subjectRef`, `title`, `searchDoc`, `timelineLabel`) so Timeline/Docs/Comms/Search/Notifications work for *every* entity automatically — turning the Capability Matrix all-green by construction instead of per-entity bespoke builds.

**Why a kernel and not more point-fixes:** the Capability and Event matrices show the same three columns failing everywhere (Automation, Notifications, Search) plus timeline holes. Those are not 60 separate bugs; they are one missing layer. Build the kernel once and ~15 event-matrix cells and a full matrix column flip to green together.

### V.4 Implementation Roadmap

**Phase A — Stop the bleeding (weeks, no kernel yet).** The Phase-2 Stage-0 correctness bombs + the Phase-1 P0 security SQL (already delivered): unify Deal identity, link Deal↔Property sold, repoint seller readers to `property_sellers`, add Meeting completion, add generic Lead→Contact conversion, ship the RLS/storage fixes.

**Phase B — Introduce the kernel (the pivotal investment).** Add `domain_events` + `emitBusinessEvent`; retrofit the ~10 mutating actions that skip the timeline to emit events; move Timeline to be kernel-driven. Deliverable: every business event lands on one append-only log and one timeline.

**Phase C — Light up subscribers.** Wire Automation triggers, Notifications, and Search-index to the kernel. Deliverable: the three all-✗ event-matrix columns go green; Attention Center shows real events; automation finally fires on entity changes.

**Phase D — Collapse duplicates onto the model.** Merge Buyer/Seller/Lead → `Contact`; merge journey systems → one `Journey`; merge deal systems; make BrandProfile the branding master; one document + one signature ledger; one Marketing stack; two→one website renderers; make the Knowledge Graph incremental.

**Phase E — Capability SDK + projections.** Implement the capability interface so Timeline/Docs/Comms/Search/Reports/Notifications apply to every entity; convert dashboards to read projections; retire recompute-on-read. Deliverable: the Capability Matrix is green by construction; new entities inherit all capabilities.

**Phase F — Fill the true feature gaps.** External calendar sync, e-signature provider, email/SMS channels, per-entity reports/exports, website↔channel wiring, AI memory consumed by reasoning.

**Sequencing logic:** A is safety and ships immediately. B is the keystone — nothing in C/E is possible without it. D can proceed in parallel with C once B lands. F is genuine new product, deferred until the platform is coherent.

---

## Closing architectural judgment

ZONO is a **feature-complete set of domains sitting on an incomplete platform.** The domains are, individually, unusually rich (twins, engines, intelligence, portals). What's absent is the operating-system substrate: an event kernel, a canonical (de-duplicated) domain model, and horizontal capability services. Today the platform *simulates* integration by recomputing everything on read; a real OS *propagates* on write.

The highest-leverage decision is not another feature — it is to **build the kernel (Phase B) and re-home the ~14 duplicate systems onto one canonical model (Phase D).** Everything the founder wants next (automation that fires, notifications that arrive, AI that remembers, reports that are live) is downstream of that single architectural move. Current OS-maturity: **5.5/10**; post-kernel + de-duplication: **~9/10** without adding a single new domain.
