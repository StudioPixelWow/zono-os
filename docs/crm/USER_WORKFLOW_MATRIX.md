# User Workflow Matrix — Lead → Collection

Reachable = a screen + action exists in the UI. Runtime-verified = executed end-to-end against a running app (NOT done here).

| Step | Screen | Action | Reachable | Runtime-verified |
|---|---|---|---|---|
| Lead intake | /leads, /leads/[id] | create, assign, contact, qualify | ✅ | ⬜ |
| Lead → Buyer | /leads/[id] | convertLead | ✅ | ⬜ |
| Buyer requirements | /buyers/[id]/edit | updateBuyer | ✅ | ⬜ |
| Match review | /matches (board) | stage change / bulk / task | ✅ | ⬜ |
| Schedule viewing | /calendar, /viewings | schedule / lifecycle | ✅ | ⬜ |
| Viewing + feedback | /viewings | complete + outcome | ✅ | ⬜ |
| Offer | /offers | create draft → submit | ✅ | ⬜ |
| Counter offer | /offers | seller/buyer counter (append-only) | ✅ | ⬜ |
| Accepted | /offers | accept | ✅ | ⬜ |
| Deal | /offers → /deals/[id] | convert-to-deal + advance stage | ✅ | ⬜ |
| Documents | /documents, /deals/[id] | upload (private) + signed view + signatures | ✅ | ⬜ |
| Commission | /commissions, /deals/[id] | create + approve | ✅ | ⬜ |
| Collection | /commissions | record / partial / reverse / paid | ✅ | ⬜ |
| Closed | /deals/[id] | mark stage closing | ✅ | ⬜ |

Every transition has a screen and an action — **no dead ends in the code path**. Runtime verification of the whole chain is the outstanding item.
