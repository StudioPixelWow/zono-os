# FACEBOOK CAMPAIGN UX REMEDIATION
**Scope:** the first-time-user journey "market a property in Facebook groups this month."
**Method:** journey reconstructed from the actual UI components (the screens the user sees), critiqued as a first-time real-estate agent. Backend architecture already passed technical QA — this document is about *usability*, not infrastructure.
**Status:** FACEBOOK CAMPAIGN UX = **NOT LAUNCH READY ❌** (usability). Every finding below is grounded in a real screen/label in the codebase.

---

## Executive Summary (plain language)
A new agent who wants to "market this property on Facebook this month" cannot tell where to start, and once they start they are handed between **three different tools that each look like the whole job but only do part of it**. The "campaign wizard" walks them through 7 steps and then, instead of turning the campaign on, tells them to **go to a different screen** to actually schedule and publish. That other screen ("מרכז ההפצה") uses different words for the same things. A third screen ("מרכז בקרת פרסום") is where problems land. Nothing tells the agent, on any single screen, "here is your campaign, here is what publishes today, press this to publish." The result feels fragmented and demands prior product knowledge — exactly the owner's experience.

The fix is **not** a backend change. It is: (1) one obvious entry point, (2) one campaign builder that ends in **Activate** (not "go to another screen"), (3) one **Today** operational surface, and (4) one consistent, human vocabulary.

---

## Current Journey (screen by screen)

**Entry (the first failure).** The sidebar group "תקשורת ושיווק" offers **seven** doors to the same job, with no hint which is the start:
`Facebook (/facebook)` · `פרסום בקבוצות (/distribution)` · `מודיעין קבוצות (/distribution/groups/intelligence)` · `מרכז בקרת פרסום (/publishing-control)` · `קמפיינים (/distribution/campaign-wizard)` · `מרכז שיווק (/marketing)` · `סטודיו יצירה (/creative-studio)`. A property page is an 8th possible start.
*User thinks:* "Which of these is 'market my property'?" — no answer.

**STEP 1 — Campaign Wizard, step "נכס"** (`/distribution/campaign-wizard`).
Screen: property picker grid. CTA: הבא →. Fine, but the user had to *find* this wizard among 7 doors first.

**STEP 2 — "תוכן פוסט".** 4 auto-generated text variations in editable textareas + an "auto-replies" block. No single visual preview of "what Facebook will see." Reasonable but dense.

**STEP 3 — "חיבור פייסבוק".** The build is interrupted to connect Facebook; the CTA leaves to *yet another screen* (`/settings/distribution-connections`). Connection is a **prerequisite**, not a mid-build step — placing it at 3/7 breaks the flow and risks losing wizard state.

**STEP 4 — "קבוצות".** Folders of groups rendered as checkbox buttons; header "{n} קבוצות נבחרו". No search / area filter / "why these" summary at the real **~400-group** scale → overwhelming. Empty state points to *another* screen (`/distribution/groups`).

**STEP 5 — "תדירות".** Four abstract tiles: פעם אחת / 3 פעמים בשבוע / כל יום / **קמפיין חודשי מלא**. The last one is mislabeled — the planner actually posts **every 3 days**, not a full month. No "which days / what hours" control.

**STEP 6 — "גאנט ואישור".** Shows a **Gantt table** (groups × dates, cells "V1/V2"). "גאנט" is PM jargon; the matrix is an engineering artifact, not a schedule a person reads. The footnote says: after approval, *"התזמון/פרסום ממשיכים במסך ה-Distribution (Publish Assistant)"* — i.e. **this wizard does not activate anything**.

**STEP 7 — "תגובות".** A post-publish explainer that links to `/social-leads`. It is not part of *creating* a campaign — it muddies "what am I doing."
Final CTA: **"סיום — למרכז ההפצה"** → dumps the user at `/distribution`. The campaign was never turned on.

**STEP 8 — Distribution Center (`/distribution`).** A different surface, different words ("queued", "Publish Assistant", "מרכז ההפצה").

**STEP 9 — Daily table (`/distribution/daily`, "שולחן פרסום יומי").** A **manual copy-paste** flow: "העתק טקסט" → "פתח קהילה ↗" → "סמן כפורסם". Statuses: pending/copied/community_opened/manual_published/skipped/failed — a *third* status vocabulary.

**STEP 10 — Publishing Control (`/publishing-control`).** The extension/claim/reconcile surface ("דורש הכרעה", internal states dispatching/awaiting_confirmation). A *fourth* surface.

## Current User Flow Diagram
```
START (7 competing doors — user guesses)
  ↓
CAMPAIGN WIZARD (7 steps: נכס→תוכן→חיבור→קבוצות→תדירות→גאנט→תגובות)
  ↓  (does NOT activate — "go to the distribution center")
DISTRIBUTION CENTER  (different vocabulary)
  ↓
DAILY TABLE (manual copy-paste: העתק→פתח קהילה→סמן כפורסם)
  ↓
PUBLISHING CONTROL (extension claim + "דורש הכרעה")
  ↓
PUBLISHED (if the user reassembled the mental model themselves)
```

## Friction Metrics (measured from the current UI)
| Metric | Count |
|---|---|
| Competing entry points | **7** (+ property page = 8) |
| Distinct major surfaces to finish one campaign | **4** (wizard, distribution center, daily table, publishing control) |
| Distinct publishing vocabularies | **3** (Gantt "V1"; copy-paste pending/copied; extension dispatching/awaiting_confirmation) |
| Wizard steps | **7** |
| Mid-flow jumps to *other* screens | **≥3** (connect FB, manage groups, "to distribution", social-leads) |
| Moments with no obvious next step | wizard→distribution handoff; distribution→daily; daily→publishing-control |
| "What do I do now?" moments | **≥5** |
| Screens that pass the 5-second test (where am I / what next / primary action) | Campaign wizard steps mostly yes; the **handoffs** all fail |

## Top 10 UX Problems
1. **P0 — No single entry point.** 7 doors to one job. *Where:* sidebar "תקשורת ושיווק". *Hurts:* the user can't even begin. *Fix:* one primary "שיווק בפייסבוק" entry; demote the rest to sub-tabs/advanced.
2. **P0 — The campaign builder never activates.** *Where:* CampaignWizard step 6/7 → "סיום — למרכז ההפצה". *Hurts:* the user finishes 7 steps and nothing is on. *Fix:* the last step is **Review → הפעלת קמפיין**, which schedules through the existing distribution engine in-place, then shows a success state.
3. **P0 — Four surfaces, three vocabularies for "publish".** *Where:* wizard Gantt vs daily copy-paste vs publishing-control extension. *Hurts:* nothing feels like one product. *Fix:* one **Today** execution surface + one **Month** planning surface; the copy-paste and extension paths become one "פרסום מונחה" action with one status language.
4. **P0 — No coherent "campaign" object in the UI.** *Where:* everywhere (raw posts/slots). *Hurts:* the user sees rows, not "ברנר 21 · 18 קבוצות · עד 16.9 · 42 פרסומים". *Fix:* a UX-level campaign summary card over existing rows (no schema change).
5. **P1 — Facebook connection is a mid-wizard step (3/7).** *Hurts:* interrupts the build, risks losing state, sends the user away. *Fix:* connection is a gate before the builder; inside the builder it's a small inline status, not a step.
6. **P1 — Group selection doesn't scale to ~400.** *Where:* wizard step 4 renders every folder×group as buttons; no search/area filter/summary. *Fix:* search + area/city filter + "נבחרו N · אזור: רחובות והסביבה" summary + saved sets.
7. **P1 — Schedule shown as a Gantt "V1/V2" matrix.** *Hurts:* unreadable to an agent. *Fix:* human preview — "א׳ 17.8 · 09:30 קבוצת דירות רחובות · 14:00 נדל״ן שפלה …" + totals.
8. **P1 — Misleading frequency label.** "קמפיין חודשי מלא" actually posts every 3 days. *Fix:* relabel to the truth ("לאורך החודש · כל 3 ימים") and, ideally, expose times/day + days-of-week.
9. **P1 — Engineering terms leak to users.** `discovered` (GroupsView/GroupLibrary), `queued` (PublishAssistant/PostingQueue), "Gantt", "Distribution/Publish Assistant". *Fix:* customer Hebrew everywhere (map below).
10. **P2 — "Comments/leads" sits inside the campaign builder (step 7).** *Hurts:* confuses "creating" with "after publishing". *Fix:* move to the campaign detail / leads area; out of the builder.

---

## New Recommended Journey
```
PROPERTY  (or one "שיווק בפייסבוק" entry)
  ↓
CREATE FACEBOOK CAMPAIGN  (single builder, FB already gated/connected)
  ↓  1 נכס → 2 תוכן → 3 קבוצות → 4 תזמון → 5 סקירה
  ↓
ACTIVATE  (הפעלת הקמפיין — schedules in place)
  ↓
SUCCESS STATE  (קמפיין פעיל · 42 פרסומים · הבא: היום 10:30 · [ליומן])
  ↓
DAILY (“היום”)  ← the morning operational surface
  ↓
ASSISTED PUBLISH  (one "פרסום מונחה" action → confirm → published)
```

## New Flow Diagram
```
START (one door: שיווק בפייסבוק / from a property)
  → BUILDER [נכס · תוכן · קבוצות · תזמון · סקירה]
  → ACTIVATE
  → CAMPAIGN ACTIVE (success)
  → TODAY (what publishes now) —→ ASSISTED PUBLISH —→ PUBLISHED
                                └→ needs attention (reconcile / reconnect)
  MONTH view = planning only (separate from Today)
```

## Screen-by-Screen Specification

### Campaign Builder (single flow, 5 steps)
- **1 · נכס (What are we marketing).** Preselected when entered from a property. Purpose line: "קמפיין שיווק בקבוצות פייסבוק ל<כתובת>". Primary: הבא. Hidden: everything else.
- **2 · תוכן (What will be published).** One large **preview card** (image + text as Facebook shows it) + "צור עם ZI" / "ערוך" / variations behind a "וריאציות" toggle. Hidden: hashtags/raw fields until expanded.
- **3 · קבוצות (Where).** Search + area/city filter + status chips (פעילות / זמינות). Header answers 3 Qs: "יש לך N קבוצות · נבחרו M · אזור: …". Saved sets ("רחובות", "משקיעים"). Empty state: inline "הוסף קבוצה" (no jump away).
- **4 · תזמון (When).** Plain questions: כמה זמן (עד תאריך) · כמה פעמים ביום · אילו ימים · אילו שעות. Live human preview + total: "17.8–16.9 · יום־חמישי–ראשון · ~44 פרסומים".
- **5 · סקירה ואישור (Review).** One card: נכס · תוכן · קבוצות (M) · תקופה · תדירות · סה״כ פרסומים · פרסום ראשון. Truth line: *"ZONO יכין ויתזמן כל פרסום. בזמן הפרסום, התוסף ילווה אותך בפרסום בקבוצה בפייסבוק — הפרסום מאושר על ידך."* Primary CTA: **הפעלת הקמפיין** (single, dominant). Secondary: שמור כטיוטה.
- Stepper `1 נכס · 2 תוכן · 3 קבוצות · 4 תזמון · 5 סקירה`. Back never destroys selections; draft autosaves.
- **Mobile 390/430:** one column, sticky bottom bar with the single primary CTA; group list is a full-height searchable sheet.

### Group Selection (hundreds of groups)
Purpose: choose destinations without overwhelm. Show: search, area/city filter, status chip (פעילה/זמינה), members count, "נבחרו" running total + area summary, saved sets, "בשימוש לאחרונה". Hidden: raw "discovered/active" internal states → "נמצאה"/"פעילה". Empty: "לא נמצאו קבוצות — נסה חיפוש אחר". Error: inline, never a raw code.

### Scheduling
Purpose: translate intent → plan without exposing the slot algorithm. Inputs: duration, times/day, days, hours. Output: human day-by-day preview + total. Never promise recurrence the engine can't do (it is slot-spreading, not calendar-recurrence — say "לאורך התקופה", not "every 1st of the month").

### Review / Activation
One confirmation card (fields above) + the assisted-publishing truth line + one CTA **הפעלת הקמפיין**. On success → the Campaign Active state, not a generic page.

### Daily Campaign Calendar (most important)
- **Today view (default).** Header "היום · 17 באוגוסט · N פרסומים". 
- **Post card anatomy:** time · property (ברנר 21) · group name · **status pill** · one primary action.
- **Status hierarchy (customer words):** מתוזמן · מוכן לפרסום · ממתין לאישור · פורסם · נכשל · **דורש הכרעה** · בוטל. Never queued/dispatching/awaiting_confirmation.
- **Primary action per card:** מוכן לפרסום → **פרסום מונחה**; דורש הכרעה → **הכרעה**; נכשל → **פרטים / נסה שוב**.
- **Campaign grouping:** cards grouped/or tagged by campaign+property so 3 concurrent campaigns don't blur.
- **Extension-required state:** if the extension isn't installed/ready, a single banner "כדי לפרסם בקבוצות יש להתקין/להפעיל את תוסף ZONO [התקנה]" — not per-card errors.
- **Reconciliation state:** "לא הצלחנו לוודא אם הפרסום עלה" → אכן פורסם / לא פורסם / ביטול (no "lost acknowledgment").

### Monthly Calendar (planning only)
Answers: how is my month distributed, empty days, totals, which campaigns are active. Not an execution surface. Reuse the existing RTL calendar (prev=ChevronRight/next=ChevronLeft already correct); add density aggregation "+N".

### Publishing Flow (Ready → Published)
```
מוכן לפרסום → [פרסום מונחה] → התוסף פותח את הקבוצה → הפרסום מאושר ידנית → אישור → פורסם ✓
```
One click to start; the extension guides; ZONO marks published only on human confirmation; ambiguous → דורש הכרעה (never silent, never auto-repost).

### First-Time Onboarding (minimal)
Three tiny inline explainers, shown once, in context (not a tour): (a) what groups are & "פעילה vs נמצאה", (b) what the extension is & why ("פרסום מונחה — אתה מאשר, ZONO מכין"), (c) the daily workflow ("כל בוקר: היום → פרסום מונחה"). No giant onboarding system.

## Hebrew Copy Changes (customer-facing)
| Internal / current | Customer Hebrew |
|---|---|
| discovered | נמצאה |
| active (group) | פעילה |
| queued / scheduled | מתוזמן |
| dispatching / awaiting_confirmation | ממתין לפרסום / ממתין לאישור |
| awaiting_reconciliation | דורש הכרעה |
| "גאנט ואישור" | סקירה ואישור |
| "קמפיין חודשי מלא" (every 3 days) | לאורך החודש · כל 3 ימים |
| "מרכז ההפצה" / "Publish Assistant" / "Distribution" | שיווק בפייסבוק / פרסום בקבוצות (one name) |
| "סיום — למרכז ההפצה" | הפעלת הקמפיין |

## Components To Reuse
Existing stepper pattern (CampaignWizard), `Icon`/IconSurface (Phase 3D), the RTL `CalendarView` (chevrons already correct), Publishing Control's reconciliation section ("דורש הכרעה" + reconcile actions — already good), `Button`/status-pill primitives, `GroupLibrarySection` search/filter table (extend for the builder).

## Components To Consolidate
The **three** publishing surfaces (`DailyDistributionView` copy-paste, `PublishingControlView` extension/reconcile, wizard Gantt) → one **Today** surface with one status language and one "פרסום מונחה" action. The **seven** sidebar entries → one "שיווק בפייסבוק" hub with internal tabs.

## P0 Changes (before launch)
- One entry point ("שיווק בפייסבוק"); demote the other 6.
- Builder ends in **הפעלת הקמפיין** (activates in place) + success state — no dead-end handoff.
- One **Today** execution surface with customer status words; one "פרסום מונחה" action.
- Campaign summary object (UX-level, over existing rows).

## P1 Changes
- Move FB connection to a pre-builder gate; inline status inside.
- Group selection: search + area filter + selection summary + saved sets at 400-scale.
- Replace the Gantt with a human schedule preview; expose times/day + days.
- Fix the misleading "קמפיין חודשי מלא" label.
- Purge engineering terms (discovered/queued/dispatching) from all customer screens.

## P2 Changes
- Group recommendations (only if real signals exist — else "בשימוש לאחרונה / הכי פעילות").
- Move comments/leads out of the builder into campaign detail.
- Month-view density aggregation polish.

## Implementation Order
1. Copy/terminology purge (safe, no architecture) — status labels, "גאנט"→"סקירה", frequency label, entry naming.
2. Builder final step → **Review → Activate** wired to the existing distribution scheduler; success state.
3. Single **Today** surface unifying the two publishing UIs under one status language.
4. Group-selection scale (search/filter/summary/saved sets).
5. Human schedule preview replacing the Gantt.
6. Entry-point consolidation (sidebar → one hub with tabs).
7. Minimal in-context onboarding.

*(Steps 1 done in this pass as safe copy fixes; 2–7 require staged UI work + retest, kept out of this pass to avoid untested changes to the publishing surfaces.)*

---

# IMPLEMENTATION UPDATE — Campaign UX P0 (activation)
*(The diagnosis above is preserved as product history. This section records what was implemented.)*

## What was implemented
The **P0 dead-end is fixed**: the Campaign Wizard now activates a real campaign end-to-end instead of handing off to another admin surface.

- **New server action** `src/lib/facebook-groups/activate.ts` → `activateFacebookCampaignAction`. Server-trusted; reuses the EXISTING distribution engine — no second scheduler, no new tables:
  `createCampaignAction` (campaign identity) → `selectGroupsAction` (group links) → `generateCampaignVariationsAction` (persisted post content) → `previewPostingQueueAction` + `createPostingQueueAction` (real `distribution_posts` schedule via `distributionSchedulerService.buildQueue`).
  - **Server-derived**: schedule window (09:00–20:00), cadence→horizon/maxPerDay, start/end dates. Browser sends only property, groups, cadence, start day.
  - **Validation**: auth + org; property re-checked to belong to the org (never trust the browser id); ≥1 group; valid cadence.
  - **Partial-failure cleanup**: if variations or queue-build fail, the just-created campaign is deleted → no empty/orphan campaign.
  - **Idempotency**: client single-flight (ref guard + disabled button, no navigation until the server confirms); `buildQueue` also de-dups slots.
- **Rewritten builder** `src/components/facebook-groups/CampaignWizard.tsx`:
  - **6 steps** (was 7): נכס · תוכן · חיבור פייסבוק · קבוצות · תזמון · **סקירה ואישור**. Removed the post-publish "תגובות" step from the builder (moved to the success note).
  - **Review** = a human summary (נכס · מחיר · קבוצות · תדירות · מתחיל · ~פרסומים) + the assisted-publishing truth line. **The Gantt / V1·V2 matrix was removed entirely.**
  - **One dominant CTA**: **הפעלת הקמפיין** (loading: "מפעילים את הקמפיין…", disabled unless a property + groups + Facebook connected).
  - **Success state** (not a generic dashboard): "הקמפיין פעיל ✅" with real persisted values (groups, total posts, end date, next publish) + primary **"לפרסומים של היום ←"** (`/distribution/daily`) and secondary "לצפייה בקמפיין".
  - Group step shows the running **selected-count**; activation is impossible with 0 groups or no property.
- **Copy** (prior pass, retained): truthful frequency label, "סקירה ואישור", no Gantt jargon.

## Before → After (campaign creation → active → today)
| Metric | Before | After |
|---|---|---|
| Builder steps | 7 | **6** |
| Dead-end handoff to another admin screen | 1 ("סיום — למרכז ההפצה") | **0** |
| "What do I do now?" after finishing the builder | yes | **no** (success state + 1 CTA) |
| Screens from *activate* to *know what to publish today* | ≥3 (distribution center → daily → self-assemble) | **2** (success → Today) |
| Engineering artifacts in the builder (Gantt V1/V2) | present | **removed** |
| Real schedule persisted on finish | no (planned client-side only) | **yes (distribution_posts)** |

## Campaign context
Scheduled posts are associated to one campaign via the existing `distribution_campaigns` row (created at activation) + `distribution_campaign_groups` links + `distribution_posts.campaign_id`. No schema change.

## Daily view integration
Activated posts are ordinary `distribution_posts` created by the shared scheduler, so they already surface in the existing daily/publishing surfaces and are claimed by the existing assisted-extension flow — unchanged.

## Remaining (P1/P2 — not in this pass)
- P1: move FB connection to a pre-builder gate (still a step here); group selection search/filter/saved-sets at 400-scale; expose times/day + days-of-week + human day-by-day preview (currently sensible server defaults 09:00–20:00).
- P1: unify the two publishing surfaces (daily copy-paste + publishing-control) under one status language.
- P2: analytics funnel events; group recommendations; move comments/leads into a campaign detail page.
- Entry-point consolidation (7 sidebar doors → 1 hub) — not touched this pass.

---

# Daily Publishing Unification Implementation (P1)

## The critical finding (why it felt like "multiple products")
Facebook posting was split across **three disconnected data pipelines**:
1. `/distribution/daily` (`DailyDistributionView`) read `daily_distribution_batches` / `daily_distribution_items` — the old **community-recommendation batch** (manual copy-paste: העתק→פתח קהילה→סמן).
2. **Campaign activation** (the P0) writes **`distribution_posts`** — which surfaced **only** in `/publishing-control` (the extension claim/reconcile engine).
3. The community-matching engine (`distribution_plan_items`) fed #1.

**Consequence:** after activating a campaign, the success CTA sent the user to `/distribution/daily`, which showed pipeline #1 — so **the campaign's own posts did not appear there**. That seam is the root cause of "feels like multiple products."

## What was implemented
- **One customer status vocabulary** — `src/lib/distribution/today-status.ts` (pure + self-check). Maps engine states → `מתוזמן · מוכן לפרסום · מפרסם · דורש הכרעה · דורש טיפול · מושהה · פורסם · בוטל`, plus the single dominant action per state. No engine state is ever shown raw.
- **One canonical Today** — `/distribution/daily` re-sourced to `getPublishingControlData()` (the **same** `distribution_posts` a campaign creates + the extension publishes). New `TodayView` renders: header + progress ("N פרסומים · X פורסמו · Y ממתינים"), a single **next-action hero**, a chronological **timeline** with normalized status pills and **one action per item**, **inline reconciliation** ("לא הצלחנו לוודא… פורסם / לא פורסם / ביטול" — no "lost-ack" jargon), plus **completion** ("סיימת את הפרסומים להיום ✓") and **empty** ("אין פרסומים… יצירת קמפיין") states. Overdue items are marked "באיחור". Reuses the existing `reconcilePostAction` / `retryPostAction` / `resumePostAction` — no new publishing mechanics. Advanced surfaces moved under "אפשרויות נוספות".
- **Navigation consolidation** — the marketing sidebar now leads with the real flow: **פרסומים להיום · קמפיינים · קבוצות פייסבוק**, then Facebook/מרכז שיווק/סטודיו, with **בקרת פרסום (מתקדם)** + מודיעין קבוצות demoted. The duplicate admin door "פרסום בקבוצות → /distribution" was dropped from primary nav (still reachable via "אפשרויות נוספות"). No route/capability removed.

## Status mapping (documented)
| engine `publish_state` / status | customer label | dominant action |
|---|---|---|
| queued / scheduled / draft (not due) | מתוזמן | — |
| queued / scheduled (due now) | מוכן לפרסום | (extension publishes; manual "פתח קבוצה" fallback) |
| dispatching / awaiting_confirmation | מפרסם | — |
| awaiting_reconciliation / needs_review | דורש הכרעה | בדיקה והכרעה (פורסם/לא פורסם/ביטול) |
| failed / dead_letter | דורש טיפול | נסה שוב |
| paused | מושהה | חידוש |
| published | פורסם | — |
| cancelled / skipped | בוטל | — |

## Before → After
| Metric | Before | After |
|---|---|---|
| User-facing publishing surfaces | 2–3 (daily batch · publishing-control · admin) | **1** (Today) |
| Status vocabularies exposed | 3 | **1** |
| Campaign posts visible in Today | **no** (wrong pipeline) | **yes** |
| Primary marketing entry points | 7 competing | **3 clear** (Today · Campaigns · Groups) + advanced demoted |
| Actions per item | 3–5 equal buttons | **1 dominant** |

## Remaining P2 (not launch-blocking)
- A UI-triggered "publish now" + "mark published" for campaign `distribution_posts` (today it relies on the extension's autonomous claim; the manual copy-paste path exists only for the legacy batch pipeline). Consider a per-post manual-publish action on the ready card.
- Retire/merge the legacy `daily_distribution_items` community-batch pipeline (or reframe it as a suggestion engine feeding campaigns) so there is truly one source.
- Group-selection search/filter/saved-sets at 400-scale inside the builder; times/day + day-by-day preview; FB connection pre-gate; analytics funnel events.

---

# Explicit Publish-Now Loop (P2)

## Previous gap
Today showed "מוכן לפרסום" but the extension claimed work autonomously by poll order — the user could not explicitly say "publish THIS one now." The hero read "התוסף יפרסם" with no action.

## Final interaction
```
מוכן לפרסום → [פרסום עכשיו] → "מכינים את הפרסום…" → בתור לפרסום ✓
  → תוסף ZONO claims THIS post next → human publishes in the group → confirm
  → Today updates (פורסם) → next ready item becomes the hero
```
The hero and each ready timeline item now expose one dominant **פרסום עכשיו**. After a click the item shows **בתור לפרסום ✓** with a reminder that the extension publishes it and the user confirms.

## Safety model (no new engine, no fake success)
"פרסום עכשיו" **does not** mark the post published. It sets a one-shot priority signal `publish_requested_at` (migration `20271260120000_p9_3_publish_now_priority.sql`). The SAME atomic `claim_next_distribution_post` then serves that post **next** to the user's extension, and the SAME lease + human-confirm + reconciliation flow runs. The signal is **consumed (cleared) on claim**, so it can never loop.
- **Eligibility**: a requested post is claimable even before its scheduled time (the user explicitly asked to publish now).
- **Precedence (poll vs explicit)**: `ORDER BY (publish_requested_at IS NULL), publish_requested_at, scheduled_at, created_at` → requested posts win (oldest request first), then schedule order. **Proven** by SQL: for `[requested-late, due-no-request, requested-early, future-no-request]` the claim order was `requested-early → requested-late → due → future`.
- **Authorization**: server-side — auth, org, post belongs to org, state ∈ {queued,scheduled,draft}, not terminal/paused/dispatching. The browser post id is never trusted.
- **Idempotency / double-click**: setting `publish_requested_at` is idempotent; the atomic `FOR UPDATE SKIP LOCKED` claim guarantees a single claim; nothing here publishes, so **no duplicate external post** can result.
- **Lost ack**: unchanged — if the claimed post's ack is lost, the existing P9.1 sweep moves it to `awaiting_reconciliation` → "דורש הכרעה". No auto-republish.
- **Extension missing**: the post simply stays requested/queued (no fake publishing state); the user is told the extension must be active.

## Before → After (clicks to process one post from Today)
| | Before | After |
|---|---|---|
| Trigger a specific post | not possible from Today (wait for poll) | **1 click** (פרסום עכשיו) |
| Leave Today to publish | sometimes (publishing-control) | **no** |
| Confirm/next | reconcile-only | hero advances to next ready item |

## Legacy daily pipeline status
The old `daily_distribution_items` community-batch is **not** customer-facing Today and does not compete in navigation. It remains as technical debt (retire or reframe as a suggestion engine) — unchanged this task.

## Files (P2)
- `supabase/migrations/20271260120000_p9_3_publish_now_priority.sql` — `publish_requested_at` column + claim priority (applied + SQL-verified).
- `src/lib/distribution/publishing-control-actions.ts` — `requestPublishNowAction` (guarded, one-shot, org-scoped, audited).
- `src/app/(app)/distribution/daily/TodayView.tsx` — פרסום עכשיו in hero + timeline.

## Remaining P2 (non-blocking)
- Live content/media preview drawer before publishing (context is shown compactly today).
- Auto-refresh Today after the extension confirms (currently on navigation/revalidate).
- Analytics funnel events (`facebook_today_publish_clicked/…`).
- Retire the legacy `daily_distribution_items` pipeline.
