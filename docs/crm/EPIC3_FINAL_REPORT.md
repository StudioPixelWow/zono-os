# Epic 3 — Operational Workspace · Final Report

Branch: `creative-lab-cert`. Status delivered in verified slices (each tsc 0 / eslint 0, additive migrations with RLS).

## Verdict: Epic 3 Incomplete (substantial progress)
The full lead→collection flow is now performable end-to-end through the UI, several Missing parts became real domains, and the hard documents blocker is resolved. Remaining: automated tests, deal-detail actions, viewings route, matches board, bulk list actions.

## Implemented / newly delivered this Epic
- **Documents (Part 13)** — private bucket + org-scoped signed URLs (5-min TTL); the public-URL completion blocker is fixed. Legacy public rows keep opening (historical compatibility).
- **Notes (Part 13)** — shared notes experience over the existing `notes` table (no second model): tags, mentions, pin, archive, append-only edit history (`note_edits`), `/notes` route + reusable `NotesPanel`.
- **Offers & Negotiation (Part 10)** — real `offers` entity + append-only `offer_events` trail; full lifecycle (draft→submit→seller/buyer counter→accept/reject/withdraw/expire) and one-click convert-to-deal into the canonical `deals` table.
- **Commissions & Collections (Part 12)** — `commissions` (side/gross/VAT/net/shares/adjustments + manager approval) + `collections` (due/collected/status/invoice/receipt) + append-only `collection_events` (non-destructive reversal).
- **Person Workspace (Part 3)** — read-time unified identity across buyers/sellers/leads by normalized phone/email (no second identity model): header, roles, quick actions (call/WhatsApp/email/task/note), merged timeline; `/people` + `/people/[type]/[id]`.
- **Leads list (Part 4)** — the missing `/leads` list route (search + stage filter).
- **Navigation (Part 1)** — sidebar exposes People, Offers, Commissions, Documents, Notes and points לידים at the real list.

## Reused (no duplication)
Single matching engine (`matching-intelligence`); DealService for deal lifecycle; canonical `deals`/`notes`/`tasks` tables; `activity_events` timeline; permissions registry mirroring RLS `has_min_role`; global search projection.

## Architecture compliance
No client-side DB writes in new code (documents upload moved to a private bucket returning only a path). Append-only histories for offers/collections/notes. Org-scoped RLS on every new table; approve/cancel gated to manager.

## Still open (honest)
- **Tests (Part 20)** — none of the 18 required E2E flows yet; no component/integration suite.
- **Deal detail (Part 11)** — board only; no `/deals/[id]` with participants/lawyer/financing/deadlines; create-commission-from-deal is via /commissions picker rather than the deal screen.
- **Viewings (Part 9)** — generic calendar; no dedicated `/viewings` with status buckets/feedback.
- **Matching (Part 8)** — flat table; no segmented board; missing per-item verbs.
- **Lists (Part 15)** — no bulk selection/actions or pagination.
- **Buyer/Seller/Property (Parts 5–7)** — field and action gaps remain; buyer requirement edits still don't trigger match recompute.
- **Today (Part 2)** — recommendation engine, not the itemized work-queue.
