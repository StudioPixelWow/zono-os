# ZONO AI Visual Generation Engine — Phase 8

יצירת ויזואלים אמיתית. הזרימה: **DNA → קונספטים → קמפיינים → נכסים → קופי → קריאייטיב → יצירת ויזואלים**. ZONO מייצר תמונות אוטומטית מתוך Marketing/Visual/Campaign DNA + נתוני נכס/מיקום. **המשתמש לעולם אינו כותב פרומפטים — הם פנימיים בלבד ולא נשמרים/מוצגים.**

---

## 1. טבלאות חדשות

`zono_visual_assets` — ויזואל לכל קריאייטיב (entity, campaign_id, creative_output_id, visual_type, provider, image_url, thumbnail_url, storage_path, generation_reason (טקסט בטוח להצגה — לא הפרומפט), visual_dna_snapshot jsonb, metadata, 6 ציונים: brand/realism/property/marketing/conversion/overall, status, is_approved, is_rejected, is_favorite, org_id) + RLS (אומת ב-PGlite replay). הדבקה: `supabase/manual-sql/zono_visual_assets.txt`.
**אחסון:** bucket `generated-zono-visuals` + מדיניות — קובץ נפרד `supabase/manual-sql/zono_visuals_storage.txt`.

## 2. שירותים חדשים

- `visual-dna.ts` (טהור) — `buildVisualDNA` (Marketing DNA → סגנון צילום/תאורה/קומפוזיציה/רמת יוקרה/רמת ריאליזם/הצגת נכס/לייפסטייל/סוכן/רקע/טיפול צבע/זוויות מצלמה + פלטה), `scoreVisual` (brand/realism/property/marketing/conversion/overall), `visualTypeForOutput`, `VARIATION_MODES` (9).
- `visual-providers/prompt.ts` (server, **internal only**) — `buildVisualPrompt` (פרומפט אנגלי מ-Visual DNA + נכס + מיקום + למידה) + `generationReason` (טקסט עברי בטוח להצגה).
- `visual-providers/index.ts` (server) — **mock** (SVG דטרמיניסטי מהפלטה, ללא מפתח/רשת), **openai** (Images API → b64), **gemini** (Imagen `:predict` → b64), בחירה לפי `VISUAL_PROVIDER`/env, נפילה בטוחה ל-mock בכל שגיאה.
- `visual-service.ts` (server-only) — `generateVisualForOutput` (בונה Visual DNA + פרומפט פנימי + ספק, מעלה bytes ל-bucket או שומר data-URL ל-mock, מדרג, שומר), `listEntityVisuals`, **`approveVisual` (auto-injection: מזריק את ה-image_url ל-block `image_placeholder` ב-render_data של הקריאייטיב + מעדכן preview/thumbnail)**, `rejectVisual`, `setVisualFavorite`, `generateVisualVariation`. לולאת למידה (visual_approved/rejected).
- `visual-actions.ts` — server actions.

## 3. רכיבים חדשים

סקשן **״ויזואלים״** ב-Studio: בוחר קריאייטיב + ״צור ויזואל״ (״ZONO מייצר ויזואל...״), כרטיסי ויזואל (תצוגת תמונה/SVG + ספק + ציון + אשר/דחה/מועדף + תפריט וריאציות: יותר יוקרה/ריאליסטי/לייפסטייל/השקעה/מודרני/פחות AI...). `CreativePreview` עודכן לרנדר את התמונה המוזרקת בתוך `image_placeholder`.

## 4. סטטוס ספקים

ברירת מחדל **mock** — מייצר SVG placeholder דטרמיניסטי מפלטת ה-Visual DNA, עובד מיד ללא מפתח. עם `VISUAL_PROVIDER=openai`+`OPENAI_API_KEY` → OpenAI Images (gpt-image-1). עם `gemini`+`GEMINI_API_KEY` → Imagen 3. כל ספק נכשל → נפילה ל-mock. עתידיים (Flux/Ideogram/Runway) — נקודת הרחבה מוכנה ב-`visual-providers/index.ts`.

## 5. ארכיטקטורת אחסון

`generated-zono-visuals` bucket (public-read, מדיניות authenticated). תמונות אמיתיות (bytes) מועלות בנתיב `{org}/{entity_type}/{entity_id}/{visual_type}/{ts}-{uuid}.png` ונשמר `storage_path` + `image_url` ציבורי. **mock** נשמר כ-`data:image/svg+xml` ללא אחסון. כשל העלאה לא מפיל — השורה נשמרת ללא תמונה.

## 6. אבטחת פרומפטים

הפרומפט נבנה server-side ב-`buildVisualPrompt` ו**אינו נשמר ב-DB ואינו מוחזר ל-UI**. רק `generation_reason` (סיכום עברי בטוח) נשמר ומוצג. מפתחות server-side בלבד.

## 7. אימות (QA)

יצירת ויזואל עובדת · mock עובד · אחסון מוכן (real bytes) · UI סקירה עובד · scoring עובד · auto-injection לקריאייטיב עובד · RTL · scoped `tsc` EXIT 0 · `eslint` 0 errors (אזהרות `<img>` בלבד) · PGlite replay OK · client/server boundary נקי · אפס שבירה.

## 8. ביצועים (הערה)

ההפקה כרגע סינכרונית עם מצב טעינה ב-UI (mock מיידי; ספק אמיתי ~10-20ש׳). תור עבודות אמיתי + progress + ביטול הם שיפור עתידי (נקודת הרחבה מוכנה).

## 9. הטמעה

1. הרץ `supabase/manual-sql/zono_visual_assets.txt` (טבלה).
2. הרץ `supabase/manual-sql/zono_visuals_storage.txt` (bucket + מדיניות).
3. (אופציונלי) הוסף `VISUAL_PROVIDER` + מפתח ל-env לויזואלים אמיתיים.
4. `git push`.

## 10. השלב הבא

**ZONO Full Marketing Automation Engine** — נכס/פרויקט אחד → קמפיין → נכסים → קופי → קריאייטיב → ויזואלים → חבילת פרסום, אוטומטי מלא.
