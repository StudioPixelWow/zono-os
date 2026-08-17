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
