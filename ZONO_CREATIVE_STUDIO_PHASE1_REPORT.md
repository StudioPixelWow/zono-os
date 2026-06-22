# ZONO Creative Studio + Real Estate Marketing DNA Engine — Phase 1

מנוע מודיעין שיווק נדל״ן (לא כלי עיצוב גנרי, לא העתק של PIXEL MANAGE) — בנוי לסוכנים, משרדים, נכסים ופרויקטים בישראל. Phase 1 בונה את התשתית בלבד: חומרים, DNA שיווקי, פרופיל למידה, סכמת Supabase ו-UI. **ללא יצירת מודעות, ללא קריאות AI** — הארכיטקטורה מוכנה ל-Vision בשלב הבא.

---

## 1. מה הוטמע

- **מודל ישות גמיש** `entity_type` + `entity_id` (agent / office / property / project) — ללא `client_id` קשיח, ללא מזהי דמה.
- **סכמת Supabase**: 5 טבלאות + `org_id` לבידוד דייר + RLS org-scoped (אומת ב-PGlite replay).
- **אחסון**: bucket `zono-marketing-assets` + מבנה נתיב org/entity-scoped + מדיניות storage (קובץ SQL נפרד).
- **זרימת העלאה אמיתית** (תבנית `property-media`): ולידציה (png/jpg/webp/pdf/svg/mp4, מקס 50MB) → העלאה ל-Storage → יצירת שורה ב-DB → רענון UI → toast.
- **ספריית חומרים** עם 12 פילטרים, badges, ותיוג מהיר (מאושר/נפסל/מתחרה/תמונת נכס/תוכנית/הדמיית פרויקט/מחיקה).
- **פאנל DNA שיווקי**: 6 כרטיסי תוכן (צבעים/סגנון/קהל/זוויות/אוהב/פוסל) + 10 ציוני 0-100 (יוקרה, דחיפות, מכירתיות, מודרניות, השקעה, לייפסטייל, מוכרים, קונים, צפיפות ויזואלית, מראה AI).
- **עורך פרופיל DNA**: DNA Summary, Visual Personality, Copywriting Tone, Positioning, הערות סוכן/משרד/מוכר/ZONO — שמירה / רענון ניתוח AI / נעילה כקו שיווקי מאושר.
- **למידה ומשוב**: 15 כפתורי משוב; כל לחיצה כותבת שורה ב-`zono_marketing_feedback` **ומכווננת את ציוני ה-DNA דטרמיניסטית** (`applyFeedbackToScores`).
- **כללי ברירת מחדל ZONO לנדל״ן**: 15 כללי הימנעות (מראה AI גנרי, יוקרה מזויפת, עברית לא קריאה, RTL שגוי, זהב מוגזם, מראה דובאי/מיאמי לא רלוונטי...) + 12 כללי העדפה (הקשר ישראלי אמיתי, CTA וואטסאפ-first, אמינות, סמכות סוכן, היררכיה נקייה...).
- **Placeholder גנרטור** ל״יצירת קמפיין נדל״ן״ (כפתור מושבת — בקרוב).
- **TypeScript types** מלאים + Hebrew RTL + אפס שבירה לעמודים קיימים.

## 2. טבלאות שנוצרו

`zono_marketing_assets` · `zono_marketing_dna_profiles` (unique על entity_type+entity_id, כל הציונים 0-100 עם CHECK) · `zono_marketing_feedback` · `zono_marketing_analysis_jobs` (תור ניתוח עתידי) · `zono_marketing_briefs` (מוכן-לעתיד). כולן עם `org_id` + RLS. אחסון: `zono-marketing-assets` + מדיניות (קובץ נפרד).

## 3. רכיבים שנוצרו

`src/lib/creative-studio/engine.ts` (טהור: catalogs, badges, ולידציה, ציוני DNA, כללי ברירת מחדל, feedback→score nudge) · `assets.ts` (העלאת client) · `service.ts` (server: getCreativeStudio, ensure/saveDna, lockDna, updateAssetFlags, deleteAsset, submitFeedback, requestAnalysis, listStudioEntities) · `actions.ts`.
UI: `creative-studio/page.tsx` (launcher) · `StudioLauncher.tsx` · `[entityType]/[entityId]/page.tsx` · `CreativeStudioView.tsx` (7 הסקשנים: header+stats, ספריה, מודל העלאה, פאנל DNA, עורך DNA, משוב, placeholder גנרטור).
*הותאם לקונבנציות ZONO (lib + server-actions) במקום מבנה `/services`+hooks; שמות הרכיבים שבמפרט ממופים לרכיבים אלו.*

## 4. מיקום המודול

נתיב ייעודי `/creative-studio` (סטודיו שיווק) בסרגל הצד, התומך בכל סוגי הישויות. ה-launcher מאפשר פתיחת סטודיו לכל ישות לפי `entityType` + `entityId`, ומציג סטודיואים פעילים. הסטודיו עצמו ב-`/creative-studio/{entityType}/{entityId}` — לכן ה-Creative Studio תמיד מופיע בהקשר הישות הנכון, ומוכן להטמעה כטאב בעמודי סוכן/משרד/נכס/פרויקט בשלב הבא.

## 5. מה עדיין דורש חיבור AI

- ניתוח Vision אמיתי של החומרים → מילוי `ai_extracted_colors`, `ai_detected_style`, `ai_detected_text`, `ai_real_estate_features`, `ai_visual_features`, `ai_summary`.
- חילול פרופיל ה-DNA מהחומרים (צבעים/סגנון/קהל/זוויות) במקום ברירות מחדל + כיוונון ידני.
- עיבוד `zono_marketing_analysis_jobs` בצד שרת (כרגע נוצרת משימת `pending` בלבד).
- יצירת thumbnails ל-PDF/וידאו.
- `ai_confidence_score` אמיתי.
*כל קריאות ה-AI ירוצו server-side בלבד (Phase 2).*

## 6. אימות (QA)

Scoped `tsc`: **EXIT 0** · `eslint`: **0 errors** (אזהרת `<img>` בלבד, עקבית עם תבנית property-media) · client/server boundary: ה-view מייבא `import type` בלבד מ-service · PGlite replay: **5 טבלאות, OK**. אין מזהי דמה, אין שבירת עמודים קיימים.

## 7. הטמעה

1. הרץ `supabase/manual-sql/zono_creative_studio.txt` (טבלאות) בעורך ה-SQL.
2. הרץ `supabase/manual-sql/zono_creative_storage.txt` (bucket + מדיניות storage).
3. `git push` מהטרמינל.

## 8. השלב הבא המומלץ

**Phase 2 — ניתוח AI אמיתי ל-DNA שיווקי באמצעות Gemini/OpenAI Vision**: עיבוד server-side של `zono_marketing_analysis_jobs`, חילוץ צבעים/סגנון/טקסט/מאפייני נדל״ן מהחומרים, חילול פרופיל DNA אוטומטי עם confidence, ואז Phase 3 — מחולל הקמפיינים (מודעות/סטוריז/קרוסלות/רילס) לפי ה-DNA.
