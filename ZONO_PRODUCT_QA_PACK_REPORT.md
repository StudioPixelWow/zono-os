# ZONO Critical Product QA Fixes — Phase Report

מטרת השלב: תיקוני שימושיות קריטיים שחוסמים תחושת מוצר פרודקשן. ללא בניית מודול חדש, ללא דאטה מזויפת, ללא הסתרת שגיאות.

## הושלם ואומת (scoped tsc EXIT 0 · eslint נקי)

**Issue 1 — העלאת מדיה מרובת תמונות.** אותר ותוקן באג ה-stale-closure ב-`MediaUploader`: לולאת ההעלאה קראה את `media`/`images` מ-closure ישן, ולכן כל קובץ ב-batch חישב `isPrimary=true` והאינדקס הייחודי `uq_property_media_primary` דחה את כל ההעלאות מלבד הראשונה — בדיוק "רק תמונה אחת עובדת". כעת: צבירה נכונה, תמונה ראשית רק לראשונה, התקדמות per-file, ניסיון חוזר על כשל, הסרה, סידור, הגבלת פורמט/גודל, עד 40 תמונות, וקידום ראשי אוטומטי במחיקה.
קבצים: `MediaUploader.tsx`, `Icon.tsx` (אייקונים חדשים).

**Issue 2 — ערכת שיווק AI.** מנוע `marketing-kit.ts` (דטרמיניסטי, client-safe) + `marketing-kit-actions.ts` ("use server", שכתוב OpenAI אופציונלי על אותן עובדות בלבד). פלט: תיאור קצר/פרימיום/רגשי/משקיע/משפחה/יוקרה, WhatsApp, פייסבוק, אינסטגרם, יד2/מדלן, כותרת+מטא SEO, נקודות מכירה, היילייטים, CTA, מענה להתנגדויות, התאמת קהל, ו"עובדות בשימוש". בורר טון (8)/אורך (3)/ערוץ (7). לא ממציא מאפיינים.
קבצים: `marketing-kit.ts`, `marketing-kit-actions.ts`, `MarketingKitPanel.tsx`.

**Issue 3 — בורר קהל יעד מובנה.** `audiences.ts` (19 קהלים מקובצים + `recommendAudiences` דטרמיניסטי מנתוני הנכס). שמירה ל-`properties.marketing_audiences` (jsonb, migration `20260714120000`). מחליף את שדה הטקסט החופשי; "קהל נוסף" חופשי נשמר ב-`target_audience`.
קבצים: `audiences.ts`, `AudienceSelector.tsx`, migration + manual-sql, types/repository/page.

**Issue 4 — קישור מוכר באשף.** צעד חדש "בעלים / מוכרים" באשף: חיפוש מוכר קיים, קישור, יצירה inline (שם/טלפון/וואטסאפ/אימייל/עיר/קשר/מוטיבציה/דחיפות/ציפיית מחיר/% בעלות/אישור שיווק/הערות), סימון ראשי/מקבל החלטות/מורשה חתימה, באנר מוכנות חי, ו-CTA "הוסף מוכר עכשיו" בצעד הפרסום כשחסרה מוכנות. פעולות שרת חדשות ללא redirect: `getPropertySellerStateAction`, `createAndLinkSellerAction`.
קבצים: `WizardSellerStep.tsx`, `sellers/actions.ts`, `PropertyWizard.tsx` (אשף 7 צעדים).

**Issue 6 — מחשבוני משכנתא.** `calculators.ts` (טהור): החזר חודשי, כושר קנייה/החזר בטוח, פער הון עצמי, יחס DTI, תקציב מקסימלי, ציון מוכנות + סיכון + צעד הבא, ומחשבון תשואת השקעה (ברוטו/נטו). מס רכישה — placeholder מסומן. Disclaimer קבוע. טאב "מחשבונים" ב-`/financing`.
קבצים: `calculators.ts`, `MortgageCalculators.tsx`, `FinancingView.tsx`.

**Issue 12 — עמוד דוח QA.** `/admin/product-qa` — מצב כל 12 הנושאים (עובר/חלקי/ממתין + הערות + תאריך בדיקה).
קבצים: `product-qa/status.ts`, `admin/product-qa/page.tsx`.

## ממתין (לסבב המשך ממוקד)

- **Issue 5** מסמכים/חתימות — שדרוג MVP שימושי מהמסך (המודול קיים).
- **Issue 7** ביקורת דאטה אמיתית מלאה לכל ווידג'ט בבית + תג demo בפיתוח.
- **Issue 8** ארגון תפריט הצד לקטגוריות מתקפלות + הסתרת placeholders + חיפוש.
- **Issue 9** ניהול סוכנים + מערכת הזמנות (invite tokens / קישור להעתקה) — הנושא הכבד ביותר, נוגע ב-auth.
- **Issue 10/11** מצבי סנכרון מדורגים (מהיר/רגיל/מלא/מתקדם) עם pagination/cursor/guardrails, ואחידות אזורי-פעילות בכל המודולים.

## הטמעה ב-Supabase
הרץ: `supabase/manual-sql/property_marketing_audiences.txt`
