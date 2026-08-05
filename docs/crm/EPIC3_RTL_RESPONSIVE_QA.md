# Epic 3 — RTL & Responsive QA

Global: <html lang="he" dir="rtl">. All new workspaces render dir="rtl", Hebrew labels, Hebrew date/number formatting (toLocaleString("he-IL")), ₪ currency, LTR-safe phone handling.

Responsive: new pages use max-w containers + responsive grids (grid-cols-2 sm:grid-cols-4, etc.); forms wrap on mobile; NotesPanel/OffersView/CommissionsView tested at narrow widths. Person quick-actions are tap-friendly links (tel/wa.me/mailto) for field agents.

Gaps: systematic keyboard-nav/focus management and screen-reader semantics on tables/modals are sparse app-wide; no dedicated RTL QA artifact for date pickers / mixed HE-EN beyond the new screens.
