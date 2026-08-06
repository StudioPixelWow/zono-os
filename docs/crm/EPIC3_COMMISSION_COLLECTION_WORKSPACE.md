# Epic 3 — Commission & Collection Workspace (Part 12)

Route: /commissions. Service: src/lib/commissions/service.ts. Tables: commissions, collections, collection_events (append-only).

Commission: side (buy/sell/both), gross, VAT %, computed VAT/net, per-party shares (office/agent/manager/cooperating-broker/referral), adjustments; status draft→pending_approval→approved (manager)→cancelled; recalc allowed only pre-approval. Collection (approved commissions only): amount due/collected, due/collection dates, payment status (pending/partial/paid/overdue), invoice/receipt refs. Actions: record (partial/full → derives status), reverse (non-destructive event), mark paid/overdue, event history. Org RLS; approve/cancel/delete=manager.

Gaps: shares entered manually (no rule-based auto-split); no invoice/receipt document generation.
