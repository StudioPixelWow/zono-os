# ZONO — WhatsApp Execution OS ("WeBot Killer")
### 86-Feature Coverage · Compliance Notes · Manual Test Flow

מודול ה-WhatsApp Execution OS נבנה במלואו על גבי הארכיטקטורה הקיימת של ZONO — ללא בנייה מחדש של מודולים קיימים, עם אינטגרציה מלאה ל-Decision Brain, ובמתכונת דטרמיניסטית, תואמת-מדיניות, ומדורגת (graceful degrade) למצב ידני כשאין API רשמי.

---

## 1. ארכיטקטורה

**מסד נתונים** — מיגרציה אחת מאוחדת (`20260701120000_whatsapp_os.sql`), 14 טבלאות (קונסולידציה מ-27 בספק): `whatsapp_accounts`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_drafts`, `whatsapp_call_events`, `whatsapp_followups`, `whatsapp_campaigns`, `whatsapp_segments`, `whatsapp_smart_links`, `whatsapp_smart_link_events`, `whatsapp_knowledge_base`, `whatsapp_ai_actions`, `whatsapp_daily_missions`, `whatsapp_audit_logs`. כולן org-scoped עם RLS (select לפי `current_org_id()`, כתיבה `has_min_role('agent')`, מחיקה `has_min_role('manager')`).

**מנוע טהור** (`engine.ts`, client-safe, ללא I/O וללא LLM) — זיהוי כוונה, הסמכת ליד, חילוץ פעולות, סיווג סיכון לתוכן רגיש, גזירת מצב תיבה, קטלוג סגמנטים, מטרות קמפיין, וקופי שחזור שיחה. כל היגיון ההחלטה דטרמיניסטי.

**שירות + פעולות** (`service.ts` server-only, `actions.ts`) — מרכז פיקוד, חיבור תואם-מדיניות (status בלבד, ללא אסימון), קליטה ידנית + הסמכה, טיוטה ← אישור ← שליחה ידנית, שחזור שיחות שלא נענו, מעקבים, קמפיינים (תור ידני), קישורים חכמים, ומשימות יומיות.

**ממשק** — `/whatsapp` מרכז פיקוד (תיבה, לידים חמים, שיחות שלא נענו, מעקבים, קמפיינים, קישורים חכמים, אישורים, סגמנטים, משימות, הגדרות) · `/admin/whatsapp-os/coverage` מטריצת 86 פיצ׳רים · `/w/[slug]` נחיתה ציבורית לקישור חכם · ווידג׳ט בית + ניווט בסרגל הצד.

**Decision Brain** — `buildWhatsappAttentionRows` מזרים ארבעה סוגי איתותים (ליד חם, ממתין לאישור, שיחה שלא נענתה, שיחה שקטה) ל-Priority Queue / Today's Focus, ללא לולאות הזנה חוזרת.

---

## 2. מטריצת 86 הפיצ׳רים

86/86 ממופים. סטטוס: **מוטמע** (לוגיקה דטרמיניסטית פעילה היום), **חלקי** (תשתית קיימת, מורחב עם ספק), **תלוי ספק** (דורש WhatsApp Business / Meta Cloud API רשמי).

| שכבה | מוטמע | חלקי | תלוי ספק |
|---|---|---|---|
| Communication Hub (1–7) | 5 | 1 | 1 |
| AI WhatsApp Assistant (8–15) | 5 | 2 | 1 |
| Smart Qualification (16–25) | 8 | 2 | 0 |
| Missed Call Engine (26–30) | 4 | 0 | 1 |
| AI Follow-Up (31–40) | 5 | 4 | 1 |
| WhatsApp Marketing AI (41–55) | 10 | 4 | 1 |
| Client Experience (56–65) | 8 | 2 | 0 |
| Intelligence (66–75) | 9 | 1 | 0 |
| Agent AI (76–86) | 11 | 0 | 0 |
| **סה״כ** | **65** | **16** | **5** |

חמשת הפיצ׳רים תלויי-הספק: שליחה אוטומטית מלאה (8), שחזור אוטומטי בוואטסאפ (27), מעקב לפי פתיחת הודעה / אישורי קריאה (39), ניתוח הקלטות קוליות (5). אלו פעילים במצב ידני עד לחיבור Meta API רשמי. המטריצה המלאה נטענת חיה ב-`/admin/whatsapp-os/coverage`.

---

## 3. הערות תאימות (Compliance)

* **ללא שמירת אסימונים/סיסמאות.** `whatsapp_accounts` שומרת סטטוס בלבד (`connection_status`, `*_status`). חיבור מציב מצב `sandbox` — ללא אישורי גישה.
* **ללא אוטומציה לא רשמית, ללא scraping, ללא דפדפן.** רק WhatsApp Business / Meta Cloud API רשמי, או מצב ידני.
* **כל הודעה יוצאת: טיוטה ← אישור ← שליחה ידנית.** אין שליחה אוטומטית. `markDraftSent` מסמן `sent_manual` בלבד; `sent_api` שמור לחיבור רשמי + הרשאה.
* **תוכן רגיש דורש אישור.** `classifyRisk` מסמן מחיר / משפטי / מו״מ / עמלה / מימון / חוזה / חתימה / זמינות כ-`sensitive` → `requires_approval`; אישור הודעה רגישה דורש `manager`.
* **קמפיינים = תור ידני מבוקר.** ללא שליחה המונית לא בטוחה; יצירת קמפיין מוגבלת ל-manager.
* **פרטיות בקישורים חכמים.** `/w/[slug]` משתמש ב-service-role לאחר ולידציית slug; ללא חשיפת PII; אירועי קליק נספרים בלבד.
* **Audit מלא.** כל פעולה משמעותית נכתבת ל-`whatsapp_audit_logs` (actor, event, risk, conversation).
* **Graceful degrade.** ללא חיבור → באנר ״לא מוגדר״ ומצב ידני; אף נתיב לא נכשל בהיעדר API.

---

## 4. אימות (Verification)

* Scoped `tsc --noEmit` על כל קבצי המודול: **EXIT 0**.
* `eslint` על כל קבצי המודול: **0 errors** (אזהרה אחת תוקנה).
* Client/server boundary audit: ה-view מייבא ערכים מ-`engine` בלבד ו-`import type` מ-`service` — ללא דליפת `next/headers` ל-bundle הלקוח.
* PGlite migration replay של קובץ ההדבקה הידנית: **REPLAY OK · 14 whatsapp_ tables**.

---

## 5. תהליך בדיקה ידני (Manual Test Flow)

1. פתח `/whatsapp` → באנר ״לא מוגדר״ → ״חבר (ארגז חול)״ → סטטוס משתנה ל-sandbox (ללא אסימון).
2. תיבה → הזן הודעה נכנסת (״מחפש לקוח לקנות דירה בתל אביב, תקציב עד 3 מיליון, דחוף״) → ״רשום ונתח״ → נוצרת שיחה עם כוונת קנייה, ציון ליד גבוה, ופעולות מחולצות.
3. בכרטיס השיחה → ״טיוטת תשובה״ → הזן תוכן רגיש (״אפשר להתמקח על המחיר?״) → ״צור טיוטה״ → מסומנת ״דורשת אישור״.
4. לשונית אישורים → ״אשר״ (חוסם משתמש לא-מנהל בהודעה רגישה) → ״סמן כנשלח״ → `sent_manual`.
5. שיחות שלא נענו → רשום שם → נוצרת שיחה + טיוטת שחזור.
6. קמפיינים (מנהל) → צור קמפיין → נוצר כטיוטה, שליחה מבוקרת.
7. קישורים חכמים → צור → פתח `/w/<slug>` בחלון נפרד → נחיתה נטענת, click_count עולה.
8. ״רענן משימות״ → נוצרות משימות יומיות מלידים חמים + אישורים ממתינים.
9. הרץ את ה-Decision Brain → איתותי WhatsApp מופיעים ב-Today's Focus.

---

## 6. הוראות הטמעה (Supabase)

הדבק את התוכן של `supabase/manual-sql/whatsapp_os.txt` (נקי מהערות, אומת ב-replay) לעורך ה-SQL של Supabase והרץ. לאחר מכן בצע `git push` מהטרמינל שלך כדי לפרוס את שכבת היישום.
