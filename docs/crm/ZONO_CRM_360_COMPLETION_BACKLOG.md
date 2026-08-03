# ZONO CRM 360 — Completion Backlog

Organized by functional dependency, not by page. Machine-readable version: `zono-crm-360-backlog.json`. Priorities: **P0** integrity/security · **P1** A–Z workflow completion · **P2** operational completeness · **P3** intelligence/advantage.

## P0 — Integrity & security (must be first; block everything)

- **CRM-P0-001 · Private document storage (M, blocking).** `documents`/`property-media` buckets are `public=true`; legal/ID/contract files world-readable by URL. → private buckets + signed URLs + RLS read.
- **CRM-P0-002 · Tenant isolation on writes (L, blocking).** All writes bypass RLS via service-role; 109 tables have no policy. → RLS on all tenant tables + an org-scoping write helper + a two-org isolation test per entity.
- **CRM-P0-003 · Deactivation & departure enforcement (M, blocking).** Disabled user keeps access; no record transfer. → guard checks status; departure reassigns records + audit.
- **CRM-P0-004 · Duplicate person on social conversion (M, blocking).** Social path inserts duplicate buyer/seller twins. → all person-creating paths through one dedup gate.

## P1 — A–Z workflow completion (the lead→commission spine)

- **CRM-P1-010 · Unified person entity (XL, blocking).** Additive `persons` model + role links so identity/history/notes/documents converge; merge/restore. *Product decision: migrate vs additive-link.*
- **CRM-P1-011 · CRM import pipeline (L, blocking).** CSV/Excel → map → preview → validate → dedup → commit + partial-failure report + history + rollback. Without this, "no other spreadsheet" is impossible.
- **CRM-P1-012 · Offers entity (L, blocking).** Persisted offers/counteroffers with amount/conditions/financing/expiry/status-history + conversion to accepted.
- **CRM-P1-013 · Commission engine (L, blocking).** Splits (side/office/agent/manager/co-broker), VAT, referral, payment/collection/invoice status, approval, audit; reconciles in reporting. *Product decision: split-rule + VAT model.*
- **CRM-P1-014 · Viewings + feedback (M, blocking).** Showings linking property+buyer+agent; structured feedback; auto follow-up; feeds matching.
- **CRM-P1-015 · Match action loop (L, blocking).** Send-to-buyer via comm hub → capture response → learn from rejection → expire stale.
- **CRM-P1-016 · Opportunity→person conversion (M, blocking).** Market-intel opportunity creates an owned lead/seller (deduped) with outcome tracking; kills dead-end cards.
- **CRM-P1-017 · Primary inbox real send (M, blocking).** Flagship inbox sends via the real WA/Gmail provider with delivery/read state + consent/opt-out.
- **CRM-P1-018 · Routing auto-assign + SLA + response time (L, blocking).** Rules/round-robin on capture; SLA tracking + escalation; real response-time; accept/reject + reopen.
- **CRM-P1-019 · Full deal lifecycle + detail page (L, blocking).** One canonical stage model (financing/legal/handover/cancelled/reopened); stage duration; `/deals/[id]`; required-fields-by-stage; win reason; cooperating broker.
- **CRM-P1-020 · Action-from-message → task/lead (S).** Durable task/lead from a conversation, linked back.

## P2 — Operational completeness

- **CRM-P2-030 · Wire autopilot execution loop (L).** Approved automations execute via kernel; delay-queue cron; rate limits; stale-lead/expiration scanners.
- **CRM-P2-031 · Bridge Google Calendar ↔ CRM meetings (M).**
- **CRM-P2-032 · Real e-signature integration (M).**
- **CRM-P2-033 · Reporting agent/source filters + PDF/Excel export + saved views (M).**
- **CRM-P2-034 · Bulk actions + saved filters on CRM lists (M).**
- **CRM-P2-035 · Contact essentials: tags/consent/ID/custom fields/archive (M).**

## P3 — Intelligence & advantage

- **CRM-P3-040 · Expose branded AI suite** (BMI/Area Leaders/Winning DNA/Zone Dominance/Coach) with readers + evidence/confidence/insufficient-data states, or hide until ready.
- **CRM-P3-041 · Feature-readiness gating** (production/beta/internal/disabled/no-data) so nothing broken/empty appears available and no dead nav links.

## Dependency order (critical path)
P0-001/002/003/004 → P1-010 (persons) → {P1-011 import, P1-016 opportunity→person} ; P1-012 offers → P1-013 commissions & P1-019 deals ; P1-014 viewings → P1-015 match loop ; P1-017 inbox → P1-020 & P2-030. Security P0s gate any external/design-partner exposure.

## Definition of Done (every item)
Changed files · DB migration (additive + rollback) · automated tests (unit + integration for the workflow) · manual QA pass · before/after evidence · reconciliation check where financial · no demo/placeholder/public-data exposure · feature-flagged if exposure is risky.
