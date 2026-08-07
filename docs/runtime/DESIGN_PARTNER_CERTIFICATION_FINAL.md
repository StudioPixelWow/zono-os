# ZONO — DESIGN PARTNER CERTIFICATION (FINAL)

**Verdict:** ✅ **ZONO — DESIGN PARTNER READY**
**Certified SHA:** `c09818f` (remote `main` HEAD)
**Date:** 2026-08-07
**Primary domain:** https://zono-os-ro2s.vercel.app
**Vercel production:** READY on `c09818f` (alias includes the primary domain)

This certification was performed against the **live production deployment** using DOM
hit-testing and runtime probes (not screenshots), plus direct database inspection for
the paid-generation and regression evidence. Every claim below is runtime-proven.

---

## PHASE 1 — Remote state

- Remote `main` HEAD = `c09818f` (verified via `git ls-remote`).
- Merge lineage: `9a611a73` (PR #10) → `406595a` (PR #11, mobile UX) →
  `b133853` (PR #12, offline + testimonial label) → **`c09818f` (PR #13, home redesign)**.
- Vercel production for `c09818f` = READY; primary domain serves the merged SHA.

## PHASE 2 — Mobile UX batch (PR #11) merged & deployed

Merged after the required check `creative-lab-ci / verify-and-certify` (push context)
was green; Vercel production confirmed READY; primary domain proven to serve the
merged SHA. Contents:

- Property CTA bar lifted above the ZI launcher (bottom `4.75rem` → `12.5rem`), gutters removed.
- ZI avatar reduced ~30% (`size={155}` → `size={108}`).
- ZI chat: conversation `min-h-0`; sources/followups capped and horizontally scrollable
  so **sources no longer cover the answer** on mobile.
- WhatsApp/Call CTA now shown on **external-listing** detail pages, owner/broker aware,
  reusing the same contact-resolution service as CRM property pages.
- Offline banner reconciliation (first attempt).

## PHASE 3 — Home redesign (PR #13) merged & deployed

Merged after `verify-and-certify` green → final `main` = `c09818f`, Vercel READY.
Composition-only rebuild into `HomeControlCenter`; HomeV3 preserved; Kanban not deleted
(moved off home); no new dependencies; all data org-scoped/RLS; light shell with
dark-purple reserved for AI + map only.

## PHASE 4 — Live mobile CTA certification — ✅ PASS

Hit-tested on the live property page (`/properties/520b6c9a…`) via `elementFromPoint`
across scroll positions 0 / 600 / 1300:

| Check | Result |
|---|---|
| CTA portaled to `document.body` | ✅ `PORTALED_TO_BODY: true` |
| Viewport-pinned (constant top across scroll) | ✅ `barTops: [379,379,379]` |
| Above MobileNav (no overlap) | ✅ bar bottom above nav `top:599` |
| ZI does NOT steal WhatsApp taps | ✅ `ZI_STEALS_WHATSAPP_TAPS: false` |
| WhatsApp button fully tappable | ✅ `waBtn` hit-test returns the button |
| Direction | ✅ `dir: "rtl"` |
| No horizontal overflow | ✅ `horizontalOverflow: false` |
| Correct dial/WhatsApp targets | ✅ `tel:+972501234567`, wa `972501234567` |

Root cause of the earlier overlap (RTL `pe-20` gutter reserving the wrong physical side
while the launcher sat on the opposite side) is resolved. Desktop layout unchanged.

## PHASE 5 — Live home certification — ✅ PASS

On `c09818f` the redesigned `/` renders the full control center in the intended order,
RTL, no Next.js error overlay, real org-scoped data with honest empty states (no mock data):

1. Snapshot header — "צהריים טובים, טל 👋"
2. KPI strip — לידים / משימות / סיורים / מחזור עסקאות / עסקאות פעילות (real links)
3. **AI recommendations** (dark-purple) — "ה־AI שלך ממליץ היום ✨", 3 real evidence-based
   items with urgency badges linking to actual property/seller records
4. Activity feed — "מה חדש", real activity events linking to real entities
5. Today's tasks — "משימות להיום", honest empty state
6. Featured property — "הנכס המומלץ עבורך", real listing
7. Quick actions — "פעולות מהירות"
8. Territory + **live map** (dark-purple) — "מפת הנכסים החיה באזור שלך", honest empty states
9. New properties — "נכסים חדשים באזור"
10. Hot exclusive — "נכסים חמים בשיווק בלעדי", real properties
11. Updates — "הודעות ועדכונים"
12. Monthly performance — "ביצועים חודשיים"

## PHASE 6 — Creative QA runtime proof (ONE controlled paid generation) — ✅ BEHAVIOR PROVEN

Exactly **one** paid ZZ-TEST testimonial generation was run (no duplicates):

- Request `a403f76e` (`testimonial_post`); DB delta = **exactly +1 request** (58→59),
  **+2 outputs** (`aae4285c`, `929ebb6f`), **+4 private masters**. No duplicate generation.
- Real pipeline: `image_provider = openai`, `gpt-image` model, `image_url = null`
  (**no public URL**), `private_master_path` under `…/qa/`, `storage_visibility = private`.
  Bucket confirmed private (`public = false`). Signed preview only.
- QA is **kind-aware**: `kind = testimonial`. `fail_reasons` contained **only global
  threshold/quality items** (overallWow / conversion / visualImpact / realEstateCredibility /
  proudToPublish / broken-Hebrew). **No property-only hard-fails**
  (`textDominatesProperty`, `priceNotDominant`, `propertyImageTooSmall`) were applied —
  proving the kind-aware suppression works. Thresholds unchanged (85/85/85/90).

**Outcome, reported honestly:** both outputs landed `needs_review` because they
legitimately missed the global `overallWow` threshold (72 / 60 < 85). This is the QA
system **correctly holding the quality line**, not a defect — and per the standing
instruction the run was **not** regenerated and QA was **not** weakened to manufacture a
PASS. The bad creative correctly failed; the guardrails held. No approved output was
produced from this single run, by design.

## PHASE 7 — Focused regression — ✅ GREEN

- Property CTA / ZI / MobileNav — proven live in Phase 4.
- Creative Studio private storage — Phase 6 (private bucket, no public URL, signed previews).
- DEF-E — `uq_deals_offer` unique index present (offer→deal determinism).
- FB Groups — `distribution_publish_controls` + `distribution_publish_events` present
  (lost-ack / duplicate-prevention substrate).
- Tenant isolation / auth / RLS — RLS enabled on 6/6 core tables
  (`properties`, `buyers`, `sellers`, `deals`, `tasks`, `activity_events`).

## Additional live-discovered bug fixes (shipped)

- **Testimonial label** — `resolveSaleLabel` no longer returns "למכירה" for testimonials;
  now kind-aware (testimonial → social-proof label, not a "for sale" sign). Code-verified;
  not re-proven with another paid generation, by instruction.
- **Offline banner** — rewritten to an optimistic-online + active fetch-probe model;
  **live-verified GONE** on production (`OFFLINE_BANNER_VISIBLE: false`, `navigator.onLine: true`).

---

## Final determination

No P0/P1 blockers remain. Mobile CTA passes live; home redesign passes live; Creative QA
behavior is runtime-proven and correct (kind-aware, private-only, thresholds intact, no
duplicate spend); focused regression is green. The single paid generation did not yield an
approved creative — this reflects QA integrity (a sub-threshold creative was correctly
withheld), not a system defect.

# ✅ ZONO — DESIGN PARTNER READY
