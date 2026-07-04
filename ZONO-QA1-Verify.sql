-- ============================================================================
-- ZONO — PHASE 34.2.2 · Supabase Post-Apply Verification (READ-ONLY)
-- ----------------------------------------------------------------------------
-- הרץ כל בלוק ב-SQL Editor. הכל SELECT בלבד — לא משנה כלום, לא מוחק כלום.
-- כל בלוק מחזיר תוצאה שאפשר להשוות למצופה (כתוב בהערה מעל).
-- ============================================================================

-- ── 1. האם 7 הטבלאות החדשות נוצרו?  (מצופה: 7 שורות) ────────────────────────
select table_name,
       (select count(*) from information_schema.columns c
          where c.table_schema='public' and c.table_name=t.table_name) as columns
from information_schema.tables t
where table_schema='public'
  and table_name in (
    'zono_org_memory','zono_org_memory_events','zono_org_learning_patterns',
    'zono_intelligence_snapshots','zono_compute_cache',
    'zono_ask_conversations','zono_ask_messages')
order by table_name;

-- ── 2. האם 7 ה-buckets קיימים?  (מצופה: 7 שורות; public = t/f כמתוכנן) ──────
select id, public
from storage.buckets
where id in ('creative-references','property-media','documents','logos',
             'agent-photos','office-assets','public-site-media')
order by id;
-- מצופה: documents=false, creative-references=false, השאר public=true.

-- ── 3. RLS מופעל על 7 הטבלאות החדשות?  (מצופה: כולן rowsecurity=true) ───────
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'zono_org_memory','zono_org_memory_events','zono_org_learning_patterns',
    'zono_intelligence_snapshots','zono_compute_cache',
    'zono_ask_conversations','zono_ask_messages')
order by relname;

-- ── 4. כמה מדיניות _qa1_read נוצרו בפועל?  (השוואה מול מס' הטבלאות שקיימות) ──
select count(*) as qa1_read_policies
from pg_policies
where schemaname='public' and policyname like '%\_qa1\_read';

-- ── 5. מדיניות כפולה על אותה טבלה עם אותו שם?  (מצופה: 0 שורות) ─────────────
select schemaname, tablename, policyname, count(*)
from pg_policies
where schemaname='public'
group by schemaname, tablename, policyname
having count(*) > 1;

-- ── 6. אינדקסים כפולים (אותו שם על אותה טבלה)?  (מצופה: 0 שורות) ────────────
select schemaname, tablename, indexname, count(*)
from pg_indexes
where schemaname='public'
group by schemaname, tablename, indexname
having count(*) > 1;

-- ── 7. אינדקסים כפולים לוגית (אותה הגדרה, שמות שונים)?  (בדיקת יתירות) ──────
select tablename, regexp_replace(indexdef, '^.*USING', 'USING') as definition,
       count(*) as copies, string_agg(indexname, ', ') as index_names
from pg_indexes
where schemaname='public'
group by tablename, regexp_replace(indexdef, '^.*USING', 'USING')
having count(*) > 1
order by copies desc;
-- שורות כאן = אינדקסים עם הגדרה זהה — מועמדים לניקוי (לא למחוק אוטומטית).

-- ── 8. טבלאות עם RLS מופעל אבל ללא אף מדיניות = "נעולות" למשתמשים ──────────
--     (מצופה: לבדוק שאף טבלה שמשתמש מחובר אמור לקרוא לא מופיעה כאן)
select c.relname as table_name
from pg_class c
where c.relnamespace='public'::regnamespace
  and c.relkind='r'
  and c.relrowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename=c.relname)
order by c.relname;
-- הערה: כתיבות רצות תחת service_role (BYPASSRLS) — נעילה כאן משפיעה רק על
-- קריאות של authenticated. טבלאות תשתית/מערכת בלי קריאת-משתמש = תקין.

-- ── 9. פונקציית העזר קיימת?  (מצופה: שורה אחת) ─────────────────────────────
select proname from pg_proc
where proname='current_org_id' and pronamespace='public'::regnamespace;

-- ── 10. ספירת RLS כללית: כמה טבלאות עם/בלי RLS ─────────────────────────────
select
  count(*) filter (where relrowsecurity)      as tables_with_rls,
  count(*) filter (where not relrowsecurity)  as tables_without_rls,
  count(*)                                     as total_tables
from pg_class
where relnamespace='public'::regnamespace and relkind='r';

-- ── 11. אימות מהיר של כתיבה/קריאה (אופציונלי — יוצר ומוחק שורת בדיקה) ───────
--     הרץ רק אם רוצים לוודא INSERT/SELECT עובדים. עוטף ב-rollback כדי לא להשאיר data.
-- begin;
--   insert into public.zono_compute_cache (org_id, namespace, cache_key, payload)
--   values ('00000000-0000-0000-0000-000000000000','verify','probe','{"ok":true}'::jsonb);
--   select cache_key, payload from public.zono_compute_cache where namespace='verify';
-- rollback;
