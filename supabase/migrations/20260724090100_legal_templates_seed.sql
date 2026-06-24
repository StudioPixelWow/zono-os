-- ============================================================================
-- ZONO — Legal templates SEED (verbatim import of the 15 legal documents).
-- Idempotent: upserts each template by key, then replaces its sections+fields.
-- Generated from the source .docx — legal text preserved; only blanks/values
-- were converted to {{field_key}} placeholders. Do not hand-edit clause text.
-- ============================================================================

-- buyer_representation_agreement — הסכם ייצוג קונה
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('buyer_representation_agreement','הסכם ייצוג קונה','representation','טיוטת בסיס משפטית למשרד תיווך','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. פרטי הצדדים','הסכם זה נערך ונחתם ביום {{agreement_date}} בין:
משרד התיווך
שם המשרד: {{office_name}}
מספר רישיון תיווך: {{agent_license}}
כתובת: {{office_address}}
טלפון: {{office_phone}}
דוא"ל: {{office_email}}
להלן: "המתווך"
לבין:
שם מלא: {{client_name}}
ת"ז: {{client_id}}
כתובת: {{client_address}}
טלפון: {{client_phone}}
דוא"ל: {{client_email}}
להלן: "הלקוח"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. מבוא','הואיל והמתווך עוסק בתיווך מקרקעין כדין ומחזיק ברישיון תיווך תקף;
והואיל והלקוח מעוניין לקבל שירותי תיווך לצורך איתור, בחינה, משא ומתן ורכישת נכסי מקרקעין;
והואיל והצדדים מבקשים להסדיר את מערכת היחסים ביניהם;
לפיכך הוסכם והוצהר כדלקמן:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. הגדרות','לצורך הסכם זה:
"נכס" – כל נכס מקרקעין שיוצג ללקוח על ידי המתווך.
"עסקה" – רכישה, אופציה, זכות חכירה, זכות שכירות ארוכת טווח, קומבינציה, רכישת מניות בחברה המחזיקה במקרקעין או כל עסקה אחרת המקנה זכויות בנכס.
"גורם קשור" – בן זוג, קרוב משפחה, ילד, הורה, אח, אחות, שותף, נאמן, חברה קשורה, בעל מניות, עובד, נציג, שלוח או כל אדם הפועל מטעם הלקוח.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. שירותי התיווך','המתווך יהיה רשאי, לפי שיקול דעתו המקצועי:
לאתר נכסים מתאימים.
להציג נכסים ללקוח.
להעביר מידע אודות נכסים.
לקשר בין צדדים לעסקה.
לנהל משא ומתן.
לתאם פגישות.
לאסוף מידע רלוונטי.
להשתמש במערכות טכנולוגיות, מערכות CRM וכלי בינה מלאכותית לצורך מתן השירות.
הלקוח מאשר כי אין התחייבות מצד המתווך לאתר נכס מסוים או להבטיח ביצוע עסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. הצהרות הלקוח','הלקוח מצהיר ומתחייב כי:
כל הפרטים שמסר נכונים ומדויקים.
הוא בעל כשירות משפטית מלאה להתקשר בהסכם זה.
הוא פועל עבור עצמו בלבד אלא אם הצהיר אחרת בכתב.
אין מניעה חוקית לביצוע עסקת מקרקעין מצדו.
כל מידע שיימסר למתווך יהיה אמיתי ומלא.
ידוע לו כי המתווך מסתמך על הצהרותיו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. עמלת תיווך','במקרה שבו תבוצע עסקה בנכס אשר הוצג ללקוח על ידי המתווך, יהא המתווך זכאי לעמלת תיווך בשיעור של:
{{commission_rate}} ממחיר העסקה בתוספת מע"מ כדין
אלא אם הוסכם אחרת בכתב.
העמלה תשולם במלואה במועד חתימת ההסכם המחייב בין הצדדים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. עסקאות עקיפות','מובהר כי המתווך יהיה זכאי לעמלה גם במקרים הבאים:
העסקה נחתמה באמצעות בן משפחה.
העסקה נחתמה באמצעות חברה.
העסקה נחתמה באמצעות שותף עסקי.
העסקה נחתמה באמצעות נאמן.
העסקה נחתמה באמצעות צד שלישי.
העסקה נחתמה לאחר החלפת שם הרוכש.
העסקה בוצעה באמצעות גורם קשור.
הלקוח לא יוכל להתחמק מתשלום עמלה באמצעות שינוי זהות הרוכש בפועל.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. התחייבות לאי עקיפה','הלקוח מתחייב שלא:
ליצור קשר ישיר עם בעלי הנכס.
ליצור קשר עם מי מטעמם.
לנהל משא ומתן עצמאי.
לבצע עסקה מאחורי גב המתווך.
להעביר פרטי נכס לצד ג''.
למסור מידע שהתקבל באמצעות המתווך לצדדים אחרים.
התחייבות זו תחול במשך {{protection_period_months}} חודשים ממועד הצגת הנכס.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. תקופת הגנה','כל נכס שהוצג ללקוח על ידי המתווך ייחשב כנכס מוגן.
הגנה זו תישאר בתוקף למשך:
{{protection_period_months}} חודשים ממועד ההצגה האחרונה של הנכס.
ביצוע עסקה בתקופה זו יקנה למתווך זכות מלאה לעמלה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. אחריות ובדיקות','הלקוח מאשר כי:
המתווך אינו:
עורך דין
שמאי מקרקעין
מהנדס
אדריכל
מודד
יועץ מס
יועץ משכנתאות
הלקוח מתחייב לבצע את כל הבדיקות הנדרשות באמצעות בעלי מקצוע מטעמו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. נכונות המידע','המתווך מעביר מידע כפי שהתקבל מצדדים שלישיים.
לפיכך:
אין התחייבות לנכונות המידע.
אין התחייבות לגבי זכויות בנכס.
אין התחייבות לגבי חריגות בנייה.
אין התחייבות לגבי היטלים.
אין התחייבות לגבי מיסוי.
אין התחייבות לגבי רישום.
האחריות לבדיקות חלה על הלקוח בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. פרטיות ומאגר מידע','הלקוח מסכים כי:
פרטיו יישמרו במאגרי המידע של המשרד.
הנתונים יישמרו במערכות ZONO.
ייעשה שימוש במערכות CRM.
ייעשה שימוש במערכות אוטומציה.
ייעשה שימוש בבינה מלאכותית לצורך ניתוח נתונים ומתן שירות.
המידע לא יועבר לצדדים שלישיים אלא לצורך ביצוע השירות או כנדרש על פי דין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. תקשורת דיגיטלית','הלקוח מסכים לקבל הודעות באמצעות:
SMS
WhatsApp
דוא"ל
הודעות מערכת
שיחות טלפון
הודעות אלה ייחשבו כהודעות תקפות לכל דבר ועניין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. חתימה אלקטרונית','הצדדים מסכימים כי:
חתימה באמצעות:
מסך מגע
טלפון נייד
טאבלט
מערכת ZONO
מערכת חתימות דיגיטלית
תהווה חתימה מחייבת לכל דבר ועניין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. סודיות','הלקוח מתחייב לשמור בסודיות כל מידע עסקי שהגיע אליו באמצעות המתווך.
לרבות:
רשימות נכסים
רשימות לקוחות
מחירים
מידע מסחרי
אסטרטגיות שיווק',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. פיצוי מוסכם','במקרה של עקיפת המתווך או הפרת התחייבות מהותית לפי הסכם זה:
יהיה המתווך זכאי לפיצוי מוסכם בסך:
50,000 ₪
מבלי לגרוע מכל סעד אחר העומד לרשותו על פי דין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. יישוב סכסוכים','הצדדים יפעלו תחילה ליישוב הסכסוך בדרך של משא ומתן.
אם לא יגיעו להסכמה בתוך 30 ימים:
תהיה הסמכות המקומית הבלעדית נתונה לבתי המשפט המוסמכים במחוז {{jurisdiction_city}}.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. שונות','הסכם זה מהווה את מלוא ההסכמות בין הצדדים.
כל שינוי ייעשה בכתב בלבד.
אי אכיפת זכות כלשהי לא תיחשב ויתור עליה.
אם ייפסל סעיף כלשהו, יתר הוראות ההסכם יישארו בתוקפן.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. חתימות','הלקוח
שם: {{client_name}}
חתימה: {{field_1}}
תאריך: {{date}}
המתווך
שם: {{agent_name}}
רישיון תיווך: {{agent_license}}
חתימה: {{field_2}}
תאריך: {{date}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agreement_date','תאריך החתימה','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_name','שם המשרד','text','ZONO – מערכת הנדל"ן המובילה בישראל',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון תיווך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_id','ת"ז','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_phone','טלפון','phone',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'commission_rate','שיעור דמי התיווך','text','2%',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'protection_period_months','תקופת הגנה (חודשים)','number','24',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','חתימה','text',null,false);
end $$;

-- property_viewing_form — טופס צפייה בנכס
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('property_viewing_form','טופס צפייה בנכס','viewing','אישור הצגת נכס והתחייבות לתשלום דמי תיווך','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. פרטי הלקוח','שם מלא: {{client_name}}
ת"ז: {{client_id}}
טלפון: {{client_phone}}
דוא"ל: {{client_email}}
כתובת: {{client_address}}
להלן: "הלקוח"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. פרטי המתווך','שם המתווך: {{agent_name}}
מספר רישיון תיווך: {{agent_license}}
שם המשרד: {{office_name}}
טלפון: {{office_phone}}
דוא"ל: {{office_email}}
להלן: "המתווך"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. פרטי הנכס','כתובת הנכס: {{property_address}}
עיר: {{city}}
גוש: {{block}}
חלקה: {{parcel}}
תת חלקה: {{sub_parcel}}
מספר נכס במערכת ZONO: {{property_zono_id}}
סוג הנכס:
☐ דירה
☐ בית פרטי
☐ פנטהאוז
☐ משרד
☐ חנות
☐ מגרש
☐ אחר',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. פרטי ההצגה','תאריך הצגה: {{viewing_date}}
שעת הצגה: {{viewing_time}}
אופן ההצגה:
☐ פגישה פיזית
☐ שיחת וידאו
☐ סיור וירטואלי
☐ שליחת מידע ותמונות
☐ אחר
כתובת ה-GPS (במידה ונאספה): {{field_1}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. אישור הצגת הנכס','הלקוח מאשר בזאת כי:
הנכס המפורט בטופס זה הוצג בפניו לראשונה על ידי המתווך.
המידע אודות הנכס התקבל באמצעות המתווך.
המתווך היה הגורם אשר חשף בפני הלקוח את הנכס ואת האפשרות להתקשר בעסקה לגביו.
הלקוח מאשר כי לא הכיר את הנכס קודם לכן אלא אם הודיע על כך בכתב לפני ההצגה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. הצהרת היכרות מוקדמת','הלקוח מצהיר כי:
☐ איני מכיר את הנכס.
☐ אני מכיר את הנכס ומתחייב להציג הוכחה בכתב לכך.
במקרה של אי הצגת הוכחה מספקת בתוך 7 ימים:
ייחשב הנכס כנכס שהוצג באמצעות המתווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. התחייבות לתשלום דמי תיווך','הלקוח מתחייב כי במקרה של ביצוע עסקה בנכס זה יהיה חייב בתשלום דמי תיווך למתווך.
דמי התיווך יהיו:
{{commission_rate}} ממחיר העסקה בתוספת מע"מ כחוק
אלא אם הוסכם אחרת בכתב.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. הגדרת עסקה','לעניין טופס זה "עסקה" כוללת:
רכישה מלאה
רכישה חלקית
אופציה
קומבינציה
שכירות ארוכת טווח
חכירה
החלפת זכויות
רכישת מניות בחברה המחזיקה בנכס
כל עסקה המקנה זכויות במקרקעין',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. עסקאות באמצעות צדדים קשורים','הלקוח מסכים כי חובת התשלום תחול גם אם העסקה תבוצע באמצעות:
בן זוג
ילד
הורה
אח
אחות
קרוב משפחה
שותף עסקי
נאמן
חברה קשורה
עובד
בעל מניות
נציג
צד שלישי מטעמו',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. התחייבות לאי עקיפה','הלקוח מתחייב שלא:
ליצור קשר ישיר עם בעל הנכס.
ליצור קשר עם בני משפחתו.
ליצור קשר עם מי מטעמו.
לבצע עסקה ללא ידיעת המתווך.
להעביר את פרטי הנכס לאחרים לצורך ביצוע עסקה.
להשתמש במידע שהתקבל לצורך עקיפת המתווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. תקופת הגנה','הלקוח מאשר כי:
הנכס יהיה מוגן לטובת המתווך למשך:
{{protection_period_months}} חודשים ממועד החתימה על טופס זה.
ביצוע עסקה בתקופה זו יקנה למתווך זכות מלאה לדמי תיווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. מידע סודי','הלקוח מתחייב לשמור בסודיות:
פרטי הנכס.
מחיר הנכס.
פרטי המוכר.
מסמכים שהועברו אליו.
מידע עסקי של המתווך.
הלקוח לא יעביר מידע זה לצד שלישי ללא אישור מראש ובכתב.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. הצהרת הסתמכות','הלקוח מאשר כי:
המתווך אינו:
עורך דין
שמאי מקרקעין
מהנדס
אדריכל
מודד
יועץ מס
יועץ משכנתאות
האחריות לביצוע הבדיקות חלה על הלקוח בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. נכונות המידע','הלקוח מבין כי:
המידע שהועבר אודות הנכס התקבל ממקורות שונים, לרבות המוכר וצדדים שלישיים.
המתווך אינו מתחייב לנכונותו המלאה של המידע.
הלקוח מתחייב לבצע את כל הבדיקות הנדרשות טרם התקשרות בעסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. תיעוד דיגיטלי','הלקוח מסכים כי:
המתווך רשאי לתעד:
מועד הצגת הנכס.
מיקום ההצגה.
תכתובות.
שיחות.
הודעות WhatsApp.
הודעות SMS.
מיילים.
נתוני מערכת ZONO.
מידע זה עשוי לשמש כראיה משפטית.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. פרטיות ומאגר מידע','הלקוח מסכים כי פרטיו יישמרו במאגרי המידע של:
ZONO – מערכת הנדל"ן המובילה בישראל
לצורך:
ניהול לקוחות
תיעוד עסקאות
שיווק
אוטומציות
שירות לקוחות
ניתוח מידע באמצעות AI',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. חתימה אלקטרונית','הלקוח מסכים כי:
חתימה באמצעות:
טלפון נייד
טאבלט
מסך מגע
מערכת ZONO
מערכת חתימות אלקטרונית
תהווה חתימה מחייבת לכל דבר ועניין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. פיצוי מוסכם','במקרה של:
עקיפת המתווך
הסתרת מידע מהותי
ביצוע עסקה בניגוד להתחייבויות
ישלם הלקוח למתווך פיצוי מוסכם בסך:
50,000 ₪
מבלי לגרוע מזכות המתווך לקבלת מלוא דמי התיווך והוצאותיו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. סמכות שיפוט','הצדדים מסכימים כי:
לבתי המשפט המוסמכים במחוז {{jurisdiction_city}} תהא סמכות השיפוט הבלעדית לדון בכל מחלוקת הנובעת מטופס זה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. חתימות','הלקוח
שם מלא: {{client_name}}
חתימה: {{field_2}}
תאריך: {{date}}
המתווך
שם מלא: {{agent_name}}
מספר רישיון: {{agent_license}}
חתימה: {{field_3}}
תאריך: {{date}}
תיעוד מערכת ZONO
מזהה מסמך: {{field_4}}
כתובת IP: {{field_5}}
מזהה מכשיר: {{field_6}}
מועד חתימה: {{field_7}}
Hash Document: {{field_8}}
Audit ID: {{field_9}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_id','ת"ז','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_phone','טלפון','phone',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם המתווך','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון תיווך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_name','שם המשרד','text','ZONO – מערכת הנדל"ן המובילה בישראל',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_address','כתובת הנכס','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'city','עיר','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'block','גוש','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'parcel','חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'sub_parcel','תת חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_zono_id','מספר נכס במערכת ZONO','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'viewing_date','תאריך הצגה','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'viewing_time','שעת הצגה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','GPS (במידה ונאספה)','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'commission_rate','שיעור דמי התיווך','text','2%',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'protection_period_months','תקופת הגנה (חודשים)','number','24',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','מזהה מסמך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','כתובת IP','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','מזהה מכשיר','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','מועד חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','Hash Document','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','Audit ID','text',null,false);
end $$;

-- seller_representation_agreement — הסכם ייצוג מוכר
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('seller_representation_agreement','הסכם ייצוג מוכר','representation','הסכם שיווק, ייצוג ומכירת נכס','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. פרטי הצדדים','הסכם זה נערך ונחתם ביום {{agreement_date}} בין:
בעל הנכס
שם מלא: {{seller_name}}
ת"ז: {{seller_id}}
כתובת: {{seller_address}}
טלפון: {{seller_phone}}
דוא"ל: {{seller_email}}
להלן: "המוכר"
לבין:
המתווך
שם המשרד: {{office_name}}
שם המתווך: {{agent_name}}
מספר רישיון תיווך: {{agent_license}}
כתובת: {{office_address}}
טלפון: {{office_phone}}
דוא"ל: {{office_email}}
להלן: "המתווך"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. מבוא','הואיל והמוכר הינו בעל הזכויות בנכס ו/או בעל הרשאה חוקית לפעול בקשר לנכס;
והואיל והמוכר מעוניין לקבל שירותי שיווק, תיווך, ייצוג, איתור רוכשים וניהול משא ומתן;
והואיל והמתווך הינו מתווך מורשה כדין;
לפיכך הוסכם בין הצדדים כדלקמן:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. פרטי הנכס','כתובת: {{property_address}}
עיר: {{city}}
גוש: {{block}}
חלקה: {{parcel}}
תת חלקה: {{sub_parcel}}
סוג הנכס: {{field_1}}
שטח רשום: {{field_2}}
מחיר מבוקש: {{price}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. הצהרות המוכר','המוכר מצהיר ומתחייב כי:
הוא בעל הזכויות בנכס.
הוא רשאי לחתום על הסכם זה.
אין מניעה חוקית למכירת הנכס.
כל המידע שנמסר למתווך נכון ומלא.
לא הסתיר מידע מהותי.
ידוע לו שהמתווך מסתמך על הצהרותיו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. הרשאה לשיווק','המוכר מעניק למתווך הרשאה לבצע בין היתר:
פרסום הנכס.
שיווק הנכס.
הצגת הנכס לרוכשים.
קיום ימי מכירה.
קיום ימי צילום.
ניהול משא ומתן.
איסוף הצעות.
פרסום ברשתות חברתיות.
פרסום בפורטלים.
פרסום בקבוצות שיווק.
שימוש במערכות AI.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. הרשאת צילום ותוכן','המוכר מאשר למתווך:
לצלם את הנכס.
לצלם וידאו.
לבצע צילום רחפן.
ליצור הדמיות.
ליצור תוכן פרסומי.
לערוך תמונות.
להשתמש בבינה מלאכותית לצרכי שיווק.
המוכר מוותר על כל טענה בנוגע לאופן הצגת הנכס כל עוד נעשה שימוש סביר ומקצועי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. שימוש בבינה מלאכותית','המוכר מסכים כי:
המתווך יהיה רשאי להשתמש במערכות AI לצורך:
יצירת תיאורי נכס.
יצירת מודעות.
יצירת הדמיות.
יצירת סרטונים.
יצירת תוכן שיווקי.
ניתוח ביצועי קמפיינים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. מחיר שיווק','מחיר השיווק המבוקש:
₪ {{field_3}}
המוכר רשאי לשנות את המחיר בכתב בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. התחייבויות המוכר','המוכר מתחייב:
לשתף פעולה עם המתווך.
לאפשר הצגת הנכס.
למסור מידע מלא.
לעדכן על כל שינוי מהותי.
להעביר מסמכים רלוונטיים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. עמלת תיווך','במקרה של עסקה שבוצעה בעקבות פעילות המתווך יהיה המתווך זכאי לעמלה בשיעור:
{{commission_rate}} ממחיר העסקה בתוספת מע"מ כחוק
אלא אם הוסכם אחרת בכתב.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. גורם יעיל','המוכר מאשר כי המתווך ייחשב גורם יעיל אם:
איתר רוכש.
חשף את הנכס לרוכש.
יצר קשר בין הצדדים.
ניהל משא ומתן.
היה מעורב באופן מהותי בתהליך העסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. עסקאות עקיפות','המוכר ישלם עמלה גם אם העסקה תבוצע באמצעות:
בן משפחה.
נאמן.
חברה קשורה.
שותף עסקי.
תאגיד בשליטתו.
צד שלישי מטעמו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. התחייבות לאי עקיפה','המוכר מתחייב שלא:
להסתיר מהמתווך פניות שהתקבלו.
לבצע עסקה עם רוכש שהופנה על ידי המתווך מבלי לעדכן את המתווך.
לנהל עסקה במטרה להתחמק מתשלום עמלה.
להעביר את הנכס לצד קשור לצורך עקיפת המתווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. תקופת הגנה','כל רוכש שהוצג למוכר על ידי המתווך ייחשב רוכש מוגן.
ההגנה תחול למשך:
{{protection_period_months}} חודשים ממועד החשיפה האחרונה של הרוכש לנכס.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. בלעדיות עתידית','אם ייחתם הסכם בלעדיות נפרד:
הוראות הסכם הבלעדיות יגברו על הוראות הסכם זה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. נכונות מידע','המוכר מתחייב כי:
כל מסמך שהעביר נכון.
אין חריגות בנייה שלא דווחו.
אין הליכים משפטיים שלא דווחו.
אין שעבודים שלא דווחו.
המוכר יישא באחריות מלאה לכל מידע שגוי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. פרטיות','המוכר מסכים כי:
פרטיו יישמרו במערכות ZONO.
המידע ינוהל במערכות CRM.
תיעשה שמירה ותיעוד של פעולות השיווק.
יתבצע עיבוד מידע באמצעות AI.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. תיעוד דיגיטלי','המוכר מאשר כי:
המתווך רשאי לתעד:
שיחות.
פגישות.
הודעות.
הצעות.
משא ומתן.
פעולות מערכת.
לצרכי בקרה, תיעוד והוכחה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. הצהרת אחריות','המוכר מבין כי:
המתווך אינו:
עורך דין.
שמאי.
מהנדס.
יועץ מס.
רואה חשבון.
האחריות לקבלת ייעוץ מקצועי חלה על המוכר בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. פיצוי מוסכם','במקרה של:
עקיפת המתווך.
הסתרת עסקה.
מסירת מידע כוזב.
הפרה יסודית של ההסכם.
ישלם המוכר למתווך פיצוי מוסכם בסך:
50,000 ₪
מבלי לגרוע מכל זכות אחרת העומדת למתווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. תקופת ההסכם','הסכם זה ייכנס לתוקף במועד חתימתו ויישאר בתוקף עד לסיום ההתקשרות או ביצוע עסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,22,'22. סמכות שיפוט','הצדדים מסכימים כי:
לבתי המשפט המוסמכים במחוז {{jurisdiction_city}} תהא סמכות השיפוט הבלעדית בכל עניין הנובע מהסכם זה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,23,'23. חתימה אלקטרונית','הצדדים מסכימים כי חתימה באמצעות:
ZONO
טלפון נייד
טאבלט
מסך מגע
מערכת חתימות אלקטרונית
תהווה חתימה מחייבת לכל דבר ועניין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,24,'24. חתימות','המוכר
שם מלא: {{seller_name}}
חתימה: {{field_4}}
תאריך: {{date}}
המתווך
שם מלא: {{agent_name}}
מספר רישיון: {{agent_license}}
חתימה: {{field_5}}
תאריך: {{date}}
Audit Trail – ZONO
Document ID: {{field_6}}
IP Address: {{field_7}}
Device ID: {{field_8}}
Timestamp: {{field_9}}
Hash Signature: {{field_10}}
Version: {{field_11}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agreement_date','תאריך החתימה','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_id','ת"ז','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_name','שם המשרד','text','ZONO – מערכת הנדל"ן המובילה בישראל',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם המתווך','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון תיווך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_address','כתובת','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'city','עיר','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'block','גוש','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'parcel','חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'sub_parcel','תת חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','סוג הנכס','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','שטח רשום','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'price','מחיר מבוקש','currency',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'commission_rate','שיעור דמי התיווך','text','2%',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'protection_period_months','תקופת הגנה (חודשים)','number','24',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_10','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_11','Version','text',null,false);
end $$;

-- exclusivity_agreement — הסכם בלעדיות לשיווק ותיווך נכס
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('exclusivity_agreement','הסכם בלעדיות לשיווק ותיווך נכס','exclusivity','הסכם בלעדיות בהתאם לחוק המתווכים במקרקעין','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. פרטי הצדדים','הסכם זה נערך ונחתם ביום {{agreement_date}}
בין:
בעל הנכס
שם מלא: {{seller_name}}
ת"ז: {{seller_id}}
כתובת: {{seller_address}}
טלפון: {{seller_phone}}
דוא"ל: {{seller_email}}
להלן: "המוכר"
לבין:
המתווך
שם המשרד: {{office_name}}
מספר רישיון תיווך: {{agent_license}}
כתובת: {{office_address}}
טלפון: {{office_phone}}
דוא"ל: {{office_email}}
להלן: "המתווך"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. מטרת ההסכם','המוכר מעניק למתווך זכות בלעדית לשיווק, פרסום, תיווך, הצגת הנכס, איתור רוכשים, ניהול משא ומתן וקידום מכירת הנכס.
במהלך תקופת הבלעדיות לא יהיה כל גורם אחר רשאי לבצע פעולות תיווך בקשר לנכס ללא אישור מראש ובכתב מהמתווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. פרטי הנכס','כתובת: {{property_address}}
עיר: {{city}}
גוש: {{block}}
חלקה: {{parcel}}
תת חלקה: {{sub_parcel}}
סוג נכס: {{field_1}}
שטח: {{field_2}}
מחיר שיווק התחלתי: {{field_3}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. תקופת הבלעדיות','תחילת הבלעדיות:
{{field_4}} / {{field_5}} / {{field_6}}
סיום הבלעדיות:
{{field_7}} / {{field_8}} / {{field_9}}
המוכר מאשר כי במהלך תקופה זו המתווך הינו הגורם הבלעדי המורשה לשיווק הנכס.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. התחייבות הבלעדיות','המוכר מתחייב כי במהלך תקופת הבלעדיות:
לא יתקשר עם מתווך אחר.
לא ימנה גורם אחר לשיווק הנכס.
לא יפרסם את הנכס באמצעות משרד תיווך אחר.
לא יאפשר לאחרים לבצע פעולות תיווך בנכס.
לא ינהל משא ומתן באמצעות גורם אחר.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. מכירה עצמאית בתקופת הבלעדיות','המוכר מאשר כי גם אם יימצא רוכש על ידו באופן עצמאי במהלך תקופת הבלעדיות, יהא המתווך זכאי לדמי תיווך בהתאם להסכם זה.
המוכר מצהיר כי זוהי אחת מהתכליות המרכזיות של הבלעדיות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. פעולות השיווק','במהלך תקופת הבלעדיות יהיה המתווך רשאי לבצע בין היתר:
צילום מקצועי
צילום וידאו
צילום רחפן
הכנת חומרים שיווקיים
פרסום ברשתות חברתיות
פרסום בפורטלי נדל"ן
קמפיינים ממומנים
שיווק לקהל לקוחות קיים
שיווק למאגרי משקיעים
שיווק באמצעות WhatsApp
יצירת דפי נחיתה
שיווק באמצעות מערכות AI
יצירת סרטונים
יצירת הדמיות',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. הרשאת שימוש בתוכן','המוכר מעניק למתווך רישיון מלא להשתמש:
בתמונות
בסרטונים
בהדמיות
בתוכניות
במפרטים
במידע אודות הנכס
לצורך שיווק ומכירת הנכס.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. שיתוף פעולה בין משרדים','המתווך רשאי לפי שיקול דעתו:
לשתף פעולה עם מתווכים אחרים.
לבצע שיווק משותף.
להציע חלוקת עמלה.
המוכר נותן לכך את הסכמתו מראש.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. חובת שיתוף פעולה של המוכר','המוכר מתחייב:
לאפשר ביקורים בנכס בתיאום סביר.
למסור מסמכים.
למסור מידע מלא.
לעדכן על כל שינוי בנכס.
לעדכן על כל פנייה שהתקבלה בקשר לנכס.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. דיווח על פניות','המוכר מתחייב לדווח למתווך על כל פנייה שקיבל:
טלפונית
בכתב
ברשתות חברתיות
באמצעות מכר
באמצעות בן משפחה
בתוך 48 שעות ממועד קבלתה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. עמלת תיווך','המוכר מתחייב לשלם:
{{commission_rate}} ממחיר העסקה בתוספת מע"מ כדין
אלא אם הוסכם אחרת בכתב.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. הגדרת עסקה','עסקה כוללת:
מכירה
קומבינציה
אופציה
החלפת זכויות
חכירה
מכירת מניות בחברה המחזיקה בנכס
כל עסקה המקנה זכות במקרקעין',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. הגנה על רוכשים שהוצגו','כל רוכש שהוצג על ידי המתווך במהלך תקופת הבלעדיות ייחשב רוכש מוגן.
ההגנה תחול למשך:
{{protection_period_months}} חודשים ממועד סיום הבלעדיות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. עסקאות עקיפות','המתווך יהיה זכאי לעמלה גם אם העסקה בוצעה באמצעות:
בן משפחה
שותף
חברה קשורה
נאמן
צד שלישי
תאגיד בשליטת המוכר',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. איסור עקיפה','המוכר מתחייב שלא לבצע פעולה שמטרתה:
התחמקות מתשלום עמלה
הסתרת רוכש
שינוי זהות הרוכש
פיצול עסקה
ביצוע עסקה באמצעות צד קשור',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. הצהרות המוכר','המוכר מצהיר כי:
הוא בעל הזכויות בנכס.
אין מניעה משפטית למכירת הנכס.
כל המידע שנמסר למתווך נכון.
לא הוסתר מידע מהותי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. פרטיות ומידע','המוכר מסכים כי:
המידע ינוהל באמצעות מערכות ZONO.
המתווך רשאי להשתמש במערכות CRM.
המתווך רשאי להשתמש בבינה מלאכותית לצרכי שיווק וניתוח מידע.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. תיעוד דיגיטלי','המוכר מאשר כי:
שיחות.
פגישות.
הודעות.
הצעות.
משא ומתן.
פעולות מערכת.
עשויים להיות מתועדים ולשמש כראיה במקרה של מחלוקת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. פיצוי מוסכם','במקרה של:
הפרת בלעדיות
עקיפת המתווך
הסתרת עסקה
מסירת מידע כוזב
ישלם המוכר למתווך:
75,000 ₪ פיצוי מוסכם
ללא צורך בהוכחת נזק.
מבלי לגרוע מכל זכות אחרת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. ביטול מוקדם','ביטול מוקדם של ההסכם יתאפשר רק בהסכמה בכתב בין הצדדים.
הפסקת שיווק חד צדדית מצד המוכר לא תבטל את זכויות המתווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,22,'22. חתימה אלקטרונית','הצדדים מסכימים כי:
חתימה באמצעות:
ZONO
טלפון נייד
טאבלט
מסך מגע
מערכת חתימות דיגיטלית
תהווה חתימה מחייבת לכל דבר ועניין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,23,'23. סמכות שיפוט','לבתי המשפט המוסמכים במחוז {{jurisdiction_city}} תהא סמכות השיפוט הבלעדית בכל עניין הנובע מהסכם זה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,24,'24. חתימות','המוכר
שם מלא: {{seller_name}}
חתימה: {{field_10}}
תאריך: {{date}}
המתווך
שם מלא: {{agent_name}}
רישיון תיווך: {{agent_license}}
חתימה: {{field_11}}
תאריך: {{date}}
Audit Trail – ZONO
Document ID: {{field_12}}
IP Address: {{field_13}}
Device ID: {{field_14}}
Timestamp: {{field_15}}
Hash Signature: {{field_16}}
Version: {{field_17}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agreement_date','תאריך החתימה','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_id','ת"ז','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_name','שם המשרד','text','ZONO – מערכת הנדל"ן המובילה בישראל',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון תיווך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_address','כתובת','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'city','עיר','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'block','גוש','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'parcel','חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'sub_parcel','תת חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','סוג נכס','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','שטח','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','מחיר שיווק התחלתי','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','שדה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','____ / ____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','שדה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','____ / ____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'commission_rate','שיעור דמי התיווך','text','2%',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'protection_period_months','תקופת הגנה (חודשים)','number','24',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_10','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_11','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_12','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_13','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_14','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_15','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_16','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_17','Version','text',null,false);
end $$;

-- brokerage_fee_agreement — הסכם דמי תיווך
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('brokerage_fee_agreement','הסכם דמי תיווך','fees','הסכם לקבלת שירותי תיווך במקרקעין','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. פרטי הצדדים','הסכם זה נערך ונחתם ביום {{agreement_date}}
בין:
הלקוח
שם מלא: {{client_name}}
ת"ז: {{client_id}}
כתובת: {{client_address}}
טלפון: {{client_phone}}
דוא"ל: {{client_email}}
להלן: "הלקוח"
לבין:
המתווך
שם המתווך: {{agent_name}}
מספר רישיון תיווך: {{agent_license}}
שם המשרד: {{office_name}}
כתובת: {{office_address}}
טלפון: {{office_phone}}
דוא"ל: {{office_email}}
להלן: "המתווך"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. מטרת ההתקשרות','הלקוח מבקש לקבל שירותי תיווך מקצועיים מהמתווך בקשר לאיתור, הצגה, שיווק, מכירה, רכישה, השכרה או כל עסקת מקרקעין אחרת.
המתווך יספק שירותי תיווך מקצועיים בהתאם לשיקול דעתו המקצועי ובהתאם להוראות הדין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. הצהרות הלקוח','הלקוח מצהיר כי:
מסר פרטים נכונים ומלאים.
הוא כשיר להתקשר בהסכם.
הוא מבין את מהות שירותי התיווך.
ידוע לו כי שירותי התיווך כרוכים בתשלום דמי תיווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. השירותים הניתנים','המתווך יהיה רשאי לבצע בין היתר:
איתור נכסים.
הצגת נכסים.
תיאום פגישות.
ניהול משא ומתן.
יצירת קשר עם בעלי נכסים.
הפצת מידע.
שיווק באמצעות פלטפורמות דיגיטליות.
שימוש במערכות CRM.
שימוש במערכות AI.
ליווי עד לחתימת עסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. שיעור דמי התיווך','הלקוח מתחייב לשלם למתווך:
{{commission_rate}} ממחיר העסקה + מע"מ כדין
אלא אם צוין אחרת להלן:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. מועד תשלום','דמי התיווך ישולמו במלואם:
עם חתימת הסכם מחייב בין הצדדים לעסקה.
מובהר כי:
השלמת העסקה בפועל אינה תנאי לתשלום דמי התיווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. מקרים המזכים בדמי תיווך','המתווך יהיה זכאי לדמי תיווך אם היה הגורם היעיל בעסקה.
בין היתר:
חשף את הנכס.
יצר את הקשר הראשוני.
תיאם פגישה.
העביר מידע.
ניהל משא ומתן.
היה מעורב באופן מהותי בעסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. עסקאות באמצעות צדדים קשורים','דמי התיווך יחולו גם אם העסקה תבוצע באמצעות:
בן זוג.
הורה.
ילד.
אח.
אחות.
קרוב משפחה.
שותף עסקי.
נאמן.
חברה קשורה.
תאגיד בשליטת הלקוח.
צד שלישי מטעמו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. תקופת הגנה','כל נכס שיוצג על ידי המתווך ייחשב נכס מוגן.
הגנה זו תחול למשך:
{{protection_period_months}} חודשים
ממועד ההצגה האחרונה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. התחייבות לאי עקיפה','הלקוח מתחייב שלא:
ליצור קשר ישיר עם בעל הנכס לצורך עקיפת המתווך.
לבצע עסקה ללא ידיעת המתווך.
להעביר את פרטי הנכס לצד שלישי.
להשתמש במידע שהתקבל לצורך התחמקות מתשלום דמי תיווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. התחייבות לדיווח','הלקוח מתחייב לעדכן את המתווך באופן מיידי על:
הצעת רכישה.
קבלת הצעה.
פתיחת משא ומתן.
חתימת זיכרון דברים.
חתימת הסכם.
כל התקדמות בעסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. ריבית והצמדה','במקרה של איחור בתשלום:
יישא החוב:
הפרשי הצמדה.
ריבית פיגורים.
הוצאות גבייה.
הוצאות משפט.
שכר טרחת עורך דין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. אחריות מקצועית','הלקוח מאשר כי:
המתווך אינו:
עורך דין.
שמאי מקרקעין.
מהנדס.
מודד.
יועץ מס.
יועץ משכנתאות.
רואה חשבון.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. בדיקות עצמאיות','הלקוח מתחייב לבצע בעצמו או באמצעות מומחים מטעמו:
בדיקות משפטיות.
בדיקות תכנוניות.
בדיקות הנדסיות.
בדיקות מיסוי.
בדיקות מימון.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. פרטיות ומידע','הלקוח מסכים כי:
פרטיו יישמרו במערכות:
ZONO – מערכת הנדל"ן המובילה בישראל
לצורך:
ניהול לקוחות.
תיעוד עסקאות.
שירות לקוחות.
אוטומציות.
שיווק.
עיבוד מידע באמצעות AI.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. תקשורת אלקטרונית','הלקוח מסכים לקבל הודעות באמצעות:
WhatsApp
SMS
דוא"ל
שיחות טלפון
התראות מערכת',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. תיעוד דיגיטלי','הלקוח מסכים כי:
המתווך רשאי לתעד:
פגישות.
שיחות.
הודעות.
מסמכים.
פעולות במערכת.
מידע זה עשוי לשמש כראיה משפטית.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. סודיות','הלקוח מתחייב שלא להעביר:
מידע עסקי.
רשימות נכסים.
רשימות לקוחות.
אסטרטגיות שיווק.
מידע מסחרי.
ללא אישור מראש ובכתב.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. פיצוי מוסכם','במקרה של:
התחמקות מתשלום.
עקיפת המתווך.
הסתרת עסקה.
הפרת התחייבויות יסודיות.
ישלם הלקוח למתווך:
50,000 ₪
כפיצוי מוסכם ללא הוכחת נזק.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. חתימה אלקטרונית','הצדדים מסכימים כי:
חתימה באמצעות:
ZONO
טלפון נייד
טאבלט
מחשב
מערכת חתימות אלקטרונית
תהווה חתימה מחייבת לכל דבר ועניין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. סמכות שיפוט','כל מחלוקת הנוגעת להסכם זה תידון בבתי המשפט המוסמכים במחוז {{jurisdiction_city}} בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,22,'22. חתימות','הלקוח
שם מלא: {{client_name}}
חתימה: {{field_1}}
תאריך: {{date}}
המתווך
שם מלא: {{agent_name}}
מספר רישיון: {{agent_license}}
חתימה: {{field_2}}
תאריך: {{date}}
Audit Trail – ZONO
Document ID: {{field_3}}
IP Address: {{field_4}}
Device ID: {{field_5}}
Timestamp: {{field_6}}
Hash Signature: {{field_7}}
Version: {{field_8}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agreement_date','תאריך החתימה','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_id','ת"ז','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_phone','טלפון','phone',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם המתווך','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון תיווך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_name','שם המשרד','text','ZONO – מערכת הנדל"ן המובילה בישראל',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'commission_rate','שיעור דמי התיווך','text','2%',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'protection_period_months','תקופת הגנה (חודשים)','number','24',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','Version','text',null,false);
end $$;

-- property_marketing_authorization — אישור שיווק נכס
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('property_marketing_authorization','אישור שיווק נכס','marketing','הרשאה לשיווק, פרסום, צילום ויצירת תוכן שיווקי','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. פרטי הצדדים','הסכם זה נערך ונחתם ביום {{agreement_date}}
בין:
בעל הנכס
שם מלא: {{seller_name}}
ת"ז: {{seller_id}}
טלפון: {{seller_phone}}
דוא"ל: {{seller_email}}
כתובת: {{seller_address}}
להלן: "בעל הנכס"
לבין:
המתווך
שם המשרד: {{office_name}}
מספר רישיון תיווך: {{agent_license}}
כתובת: {{office_address}}
טלפון: {{office_phone}}
דוא"ל: {{office_email}}
להלן: "המתווך"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. מטרת ההרשאה','בעל הנכס מאשר ומסמיך בזאת את המתווך לבצע פעולות שיווק, פרסום, קידום מכירות, צילום, יצירת תוכן והפצת מידע בקשר לנכס כמפורט במסמך זה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. פרטי הנכס','כתובת: {{property_address}}
עיר: {{city}}
גוש: {{block}}
חלקה: {{parcel}}
תת חלקה: {{sub_parcel}}
סוג הנכס: {{field_1}}
מחיר שיווק: {{price}}
מספר נכס במערכת ZONO: {{property_zono_id}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. הרשאת שיווק','בעל הנכס מאשר למתווך לבצע בין היתר:
פרסום באתרי נדל"ן.
פרסום באתר המשרד.
פרסום במערכת ZONO.
פרסום ברשתות חברתיות.
פרסום בפייסבוק.
פרסום באינסטגרם.
פרסום בלינקדאין.
פרסום בטיקטוק.
פרסום ב-WhatsApp.
פרסום בדיוור אלקטרוני.
פרסום במודעות ממומנות.
שיווק לקהל לקוחות קיים.
שיווק למאגרי משקיעים.
שיווק לשיתופי פעולה עם מתווכים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. הרשאת צילום','בעל הנכס מאשר למתווך לבצע:
צילום סטילס.
צילום מקצועי.
צילום וידאו.
צילום רחפן בכפוף לדין.
צילום פנורמי.
צילום 360.
סיור וירטואלי.
צילום לצרכי פרסום ושיווק.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. הרשאת עריכה','בעל הנכס מסכים כי המתווך יהיה רשאי:
לערוך תמונות.
לבצע תיקוני צבע.
לשפר תאורה.
לטשטש פרטים אישיים.
להסיר חפצים מפריעים.
לבצע התאמות שיווקיות סבירות.
ובלבד שלא יוצג מידע מהותי מטעה ביחס לנכס.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. הרשאת יצירת תוכן','המתווך יהיה רשאי ליצור:
תיאורי נכס.
מודעות.
סרטונים.
מצגות.
חוברות שיווק.
דפי נחיתה.
תוכן דיגיטלי.
תוכן פרסומי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. הרשאת שימוש בבינה מלאכותית','בעל הנכס מסכים כי המתווך יהיה רשאי להשתמש במערכות AI לצורך:
יצירת תיאורי נכס.
יצירת קמפיינים.
יצירת סרטונים.
יצירת תמונות שיווקיות.
יצירת הדמיות.
ניתוח ביצועי שיווק.
התאמת קהלי יעד.
אופטימיזציה של פרסום.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. הרשאת שימוש במידע','בעל הנכס מאשר למתווך להשתמש במידע הבא:
תמונות.
מפרטים.
תוכניות.
נתוני שטח.
נתוני מחיר.
נתוני סביבה.
מידע שנמסר על ידו.
לצורך ביצוע פעולות השיווק.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. הצהרות בעל הנכס','בעל הנכס מצהיר כי:
הוא בעל הזכויות בנכס או מורשה לפעול מטעמו.
הוא רשאי להעניק הרשאה זו.
המידע שנמסר למתווך נכון.
לא ידוע לו על מניעה חוקית לשיווק הנכס.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. אחריות למידע','בעל הנכס אחראי לנכונות המידע שנמסר.
המתווך יהיה רשאי להסתמך על המידע כפי שנמסר לו.
בעל הנכס ישפה את המתווך בגין כל נזק שייגרם עקב מידע שגוי, מטעה או חסר שנמסר על ידו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. שיתוף פעולה עם מתווכים נוספים','בעל הנכס מסכים כי:
המתווך יהיה רשאי לשתף את פרטי הנכס עם:
מתווכים מורשים.
משרדי תיווך.
שותפים עסקיים.
פלטפורמות שיווק.
לצורך הגדלת חשיפת הנכס.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. תקופת ההרשאה','הרשאה זו תיכנס לתוקף במועד חתימתה ותישאר בתוקף עד:
☐ מכירת הנכס
☐ ביטול בכתב
☐ סיום הסכם ההתקשרות
☐ תאריך: {{field_2}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. הסרת פרסום','בעל הנכס יהיה רשאי לבקש הסרת פרסום בכתב.
המתווך יבצע מאמצים סבירים להסרת הפרסומים שבשליטתו בתוך זמן סביר.
מובהר כי פרסומים שכבר הופצו לצדדים שלישיים אינם בשליטת המתווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. פרטיות','בעל הנכס מסכים כי:
המידע ינוהל במערכות:
ZONO – מערכת הנדל"ן המובילה בישראל
לצורך:
ניהול נכסים.
ניהול לקוחות.
שיווק.
תיעוד.
אוטומציות.
ניתוח באמצעות AI.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. תיעוד דיגיטלי','בעל הנכס מאשר כי:
המתווך רשאי לשמור:
תמונות.
סרטונים.
מסמכים.
הצעות.
תכתובות.
היסטוריית פעולות.
לצורך תיעוד ושמירת זכויות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. הגבלת אחריות','בעל הנכס מאשר כי:
המתווך אינו מתחייב:
למציאת רוכש.
למכירת הנכס.
למחיר מכירה מסוים.
לפרק זמן מסוים.
המתווך מתחייב לפעול במקצועיות ובתום לב בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. פיצוי מוסכם','במקרה שבו בעל הנכס מסר מידע כוזב ביודעין או הסתיר מידע מהותי אשר גרם לנזק למתווך:
ישפה בעל הנכס את המתווך בגין מלוא הנזק שנגרם.
בנוסף יהיה המתווך זכאי לפיצוי מוסכם בסך:
25,000 ₪
מבלי לגרוע מכל סעד אחר.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. חתימה אלקטרונית','הצדדים מסכימים כי חתימה באמצעות:
ZONO
טלפון נייד
טאבלט
מחשב
מערכת חתימות דיגיטלית
תהווה חתימה מחייבת לכל דבר ועניין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. סמכות שיפוט','כל מחלוקת הנובעת ממסמך זה תתברר בבתי המשפט המוסמכים במחוז {{jurisdiction_city}} בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. חתימות','בעל הנכס
שם מלא: {{seller_name}}
חתימה: {{field_3}}
תאריך: {{date}}
המתווך
שם מלא: {{agent_name}}
רישיון תיווך: {{agent_license}}
חתימה: {{field_4}}
תאריך: {{date}}
Audit Trail – ZONO
Document ID: {{field_5}}
IP Address: {{field_6}}
Device ID: {{field_7}}
Timestamp: {{field_8}}
Hash Signature: {{field_9}}
Version: {{field_10}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agreement_date','תאריך החתימה','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_id','ת"ז','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_name','שם המשרד','text','ZONO – מערכת הנדל"ן המובילה בישראל',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון תיווך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_address','כתובת','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'city','עיר','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'block','גוש','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'parcel','חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'sub_parcel','תת חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','סוג הנכס','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'price','מחיר שיווק','currency',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_zono_id','מספר נכס במערכת ZONO','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','☐ תאריך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_10','Version','text',null,false);
end $$;

-- broker_referral_agreement — הסכם הפניה ושיתוף פעולה בין מתווכים
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('broker_referral_agreement','הסכם הפניה ושיתוף פעולה בין מתווכים','cooperation','הסכם חלוקת עמלות והעברת לקוחות בין מתווכים מורשים','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. פרטי הצדדים','הסכם זה נערך ונחתם ביום {{agreement_date}}
בין:
המתווך המפנה
שם מלא: {{agent_name}}
מספר רישיון תיווך: {{agent_license}}
שם משרד: {{field_1}}
טלפון: {{office_phone}}
דוא"ל: {{office_email}}
להלן: "המתווך המפנה"
לבין:
המתווך המקבל
שם מלא: {{agent2_name}}
מספר רישיון תיווך: {{agent_license}}
שם משרד: {{field_2}}
טלפון: {{agent2_phone}}
דוא"ל: {{agent2_email}}
להלן: "המתווך המקבל"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. מטרת ההסכם','המתווך המפנה מעביר למתווך המקבל לקוח, נכס, מוכר, רוכש או הזדמנות עסקית, והצדדים מבקשים להסדיר את חלוקת העמלות, אחריות הטיפול, שמירת המידע וזכויותיהם.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. פרטי ההפניה','סוג ההפניה:
☐ רוכש
☐ מוכר
☐ משקיע
☐ נכס
☐ יזם
☐ פרויקט
☐ אחר
שם הלקוח: {{field_3}}
טלפון: {{property_phone}}
כתובת הנכס (אם רלוונטי): {{field_4}}
תאריך ההפניה: {{field_5}}
מזהה הפניה ב-ZONO: {{field_6}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. הצהרת רישוי','כל צד מצהיר כי:
הוא מחזיק ברישיון תיווך תקף.
לא ידוע לו על מניעה חוקית לפעול כמתווך.
יפעל בהתאם לחוק המתווכים במקרקעין.
ישמור על סטנדרט מקצועי ראוי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. חלוקת עמלה','הצדדים מסכימים כי במקרה של עסקה המזכה בעמלה:
העמלה תחולק כדלקמן:
המתווך המפנה: {{field_7}} %
המתווך המקבל: {{field_8}} %
ברירת מחדל במערכת ZONO:
50% / 50%
אלא אם הוגדר אחרת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. מועד תשלום העמלה','חלקו של המתווך המפנה ישולם בתוך:
7 ימי עסקים
מיום קבלת העמלה בפועל אצל המתווך המקבל.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. חובת דיווח','המתווך המקבל מתחייב לדווח למתווך המפנה על:
פגישה ראשונה.
הצגת נכס.
קבלת הצעה.
פתיחת משא ומתן.
חתימת הסכם.
קבלת עמלה.
הדיווח יתבצע בזמן סביר ובתום לב.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. איסור עקיפה','המתווך המקבל מתחייב שלא:
ליצור התקשרות ישירה עם הלקוח לצורך עקיפת המתווך המפנה.
להסתיר עסקאות.
להסתיר עמלות.
לשנות מבנה עסקה לצורך הפחתת חלקו של המתווך המפנה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. הגנת לקוח','הלקוח שהועבר באמצעות הפניה ייחשב:
"לקוח מוגן"
למשך:
{{protection_period_months}} חודשים
מיום ביצוע ההפניה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. עסקאות עתידיות','אם במהלך תקופת ההגנה יבצע הלקוח:
עסקה נוספת.
רכישת נכס נוסף.
מכירת נכס נוסף.
התקשרות נוספת הנובעת מהקשר שנוצר.
יחול מנגנון חלוקת העמלות גם על עסקאות אלו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. שמירת מידע','הצדדים מתחייבים לשמור בסודיות:
פרטי לקוחות.
מאגרי מידע.
רשימות נכסים.
שיטות עבודה.
מידע מסחרי.
נתוני עסקאות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. אי גיוס עובדים','כל צד מתחייב שלא:
לגייס עובדים.
לגייס סוכנים.
לשדל עובדים לעבור משרד.
במשך {{protection_period_months}} חודשים ממועד סיום שיתוף הפעולה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. אי תחרות','כל צד מתחייב שלא להשתמש במידע שהתקבל לצורך:
פגיעה עסקית.
גניבת לקוחות.
גניבת נכסים.
עקיפת שיתוף הפעולה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. דיווחים ממערכת ZONO','הצדדים מסכימים כי:
נתוני מערכת ZONO יהוו ראיה לכאורה לגבי:
מועד ההפניה.
זהות הלקוח.
סטטוס העסקה.
תכתובות.
היסטוריית פעולות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. פרטיות','הצדדים מתחייבים לעמוד בכל הוראות הדין ביחס:
לפרטיות.
למאגרי מידע.
לשימוש במידע אישי.
להעברת מידע בין משרדים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. שימוש בבינה מלאכותית','הצדדים מסכימים כי:
מערכת ZONO רשאית לבצע:
תיעוד הפניות.
ניתוח ביצועים.
חישוב חלוקת עמלות.
יצירת דוחות.
ניתוח קשרי לקוחות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. ספרים וחשבונות','המתווך המקבל ינהל רישום מסודר של:
הסכמי תיווך.
קבלות.
חשבוניות.
תשלומים שהתקבלו.
לצורך אימות חלוקת העמלה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. זכות ביקורת','במקרה של מחלוקת:
המתווך המפנה יהיה רשאי לקבל אסמכתאות המעידות על:
ביצוע העסקה.
גובה העמלה.
מועד קבלת הכספים.
תוך שמירה על פרטיות הלקוח.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. פיצוי מוסכם','במקרה של:
הסתרת עסקה.
הסתרת עמלה.
עקיפת המתווך המפנה.
דיווח כוזב.
ישלם הצד המפר:
75,000 ₪
כפיצוי מוסכם ללא הוכחת נזק.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. יישוב מחלוקות','הצדדים ינסו לפתור כל מחלוקת בדרך של משא ומתן.
אם לא הושג פתרון בתוך 30 ימים:
הסכסוך יועבר לגישור.
במידה והגישור לא יצלח:
תהיה סמכות השיפוט הבלעדית לבתי המשפט המוסמכים במחוז {{jurisdiction_city}}.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. חתימה אלקטרונית','הצדדים מסכימים כי:
חתימה באמצעות:
ZONO
טלפון נייד
טאבלט
מחשב
מערכת חתימות דיגיטלית
תהווה חתימה מחייבת לכל דבר ועניין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,22,'22. חתימות','המתווך המפנה
שם: {{agent_name}}
רישיון: {{field_9}}
חתימה: {{field_10}}
תאריך: {{date}}
המתווך המקבל
שם: {{agent2_name}}
רישיון: {{field_11}}
חתימה: {{field_12}}
תאריך: {{date}}
Audit Trail – ZONO
Document ID: {{field_13}}
Referral ID: {{field_14}}
IP Address: {{field_15}}
Device ID: {{field_16}}
Timestamp: {{field_17}}
Hash Signature: {{field_18}}
Version: {{field_19}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agreement_date','תאריך החתימה','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון תיווך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','שם משרד','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent2_name','שם מלא','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','שם משרד','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent2_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent2_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','שם הלקוח','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','כתובת הנכס (אם רלוונטי)','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','תאריך ההפניה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','ZONO','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','המתווך המפנה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','המתווך המקבל','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'protection_period_months','תקופת הגנה (חודשים)','number','24',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','רישיון','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_10','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_11','רישיון','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_12','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_13','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_14','Referral ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_15','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_16','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_17','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_18','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_19','Version','text',null,false);
end $$;

-- purchase_offer_document — מסמך הצעה לרכישת נכס
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('purchase_offer_document','מסמך הצעה לרכישת נכס','offer','מסמך הצעה בלתי מחייב לרכישת נכס','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. מטרת המסמך','מסמך זה נועד לתעד הצעה לרכישת נכס ולהעבירה לבחינת המוכר.
מובהר כי מסמך זה אינו מהווה הסכם מכר, זיכרון דברים או התחייבות מחייבת לביצוע עסקה, אלא אם צוין במפורש אחרת ונחתם על ידי כל הצדדים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. פרטי המציע','שם מלא: {{client_name}}
ת"ז: {{client_id}}
טלפון: {{client_phone}}
דוא"ל: {{client_email}}
כתובת: {{client_address}}
להלן: "המציע"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. פרטי הנכס','כתובת: {{property_address}}
עיר: {{city}}
גוש: {{block}}
חלקה: {{parcel}}
תת חלקה: {{sub_parcel}}
מספר נכס במערכת ZONO: {{property_zono_id}}
להלן: "הנכס"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. פרטי ההצעה','המציע מציע לרכוש את הנכס בסכום של:
₪ {{field_1}}
(במילים: {{field_2}})',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. מבנה התשלום','במעמד חתימת חוזה
₪ {{field_3}}
הון עצמי
₪ {{field_4}}
באמצעות משכנתא
₪ {{field_5}}
תשלום במסירה
₪ {{field_6}}
אחר
₪ {{field_7}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. תנאים מיוחדים','הצעה זו כפופה לתנאים הבאים:
☐ קבלת אישור עקרוני למשכנתא
☐ מכירת נכס קיים
☐ קבלת אישור משפטי
☐ בדיקת שמאי
☐ בדיקת מהנדס
☐ בדיקת חריגות בנייה
☐ אחר',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. מועד מסירה מבוקש','המועד המבוקש למסירת החזקה בנכס:
{{field_8}} / {{field_9}} / {{field_10}}
או
{{field_11}} חודשים ממועד חתימת הסכם המכר.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. תוקף ההצעה','הצעה זו תהיה בתוקף עד:
{{field_12}} / {{field_13}} / {{field_14}}
בשעה {{field_15}}
לאחר מועד זה תהיה ההצעה בטלה אלא אם הוארכה בכתב.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. הצהרות המציע','המציע מצהיר כי:
הוא בעל יכולת כלכלית סבירה לביצוע העסקה.
ידוע לו כי המוכר רשאי לקבל, לדחות או לשנות את ההצעה.
ידוע לו כי המוכר רשאי לנהל משא ומתן עם מציעים נוספים.
אין בהגשת ההצעה כדי להבטיח קבלת הנכס.
ידוע לו כי רק הסכם מכר חתום יחייב את הצדדים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. הצהרת המתווך','המציע מאשר כי:
המתווך אינו צד לעסקה.
המתווך אינו מתחייב לקבלת ההצעה.
המתווך אינו מתחייב למחיר כלשהו.
המתווך פועל כגורם מקשר בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. עמלת תיווך','המציע מאשר כי:
גם אם ההצעה תתקבל וגם אם תידחה, אין בכך לשנות את התחייבויותיו לפי הסכם התיווך שנחתם.
במקרה של עסקה יהיה עליו לשלם דמי תיווך בהתאם להסכם התיווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. סודיות','המציע מתחייב שלא להעביר:
מידע על הנכס.
מידע על המוכר.
מידע מסחרי.
מידע שהתקבל באמצעות המתווך.
לצדדים שלישיים ללא אישור.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. איסור עקיפה','המציע מתחייב שלא:
לפנות ישירות למוכר.
ליצור קשר עם בני משפחתו של המוכר.
לנהל משא ומתן מאחורי גב המתווך.
לבצע עסקה תוך עקיפת המתווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. עסקאות באמצעות צדדים קשורים','המציע מאשר כי התחייבויותיו יחולו גם אם העסקה תבוצע באמצעות:
בן זוג.
ילד.
הורה.
קרוב משפחה.
חברה קשורה.
שותף עסקי.
נאמן.
צד שלישי מטעמו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. הצהרת אי מחויבות','הצדדים מאשרים כי:
מסמך זה אינו מהווה:
הסכם מכר.
זיכרון דברים.
התחייבות בלתי חוזרת.
התחייבות לביצוע עסקה.
אלא מסמך לניהול משא ומתן בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. פרטיות','המציע מסכים כי פרטיו יישמרו במערכות:
ZONO – מערכת הנדל"ן המובילה בישראל
לצורך:
ניהול הצעות.
תיעוד משא ומתן.
CRM.
אוטומציות.
ניתוח באמצעות AI.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. תיעוד דיגיטלי','המציע מסכים כי:
כל הפעולות במערכת ZONO יתועדו לרבות:
הגשת הצעה.
שינוי הצעה.
ביטול הצעה.
אישור הצעה.
הודעות.
תכתובות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. פיצוי מוסכם','במקרה של:
עקיפת המתווך.
הסתרת עסקה.
שימוש במידע לצורך עקיפה.
יהיה המתווך זכאי לפיצוי מוסכם בסך:
50,000 ₪
ללא צורך בהוכחת נזק.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. חתימה אלקטרונית','המציע מסכים כי חתימה באמצעות:
מערכת ZONO
טלפון נייד
טאבלט
מחשב
מערכת חתימות דיגיטלית
תהווה חתימה מחייבת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. סמכות שיפוט','כל מחלוקת הנוגעת למסמך זה תתברר בבתי המשפט המוסמכים במחוז {{jurisdiction_city}} בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. חתימות','המציע
שם מלא: {{client_name}}
חתימה: {{field_16}}
תאריך: {{date}}
המתווך
שם מלא: {{agent_name}}
מספר רישיון: {{agent_license}}
חתימה: {{field_17}}
תאריך: {{date}}
אישור קבלת ההצעה ע"י המוכר
שם המוכר: {{field_18}}
☐ התקבלה ההצעה
☐ נדחתה ההצעה
☐ נדרש משא ומתן נוסף
הערות:
חתימה: {{field_19}}
תאריך: {{date}}
Audit Trail – ZONO
Document ID: {{field_20}}
Offer ID: {{field_21}}
Property ID: {{field_22}}
IP Address: {{field_23}}
Device ID: {{field_24}}
Timestamp: {{field_25}}
Hash Signature: {{field_26}}
Version: {{field_27}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_id','ת"ז','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_phone','טלפון','phone',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_address','כתובת','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'city','עיר','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'block','גוש','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'parcel','חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'sub_parcel','תת חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_zono_id','מספר נכס במערכת ZONO','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','(במילים','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','שדה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_10','____ / ____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_11','שדה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_12','שדה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_13','____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_14','____ / ____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_15','בשעה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_16','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_17','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_18','שם המוכר','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_19','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_20','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_21','Offer ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_22','Property ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_23','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_24','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_25','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_26','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_27','Version','text',null,false);
end $$;

-- negotiation_protocol — מסמך משא ומתן ותיעוד הצעות נגדיות
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('negotiation_protocol','מסמך משא ומתן ותיעוד הצעות נגדיות','negotiation','פרוטוקול משא ומתן ותיעוד מהלכי עסקה','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. מטרת המסמך','מסמך זה נועד לתעד באופן מלא, מדויק ושקוף את כלל מהלכי המשא ומתן בין הצדדים בקשר לנכס.
מטרתו ליצור תיעוד מסודר של הצעות, הצעות נגדיות, דרישות, הסכמות והסתייגויות שהועלו במהלך המשא ומתן.
מסמך זה אינו מהווה הסכם מכר ואינו מחייב את הצדדים לבצע עסקה אלא אם נחתם הסכם מחייב ונפרד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. פרטי הנכס','כתובת: {{property_address}}
עיר: {{city}}
גוש: {{block}}
חלקה: {{parcel}}
תת חלקה: {{sub_parcel}}
מזהה נכס ב-ZONO: {{field_1}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. פרטי הצדדים','המוכר
שם מלא: {{seller_name}}
טלפון: {{seller_phone}}
הרוכש
שם מלא: {{buyer_name}}
טלפון: {{buyer_phone}}
המתווך
שם מלא: {{agent_name}}
רישיון תיווך: {{agent_license}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. הצעה ראשונית','תאריך: {{date}}
סכום מוצע:
₪ {{field_2}}
תנאי תשלום:
מועד מסירה מבוקש:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. הצעה נגדית מס'' 1','תאריך: {{date}}
יוזם ההצעה:
☐ מוכר
☐ רוכש
☐ מתווך
הצעה:
₪ {{field_3}}
הערות:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. הצעה נגדית מס'' 2','תאריך: {{date}}
יוזם ההצעה:
☐ מוכר
☐ רוכש
☐ מתווך
הצעה:
₪ {{field_4}}
הערות:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. הצעה נגדית מס'' 3','תאריך: {{date}}
יוזם ההצעה:
☐ מוכר
☐ רוכש
☐ מתווך
הצעה:
₪ {{field_5}}
הערות:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. תנאים מסחריים שנדונו','במהלך המשא ומתן נדונו בין היתר:
☐ מחיר העסקה
☐ מועד פינוי
☐ תכולת הנכס
☐ תיקונים נדרשים
☐ חריגות בנייה
☐ אישורי עירייה
☐ משכנתא
☐ לוח תשלומים
☐ ערבויות
☐ אחר',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. תנאים מהותיים לעסקה','הצדדים מסמנים את התנאים המהותיים מבחינתם:
המוכר
הרוכש',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. תיעוד פגישות','פגישה מס'' 1
תאריך: {{date}}
משתתפים:
סיכום:
פגישה מס'' 2
תאריך: {{date}}
משתתפים:
סיכום:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. תיעוד שיחות','תאריך: {{date}}
שעה: {{time}}
צדדים משתתפים:
סיכום:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. הצהרת הצדדים','הצדדים מאשרים כי:
המשא ומתן מתנהל בתום לב.
כל צד רשאי להפסיק את המשא ומתן.
אין חובה להגיע להסכם.
אין במסמך זה כדי ליצור התחייבות חוזית מחייבת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. הגנת המתווך','הצדדים מאשרים כי:
המתווך הוא הגורם שקישר בין הצדדים.
המתווך השקיע זמן, משאבים ופעולות מקצועיות לצורך קידום העסקה.
ניהול המשא ומתן באמצעות המתווך מחזק את מעמדו כגורם יעיל בעסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. הכרה בגורם היעיל','המוכר והרוכש מאשרים כי:
המתווך:
☐ הציג את הנכס
☐ קישר בין הצדדים
☐ העביר מידע
☐ תיאם פגישות
☐ ניהל משא ומתן
☐ ליווה את העסקה
ככל שתושלם עסקה, ייחשב המתווך כגורם יעיל.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. איסור עקיפה','הצדדים מתחייבים שלא:
להמשיך משא ומתן מאחורי גב המתווך.
להסתיר התקדמות בעסקה.
לשנות זהות רוכש.
לבצע עסקה באמצעות צד קשור.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. צדדים קשורים','הוראות מסמך זה יחולו גם על:
בני זוג
ילדים
הורים
קרובי משפחה
חברות קשורות
שותפים
נאמנים
נציגים',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. סודיות','כל מידע שנמסר במסגרת המשא ומתן הינו סודי.
הצדדים מתחייבים שלא להעבירו לצדדים שלישיים ללא אישור מראש ובכתב.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. תיעוד במערכת ZONO','הצדדים מסכימים כי:
מערכת ZONO תתעד:
הצעות
הצעות נגדיות
שיחות
פגישות
מסמכים
סטטוסים
פעולות משתמש
מידע זה יהווה ראיה לכאורה במקרה של מחלוקת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. פרטיות ועיבוד מידע','הצדדים מסכימים כי:
המידע יישמר במערכות ZONO.
המידע עשוי להיות מעובד באמצעות מערכות AI לצורך:
תיעוד
סיכום פגישות
הפקת משימות
ניהול תהליך העסקה',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. חתימה אלקטרונית','הצדדים מסכימים כי:
חתימה באמצעות מערכת ZONO או אמצעי חתימה אלקטרוני תהווה חתימה מחייבת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. סמכות שיפוט','כל מחלוקת בקשר למסמך זה תתברר בבתי המשפט המוסמכים במחוז {{jurisdiction_city}}.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,22,'22. חתימות','הרוכש
שם: {{buyer_name}}
חתימה: {{field_6}}
תאריך: {{date}}
המוכר
שם: {{seller_name}}
חתימה: {{field_7}}
תאריך: {{date}}
המתווך
שם: {{agent_name}}
רישיון תיווך: {{agent_license}}
חתימה: {{field_8}}
תאריך: {{date}}
Audit Trail – ZONO
Negotiation ID: {{field_9}}
Property ID: {{field_10}}
Buyer ID: {{field_11}}
Seller ID: {{field_12}}
Document ID: {{field_13}}
Created By: {{field_14}}
Timestamp: {{field_15}}
IP Address: {{field_16}}
Device ID: {{field_17}}
Hash Signature: {{field_18}}
Version: {{field_19}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_address','כתובת','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'city','עיר','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'block','גוש','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'parcel','חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'sub_parcel','תת חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','ZONO','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'buyer_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'buyer_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','רישיון תיווך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'time','שעה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','Negotiation ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_10','Property ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_11','Buyer ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_12','Seller ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_13','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_14','Created By','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_15','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_16','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_17','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_18','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_19','Version','text',null,false);
end $$;

-- pre_contract_purchase_agreement — הסכם רכישה והצהרת כוונות לביצוע עסקת מקרקעין
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('pre_contract_purchase_agreement','הסכם רכישה והצהרת כוונות לביצוע עסקת מקרקעין','offer','מסמך טרום-חוזי לניהול והתקדמות עסקה','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. מטרת המסמך','מסמך זה נועד לתעד את הסכמות היסוד שהושגו בין הצדדים במסגרת משא ומתן לרכישת נכס.
הצדדים מבקשים לקדם את העסקה לקראת חתימת הסכם מכר מחייב באמצעות עורכי הדין מטעמם.
מובהר כי מסמך זה אינו מהווה הסכם מכר סופי ואינו מחליף ייעוץ משפטי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. פרטי המוכר','שם מלא: {{seller_name}}
ת"ז: {{seller_id}}
טלפון: {{seller_phone}}
כתובת: {{seller_address}}
דוא"ל: {{seller_email}}
להלן: "המוכר"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. פרטי הרוכש','שם מלא: {{buyer_name}}
ת"ז: {{buyer_id}}
טלפון: {{buyer_phone}}
כתובת: {{buyer_address}}
דוא"ל: {{buyer_email}}
להלן: "הרוכש"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. פרטי הנכס','כתובת: {{property_address}}
עיר: {{city}}
גוש: {{block}}
חלקה: {{parcel}}
תת חלקה: {{sub_parcel}}
שטח רשום: {{field_1}}
חניות: {{field_2}}
מחסן: {{field_3}}
הצמדות נוספות: {{field_4}}
להלן: "הנכס"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. מחיר העסקה','הצדדים מסכימים כי מחיר העסקה המוצע הינו:
₪ {{field_5}}
(במילים: {{field_6}})',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. לוח תשלומים','תשלום ראשון במעמד חתימת הסכם מכר
₪ {{field_7}}
תשלום שני
₪ {{field_8}}
בתאריך {{field_9}}
תשלום שלישי
₪ {{field_10}}
בתאריך {{field_11}}
תשלום אחרון
₪ {{field_12}}
במועד מסירת החזקה',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. מקורות מימון','הרוכש מצהיר כי מקורות המימון יהיו:
☐ הון עצמי
☐ משכנתא
☐ מכירת נכס קיים
☐ הלוואה
☐ שילוב מקורות',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. מועד מסירת החזקה','החזקה בנכס תימסר בתאריך:
{{field_13}} / {{field_14}} / {{field_15}}
או בהתאם להסכם המכר שייחתם.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. הצהרות המוכר','המוכר מצהיר כי:
הוא בעל הזכויות בנכס.
הוא רשאי למכור את הנכס.
לא ידועה לו מניעה משפטית לביצוע העסקה.
לא הסתיר מידע מהותי הידוע לו.
למיטב ידיעתו לא קיימות חריגות בנייה שלא דווחו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. הצהרות הרוכש','הרוכש מצהיר כי:
יש בידו יכולת כלכלית סבירה לביצוע העסקה.
הוא מבין כי עליו לבצע בדיקות עצמאיות.
הוא יסתייע באנשי מקצוע מטעמו.
הוא אינו מסתמך על המתווך לצורך בדיקות משפטיות או הנדסיות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. בדיקות נדרשות','הרוכש מתחייב לבצע בין היתר:
☐ בדיקת עורך דין
☐ בדיקת שמאי
☐ בדיקת משכנתא
☐ בדיקת חריגות בנייה
☐ בדיקת היטלים
☐ בדיקת זכויות
☐ בדיקת מיסוי
☐ בדיקת רישום',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. עורכי הדין בעסקה','עורך דין המוכר
שם: {{client_name}}
טלפון: {{client_phone}}
דוא"ל: {{client_email}}
עורך דין הרוכש
שם: {{client_name}}
טלפון: {{client_phone}}
דוא"ל: {{client_email}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. תיאום חוזה מכר','הצדדים מתחייבים לפעול בתום לב לצורך:
העברת מסמכים.
בדיקות משפטיות.
הכנת הסכם מכר.
קידום העסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. תיעוד מצב הנכס','המוכר מצהיר כי נכון למועד החתימה:
☐ הנכס פנוי
☐ הנכס מושכר
☐ קיימת משכנתא
☐ קיימים שעבודים
☐ קיימים הליכים משפטיים
☐ קיימות חריגות בנייה
הערות:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. התחייבות לאי ניהול מו"מ מקביל','במשך:
14 ימים ממועד החתימה
המוכר מתחייב שלא לנהל משא ומתן פעיל עם רוכשים אחרים ביחס לנכס.
אלא אם הצדדים הסכימו אחרת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. הגנת המתווך','המוכר והרוכש מאשרים כי:
המתווך:
איתר את הצדדים.
קישר ביניהם.
הציג את הנכס.
תיאם פגישות.
ניהל משא ומתן.
סייע בקידום העסקה.
הצדדים מכירים במעמדו כגורם יעיל.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. אישור דמי תיווך','המוכר והרוכש מאשרים כי:
התחייבויותיהם לתשלום דמי תיווך בהתאם להסכמים שנחתמו עימם נשארות בתוקף.
חתימה על מסמך זה אינה מבטלת התחייבויות קודמות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. איסור עקיפה','הצדדים מתחייבים שלא:
להסתיר מידע מהמתווך.
להסתיר חתימת הסכם.
לשנות זהות צד לעסקה.
לבצע עסקה באמצעות צד קשור לצורך התחמקות מתשלום עמלה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. צדדים קשורים','התחייבויות מסמך זה יחולו גם על:
בני זוג.
ילדים.
הורים.
חברות קשורות.
שותפים.
נאמנים.
תאגידים בשליטת מי מהצדדים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. פרטיות','הצדדים מסכימים כי:
המידע ינוהל במערכות:
ZONO – מערכת הנדל"ן המובילה בישראל
לצורך:
ניהול העסקה.
תיעוד.
CRM.
ניתוח נתונים.
אוטומציות.
AI.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. תיעוד דיגיטלי','הצדדים מסכימים כי:
מערכת ZONO תתעד:
הצעות.
מסמכים.
סטטוסים.
שיחות.
פגישות.
משימות.
מידע זה עשוי לשמש כראיה במקרה של מחלוקת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,22,'22. פיצוי מוסכם','במקרה של:
הסתרת עסקה.
עקיפת המתווך.
מסירת מידע כוזב.
הפרת התחייבות מהותית.
ישלם הצד המפר:
75,000 ₪
כפיצוי מוסכם ללא הוכחת נזק.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,23,'23. חתימה אלקטרונית','הצדדים מסכימים כי:
חתימה באמצעות:
ZONO
טלפון נייד
טאבלט
מחשב
מערכת חתימות אלקטרונית
תהווה חתימה מחייבת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,24,'24. סמכות שיפוט','לבתי המשפט המוסמכים במחוז {{jurisdiction_city}} תהא סמכות השיפוט הבלעדית לדון בכל מחלוקת הנובעת ממסמך זה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,25,'25. חתימות','הרוכש
שם: {{buyer_name}}
חתימה: {{field_16}}
תאריך: {{date}}
המוכר
שם: {{seller_name}}
חתימה: {{field_17}}
תאריך: {{date}}
המתווך
שם: {{agent_name}}
מספר רישיון: {{agent_license}}
חתימה: {{field_18}}
תאריך: {{date}}
Audit Trail – ZONO
Transaction ID: {{field_19}}
Property ID: {{field_20}}
Buyer ID: {{field_21}}
Seller ID: {{field_22}}
Document ID: {{field_23}}
Timestamp: {{field_24}}
IP Address: {{field_25}}
Device ID: {{field_26}}
Hash Signature: {{field_27}}
Version: {{field_28}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_id','ת"ז','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'seller_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'buyer_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'buyer_id','ת"ז','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'buyer_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'buyer_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'buyer_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_address','כתובת','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'city','עיר','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'block','גוש','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'parcel','חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'sub_parcel','תת חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','שטח רשום','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','חניות','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','מחסן','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','הצמדות נוספות','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','(במילים','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','בתאריך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_10','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_11','בתאריך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_12','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_13','שדה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_14','____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_15','____ / ____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_name','שם','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_phone','טלפון','phone',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_16','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_17','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_18','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_19','Transaction ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_20','Property ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_21','Buyer ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_22','Seller ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_23','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_24','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_25','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_26','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_27','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_28','Version','text',null,false);
end $$;

-- lead_privacy_whatsapp_ai_consent — הסכמת ליד, פרטיות, דיוור, WhatsApp ושימוש בבינה מלאכותית
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('lead_privacy_whatsapp_ai_consent','הסכמת ליד, פרטיות, דיוור, WhatsApp ושימוש בבינה מלאכותית','consent','הסכמה לקבלת שירותים דיגיטליים, תקשורת ועיבוד מידע','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. מטרת המסמך','מסמך זה מסדיר את הסכמת הלקוח למסירת פרטים, שמירת מידע, קבלת הודעות, ניהול קשרי לקוחות, שימוש במערכות אוטומציה ובינה מלאכותית, וכן שימוש במערכת ZONO ובשירותים הנלווים לה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. פרטי הלקוח','שם מלא: {{client_name}}
ת"ז: {{client_id}}
טלפון: {{client_phone}}
דוא"ל: {{client_email}}
כתובת: {{client_address}}
להלן: "הלקוח"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. הסכמה למסירת מידע','הלקוח מאשר כי:
מסר את פרטיו מרצונו החופשי.
המידע שנמסר נכון ומדויק.
אין מניעה חוקית לשמירת המידע.
הוא מודע לכך שהמידע ישמש לצורך מתן שירותי נדל"ן.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. הסכמה לשמירת מידע','הלקוח מסכים כי:
פרטיו יישמרו במאגרי המידע של:
ZONO – מערכת הנדל"ן המובילה בישראל
וכן במערכות המשמשות את המתווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. סוגי המידע הנשמרים','הלקוח מסכים לשמירת:
פרטי זיהוי.
פרטי קשר.
העדפות נדל"ן.
נכסים בהם התעניין.
הצעות שהגיש.
מסמכים שהעלה.
תכתובות.
הקלטות שיחות (ככל שנמסרה הודעה מתאימה).
נתוני פעילות במערכת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. מטרות השימוש במידע','המידע ישמש בין היתר לצורך:
איתור נכסים.
התאמת נכסים.
ניהול עסקאות.
שירות לקוחות.
תיעוד פעילות.
הפקת דוחות.
שיפור השירות.
אבטחת מידע.
מניעת הונאות.
ניתוח סטטיסטי.
שימוש במערכות AI.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. הסכמה לקבלת הודעות','הלקוח מסכים לקבל הודעות באמצעים הבאים:
☐ WhatsApp
☐ SMS
☐ דוא"ל
☐ שיחות טלפון
☐ התראות מערכת
☐ הודעות Push',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. דיוור שיווקי','הלקוח מסכים לקבל:
הצעות נדל"ן.
עדכוני נכסים.
הזדמנויות השקעה.
חדשות ועדכונים.
תוכן מקצועי.
הזמנות לאירועים.
הצעות מסחריות.
ידוע ללקוח כי הוא רשאי לבקש הסרה מרשימת התפוצה בכל עת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. הסכמה לתקשורת באמצעות WhatsApp','הלקוח מסכים כי:
יישלחו אליו הודעות WhatsApp.
ניתן יהיה להשיב לו באמצעות מערכות אוטומטיות.
שיחות יישמרו לצרכי שירות ותיעוד.
המידע עשוי להיות מעובד באמצעות מערכות AI.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. הסכמה לבוטים ואוטומציות','הלקוח מסכים כי:
חלק מהתקשורת עמו עשויה להתבצע באמצעות:
בוטים.
סוכני AI.
מערכות אוטומטיות.
מערכות ניתוח שיחה.
מבלי שהדבר יפגע באיכות השירות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. הסכמה לשימוש בבינה מלאכותית','הלקוח מאשר כי:
ZONO ומשרדי התיווך המשתמשים במערכת רשאים להשתמש במערכות בינה מלאכותית לצורך:
ניתוח צרכים.
התאמת נכסים.
סיכום שיחות.
יצירת מסמכים.
ניתוח מסמכים.
יצירת תוכן.
יצירת המלצות.
ניתוח עסקאות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. מגבלות הבינה המלאכותית','הלקוח מבין כי:
מערכות AI עשויות לטעות.
תוצרי AI אינם ייעוץ משפטי.
תוצרי AI אינם ייעוץ פיננסי.
תוצרי AI אינם ייעוץ שמאי.
תוצרי AI אינם מחליפים אנשי מקצוע.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. הסכמה להקלטת שיחות','הלקוח מסכים כי:
שיחות טלפון, פגישות מקוונות והתקשרויות דיגיטליות עשויות להיות מוקלטות לצורך:
תיעוד.
בקרה.
שיפור שירות.
מניעת מחלוקות.
ניתוח באמצעות AI.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. הסכמה לניתוח מסמכים','הלקוח מאשר כי:
מסמכים שיועלו למערכת עשויים להיות מעובדים באמצעות מערכות AI לצורך:
חילוץ מידע.
סיווג מסמכים.
זיהוי נתונים.
הפקת תובנות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. שיתוף מידע עם צדדים שלישיים','הלקוח מסכים כי מידע עשוי להיות מועבר לגורמים רלוונטיים לצורך ביצוע השירות בלבד, לרבות:
מתווכים מורשים.
עורכי דין.
שמאים.
יועצי משכנתאות.
חברות שיווק.
ספקי תוכנה וטכנולוגיה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. אבטחת מידע','ZONO והמתווך מתחייבים לנקוט באמצעים סבירים ומקובלים לשמירה על אבטחת המידע.
עם זאת, הלקוח מבין כי אין מערכת מחשוב המבטיחה חסינות מוחלטת מפני חדירה או תקלה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. זכות עיון ותיקון','הלקוח רשאי לפנות בבקשה:
לעיין במידע אודותיו.
לעדכן מידע.
לתקן מידע שגוי.
בכפוף להוראות הדין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. מחיקת מידע','הלקוח רשאי לבקש מחיקת מידע בכפוף:
לחובות שמירת מידע על פי דין.
לצורך ניהול הליכים משפטיים.
לצורך הגנה על זכויות המתווך.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. תיעוד במערכת ZONO','הלקוח מסכים כי המערכת תשמור:
זמני כניסה.
פעולות שבוצעו.
מסמכים.
חתימות.
שינויים.
הצעות.
היסטוריית תקשורת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. אחריות המשתמש','הלקוח מתחייב:
למסור מידע נכון.
לשמור על סודיות אמצעי הזיהוי שלו.
לא לעשות שימוש לרעה במערכת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. פיצוי ושיפוי','הלקוח מתחייב לשפות את ZONO ואת המתווך בגין נזקים שייגרמו כתוצאה:
ממסירת מידע כוזב ביודעין.
משימוש בלתי חוקי במערכת.
מהפרת התחייבויותיו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,22,'22. חתימה אלקטרונית','הלקוח מסכים כי חתימה באמצעות:
מערכת ZONO
טלפון נייד
טאבלט
מחשב
מערכת חתימות דיגיטלית
תהווה חתימה מחייבת לכל דבר ועניין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,23,'23. סמכות שיפוט','כל מחלוקת הנוגעת למסמך זה תידון בבתי המשפט המוסמכים במחוז {{jurisdiction_city}} בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,24,'24. חתימות','הלקוח
שם: {{client_name}}
חתימה: {{field_1}}
תאריך: {{date}}
נציג המשרד
שם: {{client_name}}
חתימה: {{field_2}}
תאריך: {{date}}
Audit Trail – ZONO
Consent ID: {{field_3}}
Lead ID: {{field_4}}
Document ID: {{field_5}}
Timestamp: {{field_6}}
IP Address: {{field_7}}
Device ID: {{field_8}}
Hash Signature: {{field_9}}
Version: {{field_10}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_id','ת"ז','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_phone','טלפון','phone',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','Consent ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','Lead ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_10','Version','text',null,false);
end $$;

-- deal_legal_checklist — רשימת בדיקה משפטית לעסקת נדל"ן
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('deal_legal_checklist','רשימת בדיקה משפטית לעסקת נדל"ן','checklist','מסמך בקרת עסקה, ציות וניהול סיכונים','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. מטרת המסמך','מסמך זה נועד ליצור בקרת איכות מלאה על עסקת הנדל"ן, לצמצם סיכונים משפטיים, למנוע טעויות ולוודא שכל הגורמים המעורבים בעסקה פעלו כנדרש.
המסמך אינו מהווה ייעוץ משפטי ואינו מחליף בדיקות מקצועיות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. פרטי העסקה','מספר עסקה במערכת ZONO: {{field_1}}
תאריך פתיחת עסקה: {{field_2}}
סוכן אחראי: {{field_3}}
סטטוס עסקה:
☐ חדשה
☐ במשא ומתן
☐ חוזה בטיוטה
☐ נחתם
☐ הושלמה
☐ בוטלה',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. פרטי הנכס','כתובת: {{property_address}}
עיר: {{city}}
גוש: {{block}}
חלקה: {{parcel}}
תת חלקה: {{sub_parcel}}
סוג נכס: {{field_4}}
מחיר עסקה: {{field_5}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. פרטי המוכר','שם מלא: {{client_name}}
טלפון: {{client_phone}}
עורך דין מייצג: {{field_6}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. פרטי הרוכש','שם מלא: {{client_name}}
טלפון: {{client_phone}}
עורך דין מייצג: {{field_7}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. מסמכי תיווך','מסמכים שנבדקו
☐ הסכם תיווך חתום
☐ טופס צפייה בנכס
☐ הסכם ייצוג
☐ הסכם בלעדיות
☐ מסמך הצעה
☐ מסמך משא ומתן
☐ אישור שיווק',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. אימות זהות','מוכר
☐ תעודת זהות
☐ ספח
☐ ייפוי כוח (אם רלוונטי)
☐ אימות בעלות
רוכש
☐ תעודת זהות
☐ ספח
☐ אימות פרטים',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. בדיקות זכויות','☐ נסח טאבו עדכני
☐ אישור זכויות
☐ אישור רמ"י
☐ חברה משכנת
☐ בדיקת בעלים
☐ בדיקת הערות אזהרה
☐ בדיקת שעבודים
☐ בדיקת עיקולים
☐ בדיקת צווי מניעה',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. בדיקות תכנון ובנייה','☐ היתר בנייה
☐ טופס 4
☐ תעודת גמר
☐ חריגות בנייה
☐ שימוש חורג
☐ צווי הריסה
☐ בדיקת תכניות עתידיות
☐ בדיקת זכויות בנייה
☐ בדיקת הצמדות',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. בדיקות עירייה','☐ ארנונה
☐ חובות עירייה
☐ היטל השבחה
☐ היטלי פיתוח
☐ אישור עירייה להעברת זכויות',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. בדיקות מיסוי','מוכר
☐ מס שבח
☐ פטור ממס שבח
☐ חישוב מס
רוכש
☐ מס רכישה
☐ מדרגות מס
☐ זכאות להטבות',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. בדיקות מימון','☐ אישור עקרוני למשכנתא
☐ מקור הון עצמי
☐ ליווי בנקאי
☐ יכולת מימון
☐ אישור בנק',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. בדיקות פיזיות','☐ ביקור בנכס
☐ בדיקת מצב הנכס
☐ ליקויי בנייה
☐ נזילות
☐ חשמל
☐ אינסטלציה
☐ רטיבות
☐ מחסן
☐ חניה',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. בדיקות מסחריות','☐ בדיקת עסקאות השוואה
☐ בדיקת מחיר שוק
☐ בדיקת תשואה
☐ בדיקת כדאיות
☐ בדיקת שמאות',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. מסמכי עסקה','☐ טיוטת חוזה
☐ נספחים
☐ לוח תשלומים
☐ פרוטוקול מסירה
☐ ייפויי כוח
☐ ערבויות
☐ מסמכי משכנתא',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. בדיקות המתווך','המתווך מאשר כי:
☐ הציג את הנכס
☐ העביר מידע
☐ תיעד את ההצעות
☐ תיעד את המשא ומתן
☐ עדכן את המערכת
☐ שמר את כל המסמכים',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. בדיקות ציות (Compliance)','☐ זיהוי לקוח
☐ אימות פרטים
☐ מניעת התחזות
☐ בדיקת ניגוד עניינים
☐ תיעוד פעילות
☐ שמירת מסמכים',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. בקרת מערכת ZONO','המערכת מאשרת:
☐ כל המסמכים נחתמו
☐ כל החתימות אומתו
☐ Audit Trail נשמר
☐ כל הפעולות תועדו
☐ גיבוי מסמכים הושלם',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. אירועים חריגים','תיאור חריגות שהתגלו:',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. הערות מקצועיות','',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. הצהרת הרוכש','אני מאשר כי הומלץ לי לבצע את כל הבדיקות המקצועיות הנדרשות באמצעות בעלי מקצוע מטעמי.
שם: {{client_name}}
חתימה: {{field_8}}
תאריך: {{date}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,22,'22. הצהרת המוכר','אני מאשר כי מסרתי את כל המידע הידוע לי ביחס לנכס.
שם: {{client_name}}
חתימה: {{field_9}}
תאריך: {{date}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,23,'23. הצהרת המתווך','אני מאשר כי פעלתי בתום לב, במקצועיות ובהתאם למידע שנמסר לי.
שם: {{client_name}}
מספר רישיון: {{agent_license}}
חתימה: {{field_10}}
תאריך: {{date}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,24,'24. סגירת עסקה','תאריך חתימת חוזה: {{field_11}}
תאריך מסירה: {{field_12}}
עמלת תיווך נגבתה:
☐ כן
☐ לא
סכום עמלה: {{field_13}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,25,'25. Audit Trail – ZONO','Deal ID: {{field_14}}
Property ID: {{field_15}}
Buyer ID: {{field_16}}
Seller ID: {{field_17}}
Agent ID: {{field_18}}
Checklist ID: {{field_19}}
Timestamp: {{field_20}}
IP Address: {{field_21}}
Device ID: {{field_22}}
Version: {{field_23}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','מספר עסקה במערכת ZONO','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','תאריך פתיחת עסקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','סוכן אחראי','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'property_address','כתובת','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'city','עיר','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'block','גוש','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'parcel','חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'sub_parcel','תת חלקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','סוג נכס','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','מחיר עסקה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_phone','טלפון','phone',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','עורך דין מייצג','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','עורך דין מייצג','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_10','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_11','תאריך חתימת חוזה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_12','תאריך מסירה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_13','סכום עמלה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_14','Deal ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_15','Property ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_16','Buyer ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_17','Seller ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_18','Agent ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_19','Checklist ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_20','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_21','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_22','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_23','Version','text',null,false);
end $$;

-- office_master_terms — תנאי התקשרות משרדיים
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('office_master_terms','תנאי התקשרות משרדיים','office','תנאי שירות כלליים ללקוחות משרד התיווך','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. מבוא','מסמך זה מסדיר את תנאי ההתקשרות הכלליים בין לקוחות המשרד לבין המתווך ו/או משרד התיווך.
מסמך זה חל על כלל השירותים הניתנים באמצעות:
משרד התיווך
אתר האינטרנט
מערכת ZONO
יישומים נלווים
שירותים דיגיטליים
שירותי בינה מלאכותית',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. הגדרות','המשרד – משרד התיווך ו/או מי מטעמו.
הלקוח – כל אדם המקבל שירות מהמשרד.
המערכת – מערכת ZONO.
שירותים – כלל שירותי התיווך, השיווק, ניהול העסקאות, השירותים הדיגיטליים והטכנולוגיים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. תחולת המסמך','מסמך זה חל על כל:
פנייה למשרד.
קבלת מידע.
צפייה בנכס.
קבלת שירותי תיווך.
שימוש במערכת.
שימוש באתר.
חתימה על מסמכים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. אופי השירות','המשרד מעניק שירותי:
תיווך מקרקעין.
שיווק נכסים.
ניהול משא ומתן.
התאמת נכסים.
ניהול לקוחות.
שירותים טכנולוגיים.
שירותי אוטומציה.
שירותי AI.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. שירותי מידע בלבד','הלקוח מבין כי:
המידע המוצג על ידי המשרד הינו מידע כללי.
המשרד אינו מתחייב:
לנכונות מלאה.
לשלמות המידע.
לעדכניות המידע.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. הגבלת אחריות מקצועית','המשרד אינו:
משרד עורכי דין.
משרד שמאות.
משרד הנדסה.
משרד אדריכלים.
משרד ייעוץ מס.
יועץ השקעות.
הלקוח חייב להסתייע באנשי מקצוע מטעמו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. בדיקות עצמאיות','הלקוח אחראי באופן בלעדי לבצע:
בדיקות משפטיות.
בדיקות הנדסיות.
בדיקות מיסוי.
בדיקות מימון.
בדיקות תכנוניות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. מידע מצדדים שלישיים','המשרד מסתמך לעיתים על מידע המתקבל מ:
בעלי נכסים.
רשויות.
יזמים.
קבלנים.
מתווכים אחרים.
צדדים שלישיים.
המשרד אינו אחראי למידע שגוי שנמסר על ידי גורמים אלו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. שירותי בינה מלאכותית','המשרד רשאי להשתמש במערכות AI לצורך:
יצירת תוכן.
ניתוח שיחות.
התאמת נכסים.
יצירת מסמכים.
סיכום פגישות.
המלצות.
הלקוח מבין כי מערכות AI עשויות לטעות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. תקשורת אלקטרונית','הלקוח מסכים לקבל תקשורת באמצעות:
WhatsApp
SMS
דוא"ל
טלפון
הודעות מערכת
כל הודעה שנשלחה לפרטי הקשר שנמסרו תיחשב כהודעה שנמסרה כדין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. תיעוד והקלטות','הלקוח מסכים כי:
פגישות, שיחות ותכתובות עשויות להיות מתועדות לצורך:
תיעוד.
בקרה.
מניעת מחלוקות.
הגנה משפטית.
שיפור השירות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. פרטיות','המידע יישמר במערכות ZONO וינוהל בהתאם למדיניות הפרטיות של המשרד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. אבטחת מידע','המשרד ינקוט באמצעי אבטחה סבירים ומקובלים.
עם זאת, לא ניתן להבטיח חסינות מוחלטת מפני:
פריצות.
תקלות.
אובדן מידע.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. קניין רוחני','כל זכויות הקניין הרוחני ב:
מערכת ZONO
מסמכים
תבניות
תוכן
חומרים שיווקיים
שייכות למשרד ו/או ל-ZONO בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. איסור שימוש לרעה','הלקוח מתחייב שלא:
להעתיק מידע.
להפיץ מידע.
לעשות שימוש מסחרי במידע.
לעקוף את המשרד.
לפגוע במוניטין המשרד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. פיצוי ושיפוי','הלקוח ישפה את המשרד בגין כל נזק שייגרם כתוצאה:
מהפרת התחייבויותיו.
ממסירת מידע כוזב.
משימוש בלתי חוקי בשירותים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. כוח עליון','המשרד לא יישא באחריות לאי מתן שירות עקב:
מלחמה.
שביתה.
אסון טבע.
תקלה טכנולוגית רחבת היקף.
אירוע שאינו בשליטתו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. תיקונים ושינויים','המשרד רשאי לעדכן מסמך זה מעת לעת.
הגרסה העדכנית תישמר במערכת ZONO.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. סמכות שיפוט','כל מחלוקת תידון בבתי המשפט המוסמכים במחוז {{jurisdiction_city}} בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. חתימות','הלקוח מאשר כי קרא, הבין והסכים לתנאי התקשרות אלו.
שם: {{client_name}}
חתימה: {{field_1}}
תאריך: {{date}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'Audit Trail – ZONO','Document ID: {{field_2}}
Client ID: {{field_3}}
Timestamp: {{field_4}}
IP Address: {{field_5}}
Device ID: {{field_6}}
Version: {{field_7}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_name','שם','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','Client ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','Version','text',null,false);
end $$;

-- reliance_waiver_liability_limitation — כתב ויתור הסתמכות והגבלת אחריות
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('reliance_waiver_liability_limitation','כתב ויתור הסתמכות והגבלת אחריות','waiver','הצהרת הבנת מגבלות שירותי התיווך והמידע','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. מטרת המסמך','מסמך זה נועד להבהיר את תחומי האחריות של המתווך, להגדיר את גבולות השירות הניתן ללקוח, ולמנוע הסתמכות בלתי סבירה על מידע, הערכות, תחזיות או דעות שנמסרו במסגרת שירותי התיווך.
הלקוח מאשר כי קרא מסמך זה בעיון, הבין את משמעותו ומסכים לכל הוראותיו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. פרטי הלקוח','שם מלא: {{client_name}}
ת"ז: {{client_id}}
טלפון: {{client_phone}}
דוא"ל: {{client_email}}
להלן: "הלקוח"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. הצהרת יסוד','הלקוח מאשר כי:
המתווך מעניק שירותי תיווך בלבד.
המתווך אינו צד לעסקה.
המתווך אינו ערב לביצוע העסקה.
המתווך אינו ערב לתוצאות העסקה.
המתווך אינו ערב לכדאיות העסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. המתווך אינו עורך דין','הלקוח מאשר כי:
המתווך אינו מעניק ייעוץ משפטי.
המתווך אינו בודק זכויות משפטיות.
המתווך אינו מחליף עורך דין.
הלקוח מחויב לקבל ייעוץ משפטי עצמאי.
כל מידע משפטי שנמסר על ידי המתווך מהווה מידע כללי בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. המתווך אינו שמאי','הלקוח מאשר כי:
המתווך אינו שמאי מקרקעין.
המתווך אינו מבצע הערכת שווי מקצועית.
המתווך אינו מתחייב לשווי הנכס.
המתווך אינו מתחייב לרווח עתידי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. המתווך אינו מהנדס','הלקוח מאשר כי:
המתווך אינו מהנדס.
המתווך אינו בודק ליקויי בנייה.
המתווך אינו בודק יציבות מבנים.
המתווך אינו בודק תקינות מערכות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. המתווך אינו אדריכל או מודד','הלקוח מאשר כי:
המתווך אינו מוסמך לקבוע:
שטחים.
זכויות בנייה.
קווי בניין.
תוספות בנייה.
התאמה לתכניות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. המתווך אינו יועץ מס','הלקוח מאשר כי:
המתווך אינו מוסמך לייעץ בנושאי:
מס רכישה.
מס שבח.
מע"מ.
היטלים.
חבות מס עתידית.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. המתווך אינו יועץ משכנתאות','הלקוח מאשר כי:
המתווך אינו מתחייב:
לקבלת משכנתא.
לגובה מימון.
לריבית מסוימת.
לאישור בנקאי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. הסתמכות על מידע מצדדים שלישיים','הלקוח מבין כי חלק מהמידע שנמסר לו התקבל מ:
בעלי נכסים.
רשויות.
יזמים.
קבלנים.
מתווכים אחרים.
גורמים מקצועיים.
המתווך אינו ערב לנכונותו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. אי התחייבות למחיר','הלקוח מאשר כי:
כל מחיר שהוצג לו הינו מידע בלבד.
המתווך אינו מתחייב:
למחיר מכירה.
למחיר רכישה.
למחיר שכירות.
למחיר עתידי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. אי התחייבות לתשואה','הלקוח מאשר כי:
כל מידע בדבר:
תשואה.
רווח.
עליית ערך.
כדאיות השקעה.
מהווה הערכה בלבד.
אין לראות בו התחייבות כלשהי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. אי התחייבות לזכויות בנייה','הלקוח מאשר כי:
אין להסתמך על מידע שנמסר על ידי המתווך לגבי:
זכויות בנייה.
הרחבות.
פיצולים.
תמ"א.
פינוי בינוי.
תוכניות עתידיות.
אלא לאחר בדיקה מקצועית עצמאית.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. אי התחייבות למצב הנכס','המתווך אינו מתחייב לגבי:
רטיבות.
נזילות.
חשמל.
אינסטלציה.
איטום.
מבנה.
תקינות מערכות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. אחריות הלקוח לבדיקות','הלקוח מתחייב לבצע בדיקות עצמאיות באמצעות בעלי מקצוע מטעמו, לרבות:
☐ עורך דין
☐ שמאי
☐ מהנדס
☐ מודד
☐ יועץ מס
☐ יועץ משכנתאות
☐ אדריכל',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. מערכות בינה מלאכותית','הלקוח מאשר כי:
ZONO עושה שימוש במערכות AI.
מערכות אלו עשויות:
לטעות.
להשמיט מידע.
לספק הערכות בלבד.
אין להסתמך על תוצרי AI כעל חוות דעת מקצועית.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. אי התחייבות למציאת נכס','הלקוח מאשר כי:
המתווך אינו מתחייב:
למצוא נכס.
למצוא קונה.
למצוא שוכר.
להשלים עסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. הגבלת אחריות כספית','מבלי לגרוע מהוראות דין שלא ניתן להתנות עליהן:
אחריות המתווך והמשרד לכל נזק, ככל שתיקבע, לא תעלה על סכום דמי התיווך ששולמו בפועל בגין העסקה נשוא המחלוקת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. ויתור על טענות הסתמכות','הלקוח מצהיר כי:
לא הסתמך באופן בלעדי על:
אמירות בעל פה.
הערכות.
תחזיות.
דעות.
מצגות.
תוצרים שנוצרו באמצעות AI.
לצורך קבלת החלטות מהותיות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. תיעוד שיחות ופגישות','הלקוח מסכים כי:
פגישות, שיחות, תכתובות והודעות עשויות להיות מתועדות ולהישמר במערכות ZONO.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. שיפוי','הלקוח מתחייב לשפות את המתווך בגין נזקים שייגרמו כתוצאה:
ממידע כוזב שמסר.
מהסתרת מידע.
משימוש בלתי חוקי במידע שהועבר אליו.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,22,'22. חתימה אלקטרונית','הלקוח מסכים כי חתימה באמצעות:
מערכת ZONO
טלפון נייד
טאבלט
מחשב
מערכת חתימות אלקטרונית
תהווה חתימה מחייבת לכל דבר ועניין.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,23,'23. סמכות שיפוט','כל מחלוקת בקשר למסמך זה תידון בבתי המשפט המוסמכים במחוז {{jurisdiction_city}} בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,24,'24. הצהרת הלקוח','אני מאשר כי:
☐ קראתי את המסמך במלואו.
☐ הבנתי את משמעותו.
☐ הובהר לי כי עליי לבצע בדיקות עצמאיות.
☐ איני מסתמך באופן בלעדי על המתווך.
☐ קיבלתי הזדמנות לשאול שאלות.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,25,'25. חתימות','הלקוח
שם: {{client_name}}
חתימה: {{field_1}}
תאריך: {{date}}
נציג המשרד
שם: {{client_name}}
חתימה: {{field_2}}
תאריך: {{date}}
Audit Trail – ZONO
Document ID: {{field_3}}
Client ID: {{field_4}}
Timestamp: {{field_5}}
IP Address: {{field_6}}
Device ID: {{field_7}}
Hash Signature: {{field_8}}
Version: {{field_9}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_name','שם מלא','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_id','ת"ז','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_phone','טלפון','phone',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'client_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','Client ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','Version','text',null,false);
end $$;

-- developer_cooperation_agreement — הסכם שיתוף פעולה עם יזם / קבלן
do $$ declare tpl uuid; begin
  insert into public.legal_templates(key,title,category,description,default_language,version,status)
  values('developer_cooperation_agreement','הסכם שיתוף פעולה עם יזם / קבלן','cooperation','הסכם שיווק, מכירה ושיתוף פעולה לפרויקט נדל"ן','he',1,'active')
  on conflict(key) do update set title=excluded.title, category=excluded.category, description=excluded.description, updated_at=now()
  returning id into tpl;
  delete from public.legal_template_fields where template_id=tpl;
  delete from public.legal_template_sections where template_id=tpl;
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,1,'1. פרטי הצדדים','הסכם זה נערך ונחתם ביום {{agreement_date}}
בין:
היזם / הקבלן
שם חברה: {{field_1}}
ח.פ: {{developer_id}}
כתובת: {{developer_address}}
טלפון: {{developer_phone}}
דוא"ל: {{developer_email}}
מורשה חתימה: {{field_2}}
להלן: "היזם"
לבין:
משרד התיווך
שם המשרד: {{office_name}}
מספר רישיון תיווך: {{agent_license}}
כתובת: {{office_address}}
טלפון: {{office_phone}}
דוא"ל: {{office_email}}
להלן: "המשווק"',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,2,'2. מטרת ההתקשרות','היזם ממנה את המשווק לצורך:
שיווק פרויקט.
איתור רוכשים.
ניהול לידים.
תיאום פגישות.
ניהול מכירות.
הפעלת מערכות שיווק דיגיטליות.
הפעלת מערכות AI.
קידום מכירת יחידות בפרויקט.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,3,'3. פרטי הפרויקט','שם הפרויקט: {{field_3}}
מיקום: {{field_4}}
מספר יחידות: {{field_5}}
סוג הפרויקט:
☐ מגורים
☐ מסחר
☐ משרדים
☐ קרקע
☐ עירוב שימושים',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,4,'4. תקופת ההתקשרות','תחילת ההתקשרות:
{{field_6}} / {{field_7}} / {{field_8}}
סיום ההתקשרות:
{{field_9}} / {{field_10}} / {{field_11}}',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,5,'5. סמכויות המשווק','היזם מסמיך את המשווק:
לפרסם את הפרויקט.
להציג מחירים.
לנהל פגישות מכירה.
לקבל פניות.
להפעיל מוקדי מכירות.
להפעיל קמפיינים.
להקים דפי נחיתה.
להשתמש במערכות ZONO.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,6,'6. חומרי שיווק','היזם יעביר:
☐ תוכניות מכר
☐ מפרטים
☐ מחירים
☐ הדמיות
☐ חומרי מותג
☐ נתוני מלאי
☐ מסמכים נוספים',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,7,'7. אחריות המידע','היזם אחראי באופן בלעדי לנכונות:
המחירים
המפרטים
התוכניות
שטחי הדירות
מועדי האכלוס
תנאי התשלום
המשווק יהיה רשאי להסתמך על המידע שהתקבל.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,8,'8. שימוש במותג','היזם מעניק למשווק רישיון להשתמש:
בשם הפרויקט
בלוגו
בהדמיות
בתמונות
בחומרים שיווקיים
לצורך ביצוע ההסכם בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,9,'9. שימוש במערכות AI','היזם מאשר כי:
המשווק יהיה רשאי להשתמש במערכות AI לצורך:
יצירת מודעות.
יצירת תמונות.
יצירת סרטונים.
יצירת תוכן.
ניתוח קמפיינים.
ניתוח לידים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,10,'10. מאגר לידים','כל ליד שנוצר באמצעות:
קמפיין
אתר
דף נחיתה
מערכת ZONO
פרסום המשווק
יירשם במערכת ZONO.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,11,'11. בעלות על לידים','במהלך תקופת ההסכם:
הלידים יהיו שייכים לפרויקט.
עם זאת המשווק יהיה זכאי:
לתעד את פעילותו.
לשמור היסטוריית מכירה.
לשמור Audit Trail.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,12,'12. עמלת המשווק','היזם ישלם:
☐ עמלה לפי עסקה
☐ עמלה קבועה
☐ ריטיינר
☐ שילוב מודלים',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,13,'13. עמלת מכירה','בגין כל יחידה שנמכרה:
₪ {{field_12}}
או
{{field_13}} %
מערך העסקה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,14,'14. מועד תשלום','תשלום יתבצע תוך:
14 ימי עסקים
ממועד קבלת התשלום מהלקוח או ממועד חתימת הסכם מכר (לפי ההסכמה המסחרית).',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,15,'15. עסקאות המשך','אם רוכש שהופנה על ידי המשווק ירכוש יחידה נוספת:
המשווק יהיה זכאי לעמלה גם בגינה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,16,'16. הגנת לידים','ליד שהוכנס למערכת על ידי המשווק ייחשב:
ליד מוגן
למשך {{protection_period_months}} חודשים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,17,'17. איסור עקיפה','היזם מתחייב שלא:
להסתיר מכירות.
להסתיר לידים.
להעביר לידים לצד שלישי.
לבצע עסקאות מחוץ למערכת במטרה להתחמק מתשלום.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,18,'18. דיווח מכירות','היזם מתחייב לעדכן:
חתימת הסכמים.
ביטולי עסקאות.
שינויי סטטוס.
מסירות.
גבייה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,19,'19. שקיפות נתונים','למשווק תינתן גישה לנתונים הבאים:
סטטוס לידים.
סטטוס מכירות.
מלאי זמין.
מלאי שמור.
מלאי שנמכר.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,20,'20. סודיות','הצדדים מתחייבים לשמור בסודיות:
מחירים.
מודלים עסקיים.
מאגרי לקוחות.
מידע מסחרי.
מידע טכנולוגי.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,21,'21. אי גיוס עובדים','הצדדים לא יגייסו:
עובדים
סוכנים
מנהלי מכירות
של הצד השני במשך {{protection_period_months}} חודשים.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,22,'22. הגבלת אחריות','המשווק אינו אחראי:
לאיחורי בנייה.
לשינויי מפרט.
לבעיות רישוי.
לבעיות תכנון.
לעיכובים במסירה.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,23,'23. פיצוי מוסכם','במקרה של:
הסתרת מכירה.
הסתרת ליד.
עקיפת המשווק.
אי תשלום עמלה.
ישלם היזם:
100,000 ₪
כפיצוי מוסכם ללא הוכחת נזק.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,24,'24. חתימה אלקטרונית','הצדדים מסכימים כי:
חתימה באמצעות מערכת ZONO או מערכת חתימות אלקטרונית תהווה חתימה מחייבת.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,25,'25. סמכות שיפוט','כל מחלוקת תידון בבתי המשפט המוסמכים במחוז {{jurisdiction_city}} בלבד.',true);
  insert into public.legal_template_sections(template_id,order_index,title,body,is_required) values(tpl,26,'26. חתימות','היזם
שם: {{developer_name}}
תפקיד: {{field_14}}
חתימה: {{field_15}}
תאריך: {{date}}
משרד התיווך
שם: {{agent_name}}
רישיון: {{field_16}}
חתימה: {{field_17}}
תאריך: {{date}}
Audit Trail – ZONO
Developer ID: {{field_18}}
Project ID: {{field_19}}
Document ID: {{field_20}}
Timestamp: {{field_21}}
IP Address: {{field_22}}
Device ID: {{field_23}}
Hash Signature: {{field_24}}
Version: {{field_25}}',true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agreement_date','תאריך החתימה','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_1','שם חברה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'developer_id','ח.פ','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'developer_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'developer_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'developer_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_2','מורשה חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_name','שם המשרד','text','ZONO – מערכת הנדל"ן המובילה בישראל',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_license','מספר רישיון תיווך','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_address','כתובת','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_phone','טלפון','phone',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'office_email','דוא"ל','email',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_3','שם הפרויקט','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_4','מיקום','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_5','מספר יחידות','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_6','שדה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_7','____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_8','____ / ____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_9','שדה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_10','____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_11','____ / ____ /','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_12','₪','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_13','שדה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'protection_period_months','תקופת הגנה (חודשים)','number','24',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'jurisdiction_city','סמכות שיפוט (מחוז)','text','חיפה',false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'developer_name','שם','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_14','תפקיד','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_15','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'date','תאריך','date',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'agent_name','שם','text',null,true);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_16','רישיון','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_17','חתימה','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_18','Developer ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_19','Project ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_20','Document ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_21','Timestamp','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_22','IP Address','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_23','Device ID','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_24','Hash Signature','text',null,false);
  insert into public.legal_template_fields(template_id,field_key,label,field_type,default_value,is_required) values(tpl,'field_25','Version','text',null,false);
end $$;
