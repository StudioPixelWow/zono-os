# ZONO — Communication Intelligence OS
### Turn every interaction into intelligence

מודול מודיעין התקשורת נבנה על גבי שכבת התקשורת והפעילות הקיימת (`communication_threads`, `communication_commitments`, `communication_followups`, `activity_events`) — מבלי לבנות מחדש את ה-CRM, העסקאות, ההמלצות, התחזית, ההכנסות, האוטומציה או ה-Decision Brain. כל אינטראקציה — וואטסאפ, שיחה, הודעה קולית, פגישה, אימייל, פעילות פורטל ואתר — נקלטת לאירוע מנורמל אחד והופכת למודיעין דטרמיניסטי.

---

## 1. בסיס נתונים — 10 טבלאות חדשות

מיגרציה: `20260702120000_communication_intelligence_os.sql` (אומתה ב-PGlite replay, 11 טבלאות כולל reuse). כל הטבלאות org-scoped (`org_id` + `current_org_id()`), RLS בלולאת do-block (select לפי org, insert/update `agent`, delete `manager`).

`communication_events` (אירוע מנורמל מכל מקור · source/channel/direction/intent/sentiment/transcript) · `communication_summaries` (סיכומים מתגלגלים: מה הלקוח רוצה, מה השתנה, מה חוסם, הצעד הבא) · `communication_entities` (חילוץ ערים/תקציב/חדרים/לו״ז) · `communication_objections` (9 סוגי התנגדויות + severity + resolution) · `communication_sentiment` (7 מצבים) · `communication_intents` · `communication_risks` (6 סוגי סיכון) · `communication_opportunities` (6 סוגי הזדמנות) · `client_memory` (זיכרון לקוח דורסטבילי — כולל זיכרון קונה ומוכר מאוחד) · `conversation_memory` (זיכרון עבודה פר-שיחה: open loops, established facts).

**קונסולידציה מתועדת:** מודיעין פגישות והודעות קוליות נכתב לתוך `communication_events` (source=`meeting`/`voice_note`) + `communication_summaries` (scope), במקום טבלאות `meeting_*`/`voice_*` נפרדות — נמנעת כפילות עם טבלת `meetings` הקיימת.

---

## 2. שירותים, מנועים ואיתותים

**מנוע טהור** (`comm-intelligence/engine.ts`, client-safe, ללא I/O/LLM): `detectIntents` (12), `detectObjections` (9: מחיר/מימון/תזמון/אמון/תחרות/מיקום/מצב הנכס/צריך לחשוב/צריך להתייעץ), `detectSentiment` (7: חיובי/ניטרלי/שלילי/מתוסכל/נלהב/דחוף/צונן), `extractEntities`, `detectCommitments` (סוכן/לקוח), `computeRisks` (6: היעלמות/עסקה/נטישת מוכר/נטישת קונה/כשל תקשורת/הזדמנות אובדת), `computeOpportunities` (6: קונה מוכן/מוכר מוכן/תמחור/הפניה/ביקורת/סגירה), `mergeClientMemory`, `classifyEngagement`, `agentAIAnswers`.

**שירות** (`service.ts`, server-only): `ingestCommunication` (כותב אירוע + סנטימנט + כוונות + התנגדויות + ישויות + התחייבויות + זיכרון לקוח/שיחה, ואז recompute), `recomputeEntity` (מרענן snapshot סיכונים/הזדמנויות פר-ישות), `recomputeAllEntities`, `getCommunicationCommandCenter`, `getUnifiedTimeline`, `getAgentAI` (מה קרה / מה השתנה / מה הבא / מה חוסם), `getClientMemory`, `resolveObjection`, `markCommitmentFulfilled`, `markOpportunityActioned`. פעולות ב-`actions.ts`.

**Decision Brain** — `buildCommIntelAttentionRows` מזרים: `communication_risk`, `communication_opportunity`, `commitment_broken`, `objection_detected` (+`client_engaged`/`client_disengaged` נגזרים מ-engagement_score) ל-Priority Queue / Today's Focus. תוסף בלבד, ללא לולאות.

---

## 3. ממשק

`/communication` מרכז פיקוד: KPIs (התנגדויות חדשות, הבטחות שנשברו, סיכוני תקשורת, קונים מוכנים, מוכרים מוכנים, אירועים) + ציר זמן מאוחד (מציג כל מקור עם אייקון, כוונה, סנטימנט) + לשוניות התנגדויות / התחייבויות שנשברו / סיכונים / הזדמנויות / קליטת תקשורת. כפתורי פעולה: סמן התנגדות כפתורה, סמן התחייבות כבוצעה, סמן הזדמנות כטופלה. ווידג׳ט בית `CommIntelDashboardSection` + ניווט בסרגל הצד.

---

## 4. אימות

Scoped `tsc --noEmit`: **EXIT 0** · `eslint`: **0 errors** (אזהרה תוקנה) · client/server boundary: ה-view מייבא ערכים מ-`engine` בלבד ו-`import type` מ-`service` (ללא דליפת `next/headers`) · PGlite replay של קובץ ההדבקה: **REPLAY OK, 11 טבלאות**.

## 5. תהליך QA ידני

1. `/communication` → לשונית ״קליטת תקשורת״ → בחר קונה + הדבק UUID + ״מחפש דירה 4 חדרים בתל אביב עד 3 מיליון, אבל המחיר נראה לי גבוה ואני צריך להתייעץ עם אשתי״ → קלוט.
2. צפה: כוונת קנייה זוהתה, סנטימנט, 2 התנגדויות (מחיר + צריך להתייעץ), ישויות (עיר/תקציב/חדרים), זיכרון לקוח עודכן.
3. ״חשב סיכונים והזדמנויות״ → סיכונים/הזדמנויות מתעדכנים.
4. סמן התנגדות כפתורה → נעלמת מהרשימה.
5. הרץ Decision Brain → איתותי תקשורת מופיעים ב-Today's Focus.

## 6. הטמעה

הדבק `supabase/manual-sql/communication_intelligence_os.txt` לעורך ה-SQL של Supabase והרץ. לאחר מכן `git push` מהטרמינל.

---

## 7. פערים נותרים — לקראת חזון 86 הפיצ׳רים המלא של WhatsApp

הליבה הדטרמיניסטית מלאה. הפערים שנותרו, רובם תלויי-ספק או שיפורי AI עתידיים:

- **תמלול הקלטות קוליות אמיתי** — כרגע התמלול מוזן ידנית; חיבור ספק תמלול (Meta/Whisper) ימלא את `is_voice_note` + transcript אוטומטית.
- **קליטה אוטומטית ממקורות חיים** — כרגע הקליטה ידנית/מ-WhatsApp OS; חיבור webhook רשמי (Meta API / Gmail / טלפוניה) יזרים אירועים אוטומטית. ללא scraping/אוטומציה לא רשמית.
- **סיכומי AI מחוללים** — `communication_summaries` נכתב כרגע מתבניות דטרמיניסטיות; שכבת LLM אופציונלית תעשיר את הטקסט ללא שינוי חוזים.
- **חיבור ישיר מ-WhatsApp OS** — כדאי לחבר `whatsapp_messages` → `ingestCommunication` כדי שכל הודעת וואטסאפ תזין אוטומטית את מודיעין התקשורת (נקודת אינטגרציה מוכנה, לא חוברה עדיין).
- **גרף הפניות/ביקורות** — הזדמנויות הפניה/ביקורת מזוהות; חיבורן ל-Reputation OS לסגירת הלולאה.
- **פאנלים בעמודי ישות** — ציר הזמן ופאנל ה-Agent-AI זמינים דרך `getUnifiedTimeline`/`getAgentAI`; הטמעתם בעמודי קונה/מוכר/עסקה היא שיפור UI נוסף.

כל הפערים הללו הם הרחבות תוספתיות — הליבה (tables, services, engines, signals, UI, Decision Brain) פעילה ועוברת tsc/lint/replay.
