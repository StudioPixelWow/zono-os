# ZONO — Facebook Groups Distribution Engine (Phase 28)

**Date:** 2026-06-24
**Goal:** turn Facebook Groups into a structured, measurable distribution channel —
built **on top of** the existing `distribution_groups` + Chrome-extension architecture
(no rebuild). **No fake publishing. No hidden automation. User-controlled publishing only.**

**Gates:** scoped `tsc` → 0 errors · ESLint → 0 errors.

## What already existed (reused, not duplicated)
`distribution_groups` + `distribution_campaign_groups` tables, the Chrome-extension
publish flow (`extension-service`, `facebook_extension_*`), and the manual-publish
assistant. Phase 28 adds the **registry intelligence, scoring, attribution and analytics**
layer on top.

## 1–13. Requirements coverage
1. **Group registry** — `distribution_groups` + new `/distribution/groups` UI to add/list groups.
2. **Group categorization** — `classifyGroup()` tags `category` (נדל"ן/קהילה/עירונית/משקיעים) from the name.
3. **Geographic classification** — `region` derived from the city via real Israeli city→region map (`regionForCity`).
4. **Property-type classification** — `property_types[]` inferred from Hebrew keywords (דירת גן/פנטהאוז/מסחרי…).
5. **Distribution planning** — `recommendGroupsForProperty()` ranks groups per property (geo + type + performance) with reasons + cautions + expected reach/leads.
6. **Publishing queue** — existing `distribution_campaign_groups` (selected/posted/skipped) + the extension assistant.
7. **Publishing history** — new `distribution_group_posts` (per-group posts, reach/reactions/comments, `posted_by`, `posted_at`).
8. **Group performance scoring** — `scoreGroupPerformance()` + `scoreGroupLeads()` computed from REAL posts + attributed leads (lead rate, engagement, reach, recency, minus spam). `recomputeGroupScores()` recomputes on demand.
9. **Lead attribution** — new `distribution_group_leads` links a lead back to the group (and optional post/property), with `recordGroupLead()` + "+ ליד" UI.
10. **AI group recommendations** — `recommendGroups(propertyId)` action returns ranked groups with explainable reasons.
11. **Duplicate prevention** — `contentHash()` fingerprint on each post; `recordGroupPost` blocks re-posting identical content to the same group.
12. **Compliance safeguards** — `checkCompliance()` warns on over-posting (min 3 days between posts/group), high spam risk, and private-group rules; surfaced before posting.
13. **Distribution analytics** — `getGroupsAnalytics()`: totals, top-by-leads, top-by-performance, and a "needs attention" list (high spam / posts-without-leads).

The system now knows **which groups exist, which perform best, which property belongs
in which groups, and which groups generate leads** — all from real recorded data.

## Files
- Migration `supabase/migrations/20260737120000_fb_groups_distribution_engine.sql` — extends `distribution_groups` (property_types/region/language/neighborhoods/stats) + new `distribution_group_posts`, `distribution_group_leads` (RLS, indexes).
- `src/lib/distribution/groups-engine.ts` (PURE: classify/score/recommend/contentHash/compliance), `groups-service.ts` (server), `groups-actions.ts`.
- `src/app/(app)/distribution/groups/page.tsx` + `GroupsView.tsx`.
- Nav: "קבוצות פייסבוק" under צמיחה (`/distribution/groups`).

## Real vs stub
**Real:** registry, classification, scoring, recommendations, attribution, analytics,
duplicate prevention, compliance — all from real org rows. **Publishing itself** remains
the existing human-confirmed Chrome-extension flow; `recordGroupPost` logs what the user
actually published (it never posts on its own). No Graph-API group auto-posting (Meta does
not permit it) — fully compliant.

## How to use
Apply the migration → open `/distribution/groups` → add the groups you post in (auto-classified)
→ after publishing via the extension, record the post + any leads → press "חשב ביצועים" to
rank groups by real performance → use per-property recommendations to plan distribution.
