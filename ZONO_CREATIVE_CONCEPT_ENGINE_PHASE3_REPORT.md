# ZONO Real Estate Creative Concept Engine — Phase 3

המוח השיווקי האסטרטגי של ZONO. הזרימה החדשה: **ישות → חומרים → Marketing DNA → קונספטים שיווקיים נדל״ניים** — לפני ייצור קריאייטיב כלשהו. **ללא יצירת מודעות / סטים / ויזואלים** — קונספטים (אסטרטגיה) בלבד.

---

## 1. טבלאות חדשות

`zono_creative_concepts` — קונספט שיווקי לכל ישות (entity_type+entity_id, marketing_dna_profile_id, title, concept_type, description, marketing_angle, emotional_trigger, visual_hook, copy_hook, recommended_layout/cta_style/audience, reasoning, confidence_score 0-100, is_favorite, is_approved, status, generation_metadata) + org_id + RLS (אומת ב-PGlite replay). הדבקה: `supabase/manual-sql/zono_creative_concepts.txt`.

## 2. שירותים חדשים

- `concept-engine.ts` (טהור, client-safe) — **~22 תבניות קונספט נדל״ני** (יוקרה/השקעה/סיפור שכונה/בית חלומות/משפחה/בלעדי/פנטהאוז/דירת גן/בית ראשון/שדרוג/גיוס מוכרים/גיוס קונים/השקת פרויקט/פרי-סייל/סוכן סמכות/מומחה שכונה/יוקרת יזם/קהילה/יתרון מיקום/עירוני/חוף/ROI/עליית ערך) עם scorers לפי הקשר, בחירת 4-8 מובילים, חישוב ביטחון, ו-`reasoning` (״למה ZONO חושב שזה מתאים״). כולל `contextFromDna` ו-`normalizeConcept`.
- `concept-ai.ts` (server-only) — augmentation אופציונלי דרך **Gemini/OpenAI טקסט** (אותו env מ-Phase 2); נופל חזרה למנוע הדטרמיניסטי (mock) ללא מפתח / בכשל / בפלט חלש. לא זורק.
- `concept-service.ts` (server-only) — `generateConcepts` (טוען DNA + היסטוריית למידה, מריץ generator, שומר; מארכב קונספטים ישנים שאינם מועדפים/מאושרים), `listConcepts`, `favorite/approve/delete`. **לולאת למידה**: approve כותב `concept_approved`, delete כותב `concept_rejected` ל-`zono_marketing_feedback`; יצירה עתידית מעלה משקל לסוגים מאושרים ומורידה לסוגים שנדחו.
- `concept-actions.ts` — server actions.

## 3. רכיבים חדשים

ב-`CreativeStudioView.tsx` נוסף סקשן **״קונספטים שיווקיים״**: כפתור צור/רענן (״ZONO חושב על כיווני שיווק...״), כרטיסי קונספט (כותרת/סוג/קהל/זווית/ביטחון + מועדף/אשר/פרטים/מחק), ו-`ConceptDrawer` (אסטרטגיה מלאה, קהל, טריגר, וו ויזואלי/קופי, CTA, ו-reasoning). עמוד הסטודיו טוען ומעביר את הקונספטים.

## 4. סטטוס יצירת קונספטים

עובד מקצה לקצה. ברירת מחדל **mock** (המנוע הדטרמיניסטי) — מייצר 4-8 קונספטים אמיתיים ורלוונטיים מתוך ה-DNA גם ללא מפתח AI. עם `GEMINI_API_KEY`/`OPENAI_API_KEY` (אותם משתני env מ-Phase 2) — קונספטים נוצרים ב-AI עם נפילה בטוחה למנוע.

## 5. מה עדיין במצב mock

ללא מפתח AI — כל יצירת הקונספטים רצה במנוע הדטרמיניסטי (איכותי, מבוסס DNA + סוג ישות + נכס + מקום + תמחור + למידה). הוספת מפתח מפעילה AI אוטומטית. אין רכיב אחר שתלוי ב-mock.

## 6. אימות (QA)

יצירת קונספטים עובדת · כרטיסים מוצגים · workflow אישור עובד · למידה מתעדכנת (feedback rows + משקלל יצירה) · RTL עברית · scoped `tsc` EXIT 0 · `eslint` 0 errors (אזהרת `<img>` בלבד) · client/server boundary נקי · PGlite replay OK · אפס שבירה לעמודים קיימים · אין מזהי דמה.

## 7. הטמעה

הרץ `supabase/manual-sql/zono_creative_concepts.txt` ב-Supabase, ואז `git push`. (Phase 1+2 SQL כבר קיימים.)

## 8. השלב הבא המומלץ

**ZONO Property Campaign Factory** — נכס/פרויקט אחד → מבנה קמפיין שיווקי שלם: בחירת קונספט מאושר → brief → סט נכסים נדרשים (מודעות/סטוריז/קרוסלות/רילס) + לוח זמנים + ערוצים + CTA וואטסאפ, על בסיס ה-DNA והקונספטים שנבנו כאן.
