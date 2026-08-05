# Road to V1

Ordered, additive, no new modules.

## Gate A — Epic 3 → Complete (code)
1. Buyer: wire requirement-edit → matching recompute (subscribe `buyer.updated` to `generateMatchesForOrg` for that buyer); add accept/reject-match + submit-offer buttons.
2. Seller: embed the shared NotesPanel; add record-valuation + exclusivity(with dates) actions.
3. Property: add NoteComposer to the timeline tab; add schedule-viewing + create-offer quick actions.
4. Deals: add participants/lawyer/financing/deadline fields (additive columns) + reopen/cancel.
5. Lists: lift the leads selection/bulk pattern into buyers/sellers/properties.

## Gate B — Test evidence (required for any "Ready" verdict)
6. Playwright E2E for the 18 flows in USER_WORKFLOW_MATRIX + Alpha/Beta org-isolation + inactive-user-denied + optimistic-lock conflict.
7. Run migration replay against a staging Postgres; confirm RLS with the org SELECT/INSERT policies.

## Gate C — Ready for Staging
8. Apply migrations 20270402–20270405 to a dedicated staging Supabase project; smoke the full lead→collection chain in the deployed app; verify documents signed-URL access + cross-org denial live.

## Gate D — Ready for Design Partner / Production
9. Green E2E + staging smoke + no P0/P1; performance pass on list/board queries; then escalate the verdict on that runtime evidence.

Current position: **end of Gate A (partial) — code substantially complete; Gates B–D not started.**
