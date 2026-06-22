# ZONO Copy Generation Engine — Phase 6

שכבת יצירת הקופי השיווקי. הזרימה: **DNA → קונספטים → קמפיינים → נכסי שיווק → מחולל הקופי**. לכל נכס שיווק מאושר ZONO כותב אוטומטית את כל הקופי הנדרש. **ללא עיצובים / ויזואלים / image providers** — טקסט בלבד.

---

## 1. טבלאות חדשות

`zono_copy_assets` — פריט קופי לכל נכס שיווק (creative_asset_id, campaign_id, entity_type/entity_id, copy_type, title, headline, subheadline, body, cta, platform, language='he', tone, audience, reasoning, status, confidence_score, metadata המכיל review sub-scores + provider, is_approved, is_favorite, org_id) + RLS (אומת ב-PGlite replay). הדבקה: `supabase/manual-sql/zono_copy_assets.txt`.

## 2. שירותים חדשים

- `copy-engine.ts` (טהור) — 17 סוגי קופי + 12 מצבי כתיבה (יוקרה/פרימיום/השקעה/לייפסטייל/משפחה/סמכות/דחיפות/חינוכי/רגשי/גיוס מוכרים/גיוס קונים/השקת פרויקט). בחירת מצב לפי ה-DNA + מטרת הנכס, ויצירת סט מלא: כותרת/משנה/גוף/CTA/כיתוב + לפי סוג נכס: טקסט סטורי, שקופיות קרוסלה, וו לריל, הודעת וואטסאפ, תסריטי גיוס, טקסט פרויקט, תוכן שכונה. עברית, RTL, מודע-מיקום.
- `copy-review.ts` (טהור) — ציוני RTL / קריאוּת / חוזק כותרת / חוזק CTA / התאמת מותג (מול approved/rejected patterns) / רלוונטיות נדל״ן → confidence (0-100).
- `copy-ai.ts` (server-only) — כתיבה אופציונלית ב-Gemini/OpenAI (אותו env), נפילה למנוע (mock) ללא מפתח/בכשל.
- `copy-service.ts` (server-only) — `generateCopyForAsset` (טוען נכס + Campaign DNA + Marketing DNA + approved/rejected patterns + הערות מותג + רמזי מיקום, מייצר, מדרג ב-review, שומר), `listEntityCopy`, `approve/reject/favorite/regenerate`. **לולאת למידה**: אישור/דחייה כותבים `copy_approved`/`copy_rejected` ל-`zono_marketing_feedback` → מזין DNA/קונספטים/קמפיינים/נכסים.
- `copy-actions.ts` — server actions.

## 3. רכיבי UI חדשים

ב-`CreativeStudioView.tsx` סקשן **״טקסטים שיווקיים״**: בוחר נכס שיווק + ״צור טקסטים״ (״ZONO כותב קופי שיווקי...״), כרטיסי קופי (סוג/טון/קהל/פלטפורמה/ביטחון + תצוגה מקדימה RTL + אשר/דחה/מועדף/חדש/פרטים), ו-`CopyDrawer` (כותרת/משנה/גוף/CTA/קהל/טון/פלטפורמה + ״למה ZONO כתב כך״). עמוד הסטודיו טוען ומעביר את הקופי.

## 4. סטטוס יצירת קופי

עובד מקצה לקצה. ברירת מחדל **mock** (מנוע תבניות+DNA) — מייצר 8-12 פריטי קופי מדורגי-ביטחון לכל נכס, גם ללא מפתח AI. עם `GEMINI_API_KEY`/`OPENAI_API_KEY` — כתיבה ב-AI עם נפילה בטוחה למנוע. מנוע ה-review מדרג כל פריט תמיד.

## 5. השלב הבא המומלץ

**ZONO Creative Production Engine** — מיזוג Creative Assets + Copy Assets + Marketing DNA + Campaign DNA והתחלת יצירת קריאייטיב שיווקי אמיתי (עיצובים/ויזואלים).

## 6. אימות (QA)

יצירת קופי עובדת · מנוע review עובד · כרטיסים מוצגים · אישור/דחייה עובדים · למידה מתעדכנת · RTL עברית · scoped `tsc` EXIT 0 · `eslint` 0 errors (אזהרת `<img>` בלבד) · PGlite replay OK · client/server boundary נקי · אפס שבירה לעמודים קיימים.

## 7. הטמעה

הרץ `supabase/manual-sql/zono_copy_assets.txt` ב-Supabase, ואז `git push`.
