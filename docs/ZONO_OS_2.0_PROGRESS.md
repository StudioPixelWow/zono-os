# ZONO OS 2.0 — סיכום התקדמות ומפת דרכים

## חלק א׳ — מה כבר נעשה

### 1. אבחון (3 שלבי אודיט)
| מסמך | מה הוא מכיל |
|---|---|
| `docs/PERSISTENCE_AUDIT.md` | אודיט שכבת ה‑Persistence: ~72% כיסוי, 3 פרצות RLS קריטיות, טבלאות/כתיבות/קריאות חסרות. |
| `docs/ARCHITECTURE_AUDIT_PHASE2.md` | אודיט ארכיטקטורה: **אין event bus**; automation/notifications/search כבויים ב‑18/18 האירועים; 14 מערכות כפולות. |
| `docs/ARCHITECTURE_AUDIT_PHASE3.md` | תכנון OS יעד: Domain Model קנוני, Kernel, Capability Services, Roadmap. |

### 2. SQL לתיקון (מוכן להרצה ב‑Supabase)
- `docs/supabase-audit-fixes-ALL.sql` — קובץ מאוחד, guarded, idempotent: תיקוני RLS קריטיים (Storage / Facebook / WhatsApp), הידוק `deal_profiles`, FK ל‑`zono_*`, `deals→bigint`, טבלאות `approval_decisions` / `user_ui_preferences` / `journey_notes`, חבילת אינדקסים.
  ⚠️ **עדיין לא הורץ על מסד הנתונים החי.**

### 3. יישום ZONO OS 2.0 (הכל בוצע, verified, commit ל‑main)

| שלב | מה נעשה | Commit |
|---|---|---|
| **0.4** | מחזור חיים לפגישה (השלמה/ביטול/דחייה/no‑show + outcome + משימת המשך) + תיקון KPI | `1285668` |
| **0.1** | זהות עסקה קנונית: `public.deals` = מקור אמת, `deal_profiles` = פרויקציה 1:1; Quick‑Create מופיע ב‑Deals OS; תיקון FK של מסמכים משפטיים | `a9044bd` |
| **0.2** | סנכרון עסקה נסגרה ↔ נכס נמכר (דו‑כיווני, idempotent, ללא סתירות) | `ca0a011` |
| **0.3** | קישור מוכר: `property_sellers` קנוני + גשר תאימות ל‑`properties.seller_id` (backfill דו‑כיווני) | `ffa9cca` |
| **0.5** | מחזור חיים והמרה לליד: שירות קנוני, המרה מודעת‑כוונה ל‑Buyer/Seller/שניהם + dedup; תיקון באג "כוונת מוכר יוצרת קונה" | `5ecbbee` |
| **1** | **Event Kernel**: טבלת `domain_events` (append‑only, RLS, idempotent) + `emitBusinessEvent()` + רישום אירועים מרכזי; ~13 סוגי אירועים נפלטים | `cce3258` |

**מה זה נותן:** כל מוטציה עסקית מרכזית עכשיו פולטת אירוע דומיין דורבילי, זהות העסקה/הנכס/המוכר/הליד אחידה, ואין עוד סתירת "עסקה נסגרה אבל הנכס עדיין באתר".

**Stage 0 הושלם ב‑100%. Stage 1 ~80% (הבסיס + הפולטים הראשונים).**

---

## חלק ב׳ — מפת הדרכים להמשך

### להריץ עכשיו (תפעולי, לא קוד)
1. **להריץ את המיגרציות על ה‑DB החי** — `20260916–20260919` + קובץ ה‑SQL של האודיט.
2. **לרג׳נרט את טייפי Supabase** אחרי ההרצה (כדי להסיר את ה‑cast של `domain_events`).

### השלמת Stage 1 (שאריות)
- **Outbox worker** (cron) שמעבד `domain_events` (`pending → done`), עם retry ו‑dead‑letter.
- הרחבת הפולטים לשאר הפקודות (document, facebook/whatsapp connected, task, journey, external listing).

### Stage 2 — Timeline כ‑Guarantee של הקרנל
Subscriber שהופך כל אירוע ל‑`activity_events` (idempotent לפי event_id) ומגשר את הלוגים המקבילים (`activities`, `communication_*`, `whatsapp_messages`, `document_audit_logs`). כל cockpit קורא timeline אחד. → העמודה "Timeline" הופכת ✅.

### Stage 3 — הפעלת Automation + Notifications
- מיפוי אירועים → `automation_workflows` (הצעות מאושרות בלבד, לא auto‑send).
- נתיב אחד event→notification; איחוד `notification_state` מול `public.notifications` היתומה; תיקון פעמון ה‑header. → 2 העמודות הכבויות הופכות ✅.

### Stage 4 — Search / Knowledge Graph / AI Memory
- פרויקציית חיפוש קנונית לכל הישויות (properties/buyers/sellers/leads/deals/agents/meetings/tasks/documents).
- עדכון גרף **אינקרמנטלי** מאירועים (במקום rescan כל 24 שעות).
- מאגר זיכרון AI אחד שה‑reasoning באמת קורא + שמירת שיחות Ask ZONO.

### Stage 5 — איחוד Journeys
מ‑5 מערכות "journey" ל‑spine אחד עם סוגי‑ישות (buyer/seller/lead/property/deal); פרישת המערכת הקפואה; Journey Center הופך לפרויקציה.

### Stage 6 — איחוד Documents & Signatures
Stack מסמכים אחד + ledger חתימות אחד (עדיפות למכונת‑המצבים העשירה `legal_*`), עם גישור נתונים legacy ואירועי document.* לקרנל.

### Stage 7 — איחוד Branding & Websites
`brand_identity_profiles` = מקור branding יחיד; אתרים צורכים ולא משכפלים זהות; renderer אחד לסוכן ואחד למשרד (מיזוג `/agent`↔`/ai-agent`, `/site`↔`/ai-site`) עם lead‑capture ואנליטיקס בכולם.

### Stage 8 — איחוד Marketing & External Listings
מיזוג 3 stacks שיווק לזהות‑קמפיין אחת עם אישורים נשמרים ואטריביושן; פיוס 2 צינורות ה‑external‑listings (`external-listings` מול `property-radar`).

### Stage 9 — Capability SDK
חוזה אופקי אחד לכל ישות (subjectRef / timeline / search / documents / notifications / report / edges / public‑safe snapshot) — הוספת יכולת לישות מפסיקה לדרוש חיווט מותאם בהרבה קבצים.

### Stage 10 — Projections / איחוד דשבורדים
`decision-intelligence` = עמוד השדרה הנשמר; Executive/CoS/BI/Daily/Attention הופכים ל‑views מעל signals קנוניים; דשבורדים קוראים פרויקציות במקום recompute‑on‑read.

---

## מדדים
- **התקדמות כוללת ZONO OS 2.0:** ~20% (Stage 0 + Stage 1 בסיס).
- **בשלות קרנל:** ~40% (store+emit+registry קיימים; subscribers/outbox בהמשך).
- **בשלות ארכיטקטורה כוללת:** 5.5 → ~9 לאחר Stage 2–4 + איחוד הכפילויות.
- **סיכון:** נמוך (הכל additive, reversible, best‑effort).

**המהלך בעל המנוף הגבוה ביותר הבא:** Stage 2 (Timeline subscriber) — הופך ~15 תאים מ‑❌ ל‑✅ ומדליק את מה שכל השאר תלוי בו.
