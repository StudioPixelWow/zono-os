# Epic 3 — Search & Lists (Parts 14, 15)

Search (Part 14, Implemented): src/lib/search/service.ts — canonical search_documents projection, Hebrew/normalized-phone/address-aware, org+owner scoped, grouped; ⌘K CommandPalette with keyboard nav + loading/empty/error.

Lists (Part 15, Partial): buyers/sellers/properties/deals/leads/people lists have search + filters + empty/error states; properties uses URL-driven server filters (direct-linkable). New /leads and /people lists added. Gaps: no bulk selection/actions (hence no partial-failure row results), no pagination/virtualization, no server-side saved views, no column selection.
