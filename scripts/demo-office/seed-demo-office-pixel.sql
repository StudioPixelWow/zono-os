-- ============================================================================
-- ZONO — REALISTIC DEMO OFFICE DATASET  ·  seed  ·  marker = zono_demo_office_pixel_v1
-- ----------------------------------------------------------------------------
-- Single-identity demo office (no Auth users are created — every agent/manager
-- in ZONO is a public.users row FK'd to auth.users, so a 4-agent team cannot
-- exist without Auth users). All records are attributed to the ONE existing
-- owner of the target org and tagged with a removable marker.
--
--   TARGET ORG : פיקסל          0f1825d2-0ac8-45d1-b03c-50ce9e9366a2   (DEV only)
--   OWNER USER : 139e649a-25d6-4501-ab95-f02d796d4aab  (tal.pixeld@gmail.com) 
--   MARKER     : jsonb {"demo_seed":"zono_demo_office_pixel_v1"} where a jsonb column
--                exists; the token "[zono_demo_office_pixel_v1]" / "demo:zdo1p" / stable
--                md5('zdo1p:<type>:<n>')::uuid ids elsewhere.
--
-- Rerun-safe: every row uses a deterministic id + ON CONFLICT DO NOTHING.
-- Run against the ZONO **DEV** database only. Never production.
-- Cleanup: scripts/demo-office/cleanup-demo-office-pixel.sql
-- ============================================================================

-- ── Stage 1 — sellers + properties + property_sellers ───────────────────────
do $$
declare
  o uuid := '0f1825d2-0ac8-45d1-b03c-50ce9e9366a2';
  u uuid := '139e649a-25d6-4501-ab95-f02d796d4aab';
  mk jsonb := '{"demo_seed":"zono_demo_office_pixel_v1"}';
  sid uuid; pid uuid; n int;
  fn text[] := array['אבי גולן','רונית שקד','משה דהן','יעל בר','דוד פרץ','נעמה כץ','עידן מזרחי','טל אבני','ליאור חן','שרון לביא','גיא רוזן','דנה שלו','אורי נבון','מיכל ארז'];
  cities text[] := array['חיפה','קריית ביאליק','קריית מוצקין','קרית ים','נשר','טירת כרמל','קרית אתא','חיפה'];
begin
  for n in 1..14 loop
    sid := md5('zdo1p:seller:'||n)::uuid;
    insert into public.sellers (id, org_id, owner_id, full_name, phone, email, city, notes,
       desired_price, minimum_price, available_for_showings, allows_marketing, allows_exclusive, has_signed_agreement)
    values (sid, o, u, fn[n], '05'||(20000000 + n*137)::text, 'seller'||n||'@demo.zono.test',
       cities[1 + (n % 8)], '[zono_demo_office_pixel_v1] מוכר הדגמה',
       (1500000 + n*180000), (1400000 + n*170000),
       (n % 3 <> 0), (n % 4 <> 0), (n % 2 = 0), (n % 3 = 0))
    on conflict (id) do nothing;
  end loop;
  for n in 1..20 loop
    pid := md5('zdo1p:prop:'||n)::uuid;
    insert into public.properties (id, org_id, owner_id, assigned_agent_id, office_owner_id, uploaded_by_user_id, seller_id,
      title, type, listing_kind, status, price, monthly_rent, rooms, size_sqm, floor, total_floors,
      has_parking, has_elevator, has_balcony, has_safe_room, city, neighborhood, has_exclusivity,
      price_before_discount, listed_at, is_internal_inventory, source_metadata)
    values (
      pid, o, u, u, u, u, (case when n<=14 then md5('zdo1p:seller:'||n)::uuid else null end),
      (array['דירת 4 חד'' משופצת','גן דירה עם חצר','פנטהאוז עם נוף לים','בית פרטי דו-משפחתי',
             'דירת 3 חד'' מרכזית','דירת 5 חד'' חדשה','קוטג'' טורי','דירת 3.5 חד'' עם מרפסת',
             'דירת גן 4 חד''','פנטהאוז דופלקס','דירת 4 חד'' עורפית','דירת 2.5 חד'' להשקעה',
             'בית קרקע עם גינה','דירת 4 חד'' עם מעלית','מיני פנטהאוז','דירת 3 חד'' משופצת',
             'דירת 4 חד'' להשכרה','דירת 3 חד'' להשכרה','דירת 2.5 חד'' להשכרה','דירת גן להשכרה'])[n]
        ||' · '||(array['חיפה','קריית ביאליק','קריית מוצקין','קרית ים','נשר','טירת כרמל','קרית אתא'])[1+(n%7)],
      (array['apartment','garden_apartment','penthouse','private_house','apartment','apartment','cottage','apartment',
             'garden_apartment','penthouse','apartment','apartment','private_house','apartment','penthouse','apartment',
             'apartment','apartment','apartment','garden_apartment']::property_type[])[n],
      (case when n>=17 then 'rent' else 'sale' end)::listing_kind,
      (array['active','active','active','active','draft','active','active','active','active','under_offer',
             'under_offer','sold','withdrawn','active','active','active','active','active','active','active']::property_status[])[n],
      (case when n>=17 then (4200 + n*250) else (1690000 + n*145000) end),
      (case when n>=17 then (4200 + n*250) else null end),
      (array[4,4,4.5,5,3,5,4,3.5,4,5,4,2.5,5,4,4,3,4,3,2.5,4]::numeric[])[n],
      (array[95,110,130,180,70,120,140,82,105,150,96,58,200,98,115,72,92,70,55,88]::int[])[n],
      (array[3,0,8,0,2,4,0,3,0,9,4,1,0,5,7,2,3,1,2,0]::int[])[n],
      (array[4,4,9,2,4,6,2,4,3,10,5,4,2,6,8,4,4,3,3,3]::int[])[n],
      (n % 3 <> 0), (n % 2 = 0), (n % 2 = 1), (n % 4 <> 0),
      (array['חיפה','קריית ביאליק','קריית מוצקין','קרית ים','נשר','טירת כרמל','קרית אתא'])[1+(n%7)],
      (array['כרמל','רמות','נווה שאנן','אחוזה','מרכז','הדר','קריות'])[1+(n%7)],
      (n % 3 = 0),
      (case when n=7 then (1690000 + n*145000 + 90000) else null end),
      (now() - (n||' days')::interval), true, mk)
    on conflict (id) do nothing;
  end loop;
  for n in 1..14 loop
    insert into public.property_sellers (id, org_id, property_id, seller_id, relationship_type, is_primary, receives_reports, status, metadata)
    values (md5('zdo1p:ps:'||n)::uuid, o, md5('zdo1p:prop:'||n)::uuid, md5('zdo1p:seller:'||n)::uuid, 'owner', true, true, 'active', mk)
    on conflict (id) do nothing;
  end loop;
end $$;

-- ── Stage 2 — buyers + leads ────────────────────────────────────────────────
do $$
declare
  o uuid := '0f1825d2-0ac8-45d1-b03c-50ce9e9366a2';
  u uuid := '139e649a-25d6-4501-ab95-f02d796d4aab';
  n int;
  bnames text[] := array['אלון מור','שירה כהן','יוסי לוי','נועה דגן','רם אבידן','הילה נחום','עומר גל','מאיה שוב','ניר הדר','ליטל עוז','ארז בן דוד','רותם קפלן','אסף רון','גל מימון','תמר אשל','יובל סער','דור אלבז','ספיר גבאי','איתן פלד','נטע ברקת','עידו חזן','שני מלכה','רון אדרי','לירן שגב','אורן דוד','מור זהבי','חן ביטון','עדי נגר','טום לוין','ריקי אנג''ל','בר כהן','אמיר שני','יערה טל','נדב אור','קרן ליבנה'];
  lsrc text[] := array['facebook','instagram','website','referral','yad2','madlan','portal','sign_call','open_house','other'];
  lstage text[] := array['new','contacted','qualified','nurturing','converted','lost','contacted','new','qualified','nurturing'];
  lintent text[] := array['buyer','seller','renter','investor','both','buyer','buyer','seller','renter','buyer'];
begin
  for n in 1..35 loop
    insert into public.buyers (id, org_id, owner_id, full_name, phone, email, temperature,
      budget_min, budget_max, rooms_min, rooms_max, preferred_types, preferred_areas,
      must_have_parking, has_preapproval, readiness, last_contacted_at, preferences)
    values (md5('zdo1p:buyer:'||n)::uuid, o, u, bnames[n], '05'||(30000000+n*211)::text, 'buyer'||n||'@demo.zono.test',
      (case when n%5=0 then 'hot' when n%4=0 then 'cold' else 'warm' end)::buyer_temperature,
      (1400000 + (n%6)*200000), (2000000 + (n%6)*300000), (2 + (n%3)), (3 + (n%4)),
      (array['apartment','garden_apartment','penthouse']::property_type[])[1:(1+(n%3))],
      (array['חיפה','קריית ביאליק','נשר','קרית אתא'])[1:(1+(n%3))],
      (n%2=0), (n%3=0), (1 + (n%5)),
      (case when n%7=0 then null when n%3=0 then now()-'22 days'::interval else now()-((n%9)||' days')::interval end),
      jsonb_build_object('demo_seed','zono_demo_office_pixel_v1','note','קונה הדגמה'))
    on conflict (id) do nothing;
  end loop;
  for n in 1..50 loop
    insert into public.leads (id, org_id, owner_id, full_name, phone, email, source, intent, stage,
      message, score, property_id, last_activity_at)
    values (md5('zdo1p:lead:'||n)::uuid, o,
      (case when n%6=0 then null else u end),
      bnames[1+(n%35)]||' '||(n)::text, '05'||(40000000+n*173)::text, 'lead'||n||'@demo.zono.test',
      (lsrc[1+(n%10)])::lead_source, (lintent[1+(n%10)])::lead_intent, (lstage[1+(n%10)])::lead_stage,
      '[zono_demo_office_pixel_v1] פנייה מהדגמה',
      (case when n%9=0 then 88 when n%5=0 then 70 else (30+(n%40)) end),
      (case when n%4=0 then md5('zdo1p:prop:'||(1+(n%20)))::uuid else null end),
      (case when n%4=0 then now()-'9 days'::interval when n%6=1 then now()-'2 hours'::interval else now()-((n%5)||' days')::interval end))
    on conflict (id) do nothing;
  end loop;
end $$;

-- ── Stage 3 — meetings/viewings (Asia/Jerusalem) + tasks ────────────────────
do $$
declare o uuid := '0f1825d2-0ac8-45d1-b03c-50ce9e9366a2'; u uuid := '139e649a-25d6-4501-ab95-f02d796d4aab';
begin
  insert into public.meetings (id, org_id, organizer_id, type, status, title, description, start_at, end_at,
     property_id, buyer_id, seller_id, intelligence_source, completed_at, outcome)
  select md5('zdo1p:mtg:'||k)::uuid, o, u, mt::meeting_type, ms::meeting_status, ttl,
     '[zono_demo_office_pixel_v1]', st, st + '60 min'::interval, prop, buy, sel, 'demo:zdo1p', cmp, oc
  from (values
    (1,'meeting','confirmed','פגישת קונה — אלון מור', ((current_date)::text||' 10:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:1')::uuid, md5('zdo1p:buyer:1')::uuid, null::uuid, null::timestamptz, null::text),
    (2,'viewing','confirmed','ביקור בנכס — פנטהאוז', ((current_date)::text||' 14:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:8')::uuid, md5('zdo1p:buyer:3')::uuid, null, null, null),
    (3,'call','scheduled','שיחת מוכר — משה דהן', ((current_date)::text||' 16:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:3')::uuid, null, md5('zdo1p:seller:3')::uuid, null, null),
    (4,'viewing','scheduled','ביקור אחה״צ — דירת גן', ((current_date)::text||' 17:30')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:9')::uuid, md5('zdo1p:buyer:6')::uuid, null, null, null),
    (5,'viewing','scheduled','ביקור מקביל — דירת 4 חד', ((current_date)::text||' 14:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:2')::uuid, md5('zdo1p:buyer:9')::uuid, null, null, null),
    (6,'viewing','confirmed','ביקור — קוטג', ((current_date+1)::text||' 11:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:7')::uuid, md5('zdo1p:buyer:12')::uuid, null, null, null),
    (7,'viewing','scheduled','ביקור — דירת 5 חד', ((current_date+2)::text||' 18:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:6')::uuid, md5('zdo1p:buyer:15')::uuid, null, null, null),
    (8,'meeting','confirmed','פגישת אסטרטגיה — מוכר', ((current_date+3)::text||' 09:30')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:4')::uuid, null, md5('zdo1p:seller:4')::uuid, null, null),
    (9,'viewing','scheduled','ביקור — פנטהאוז דופלקס', ((current_date+4)::text||' 17:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:10')::uuid, md5('zdo1p:buyer:20')::uuid, null, null, null),
    (10,'signing','scheduled','חתימת חוזה', ((current_date+5)::text||' 12:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:11')::uuid, md5('zdo1p:buyer:2')::uuid, null, null, null),
    (11,'viewing','completed','ביקור שהושלם', ((current_date-2)::text||' 16:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:9')::uuid, md5('zdo1p:buyer:4')::uuid, null, ((current_date-2)::text||' 17:00')::timestamp at time zone 'Asia/Jerusalem','עניין גבוה'),
    (12,'viewing','completed','ביקור שהושלם', ((current_date-4)::text||' 11:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:9')::uuid, md5('zdo1p:buyer:7')::uuid, null, ((current_date-4)::text||' 12:00')::timestamp at time zone 'Asia/Jerusalem','לא מתאים'),
    (13,'viewing','completed','ביקור שהושלם', ((current_date-6)::text||' 15:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:2')::uuid, md5('zdo1p:buyer:11')::uuid, null, ((current_date-6)::text||' 16:00')::timestamp at time zone 'Asia/Jerusalem','עניין בינוני'),
    (14,'viewing','completed','ביקור שהושלם', ((current_date-7)::text||' 10:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:10')::uuid, md5('zdo1p:buyer:14')::uuid, null, ((current_date-7)::text||' 11:00')::timestamp at time zone 'Asia/Jerusalem','הוגשה הצעה'),
    (15,'viewing','cancelled','ביקור שבוטל', ((current_date-1)::text||' 13:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:14')::uuid, md5('zdo1p:buyer:18')::uuid, null, null, null),
    (16,'valuation','completed','הערכת שווי', ((current_date-3)::text||' 09:00')::timestamp at time zone 'Asia/Jerusalem', md5('zdo1p:prop:5')::uuid, null, md5('zdo1p:seller:5')::uuid, ((current_date-3)::text||' 10:00')::timestamp at time zone 'Asia/Jerusalem','בוצעה')
  ) as v(k, mt, ms, ttl, st, prop, buy, sel, cmp, oc)
  on conflict (id) do nothing;

  insert into public.tasks (id, org_id, assignee_id, created_by, title, description, status, priority, due_at, completed_at,
     lead_id, property_id, seller_id, buyer_id, intelligence_source, impact_score)
  select md5('zdo1p:task:'||n)::uuid, o, u, u,
     (array['להתקשר ללקוח שלא נענה','מעקב פנייה חדשה','לחזור למוכר','מעקב אחרי ביקור','לקדם עסקה',
            'נכס דורש שיווק','לאשר תוכנית שיווק','מעקב המלצה'])[1+(n%8)]||' #'||n,
     '[zono_demo_office_pixel_v1] משימת הדגמה',
     (case when n%5=0 then 'done' else 'todo' end)::task_status,
     (array['urgent','high','medium','low','high','medium','low','medium']::task_priority[])[1+(n%8)],
     (case when n%5=0 then now()-'1 day'::interval when n%3=0 then now()-((n%7+1)||' days')::interval when n%3=1 then now()+'4 hours'::interval else now()+((n%6+1)||' days')::interval end),
     (case when n%5=0 then now()-'2 hours'::interval else null end),
     (case when n%4=0 then md5('zdo1p:lead:'||(1+(n%50)))::uuid else null end),
     (case when n%4=1 then md5('zdo1p:prop:'||(1+(n%20)))::uuid else null end),
     (case when n%4=2 then md5('zdo1p:seller:'||(1+(n%14)))::uuid else null end),
     (case when n%4=3 then md5('zdo1p:buyer:'||(1+(n%35)))::uuid else null end),
     'demo:zdo1p:task:'||n,
     (case when n%5=0 then 20 else (40+(n%50)) end)
  from generate_series(1,35) n
  on conflict (id) do nothing;
end $$;

-- ── Stage 4 — deals + deal_profiles + journeys + objections ─────────────────
do $$
declare o uuid := '0f1825d2-0ac8-45d1-b03c-50ce9e9366a2'; u uuid := '139e649a-25d6-4501-ab95-f02d796d4aab'; mk jsonb := '{"demo_seed":"zono_demo_office_pixel_v1"}';
begin
  insert into public.deals (id, org_id, owner_id, title, type, stage, status, value, commission_amount, commission_pct,
     probability, buyer_id, seller_id, property_id, expected_close_date, closed_at, lost_reason)
  select md5('zdo1p:deal:'||k)::uuid, o, u, ttl, 'sale'::deal_type, stg::deal_stage, sts::deal_status,
     val, (val*0.02)::bigint, 2.0, prob, md5('zdo1p:buyer:'||b)::uuid, md5('zdo1p:seller:'||s)::uuid, md5('zdo1p:prop:'||p)::uuid, ecd, cl, lr
  from (values
    (1,'עסקה — דירת 4 חד'' חיפה','negotiation','open',1950000,60,1,1,2,(current_date+25)::date,null::timestamptz,null::text),
    (2,'עסקה — פנטהאוז דופלקס','agreement','open',3200000,70,2,10,10,(current_date+18)::date,null,null),
    (3,'עסקה — דירת 3 חד'' מרכזית','qualified','open',1750000,30,15,5,5,(current_date+40)::date,null,null),
    (4,'עסקה — דירת 4 חד'' עורפית','contract','open',2100000,80,3,11,11,(current_date+12)::date,null,null),
    (5,'עסקה — דירת 5 חד'' חדשה','new','open',2450000,20,6,6,6,(current_date+55)::date,null,null),
    (6,'עסקה — קוטג''','closing','open',3050000,90,7,7,7,(current_date+8)::date,null,null),
    (7,'עסקה — דירת 2.5 להשקעה','won','won',1290000,100,12,12,12,(current_date-3)::date,now()-'3 days'::interval,null),
    (8,'עסקה — דירת גן','lost','lost',2380000,0,9,9,9,(current_date-10)::date,now()-'10 days'::interval,'המחיר גבוה מהתקציב'),
    (9,'עסקה — מיני פנטהאוז','negotiation','open',2750000,55,15,13,15,(current_date+22)::date,null,null)
  ) as v(k, ttl, stg, sts, val, prob, b, s, p, ecd, cl, lr)
  on conflict (id) do nothing;

  insert into public.deal_profiles (id, organization_id, deal_id, buyer_id, seller_id, property_id, assigned_agent_id,
     deal_stage, deal_health, deal_risk, deal_velocity, deal_probability, deal_value, commission_value,
     expected_close_date, primary_blocker, next_best_action, status, locality, metadata, last_calculated_at)
  select md5('zdo1p:dp:'||k)::uuid, o, md5('zdo1p:deal:'||k)::uuid, md5('zdo1p:buyer:'||b)::uuid, md5('zdo1p:seller:'||s)::uuid,
     md5('zdo1p:prop:'||p)::uuid, u, dstage, health, risk, velo, prob, val, (val*0.02)::bigint, ecd, blocker, nba, st, 'חיפה', mk, now()
  from (values
    (1,'negotiation',72,25,65,60,1950000,1,1,2,(current_date+25)::date,'ממתין לתשובת קונה','לתאם פגישת סגירה','active'),
    (2,'agreement_draft',80,20,70,70,3200000,2,10,10,(current_date+18)::date,'טיוטת הסכם בבדיקת עו״ד','לוודא חתימת מוכר','active'),
    (3,'meeting_scheduled',45,55,30,30,1750000,15,5,5,(current_date+40)::date,'קונה מתלבט','לקבוע פגישת המשך','active'),
    (4,'legal_review',78,22,75,80,2100000,3,11,11,(current_date+12)::date,'בדיקה משפטית','להשלים מסמכים לעו״ד','active'),
    (5,'new_opportunity',35,78,20,20,2450000,6,6,6,(current_date+55)::date,'טרם נוצר קשר ראשוני','ליצור קשר ראשוני','active'),
    (6,'signed',90,12,88,90,3050000,7,7,7,(current_date+8)::date,'ממתין למועד חתימה','לאשר מועד חתימה','active'),
    (7,'closed',100,5,95,100,1290000,12,12,12,(current_date-3)::date,null,null,'won'),
    (8,'lost',0,95,0,0,2380000,9,9,9,(current_date-10)::date,null,null,'lost'),
    (9,'offer_sent',60,45,55,55,2750000,15,13,15,(current_date+22)::date,'הצעה נשלחה, ממתין','לחזור לקונה על ההצעה','active')
  ) as v(k, dstage, health, risk, velo, prob, val, b, s, p, ecd, blocker, nba, st)
  on conflict (id) do nothing;

  insert into public.deal_journeys (id, organization_id, deal_profile_id, stage, entered_at, exited_at, duration_hours, owner_id, note)
  select md5('zdo1p:dj:'||k||':'||stg)::uuid, o, md5('zdo1p:dp:'||k)::uuid, stg, ent, ex,
     round(extract(epoch from (coalesce(ex,now())-ent))/3600)::int, u, '[zdo1p]'
  from (values
    (1,'new_opportunity', now()-'22 days'::interval, now()-'18 days'::interval),
    (1,'meeting_scheduled', now()-'18 days'::interval, now()-'12 days'::interval),
    (1,'negotiation', now()-'12 days'::interval, null::timestamptz),
    (3,'new_opportunity', now()-'35 days'::interval, now()-'30 days'::interval),
    (3,'meeting_scheduled', now()-'30 days'::interval, null),
    (4,'negotiation', now()-'20 days'::interval, now()-'9 days'::interval),
    (4,'legal_review', now()-'9 days'::interval, null),
    (7,'negotiation', now()-'30 days'::interval, now()-'12 days'::interval),
    (7,'signed', now()-'12 days'::interval, now()-'3 days'::interval),
    (7,'closed', now()-'3 days'::interval, now()-'3 days'::interval)
  ) as v(k, stg, ent, ex)
  on conflict (id) do nothing;

  insert into public.deal_objections (id, organization_id, deal_profile_id, objection_type, severity, resolved, owner_id, description, recommended_action)
  values
    (md5('zdo1p:do:8')::uuid, o, md5('zdo1p:dp:8')::uuid, 'price', 'high', false, u, 'הקונה חרג מהתקציב ב-8%','להציע נכס חלופי בטווח המחיר'),
    (md5('zdo1p:do:3')::uuid, o, md5('zdo1p:dp:3')::uuid, 'timing', 'medium', false, u, 'הקונה מתלבט לגבי עיתוי','לתאם פגישת החלטה')
  on conflict (id) do nothing;
end $$;

-- ── Stage 5 — activity history + marketing (non-claimable) + support + notifs ─
do $$
declare o uuid := '0f1825d2-0ac8-45d1-b03c-50ce9e9366a2'; u uuid := '139e649a-25d6-4501-ab95-f02d796d4aab'; mk jsonb := '{"demo_seed":"zono_demo_office_pixel_v1"}'; n int;
begin
  for n in 1..40 loop
    insert into public.activity_events (id, org_id, actor_user_id, event_type, entity_type, entity_id, title, channel, occurred_at, metadata)
    values (md5('zdo1p:ae:created:'||n)::uuid, o, u, 'lead.created', 'lead', md5('zdo1p:lead:'||n)::uuid::text, 'ליד חדש נקלט', 'system', now()-((n%14+1)||' days')::interval, mk)
    on conflict (id) do nothing;
    if n % 3 <> 0 then
      insert into public.activity_events (id, org_id, actor_user_id, event_type, entity_type, entity_id, title, channel, direction, occurred_at, metadata)
      values (md5('zdo1p:ae:contact:'||n)::uuid, o, u, 'lead.contacted', 'lead', md5('zdo1p:lead:'||n)::uuid::text, 'יצירת קשר עם ליד', 'whatsapp', 'outbound',
        now()-((n%14+1)||' days')::interval + (case when n%2=0 then '1 hour'::interval else '30 hours'::interval end), mk)
      on conflict (id) do nothing;
    end if;
  end loop;
  insert into public.activity_events (id, org_id, event_type, entity_type, entity_id, title, occurred_at, metadata)
  select md5('zdo1p:ae:click:'||g)::uuid, o, 'property.contact_clicked', 'property', md5('zdo1p:prop:'||((g%9)+1))::uuid::text, 'לחיצת יצירת קשר על נכס', now()-((g%6)||' days')::interval, mk
  from generate_series(1,12) g on conflict (id) do nothing;

  insert into public.distribution_campaigns (id, org_id, property_id, name, status, starts_at, metadata)
  values
   (md5('zdo1p:camp:1')::uuid, o, md5('zdo1p:prop:2')::uuid, 'קמפיין דירת 4 חד'' חיפה', 'active', now()-'5 days'::interval, mk),
   (md5('zdo1p:camp:2')::uuid, o, md5('zdo1p:prop:8')::uuid, 'קמפיין פנטהאוז', 'active', now()-'2 days'::interval, mk),
   (md5('zdo1p:camp:3')::uuid, o, md5('zdo1p:prop:3')::uuid, 'קמפיין דירת 3 חד''', 'completed', now()-'20 days'::interval, mk)
  on conflict (id) do nothing;

  -- Posts are ONLY seeded in TERMINAL, non-claimable states (published / dead_letter,
  -- terminal=true, next_retry_at null) so no worker/cron can ever claim or publish them.
  insert into public.distribution_posts (id, org_id, campaign_id, property_id, platform, post_text, publish_state, status, terminal, published_at, failure_reason, next_retry_at, metadata)
  values
   (md5('zdo1p:post:1')::uuid, o, md5('zdo1p:camp:1')::uuid, md5('zdo1p:prop:2')::uuid, 'facebook_groups', 'נכס חדש למכירה בחיפה', 'published', 'published', true, now()-'4 days'::interval, null, null, mk),
   (md5('zdo1p:post:2')::uuid, o, md5('zdo1p:camp:1')::uuid, md5('zdo1p:prop:2')::uuid, 'facebook_groups', 'עדכון מחיר', 'published', 'published', true, now()-'2 days'::interval, null, null, mk),
   (md5('zdo1p:post:3')::uuid, o, md5('zdo1p:camp:2')::uuid, md5('zdo1p:prop:8')::uuid, 'facebook_groups', 'פנטהאוז עם נוף', 'published', 'published', true, now()-'1 day'::interval, null, null, mk),
   (md5('zdo1p:post:4')::uuid, o, md5('zdo1p:camp:2')::uuid, md5('zdo1p:prop:8')::uuid, 'facebook_groups', 'פרסום שנכשל', 'dead_letter', 'failed', true, null, 'קבוצה דחתה את הפרסום', null, mk)
  on conflict (id) do nothing;

  insert into public.marketing_plans (id, org_id, property_id, created_by, status, plan_json)
  values
   (md5('zdo1p:mp:1')::uuid, o, md5('zdo1p:prop:6')::uuid, u, 'draft', jsonb_build_object('demo_seed','zono_demo_office_pixel_v1','items',3)),
   (md5('zdo1p:mp:2')::uuid, o, md5('zdo1p:prop:2')::uuid, u, 'active', jsonb_build_object('demo_seed','zono_demo_office_pixel_v1','items',5)),
   (md5('zdo1p:mp:3')::uuid, o, md5('zdo1p:prop:10')::uuid, u, 'failed', jsonb_build_object('demo_seed','zono_demo_office_pixel_v1','items',4,'error','provider'))
  on conflict (id) do nothing;

  insert into public.support_tickets (id, org_id, user_id, subject, description, status, priority, category)
  values
   (md5('zdo1p:tkt:1')::uuid, o, u, 'שאלה על חיבור WhatsApp', '[zdo1p] איך מחברים מספר עסקי', 'open', 'normal', 'integration'),
   (md5('zdo1p:tkt:2')::uuid, o, u, 'בקשת שינוי בדוח מוכר', '[zdo1p] ממתין לפרטים מהלקוח', 'waiting_customer', 'low', 'general'),
   (md5('zdo1p:tkt:3')::uuid, o, u, 'תקלה בהעלאת תמונות', '[zdo1p] נפתר', 'resolved', 'normal', 'technical'),
   (md5('zdo1p:tkt:4')::uuid, o, u, 'חיוב לא תקין דחוף', '[zdo1p] דורש טיפול מיידי', 'open', 'urgent', 'billing')
  on conflict (id) do nothing;

  -- In-app notifications ONLY (public.notifications = the in-app kernel, not the
  -- outbound notification_deliveries queue) → nothing is enqueued for a provider send.
  insert into public.notifications (id, org_id, user_id, level, category, title, body, is_read, href, lead_id, deal_id, property_id, created_at)
  select md5('zdo1p:notif:'||g)::uuid, o, u,
    (array['info','warning','critical','info','success','warning','info','critical']::notification_level[])[g],
    (array['new_lead','followup_due','deal_update','meeting_reminder','price_change','followup_due','new_match','system']::notification_category[])[g],
    (array['ליד חם ממתין למענה','מעקב באיחור','עסקה תקועה דורשת תשומת לב','ביקור מתקרב היום',
           'פרסום פורסם בהצלחה','מוכר ממתין לשיחת עדכון','קונה הגיב על נכס','חשבונית נכשלה'])[g],
    '[zono_demo_office_pixel_v1]', (g%3=0), '/action-center',
    (case when g in (1,2) then md5('zdo1p:lead:'||g)::uuid else null end),
    (case when g=3 then md5('zdo1p:deal:1')::uuid else null end),
    (case when g in (4,5) then md5('zdo1p:prop:'||g)::uuid else null end),
    now()-((g)||' hours')::interval
  from generate_series(1,8) g on conflict (id) do nothing;
end $$;

-- ── Stage 6 — customer_property_recommendations (powers /my + /r) ────────────
-- Requires migration 20280202090000_customer_property_recommendations. Varied
-- status mix; unique(org,contact_type,contact_id,property_id) prevents dup per
-- buyer. NO outbound delivery rows are created (transport is separate).
do $$
declare o uuid := '0f1825d2-0ac8-45d1-b03c-50ce9e9366a2'; b int; j int; prop int; pid uuid; bid uuid; st text; msc int; pr int;
  stat text[] := array['recommended','viewed','interested','viewing_requested','rejected'];
begin
  for b in 1..12 loop
    bid := md5('zdo1p:bundle:'||b)::uuid;
    for j in 0..(3 + (b % 3)) loop
      prop := 1 + ((b + j) % 16);
      pid := md5('zdo1p:prop:'||prop)::uuid;
      st := stat[1 + ((b + j) % 5)];
      msc := 62 + ((b*7 + j*5) % 34);
      select price::int into pr from public.properties where id=pid;
      insert into public.customer_property_recommendations
        (id, org_id, contact_type, contact_id, property_id, bundle_id, channel, status, match_score, price_at_send, recommended_at, responded_at)
      values (md5('zdo1p:cpr:'||b||':'||prop)::uuid, o, 'buyer', md5('zdo1p:buyer:'||b)::uuid, pid, bid,
         (case when b%2=0 then 'whatsapp' else 'email' end), st, msc, pr,
         now()-((b%9+1)||' days')::interval,
         (case when st='recommended' then null else now()-((b%4+1)||' days')::interval end))
      on conflict (org_id, contact_type, contact_id, property_id) do nothing;
    end loop;
  end loop;
  insert into public.customer_property_recommendations
    (id, org_id, contact_type, contact_id, property_id, bundle_id, channel, status, match_score, price_at_send, recommended_at, responded_at)
  select md5('zdo1p:cpr:hot:'||g||':'||p)::uuid, o, 'buyer', md5('zdo1p:buyer:'||g)::uuid, md5('zdo1p:prop:'||p)::uuid,
     md5('zdo1p:bundle:hot:'||g)::uuid, 'whatsapp', 'interested', 80+g,
     (select price::int from public.properties where id=md5('zdo1p:prop:'||p)::uuid), now()-'3 days'::interval, now()-'1 day'::interval
  from (values (21,2),(22,2),(23,2),(24,8),(25,8),(26,8)) as v(g,p)
  on conflict (org_id, contact_type, contact_id, property_id) do nothing;
end $$;

-- ── Stage 7 — office_members roster + office_member_id workload distribution ──
-- Requires migration 20280501120000_office_members. Represents 4 demo agents +
-- the manager WITHOUT Auth users (office_members.user_id is nullable). Attribution
-- is additive: existing owner_id/assigned_agent_id are untouched.
do $$
declare o uuid := '0f1825d2-0ac8-45d1-b03c-50ce9e9366a2'; u uuid := '139e649a-25d6-4501-ab95-f02d796d4aab'; mk jsonb := '{"demo_seed":"zono_demo_office_pixel_v1"}';
begin
  insert into public.office_members (id, org_id, user_id, full_name, role, status, specialty, avatar_url, metadata)
  values
   (md5('zdo1p:member:manager')::uuid, o, u, 'מיכל כהן', 'owner', 'active', 'ניהול משרד', '/demo/agents/michal.svg', mk),
   (md5('zdo1p:member:dana')::uuid, o, null, 'דנה כהן', 'agent', 'active', 'מכירות מגורים', '/demo/agents/dana.svg', mk),
   (md5('zdo1p:member:yoav')::uuid, o, null, 'יואב לוי', 'agent', 'active', 'השכרות ורוכשים ראשונים', '/demo/agents/yoav.svg', mk),
   (md5('zdo1p:member:maya')::uuid, o, null, 'מאיה ישראלי', 'agent', 'active', 'נכסי יוקרה ובלעדיות', '/demo/agents/maya.svg', mk),
   (md5('zdo1p:member:omer')::uuid, o, null, 'עומר רז', 'agent', 'active', 'חיפה והקריות', '/demo/agents/omer.svg', mk)
  on conflict (id) do update set avatar_url = excluded.avatar_url;

  update public.properties p set office_member_id = md5('zdo1p:member:'||v.k)::uuid
  from (values (1,'dana'),(2,'dana'),(5,'dana'),(8,'dana'),(14,'dana'),(16,'dana'),(17,'dana'),
               (9,'yoav'),(18,'yoav'),(19,'yoav'),(20,'yoav'),
               (3,'maya'),(4,'maya'),(7,'maya'),(10,'maya'),(13,'maya'),(15,'maya'),
               (6,'omer'),(11,'omer'),(12,'omer')) as v(n,k)
  where p.org_id=o and p.id = md5('zdo1p:prop:'||v.n)::uuid;

  update public.leads l set office_member_id = sub.mid
  from (select n, md5('zdo1p:member:'|| (case when n<=17 then 'dana' when n<=30 then 'yoav' when n<=41 then 'maya' else 'omer' end))::uuid mid,
               md5('zdo1p:lead:'||n)::uuid lid from generate_series(1,50) n where n%6<>0) sub
  where l.org_id=o and l.id = sub.lid;

  update public.deals d set office_member_id = md5('zdo1p:member:'||v.k)::uuid
  from (values (1,'dana'),(5,'dana'),(7,'dana'),(6,'yoav'),(2,'maya'),(4,'maya'),(9,'maya'),(3,'omer'),(8,'omer')) as v(n,k)
  where d.org_id=o and d.id = md5('zdo1p:deal:'||v.n)::uuid;

  update public.meetings mt set office_member_id = p.office_member_id
  from public.properties p where mt.org_id=o and mt.property_id = p.id and mt.intelligence_source='demo:zdo1p' and p.office_member_id is not null;

  update public.tasks t set office_member_id = sub.mid
  from (select n, md5('zdo1p:member:'|| (array['dana','yoav','maya','omer'])[1+(n%4)])::uuid mid, md5('zdo1p:task:'||n)::uuid tid from generate_series(1,35) n) sub
  where t.org_id=o and t.id = sub.tid;
end $$;
