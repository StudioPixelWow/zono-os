# ZONO CRM 360 — Capability Inventory

**Method:** evidence-based audit of the actual repo (`7096473`), database (project `tlrefajhyrqnjtmimaos`, live row counts), routes, server actions, migrations, and cron. A capability is `complete` **only** when the write path + persistence + read/propagation all exist and the full workflow works — never from the existence of a page or table. Status vocabulary: complete / implemented-not-connected / partial / ui-shell-only / demo-seed-dependent / backend-only / flag-hidden / broken / missing / not-evaluated.

**Headline (DB-verified):** intelligence data is large and real (`external_listings` 1363, `property_transactions` 751, `property_broker_matches` 57004, `broker_profiles` 749); the **CRM transactional core is empty** (`leads` 0, `deals` 0, `opportunities` 0, `meetings` 0, `notes` 0, `communication_messages` 0, `whatsapp_messages` 0, `automation_runs` 0; **no commissions table**). ZONO is today a market-intelligence platform with a CRM skeleton.

## Completion by domain (evidence-based, not route-count)

| # | Domain | Completion | One-line verdict |
|---|--------|-----------|------------------|
| 1 | Organizations/Offices/Users | **34%** | Org+roles real; no branch model; deactivation not enforced; no departure/record transfer |
| 2 | People/Contacts/Identity | **22%** | **No unified person entity** — leads/buyers/sellers duplicate a person; no merge/archive/tags/consent/ID/import |
| 3 | Lead Management | **38%** | Capture (manual/web/FB) + convert + lost real; routing is recommend-only; SLA/response-time/reopen missing |
| 4 | Buyer CRM | **45%** | Rich buyer intelligence backend; intake form captures ~12 of ~30 attributes; equity/mortgage/floor/condition absent |
| 5 | Seller/Owner CRM | **50%** | Strong seller-360 + multi-owner; valuation-history/appointments/exclusivity-dates/competing-agents off-record |
| 6 | Property Management | **55%** | Listing+media+valuation+owners real; **no viewings/offers/feedback**; no outbound portal syndication |
| 7 | Buyer↔Property Matching | **45%** | Generation+scoring+dedup real; **no send/feedback/learn/expire loop** — dead-end scorecard |
| 8 | Communication Hub | **55%** | Real Gmail + WA Cloud API exist; **flagship inbox is a manual-mark stub**; send off-by-default; no consent/opt-out |
| 9 | Calendar/Tasks/Follow-up | **60%** | Meeting lifecycle + Google API real; tasks one-time-only; Google sync is an unbridged parallel store |
| 10 | Deal Pipeline | **55%** | Stage engine + history + links real; no config/required-fields/cooperating-broker; stage-duration broken; board-only |
| 11 | Offers/Negotiations | **20%** | **No offers table** — offers are ephemeral, never persisted; single negotiation-log row |
| 12 | Documents/Compliance | **65%** | Templates+versions+checklist+audit real; **e-sign manual-only**; **documents bucket public** (safe-download broken) |
| 13 | Commissions | **18%** | Flat 2% estimate + one manual number; **no splits/VAT/referral/invoice/collection/approval** — no table |
| 14 | Market Intelligence/Radar | **68%** | Ingest→score→evidence→property-promotion real; **opportunities never become a person/lead/seller** |
| 15 | Automation/Autopilot | **55%** | Production-grade substrate; **autopilot not wired** — classify-only, orphaned dispatcher, cron-less delays |
| 16 | AI/Coaching | **60%** | Real engines; flagship suite (BMI/Area Leaders/Winning DNA/Zone Dominance/Coach) is **backend-only, zero UI reader** |
| 17 | Office/Team Management | **70%** | Invite/role/routing real; no branches; no departure re-assignment; runtime unverifiable (single-owner) |
| 18 | Reporting/Analytics | **65%** | Reports reconcile with **live** records (not stale cache); no agent/source filters, saved views, real PDF/Excel |
| 19 | Import/Export/Migration | **22%** | **No CRM import pipeline at all** — cannot migrate off a spreadsheet (launch-critical) |
| 20 | Search/Navigation | **75%** | Global search + command palette + quick-create real and record-backed; no bulk actions / saved filters |
| 21 | Security/Permissions | **48%** | RLS on 446/541 tables; **109 unprotected**; service-role writes bypass RLS; **public document buckets** |

**Weighted overall:** operational A–Z spine (domains 2–13) ≈ **42%**; intelligence/support (14–20) ≈ **63%**; security (21) ≈ **48%**. The 30-day "sole system of record" bar is gated far below these averages by hard blockers (no import, no offers, no commission engine, no viewings, fragmented identity, public document buckets).

## Cross-cutting pattern (the single most important finding)

Across nearly every domain: **strong, honest backend engines that are under-wired at the last mile.** Real integrations sit behind UIs that don't call them (WhatsApp real API vs stub inbox; Google Calendar real vs unbridged), persisted computations have no reader (entire branded AI suite), event pipelines have no dispatcher (automation classify-only), and opportunities never convert to people. The gap to CRM 360 is less "build engines from scratch" and more **connect, converge identity, and close loops** — plus genuinely missing pieces (import, offers, commissions, viewings).

_Per-capability tables with file:line evidence are preserved in the gap analysis and backlog. Row counts captured live 2026-08-03._
