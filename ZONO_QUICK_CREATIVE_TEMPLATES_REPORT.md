# ZONO Quick Creative Templates

מערכת גרפיקה מהירה ופרקטית לסוכני נדל״ן (לא מחולל AI גנרי). הסוכן לוחץ כפתור, ממלא טופס קצר, ומקבל **4 וריאציות עיצוב ממותגות מוכנות לפרסום** — בעברית RTL, עם תמונת הסוכן, לוגו המשרד, צבעי המותג, ה-Marketing DNA, תמונת הנכס (אם סופקה) ו-CTA וואטסאפ-first.

---

## 1. מה הוטמע

3 כפתורי יצירה מהירה ב-Creative Studio (סקשן **״יצירה מהירה״**): **צור פוסט המלצה · צור פוסט נמכר · צור פוסט פרסום דירה**. כל זרימה מריצה אשף בן 4 שלבים (סוג+פורמט → פרטים → תצוגת מותג+אזהרות → יצירה) ומפיקה 4 וריאציות: **Premium Clean · Modern Sales · Trust/Authority · Bold Social**, בפורמט פיד 4:5 או סטורי 9:16. כל פלט נשמר כ-`render_data` מובנה וערוך (לא תמונה שטוחה בלבד), עם ציונים, ומוצג בתצוגה מקדימה חיה.

## 2. טבלאות שנוספו

`zono_quick_creative_requests` (סוג בקשה, input_data, brand_snapshot, marketing_dna_snapshot, קישורי agent/office/property/deal) · `zono_quick_creative_outputs` (output_type, variant_name, format, render_data, headline/subheadline/body/cta, ציונים: brand/readability/conversion/seller_lead/buyer_lead/overall, is_favorite/is_approved). שתיהן org-scoped RLS (אומת ב-PGlite replay). הדבקה: `supabase/manual-sql/zono_quick_creative.txt`.

## 3. רכיבים/שירותים שנוצרו

- `quick-creative-engine.ts` (טהור) — כותרות/גוף/CTA ברירת מחדל לכל סוג (לפי המפרט), `buildQuickVariations` (4 וריאציות × render_data עם palette+blocks: image_placeholder, agent_card, logo_slot, property_features, price_badge, location_badge, whatsapp_cta), feature-row של שדות זמינים בלבד, ו-`validateRequired`. **לעולם לא ממציא תוכן** — טקסט ההמלצה/הנכס נשמר כלשונו.
- `quick-creative-service.ts` (server) — `resolveBrandSnapshot` (תמונת סוכן+טלפון מ-users, לוגו+שם משרד מ-organizations, צבעים מ-Marketing DNA + אזהרות חוסר), `generateQuickCreative`, `listQuickOutputs`, `approve/favorite/reject/duplicate/editText/replaceImage/regenerate`. ציונים (brand/readability/RE-relevance/seller-lead/buyer-lead/overall). **לולאת למידה** ל-`zono_marketing_feedback`.
- `quick-creative-actions.ts` — server actions (כולל `brandPreviewAction`).
- UI ב-`CreativeStudioView.tsx`: סקשן ״יצירה מהירה״ (3 כרטיסים), `QuickCreativeWizard` (אשף 5-שלבי עם תצוגת מותג ואזהרות חוסר — מאפשר יצירה בכל מקרה), `QuickResultCard` (תצוגה מקדימה + ציונים + אשר/דחה/מועדף/חדש/שכפל + כפתור PNG מושבת ״בקרוב״).

## 4. איך כל זרימה עובדת

- **פוסט המלצה** — חובה: טקסט המלצה, שם ממליץ, כתובת. אופציונלי: תמונה/שכונה/עיר/כוכבים/תאריך/שיפור-ניסוח. ההמלצה היא הגיבור; תמונת סוכן לאמון; לוגו נקי. 4 וריאציות (כרטיס המלצה נקי / רקע נכס + אמון / סמכות סוכן / הוכחה חברתית בולטת).
- **פוסט נמכר** — חובה: כתובת. אופציונלי: סוג נכס/מחיר/בלעדיות/זמן/מוכר/שכונה/עיר. ״נמכר״ הוא האלמנט הגדול; דגש גיוס מוכרים (״גם הנכס שלכם יכול להיות הבא״).
- **פוסט פרסום דירה** — חובה: כתובת + טקסט חשוב. שורת מאפיינים (חדרים/מ״ר/קומה/חניה/מחסן/מרפסת/מעלית) רק לשדות שסופקו. תמונת נכס כגיבור אם קיימת; CTA וואטסאפ-first.
- **prefill לפי הקשר**: בעמוד הסטודיו של נכס → שדות נכס; של סוכן → נתוני סוכן + מותג נמשכים אוטומטית.

## 5. מה עדיין דורש אינטגרציית ויזואל/תמונה

ייצור התמונה עצמה (Property Hero / Lifestyle אמיתי) מגיע ממנוע הוויזואלים של Phase 8 — `replaceQuickImage`/`image_placeholder` מקבלים URL אמיתי כשמופק. **Export PNG / Export Story** — הארכיטקטורה מוכנה (render_data מובנה), הכפתור מושבת (״בקרוב״) עד הוספת rasterizer (html-to-image/satori) שיהפוך render_data ל-PNG.

## 6. אימות (QA)

הכפתורים מופיעים · האשף עובד ל-3 הסוגים · ולידציית חובה · תמונת נכס אופציונלית · תמונת סוכן/לוגו/צבעים/DNA נמשכים אם קיימים (אזהרות אם חסר, יצירה מתאפשרת בכל מקרה) · 4 וריאציות · RTL תקין · אין המצאת פרטים · נשמר ל-DB · תצוגה מקדימה · אישור/מועדף · scoped `tsc` EXIT 0 · `eslint` 0 errors · PGlite replay OK · אפס שבירה לעמודים קיימים · אין מזהי דמה.

## 7. הטמעה

הרץ `supabase/manual-sql/zono_quick_creative.txt` ב-Supabase, ואז `git push`.

## 8. השלב הבא המומלץ

חיבור Export (render_data → PNG/Story) + הזרקת ויזואלים אמיתיים מ-Phase 8 אוטומטית לתבניות המהירות, ושילוב ב-Full Marketing Automation Engine.
