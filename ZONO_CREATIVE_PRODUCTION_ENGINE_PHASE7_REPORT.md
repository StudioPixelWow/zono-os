# ZONO Creative Production Engine — Phase 7

השלב הראשון שמייצר קריאייטיב שיווקי אמיתי — כ**אובייקטי render מובנים וערוכים** (HTML/CSS), לא כתמונות. הזרימה: **DNA → קונספטים → קמפיינים → נכסי שיווק → קופי → מחולל הקריאייטיב**. כל מורכבות ה-AI נשארת מאחורי הקלעים — אין כתיבת פרומפטים ידנית ואין חשיפת פרומפטים למשתמש. **יצירת תמונות AI היא השלב הבא** (כאן blocks ויזואליים הם placeholders).

---

## 1. טבלאות חדשות

`zono_creative_outputs` — קריאייטיב לכל נכס שיווק (entity, campaign_id/creative_asset_id/copy_asset_id, output_type, title, status, preview_url, thumbnail_url, **render_data jsonb** (אובייקט render מובנה וערוך), generation_metadata, 6 ציונים: brand/marketing/readability/hierarchy/conversion/overall, is_approved, is_favorite, org_id) + RLS (אומת ב-PGlite replay). הדבקה: `supabase/manual-sql/zono_creative_outputs.txt`.

## 2. שירותים חדשים

- `production-engine.ts` (טהור) — **ספריית 12 פריסות נדל״ן** (גיבור נכס/יוקרה/השקת פרויקט/גיוס מוכרים/גיוס קונים/סמכות שכונתית/מיתוג סוכן/השקעה/לייפסטייל/בית פתוח/הורדת מחיר/נמכר), **ספריית ~14 קומפוננטות** (eyebrow/headline/subheadline/cta/whatsapp_cta/price_badge/location_badge/property_features/agent_card/project_details/developer_block/investment_block/testimonial/image_placeholder/logo), פלטות מבוססות-DNA, מידות פורמט (feed 1080×1350 / story 1080×1920 / carousel / reel / banner). `produceCreativeVariants`→4-8 אובייקטי render (פריסה×פלטה, blocks ממולאים מהקופי+הנכס) עם אכיפת DNA (approved/rejected/brand/avoid).
- `creative-scoring.ts` (טהור) — `scoreCreative` (Brand/Marketing/Mobile-Readability/Hierarchy/Conversion/Overall) + `reviewCreative` (RTL / קריאוּת עברית / היררכיה / נראות CTA / רלוונטיות נכס / יישור DNA + notes).
- `output-service.ts` (server-only) — `generateOutputsForAsset` (טוען נכס + הקופי הטוב/מאושר ביותר + Campaign DNA + Marketing DNA + צבעי מותג + נתוני נכס, מפיק וריאציות, מדרג+review, שומר render_data), `listEntityOutputs`, `approve/reject/favorite/duplicate/regenerate`. **לולאת למידה**: אישור/דחייה → `creative_approved`/`creative_rejected` ל-`zono_marketing_feedback`.
- `output-actions.ts` — server actions.

## 3. רכיבים חדשים

- `CreativePreview` — מרנדר את `render_data` חי כתצוגה מוקטנת (יחס פורמט, גרדיאנט פלטה, כל block לפי סוג קומפוננטה, RTL). מבוסס **render-object** — ערוך, לא תמונה.
- סקשן **״קריאייטיב מוכן״** ב-Studio: בוחר נכס שיווק + ״הפק קריאייטיב״, רשת כרטיסי קריאייטיב עם **תצוגה מקדימה חיה** + ציון כללי + סטטוס + אשר/דחה/מועדף/שכפל/חדש, ו-`OutputDrawer` (תצוגה גדולה + 6 ציוני משנה + הסבר).

## 4. ארכיטקטורת הרינדור

נבחר **HTML/CSS renderer** (תואם stack של Next/React). הפלט נשמר כ-`render_data` מובנה: `{ format, width, height, layoutId, paletteId, palette, blocks[] }` — כל block הוא קומפוננטה עם טקסט/items/emphasis. ניתן לעריכה, חיפוש ושכפול; **לא נשמרת תמונה בלבד**. `CreativePreview` ממפה blocks→JSX מעוצב.

## 5. מה עדיין placeholders

- **בלוק `image_placeholder`** — מסומן ״תמונת נכס (תתווסף בשלב הוויזואלי)״; אין יצירת תמונות עדיין.
- `preview_url` / `thumbnail_url` — null כרגע (התצוגה נבנית מ-render_data בצד הלקוח); ימולאו כשנרנדר ל-PNG/visual בשלב הבא.
- אין קריאות image-provider; כל ההפקה דטרמיניסטית (״mock mode״ של ויזואלים = placeholders), והמערכת עובדת מלא.

## 6. השלב הבא המומלץ

**ZONO AI Visual Generation Engine** — אינטגרציית Gemini/OpenAI image generation לייצור תמונות נכס/לייפסטייל/פרויקט/שכונה/גיוס מוכרים/קונים, והזרקתן אוטומטית ל-`image_placeholder` בתוך ה-`render_data` של הקריאייטיב.

## 7. אימות (QA)

הפקת קריאייטיב עובדת · תצוגות מקדימות מוצגות · ציונים מוצגים · אישור/דחייה עובדים · למידה מתעדכנת · RTL עברית · scoped `tsc` EXIT 0 · `eslint` 0 errors (אזהרת `<img>` בלבד, ב-upload modal קיים) · PGlite replay OK · client/server boundary נקי · אפס שבירה.

## 8. הטמעה

הרץ `supabase/manual-sql/zono_creative_outputs.txt` ב-Supabase, ואז `git push`.
