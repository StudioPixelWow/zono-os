# Epic 3 — Navigation Map

Sidebar group "המשרד שלי" (src/components/dashboard/Sidebar.tsx):
- אנשים → /people
- נכסים → /properties · קונים → /buyers · מוכרים → /sellers
- לידים → /leads (new list) → /leads/[id]
- הצעות → /offers
- עסקאות → /deals
- עמלות וגבייה → /commissions
- מסמכים → /documents
- הערות → /notes
- פגישות → /calendar

Person deep-links: /people/[type]/[id] (type ∈ buyer|seller|lead). No PII in URLs (opaque UUIDs). Global search (⌘K) reaches all core entities.

Gaps: role-filtered sidebar (registry supports roleMin but GROUPS is static); breadcrumbs; favorites; org/office switcher.
