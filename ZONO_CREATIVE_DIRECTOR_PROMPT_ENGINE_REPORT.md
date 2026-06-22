# ZONO Creative Director Prompt Engine

שכבה משלימה למערכת הקריאייטיב: כל החלטת ויזואל/לייאאוט עוברת דרך מסגרת ה-Creative Director המוכחת (זו שעובדת אצל מתחרים) — **בלי לכתוב מחדש את הלוגיקה**. הפרומפט הוא **פנימי בלבד**; המשתמש מקבל פלט מוכן. צפייה בפרומפט זמינה רק למנהל/מפתח.

---

## 1. היכן נשמרה המסגרת

`src/lib/creative-studio/creative-director/system-prompt.ts` — קבוע `ZONO_CREATIVE_DIRECTOR_SYSTEM_PROMPT` מכיל את המסגרת המוכחת **כלשונה** (Elite Post-AI Creative Director: blacklist, industry-aware, 6 אסטרטגיות Meta-native, scroll-stop, typography, text-dominant, craft rules). בנוסף: מערך `BLACKLIST` (רכיבים אסורים ל-anti-AI) ו-`RE_FAKE_TERMS` (בטיחות נדל״ן).

## 2. אילו זרימות יצירה מהירה משתמשות בה

כל 3 הזרימות — **פוסט המלצה · פוסט נמכר · פוסט פרסום דירה** — מריצות כל אחת מ-4 הוריאציות דרך:
`zonoPromptBriefBuilder` (`brief-builder.ts`, מבנה הבריף העברי המדויק) → `zonoCreativeDirectorEngine` (`engine.ts`, בוחר אסטרטגיה + visual hook + scroll-stop reason + המלצת לייאאוט/טיפוגרפיה + פרומפט אנגלי רציף תואם-מסגרת, בטוח-בלאקליסט, אמת-נדל״ן, **משמר את הקופי העברי המדויק**) → `zonoCreativeValidationService` (`validation.ts`). התוצאה נשמרת לכל פלט.
(הזרימה גם מוכנה להזרקה ל-Phase 8 visual prompt ול-Creative Outputs דרך אותו מנוע.)

## 3. שדות DB שנוספו

ל-`zono_quick_creative_outputs` ול-`zono_creative_outputs`: `internal_prompt`, `creative_strategy`, `visual_hook`, `scroll_stop_reason`, `creative_director_metadata` (jsonb: לייאאוט/טיפוגרפיה/blacklistHits/fakeRealEstateHits/passed/notes), ו-4 ציונים: `scroll_stop_score`, `creative_director_score`, `anti_ai_score`, `rtl_readability_score`. הדבקה: `supabase/manual-sql/zono_creative_director.txt`.

## 4. איך עובדת צפיית הפרומפט (admin/debug)

עמוד הסטודיו מחשב `isManager` (RPC `has_min_role('manager')`) ומעביר ל-UI. בכל כרטיס תוצאה של יצירה מהירה, **רק למנהל** מופיע כפתור **״הצג פרומפט פנימי״** שחושף את ה-`internal_prompt`, האסטרטגיה, וציוני anti-AI/scroll/RTL. למשתמש רגיל הפרומפט אינו נחשף כלל.

## 5. כללי בטיחות שנאכפים

- **NO COPY EDITING**: הקופי העברי משולב **מדויק ומלא** בפרומפט; ״שיפור ניסוח״ רק בהסכמה מפורשת, והמקור תמיד נשמר (`input_data`).
- **בטיחות נדל״ן**: המנוע לא ממציא נוף/פנטהאוז/גינה/מרפסת/חניה/מחסן — מזכיר רק מאפיינים שסופקו; ללא תמונה → רקע נדל״ני ממותג + פורטרט סוכן + לוגו + טיפוגרפיה; ל״נמכר״ המילה דומיננטית; הולידציה מסמנת `fakeRealEstateHits` ומורידה ציון.
- **anti-AI blacklist**: סריקת הפרומפט מול הרכיבים האסורים → `anti_ai_score`.

## 6. אימות (QA)

המסגרת נשמרת ובשימוש חוזר · 3 הזרימות משתמשות בה · פרומפט פנימי נוצר לכל פלט · לא נחשף למשתמש רגיל · admin רואה בלחיצה · קופי עברי נשמר מדויק כברירת מחדל · בטיחות נדל״ן + blacklist + scroll-stop + RTL מחושבים · scoped `tsc` EXIT 0 · `eslint` 0 errors · PGlite replay OK · אפס שבירה.

## 7. מה עדיין דורש image provider

הפרומפט הפנימי + הציונים מוכנים. כדי שהפרומפט יהפוך לתמונה ממשית, צריך לחבר אותו ל-Phase 8 (מחולל הוויזואלים) — נקודת אינטגרציה מוכנה: `buildCreativeDirection().internalPrompt` יכול להחליף/להעשיר את `buildVisualPrompt` ב-`visual-providers`. כיום (ללא מפתח) הכל דטרמיניסטי והמערכת עובדת מלא.

## 8. הטמעה

הרץ `supabase/manual-sql/zono_creative_director.txt` ב-Supabase, ואז `git push`.
