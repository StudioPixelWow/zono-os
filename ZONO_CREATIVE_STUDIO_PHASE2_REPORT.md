# ZONO Creative Studio — Phase 2: Real AI Marketing DNA Analysis

חיבור ה-Creative Studio לניתוח AI אמיתי. **ללא יצירת מודעות / סטים / קמפיינים** — הפאזה הזו מנתחת חומרים שהועלו ובונה/מעדכנת אוטומטית את פרופיל ה-Real Estate Marketing DNA, על גבי הטבלאות, ה-UI, האחסון ומודל הישות הגמיש מ-Phase 1.

---

## 1. מה הוטמע

- **שכבת ספקים גמישה** (server-side בלבד): ממשק `MarketingDnaProvider` שכל ספק מחזיר ממנו אובייקט מנורמל אחד.
  - **Gemini Vision** — base64 inline של עד 8 תמונות + פרומפט, `responseMimeType: application/json`.
  - **OpenAI Vision** — `gpt-4o-mini`, image_url + `response_format: json_object`.
  - **Mock** — ברירת מחדל ללא מפתח; בונה DNA סביר בביטחון נמוך ממטא-דאטה (ספירות/דגלים/תגיות). לא קורס.
  - **בחירה לפי env** (`selectMarketingDnaProvider`) — אם אין מפתח → mock אוטומטית.
- **נרמול קשיח** (`normalizeResult`) — מצמצם ציונים ל-0-100, כופה מערכים/אובייקטים, מנקה JSON עם code-fences (`parseJsonLoose`) — תגובת מודל פגומה לעולם לא תשחית את ה-DB.
- **שירות ניתוח** (`runMarketingAnalysis`): יוצר job `running` + `started_at` → אוסף ומתעדף חומרים (5 מאושרים / 3 שנפסלו / 4 נכס-פרויקט / 2 לוגו-מותג / 2 ברושור-אתר / 2 שכונה-מתחרה) → קורא לספק → upsert ל-`zono_marketing_dna_profiles` לפי entity_type+entity_id → **שומר הערות ידניות** (agent/office/seller/zono) → `last_analyzed_at` + `ai_confidence_score` + `profile_status='active'` → job `completed`. בכשל: job `failed` + `error_message` + `finished_at`.
- **prompt תפקיד-מומחה**: מנהל קריאייטיב נדל״ן בכיר + אסטרטג שיווק נדל״ן ישראלי + מומחה Meta Ads + מומחה המרת ליסטינגים + אסטרטג מיתוג סוכן; מבחין בין שיווק סוכן/משרד/נכס/פרויקט וגיוס מוכרים/קונים/סמכות שכונתית; למידת approved → patterns מועדפים, rejected → patterns להימנעות.
- **UI**: ״נתח DNA שיווקי״ + ״רענן ניתוח AI״ מריצים ניתוח אמיתי, מצב טעינה ״ZONO מנתח את הסגנון השיווקי והנדל״ני...״, toast הצלחה ״Marketing DNA עודכן בהצלחה · ספק · ביטחון X%״, מצב שגיאה, רענון אוטומטי, תאריך ניתוח אחרון, ציון ביטחון AB, הסבר המקורות, וסקשן חדש **״מה ZONO למד?״** (2 עמודות: מה עובד כאן / ממה להימנע + קהלים).

## 2. הספק הפעיל

נקבע בזמן ריצה לפי env: `gemini` אם קיים `GEMINI_API_KEY`, אחרת `openai` אם קיים `OPENAI_API_KEY`, אחרת **`mock`** (ברירת מחדל — עובד מיד ללא מפתח). אפשר לכפות עם `ZONO_MARKETING_ANALYSIS_PROVIDER=gemini|openai|mock`.

## 3. קבצים שהשתנו / נוצרו

נוצרו: `providers/types.ts`, `providers/prompt.ts`, `providers/mock.ts`, `providers/gemini.ts`, `providers/openai.ts`, `providers/index.ts`, `marketing-analysis-service.ts`.
עודכנו: `creative-studio/actions.ts` (החלפת stub ב-`analyzeMarketingDnaAction` אמיתי), `CreativeStudioView.tsx` (טריגר אמיתי, טעינה, ביטחון, ״מה ZONO למד?״, הסבר).

## 4. משתני סביבה נדרשים

```
ZONO_MARKETING_ANALYSIS_PROVIDER=gemini   # gemini | openai | mock (אופציונלי)
GEMINI_API_KEY=...                        # לניתוח Gemini אמיתי
OPENAI_API_KEY=...                        # לניתוח OpenAI אמיתי
# אופציונלי: ZONO_GEMINI_MODEL (ברירת מחדל gemini-2.0-flash) · ZONO_OPENAI_MODEL (gpt-4o-mini)
```
ללא אף מפתח — המערכת רצה ב-mock. כל המפתחות server-side בלבד; לא נחשפים, ו-URLs פרטיים לא נרשמים בלוג.

## 5. אבטחה

ניתוח רץ אך ורק על חומרי הישות הנבחרת (שאילתות RLS-scoped ל-org + entity). מפתחות server-side בלבד. אין רישום של file URLs. תקרות עלות: עד 8 תמונות לניתוח, כל תמונה עד 4MB (Gemini), קבצים לא נתמכים → מטא-דאטה בלבד.

## 6. אימות (QA)

Scoped `tsc`: **EXIT 0** · `eslint`: **0 errors** (אזהרת `<img>` בלבד) · client/server boundary: ה-view מייבא `import type` בלבד מהשירות (אפס דליפת מפתחות/`next/headers` ללקוח) · job lifecycle running→completed/failed · upsert שומר הערות ידניות · Hebrew RTL נשמר · אפס שבירה לעמודים קיימים · אין מזהי דמה.

## 7. הטמעה

הקוד committed. הוסף מפתח (`GEMINI_API_KEY` או `OPENAI_API_KEY`) ב-env לפרודקשן לניתוח אמיתי (אחרת mock), ואז `git push`.

## 8. ה-prompt הבא

**Phase 3 — ZONO Real Estate Creative Concept Engine**: על בסיס פרופיל ה-DNA שנלמד, יצירת קונספטים שיווקיים נדל״ניים (זוויות, מסרים, מבני מודעה, מבני סטורי/קרוסלה, CTA וואטסאפ) — עדיין ללא רינדור עיצוב סופי, אלא שכבת הקונספט שתזין את מחולל הקריאייטיב.
