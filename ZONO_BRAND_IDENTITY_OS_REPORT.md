# ZONO Agent Brand Identity & Design Profile OS

מקור האמת היחיד למיתוג בכל מערכת ZONO. נבנה כסקשן ב-Settings → מותג וזהות, מרחיב את ארכיטקטורת הפרופיל הקיימת (ללא בנייה מחדש). כל מנועי העיצוב, התוכן, האתרים, הפורטלים והקריאייטיב צורכים את ההגדרות הללו דרך `getEffectiveBrand`.

---

## 1. טבלאות שנוצרו

`brand_identity_profiles` — פרופיל מותג אחד לכל ישות (entity_type agent/office + entity_id, unique): פרטי סוכן (שם/תפקיד/ביו/טלפון/וואטסאפ/אימייל/משרד/ניסיון/אזורים/התמחויות/שפות/נראות), תמונת פרופיל (url/thumb/status), לוגו (url + dark/light/transparent + type/status), צבעי מותג (primary/secondary/accent + palette jsonb + confidence + source), סגנון/טון, פרופיל תוכן (writing/communication/personality/audience/cta/design-language/post-style), `ai_design_profile` jsonb, `inherit_brand_settings` + `allow_agent_override`, `completion_score`, org_id.
`brand_assets` — נכסי מותג נוספים (asset_kind: secondary_logo/watermark/signature_image/agent_signature/office_stamp/cover_image/office_image, url, status). שתיהן org-scoped RLS (אומת ב-PGlite replay).

## 2. שדות שנוצרו

ראה למעלה — כולל כל 12 החלקים מהמפרט (פרופיל, תמונה, לוגו, צבעים, תצוגה, סגנון, נכסים, אינטגרציה, פרופיל תוכן, AI design profile, ירושת משרד, completion).

## 3. שירותים שנוצרו

- `brand-identity/color-extraction.ts` (client, **דטרמיניסטי, ללא LLM**) — חילוץ צבעים דומיננטיים מהלוגו דרך קנבס + קוונטיזציה (סינון לבן/שחור/שקיפות), מחזיר primary/secondary/accent + palette + confidence.
- `brand-identity/engine.ts` (pure) — קטלוגי סגנון/טון/post-style/נראות, `computeCompletion`, `buildAiDesignProfile` (מוח העיצוב), `resolveEffectiveBrand` (ירושה: סוכן יורש משרד אלא אם override מותר).
- `brand-identity/service.ts` (server) — `getBrandStudio`, `ensureBrandProfile`, `saveBrandProfile`, `saveBrandColors`, `saveBrandAsset`, ו-**`getEffectiveBrand(orgId, agentId)` — הפונקציה שכל מחולל צורך**.
- `brand-identity/actions.ts` + `brand-identity/upload.ts` (העלאה ל-bucket `zono-marketing-assets`).

## 4. מנוע חילוץ הצבעים

קנבס 96×96 → buckets RGB גסים (24 צעדים) → דירוג לפי שכיחות, סינון רעש, accent = הרווי ביותר, confidence = שילוב דומיננטיות הצבע המוביל ומגוון הפלטה. ביטחון גבוה → הצעה לאישור; ביטחון נמוך / ללא לוגו → בחירה ידנית (עד 3 צבעים).

## 5. מנוע פרופיל המותג + ירושה

`resolveEffectiveBrand(agent, office)`: אם הסוכן יורש (`inherit_brand_settings`) או שהמשרד אוסר override → מעדיף ערכי משרד; אחרת מעדיף ערכי סוכן. `buildAiDesignProfile` מרכיב את מוח העיצוב (צבעים/לוגואים/סגנון/שפה ויזואלית/טון תוכן/העדפות) לשמירה ב-`ai_design_profile`.

## 6. רכיבי UI

`/settings/brand` — סקשן פרימיום RTL עם כל 12 החלקים: פרטי סוכן, העלאת תמונת פרופיל, העלאת לוגו + חילוץ צבעים אוטומטי + אישור/override ידני, תצוגת מותג חיה (8 כרטיסים: אתר/פורטל/פוסט נכס/חבילת המלצות/סושיאל/וואטסאפ/PDF/מצגת), סגנון/טון, פרופיל תוכן, נכסי מותג, ירושת משרד, ומד השלמת מותג. קישור מ-Settings hub + ווידג׳ט **השלמת מותג** בבית.

## 7. ארכיטקטורת ירושה

משרד (entity_type=office, entity_id=org) מגדיר מותג; סוכנים (entity_type=agent) יורשים כברירת מחדל (`inherit_brand_settings=true`). מנהל יכול לאסור override (`allow_agent_override=false`). `getEffectiveBrand` מיישם זאת אוטומטית בכל קריאה.

## 8. אינטגרציות עם מערכות קיימות

`getEffectiveBrand` חובר ל-**מחולל היצירה המהירה** (`resolveBrandSnapshot`) — צבעי/לוגו/תמונת/שם המותג מ-Brand Identity מקבלים עדיפות על פני users/org/Marketing DNA. נקודת צריכה זהה זמינה לכל שאר המערכות (אתרי סוכן/משרד, פורטל, חבילות המלצה, דוחות, מודיעין שיווק, סושיאל, WhatsApp, PDF, מצגות, Project/Reputation, וה-Creative/Visual engines) דרך אותה פונקציה.

## 9. QA

העלאת תמונה/לוגו · חילוץ צבעים אוטומטי · אישור/override · תצוגה חיה · ירושת משרד/override · שמירה ועדכון · בידוד cross-org (RLS) · scoped `tsc` EXIT 0 · `eslint` 0 errors (אזהרות `<img>` בלבד) · PGlite replay OK · אפס שבירה לעמודים קיימים.

## 10. הטמעה

הרץ `supabase/manual-sql/zono_brand_identity.txt` ב-Supabase, ואז `git push`.
