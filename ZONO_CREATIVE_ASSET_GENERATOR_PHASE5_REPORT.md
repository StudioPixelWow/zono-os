# ZONO Creative Asset Generator — Phase 5

שכבת ייצור נכסי השיווק. הזרימה: **DNA → קונספטים → מפעל קמפיינים → מחולל נכסי השיווק**. לכל קמפיין מאושר ZONO בונה אוטומטית את כל נכסי השיווק הנדרשים — מתוכננים, מדורגים ומדורגי-ציון. **ללא תמונות סופיות / ויזואלים / Gemini visuals / עיצובים editable** — פלט קריאייטיב מובנה בלבד.

---

## 1. טבלאות חדשות

`zono_creative_assets` — נכס שיווק לכל קמפיין (campaign_id, campaign_asset_id↗ל-Phase 4, asset_type, title, objective, audience, marketing_angle, emotional_trigger, visual_hook, copy_hook, cta_style, recommended_layout, priority, reasoning, **5 ציונים**: campaign_match/audience_match/conversion_potential/marketing_strength/asset_score 0-100, asset_status, is_favorite, is_approved, generation_metadata, org_id) + RLS (אומת ב-PGlite replay). הדבקה: `supabase/manual-sql/zono_creative_assets.txt`.

## 2. שירותים חדשים

- `asset-generator.ts` (טהור) — 12 סוגי נכס, מעשיר כל נכס מתוכנן מ-Phase 4 (seed) לאובייקט מלא; לוגיקה ספציפית לסוג נכס (יוקרה: יוקרה/לייפסטייל/בלעדיות/נוף/מיקום · השקעה: ROI/הזדמנות/נתוני שוק/צמיחה · משפחה: לייפסטייל/בתי ספר/קהילה/נוחות) ולפרויקט (מודעות/לידים/לייפסטייל/מיקום/אמון יזם/דחיפת מלאי). מטרה, פריסה ו-reasoning לכל נכס.
- `asset-scoring.ts` (טהור) — Campaign Match / Audience Match / Conversion Potential / Marketing Strength / Overall (0-100).
- `asset-ai.ts` (server-only) — העשרה אופציונלית דרך Gemini/OpenAI (אותו env), נפילה למנוע (mock) ללא מפתח/בכשל.
- `asset-service.ts` (server-only) — `generateAssetsForCampaign` (טוען קמפיין + Campaign DNA + הנכסים המתוכננים + ביטחון DNA, מייצר, מדרג, שומר; מארכב טיוטות קודמות), `listEntityCreativeAssets`, `approve/reject/favorite/duplicate`, `approveAllForCampaign`. **לולאת למידה**: אישור/דחייה כותבים `asset_approved`/`asset_rejected` ל-`zono_marketing_feedback` → מזין DNA/קונספטים/קמפיינים/ייצור עתידי.
- `asset-actions.ts` — server actions.

## 3. רכיבי UI חדשים

ב-`CreativeStudioView.tsx` נוסף סקשן **״נכסי שיווק״**: בוחר קמפיין + ״צור נכסים״ (״ZONO בונה נכסי שיווק...״) + ״אשר הכל״, כרטיסי נכס (סוג/מטרה/קהל/עדיפות/סטטוס/ציון + אשר/דחה/מועדף/שכפל/פרטים), ו-`CreativeAssetDrawer` (4 ציוני המשנה + מטרה/קהל/כיוון ויזואלי/כיוון קופי/כיוון CTA/קשר לקמפיין + ״למה ZONO ייצר את הנכס הזה״). עמוד הסטודיו טוען ומעביר את נכסי השיווק.

## 4. סטטוס יצירת נכסים

עובד מקצה לקצה. ברירת מחדל **mock** (מנוע דטרמיניסטי, נגזר מתוכניות הקמפיין של Phase 4) — מייצר נכסים מלאים ומדורגי-ציון גם ללא מפתח AI. עם `GEMINI_API_KEY`/`OPENAI_API_KEY` — העשרה ב-AI עם נפילה בטוחה למנוע.

## 5. מוכנות לעיצוב (Future Design Readiness)

כל `zono_creative_assets` row הוא brief עיצוב מלא ל-**Phase 6 — Design Generation Engine**: asset_type + recommended_layout (יחס מסך + מבנה) + visual_hook + copy_hook + cta_style + audience → קלט ישיר ל-feed/story/carousel/reel editable עם layout structures ו-design objects. סטטוס draft→approved→produced ינוהל ע״י Phase 6, ו-asset_score מתעדף מה לעצב קודם.

## 6. אימות (QA)

יצירת נכסים עובדת · דאשבורד עובד · workflow אישור/דחייה עובד · scoring עובד (5 ציונים) · למידה (feedback) · RTL עברית · scoped `tsc` EXIT 0 · `eslint` 0 errors (אזהרת `<img>` בלבד) · PGlite replay OK · client/server boundary נקי · אפס שבירה לעמודים קיימים.

## 7. הטמעה

הרץ `supabase/manual-sql/zono_creative_assets.txt` ב-Supabase, ואז `git push`.

## 8. השלב הבא

**ZONO Design Generation Engine** — הפיכת נכסים מאושרים ל-feed posts / stories / carousels / reel covers editable עם layout structures ו-design objects.
