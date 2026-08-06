# Missing / Incomplete Workflow Report

Honest list of what is NOT done (no minimizing).

## Not implemented
- **Automated E2E (Part 20):** none of the 18 required browser flows; no org-isolation (Alpha/Beta) browser tests; no optimistic-lock conflict test. Only pure-logic unit tests exist.
- **Runtime/staging validation:** migrations not applied to a DB here; app not run; new CRM flows not executed end-to-end.

## Partial (screen/action exists, depth missing)
- **Buyer:** requirement edit does not trigger match recompute; no saved searches / favorites; no accept/reject-match or submit-offer from the buyer screen.
- **Seller:** no in-place notes composer (Person workspace covers it); no valuation history, exclusivity dates, competing agencies, listing-appointment actions.
- **Property:** notes are read-only in-place (no composer); no distinct Price-History / Feedback / Offers / Negotiation tabs; no schedule-viewing / create-offer from the property.
- **Matches:** no per-match owner/assignment field (bulk assign not possible without a model change); "missing data" / "source" not surfaced.
- **Deals:** detail lacks participants / lawyer / financing / deadline fields; no reopen/cancel controls.
- **Lists (buyers/sellers/properties):** no selection/bulk (only leads has it).
- **Today:** work-queue is read+link; no inline complete/snooze/undo on queue items.

## Explicitly out of scope (not started — correct)
Epic 4, communication integrations (WhatsApp/Gmail send), automation execution, AI coach, new modules.
