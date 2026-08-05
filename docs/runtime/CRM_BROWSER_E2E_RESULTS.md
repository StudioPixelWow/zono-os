# ZONO CRM 360 — CRM Browser E2E Results (Phase 6)

**Status: ⛔ NOT EXECUTED — blocked on a deployed staging app (Phase 5).**
**Date:** 2026-08-05

Real-browser E2E cannot be run because there is no deployed application in this session, and the program rule forbids substituting code inspection for E2E. When Phase 5 delivers a deployed staging URL, run the following matrix and record per-journey PASS / FAIL / BLOCKED with screenshots + the deployed SHA.

## Test matrix (to execute against the deployed app)

Orgs: **Alpha**, **Beta**. Roles: **owner, manager, agent, inactive user, unauthenticated**.

| # | Journey | Key assertions |
|---|---|---|
| 1 | Lead → Buyer | create/assign/contact/qualify/convert; timeline + Today queue update |
| 2 | Seller & Property | seller↔property, valuation, listing appt, status, notes/documents, timeline |
| 3 | Matching | open match, stage change, follow-up, kanban filters, **bulk stage change with one forced row failure → partial-failure report**, requirements change → rematch/pending state |
| 4 | Viewing | schedule→confirm→reschedule→complete→feedback→follow-up→offer; timeline |
| 5 | Offer & Negotiation | draft→submit→counter→accept; **immutable offer_events**; convert to deal; invalid transition rejected |
| 6 | Deal | open detail, stage, documents, participants, financing/legal, deadlines, missing-data states, history |
| 7 | Commission & Collection | calc + VAT/splits, approve, collection, partial, **append-only reversal**, complete; totals + timeline |
| 8 | Today Workspace | seed 6 signal types → priority ordering, category counts, direct actions |
| 9 | Bulk Leads | multi-select valid action + one stale row → **per-row result, no false full-success** |
| 10 | Private Documents | upload; authorized signed access OK; **anon denied; Beta denied; expired URL denied**; legacy file_url fallback |

## Available tooling when unblocked

This session has Claude-in-Chrome browser tools and a GIF recorder; once a staging URL + test logins exist, these journeys can be driven and recorded here.

## Current result

**0 / 10 executed** — blocked. Not passable or failable until deployed. This is an **open Design-Partner gate**.
