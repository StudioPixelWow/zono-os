# Epic 3 — Deal Workspace (Part 11)

Route: /deals (board). Service: DealService (server-only; append-only deal_journeys; canonical revenue ledger — real money only). Status: Partial (pre-existing) + now the offers domain converts accepted offers into deals, and /commissions creates commissions/collections against deals.

Gaps: /deals/[id] detail route; add participant / assign lawyer / update financing / add deadline; explicit mark-won/lost, reopen, cancel; create-commission/collection from the deal screen (currently via /commissions deal picker).
