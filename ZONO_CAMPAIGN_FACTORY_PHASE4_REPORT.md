# ZONO Property Campaign Factory — Phase 4

המוח התכנוני-שיווקי של ZONO. הזרימה: **ישות → חומרים → DNA → קונספטים → מפעל קמפיינים**. נכס/פרויקט מייצר **מבנה קמפיין שלם** (מספר נכסים שיווקיים מתוכננים), לא מודעה בודדת. **ללא עיצובים / ויזואלים / image prompts** — תכנון בלבד. ZONO מחליט: מה לשווק, למי, אילו מסרים, אילו נכסים שיווקיים לייצר, ובאיזה סדר.

---

## 1. טבלאות חדשות

`zono_campaigns` (entity_type/entity_id, title, campaign_type, objective, target_audience, marketing_angle, campaign_summary, reasoning, status, marketing_dna_profile_id, source_concept_id, generation_metadata jsonb המכיל את ה-Campaign DNA, org_id) · `zono_campaign_assets` (campaign_id, asset_type, title, purpose, recommended_message, recommended_cta, audience_variant, priority, status, org_id). שתיהן org-scoped RLS (אומת ב-PGlite replay). הדבקה: `supabase/manual-sql/zono_campaign_factory.txt`.

## 2. שירותים חדשים

- `campaign-engine.ts` (טהור) — 16 סוגי קמפיין, `deriveCampaignDNA` (urgency/trust/luxury/lifestyle/investment/seller/buyer/CTA-intensity + תמהיל תוכן + תדירות פרסום מתוך ה-Marketing DNA), `planCampaignAssets` (תוכניות נכסים דטרמיניסטיות לכל סוג — מבני נכס ופרויקט: פוסטים/סטוריז/קרוסלה/ריל + גרסאות מוכר/קונה/משקיע), `campaignReasoning`, `normalizePlannedAsset`.
- `campaign-ai.ts` (server-only) — תכנון נכסים אופציונלי דרך Gemini/OpenAI (אותו env), נפילה למנוע הדטרמיניסטי (mock) ללא מפתח/בכשל. לא זורק.
- `campaign-service.ts` (server-only) — `generateCampaign` (טוען DNA + הקונספט המוביל + רמזי נכס, גוזר Campaign DNA, מתכנן נכסים, שומר קמפיין+נכסים), `listCampaigns` (עם ספירת נכסים ו-% השלמה), `listEntityCampaignAssets`, `getCampaignAssets`, `duplicateCampaign`, `setCampaignStatus` (archive/delete), `approveCampaign`. **לולאת למידה**: אישור כותב `campaign_approved` ל-`zono_marketing_feedback` → מזין DNA/קונספטים/קמפיינים עתידיים.
- `campaign-actions.ts` — server actions.

## 3. רכיבי UI חדשים

ב-`CreativeStudioView.tsx` נוסף סקשן **״מפעל קמפיינים״**: בוחר סוג קמפיין + ״צור קמפיין״ (״ZONO בונה מבנה קמפיין...״), כרטיסי קמפיין (שם/סוג/סטטוס/מס׳ נכסים/% השלמה/עודכן + פרטים/אשר/שכפל/ארכיון/מחק), ו-`CampaignDrawer` (מטרה/קהל/זווית/תקציר/תמהיל תוכן/תדירות + **תוכנית הנכסים השיווקיים** המלאה עם מסר ו-CTA לכל פריט + ״למה ZONO בנה את הקמפיין הזה״). עמוד הסטודיו טוען ומעביר קמפיינים + נכסים.

## 4. ארכיטקטורת הקמפיין

ישות → Marketing DNA + הקונספט המוביל → **Campaign DNA** (עוצמות + תמהיל תוכן + תדירות) → **תוכנית נכסים** (4-9 פריטים מתוכננים, מותאמים לסוג נכס/קהל/מיקום/תמחור, כולל גרסאות מוכר/קונה/משקיע) → קמפיין + נכסים נשמרים כ-״draft״. מבני פרויקט: מודעות → ביקוש → לידים → דחיפת מלאי → יחידות אחרונות.

## 5. עתידיות (Future Readiness)

הנכסים המתוכננים (`zono_campaign_assets`) הם בדיוק הקלט ל-**Phase 5 — Creative Asset Generator**: כל שורה (asset_type + purpose + recommended_message + recommended_cta + audience_variant) היא brief מוכן לרינדור פוסט/סטורי/קרוסלה/כריכת ריל. סטטוס הנכס (planned→approved→produced) מזין את אחוז ההשלמה. אישור קמפיין כבר מזין את לולאת הלמידה.

## 6. אימות (QA)

יצירת קמפיין עובדת · דאשבורד עובד · תכנון נכסים עובד · למידה (feedback rows) · RTL עברית · scoped `tsc` EXIT 0 · `eslint` 0 errors (אזהרת `<img>` בלבד) · PGlite replay OK · client/server boundary נקי · אפס שבירה · ברירת מחדל mock (מנוע דטרמיניסטי) — עובד ללא מפתח AI.

## 7. הטמעה

הרץ `supabase/manual-sql/zono_campaign_factory.txt` ב-Supabase, ואז `git push`.

## 8. השלב הבא

**ZONO Creative Asset Generator** — ייצור פוסטים/סטוריז/קרוסלות/כריכות ריל מתוך מבני הקמפיין המאושרים שנבנו כאן.
