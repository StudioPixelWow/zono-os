# CRM 360 — Completeness Matrix

Classification: Complete / Mostly complete / Incomplete / Missing. No inflation. "Complete" requires: implemented + consumes existing services + states (loading/empty/error) + reachable + runtime-verified. Since runtime/E2E was not executed here, nothing is marked "Complete" beyond code+static-verified primitives.

| Module | Class | Evidence / gap |
|---|---|---|
| Application shell / nav | Mostly complete | Sidebar exposes all workspaces; role-filtered nav + breadcrumbs still static |
| Today | Mostly complete | New explicit work-queue + existing ranked queue + agenda; snooze/undo per-item partial |
| Person workspace | Mostly complete | Read-time unified identity, roles, quick actions, merged timeline, notes; exact phone/email match only |
| Leads | Mostly complete | List + stage filter + **bulk actions**; stage-transition guard not enforced at service; some field depth missing |
| Buyers | Mostly complete | Notes/timeline/tasks/matches present; requirement edit does NOT trigger match recompute; no saved-searches/favorites |
| Sellers | Incomplete | 360 + link/co-owner; **no in-place notes** (available via Person workspace); valuation-history/exclusivity-dates missing |
| Properties | Mostly complete | Rich tabs + actions; read-only notes (no composer in-place); some distinct tabs missing |
| Matches | Mostly complete | **New operational board** (columns/filter/bulk) over single engine; per-match owner/assignment not modeled |
| Viewings | Mostly complete | Dedicated route + status buckets + complete/feedback/cancel/no-show; confirm/reminders not modeled |
| Offers & negotiation | Mostly complete | Full lifecycle + append-only trail + convert-to-deal; entity-linking from standalone create deferred |
| Deals | Mostly complete | Board + **detail route** (offers/commissions/docs/timeline + stage advance + create-commission); participants/lawyer/financing fields missing |
| Commissions & collections | Mostly complete | Full domain: shares/VAT/approval, partial/reverse collections; rule-based auto-split + invoice gen missing |
| Documents | Mostly complete | **Private signed access (blocker fixed)** + versions/signatures/checklist; e-sign provider not integrated |
| Notes | Mostly complete | Shared over existing table: tags/mentions/pin/archive/edit-history; attachments + mention-resolution UI missing |
| Global search | Mostly complete | Canonical, Hebrew/phone/address aware, grouped, ⌘K |
| Tasks | Mostly complete | Shared tasks table; no dedicated /tasks hub |
| Bulk / lists | Mostly complete | Bulk on leads (pattern); buyers/sellers/properties lists still single-open (no selection) |
| Testing | Incomplete | Unit tests for pure rules pass; 18 E2E flows + org-isolation browser tests NOT implemented/run |

No module is classified higher than the runtime evidence supports.
