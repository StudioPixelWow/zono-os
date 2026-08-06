# Epic 3 — Offers & Negotiation Workspace (Part 10)

Route: /offers. Service: src/lib/offers/service.ts. Tables: offers, offer_events (append-only).

List: amount, status, next action, expiry; filters (all/open/accepted). Detail: financing/conditions/included, full negotiation trail from offer_events. Lifecycle: draft → submit → seller counter/accept/reject → buyer counter → accept/reject/withdraw/expire → convert-to-deal (canonical deals table). Historical amounts never overwritten — each change is a new immutable event. Org RLS; write=agent; offer_events insert-only.

Gaps: entity linking (buyer/property) from the standalone create form deferred to launch-from-workspace; attachments not modeled.
