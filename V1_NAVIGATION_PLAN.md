# V1_NAVIGATION_PLAN

_Phase 12 — V1 navigation experience. **Navigation-only**: no routes, features, code, or DB removed. Every route remains reachable by direct URL; only sidebar visibility changed._

## What shipped

A two-mode sidebar (`src/components/dashboard/Sidebar.tsx`):

- **Standard mode (default)** — a flat, ~12-item list of the brokerage core. No category headers, no collapsible groups. Learnable in a day.
- **Advanced mode (opt-in toggle)** — the full grouped, role-aware navigation, minus permanently-hidden items.

A bottom toggle switches modes; the choice persists in `localStorage` (`zono-nav-mode`, default `standard`). SSR always renders Standard and the saved preference is applied after mount (deferred) to avoid hydration mismatch.

Every nav item now carries a `tier`: `"v1" | "advanced" | "hidden"`. Nothing is deleted — `hidden` items simply don't appear in the sidebar but still work via direct URL or the ⌘K command center.

## Standard mode (VISIBLE IN V1) — flat order

1. דף הבית — `/`
2. נכסים — `/properties`
3. קונים — `/buyers`
4. מוכרים — `/sellers`
5. עסקאות — `/deals`
6. התאמות — `/matches`
7. ZONO קריאייטיב — `/creative-studio`
8. שיווק — `/marketing`
9. המלצות — `/recommendations`
10. צוות וסוכנים — `/team` _(managers only)_
11. מסמכים — `/documents`
12. הגדרות — `/settings` _(managers only)_

_(`notifications` is also tier `v1` and reachable; the flat list above is the curated 12 from the spec. Agents see the non-manager-only subset.)_

## Advanced mode (MOVE TO ADVANCED MENU)

Shown only when Advanced is toggled, inside their existing groups:

- מרכז פיקוד `/command`, מוח המשרד `/ai-office` (main)
- תקשורת `/communication`, מסעות `/journeys` (CRM)
- תחזית `/forecast`, הכנסות `/revenue`, טריטוריות `/territories`, שוק ועסקאות `/transactions`, מפה חכמה `/market`, מתחרים `/competitors`, גיוס נכסים `/acquisition` (intel)
- Creative DNA `/creative-dna`, הפצה יומית `/distribution`, חיבורי הפצה `/settings/distribution-connections`, לידים חברתיים `/social-leads` (marketing)
- פורטלים `/portals`, אתר משרד `/office-website`, אתר סוכן `/agent-website`, מסמכים משפטיים `/legal-templates`, משכנתא `/financing` (digital)
- ניהול סוכנים `/admin/agents`, ניתוב לידים `/routing`, מוניטין `/reputation`, אוטומציות `/automation` (office)
- אזורי פעילות `/settings/operating-areas` (system)

## Hidden completely (HIDE) — still reachable by URL

- קשרים עסקיים `/graph` (no real visual graph)
- קהילות `/communities` (schema-only / future)
- WhatsApp `/whatsapp` (needs Meta WA API)
- Admin utilities: בריאות מערכת `/admin/system-health`, איכות דאטה `/admin/data-quality`, דוח QA `/admin/product-qa`, הרשאות `/admin/permissions`, תצורה `/admin/configuration`
- Broker Intelligence `/broker-intelligence` (never had a sidebar entry; remains URL-only)

## Guarantees
- **No route removal, no feature deletion, no DB change** — only the sidebar's item list/visibility.
- Role-based visibility preserved (manager-only groups still gated).
- ⌘K command center still reaches everything.
- Mobile bottom bar (`MobileNav.tsx`) is a separate minimal 5-item surface — already lean, left unchanged.

## Verification
- `tsc` exit 0, `eslint` clean on `Sidebar.tsx`.
