// ============================================================================
// ZI Expert™ Knowledge Engine — built-in ZONO knowledge base (Phase 23, PURE).
// Deterministic product articles for every major module. Each explains: what it
// does · who can use it · where to find it · key terms · common questions ·
// common problems · related screens. These seed zi_knowledge_articles and are
// also the always-available source for retrieval/RAG even before a DB sync.
// Knowledge describes FEATURES — never a specific organization's data.
// ============================================================================
import type { KnowledgeArticleSeed, RoleVisibility } from "./knowledge-types";

interface ArticleDef {
  slug: string;
  title: string;
  category: string;
  module: string | null;
  routes: string[];
  role: RoleVisibility;
  summary: string;
  whatItDoes: string;
  whoCanUse: string;
  whereToFind: string;
  keyTerms: { term: string; def: string }[];
  questions: { q: string; a: string }[];
  problems: { p: string; fix: string }[];
  related: string[];
  keywords: string[];
}

/** Render an article definition into a consistent Markdown body. */
function renderArticle(d: ArticleDef): string {
  const lines: string[] = [];
  lines.push(`## מה זה עושה`, d.whatItDoes, "");
  lines.push(`## מי יכול להשתמש`, d.whoCanUse, "");
  lines.push(`## איפה למצוא`, d.whereToFind, "");
  if (d.keyTerms.length) { lines.push(`## מושגי מפתח`); for (const t of d.keyTerms) lines.push(`- **${t.term}** — ${t.def}`); lines.push(""); }
  if (d.questions.length) { lines.push(`## שאלות נפוצות`); for (const q of d.questions) lines.push(`- **${q.q}** — ${q.a}`); lines.push(""); }
  if (d.problems.length) { lines.push(`## בעיות נפוצות`); for (const p of d.problems) lines.push(`- **${p.p}** — ${p.fix}`); lines.push(""); }
  if (d.related.length) lines.push(`## מסכים קשורים`, d.related.join(" · "));
  return lines.join("\n").trim();
}

const DEFS: ArticleDef[] = [
  {
    slug: "property-radar", title: "Property Radar — רדאר נכסים", category: "מודיעין שוק",
    module: "property-radar-live", routes: ["/property-radar", "/exclusive-opportunities"], role: "agent",
    summary: "רדאר הנכסים סורק את השוק בזמן אמת ומציף נכסים חדשים, ירידות מחיר, עסקאות חמות ונכסים פרטיים — מדורגים לפי ציון הזדמנות.",
    whatItDoes: "סורק מקורות שוק (יד2/מדלן) באזורי ההתמחות שלך, מזהה שינויים, ומדרג כל נכס לפי Opportunity Score וכמות קונים מתאימים.",
    whoCanUse: "כל סוכן עם אזור התמחות מוגדר. ככל שמוגדרים יותר אזורים — הרדאר מנטר רחב יותר.",
    whereToFind: "תפריט ראשי → 'רדאר נכסים — חי' (/property-radar). נכסים פרטיים בלעדיים גם תחת 'הזדמנויות בלעדיות'.",
    keyTerms: [
      { term: "Opportunity Score", def: "ציון 0–100 לפי נכס פרטי, ימים בשוק, ירידות מחיר, פער מול שוק וכמות קונים מתאימים." },
      { term: "Hot Deals", def: "נכסים שצברו אותות חזקים (פרטי + ירידת מחיר + ביקוש) — לפעול מהר." },
      { term: "Price Drops", def: "נכסים שמחירם ירד מאז הסריקה הקודמת — סימן למוכר גמיש." },
      { term: "Provider Health", def: "מצב ספקי הסריקה (Apify) — אם כבוי, אין נתונים חדשים." },
      { term: "Credits Saved", def: "כמה קריאות סריקה נחסכו בזכות מטמון השוק המשותף." },
    ],
    questions: [
      { q: "איך מחושב ציון ההזדמנות?", a: "מנוע דטרמיניסטי לפי סימני שוק אמיתיים — לא ניחוש ולא AI." },
      { q: "למה נכס מסומן חשוב?", a: "בגלל שילוב של אותות: פרטי, ימים רבים בשוק, ירידת מחיר, או קונים מתאימים." },
    ],
    problems: [
      { p: "אין נכסים חדשים", fix: "ודא אזור התמחות מוגדר, ש‑APIFY_TOKEN פעיל, ושהסריקה (cron) רצה." },
      { p: "הנכסים לא על המפה", fix: "מודעות חיצוניות צריכות גיאוקודינג — הרץ /admin/geocoding על 'מודעות חיצוניות'." },
    ],
    related: ["רדאר נכסים", "הזדמנויות בלעדיות", "התאמות", "הגדרות → רדאר נכסים"],
    keywords: ["רדאר", "radar", "opportunity", "ציון הזדמנות", "ירידת מחיר", "hot deal", "סריקה", "yad2", "madlan"],
  },
  {
    slug: "shared-market-cache", title: "Shared Market Cache — מטמון שוק משותף", category: "תשתית",
    module: null, routes: ["/settings/property-radar"], role: "manager",
    summary: "מטמון משותף שמונע סריקות כפולות של אותו אזור — חוסך עלויות API ומאיץ תוצאות לכל הארגונים שמנטרים את אותה עיר.",
    whatItDoes: "כאשר אזור כבר נסרק לאחרונה, ZONO מגיש את התוצאה מהמטמון במקום לסרוק שוב — שקוף למשתמש.",
    whoCanUse: "מנהל/אדמין שמנהל את הגדרות הסריקה. הסוכן נהנה מזה אוטומטית.",
    whereToFind: "הגדרות → רדאר נכסים (/settings/property-radar) — מצב הסריקה (market/org) ורעננות המטמון.",
    keyTerms: [
      { term: "Cache Freshness", def: "כמה זמן תוצאה נחשבת 'טרייה' לפני סריקה מחדש." },
      { term: "Fanout", def: "פיזור תוצאת סריקה אחת לכל הארגונים שמנטרים את אותו אזור." },
      { term: "Scheduler Mode", def: "market = סריקה לפי אזורי שוק משותפים; org = סריקה לפי כל ארגון בנפרד." },
    ],
    questions: [
      { q: "למה לפעמים אין סריקה חדשה?", a: "כי המטמון עדיין טרי — זה תקין וחוסך עלויות. סריקה תתבצע כשהמטמון יתיישן." },
    ],
    problems: [
      { p: "תוצאות נראות ישנות", fix: "אפשר להפעיל סריקה ידנית; אחרת הרעננות נקבעת לפי הגדרת המטמון." },
    ],
    related: ["רדאר נכסים", "הגדרות → רדאר נכסים"],
    keywords: ["מטמון", "cache", "fanout", "scheduler", "credits", "shared market"],
  },
  {
    slug: "buyer-matching", title: "Buyer Matching — התאמת קונים", category: "מכירות",
    module: "matches", routes: ["/matches"], role: "agent",
    summary: "התאמה אוטומטית בין נכסים לקונים פעילים לפי תקציב, אזור, סוג נכס, חדרים והעדפות — עם הסבר ודירוג לכל התאמה.",
    whatItDoes: "המנוע משווה כל נכס למאגר הקונים ומחשב תאימות, בשלות ועיתוי. מציג למי מתאים מה ומדוע.",
    whoCanUse: "כל סוכן עם קונים ונכסים במערכת.",
    whereToFind: "תפריט ראשי → 'התאמות' (/matches). גם בכרטיס נכס/קונה כפאנל התאמות.",
    keyTerms: [
      { term: "Compatibility", def: "מידת ההתאמה בין דרישות הקונה למאפייני הנכס." },
      { term: "Readiness", def: "כמה הקונה בשל לפעולה (תקציב, מימון, דחיפות)." },
      { term: "Timing", def: "עד כמה העיתוי מתאים — נכס חדש מול קונה פעיל." },
    ],
    questions: [
      { q: "האם ZI מחליט מי מתאים?", a: "לא. המנוע הדטרמיניסטי מחשב; ZI רק מסביר את ההיגיון." },
      { q: "למה אין התאמות לקונה?", a: "בדוק שהוגדרו לו תקציב/אזור/סוג נכס — בלי אלה אין למה להשוות." },
    ],
    problems: [
      { p: "אין התאמות", fix: "ודא שלקונים יש העדפות מלאות ושיש נכסים פעילים תואמים באזור." },
    ],
    related: ["קונים", "נכסים", "התאמות"],
    keywords: ["התאמה", "matching", "buyer", "קונה", "תאימות", "compatibility"],
  },
  {
    slug: "seller-intelligence", title: "Seller Intelligence — מודיעין מוכרים", category: "מכירות",
    module: "exclusive-opportunities", routes: ["/exclusive-opportunities", "/sellers"], role: "agent",
    summary: "מזהה מי הכי קרוב לחתום בלעדיות ואת מי לפנות קודם — לפי סימני מצוקה, זמן בשוק וסבירות בלעדיות.",
    whatItDoes: "מנתח מוכרים ונכסים פרטיים ומחשב סבירות בלעדיות, שלב במחזור החיים והפעולה המומלצת הבאה.",
    whoCanUse: "כל סוכן. ההזדמנויות הבלעדיות מרוכזות במסך ייעודי.",
    whereToFind: "תפריט ראשי → 'הזדמנויות בלעדיות' (/exclusive-opportunities); נתוני מוכר בכרטיס המוכר.",
    keyTerms: [
      { term: "Exclusive Probability", def: "הערכה כמה סביר לקבל בלעדיות לפי פרטי/זמן בשוק/מצוקה." },
      { term: "Lifecycle Stage", def: "שלב במסע המוכר — מזיהוי ועד חתימה." },
    ],
    questions: [
      { q: "במי לפנות קודם?", a: "במי שסבירות הבלעדיות שלו גבוהה והפעולה המומלצת 'לפנות היום'." },
    ],
    problems: [
      { p: "הרשימה ריקה", fix: "צריך נכסים פרטיים מזוהים ברדאר — ודא שהסריקה רצה ושיש אזור התמחות." },
    ],
    related: ["מוכרים", "הזדמנויות בלעדיות", "רדאר נכסים"],
    keywords: ["מוכר", "seller", "בלעדיות", "exclusive", "מודיעין מוכרים"],
  },
  {
    slug: "exclusive-acquisition", title: "Exclusive Acquisition — גיוס בלעדי", category: "מכירות",
    module: "acquisition", routes: ["/acquisition", "/exclusive-opportunities"], role: "agent",
    summary: "מרכז גיוס: מדרג הזדמנויות גיוס בלעדיות, בונה רצף נגיעות (touchpoints) וממליץ על הצעד הבא לכל יעד.",
    whatItDoes: "אוסף נכסים פרטיים בעלי פוטנציאל בלעדיות, מנקד אותם, ובונה לוח פעולה לגיוס.",
    whoCanUse: "כל סוכן שמגייס נכסים בבלעדיות.",
    whereToFind: "תפריט ראשי → 'גיוס' (/acquisition) ו'הזדמנויות בלעדיות'.",
    keyTerms: [
      { term: "Touchpoints", def: "רצף נגיעות מומלץ מול בעל הנכס עד לחתימה." },
      { term: "Acquisition Score", def: "ניקוד פוטנציאל הגיוס של נכס פרטי." },
    ],
    questions: [
      { q: "מה ההבדל מ‑Seller Intelligence?", a: "מודיעין מוכרים מזהה; הגיוס מנהל את תהליך הפנייה והנגיעות בפועל." },
    ],
    problems: [
      { p: "אין יעדי גיוס", fix: "תלוי בנכסים פרטיים מהרדאר — ודא סריקה ואזור התמחות." },
    ],
    related: ["גיוס", "הזדמנויות בלעדיות", "רדאר נכסים"],
    keywords: ["גיוס", "acquisition", "בלעדי", "touchpoints"],
  },
  {
    slug: "ai-copilot", title: "AI Copilot — עוזר ה‑AI", category: "AI",
    module: "ai-office", routes: ["/ai-office"], role: "agent",
    summary: "שכבת AI שמסבירה, מנסחת, מסכמת וממליצה — תמיד מעל המנועים הדטרמיניסטיים, לעולם לא מחליפה אותם ולא מחליטה.",
    whatItDoes: "מנסח הודעות, מסכם פעילות, מכין תדריך שיחה ומסביר ציונים — מהקשר מובנה ומסונן בלבד.",
    whoCanUse: "כל סוכן. כפתורי ✨ מופיעים במסכים רלוונטיים.",
    whereToFind: "/ai-office וכפתורי AI בכרטיסי נכס/קונה/מוכר/עסקה.",
    keyTerms: [
      { term: "Augmentation", def: "ה‑AI מוסיף ערך (הסבר/ניסוח) אך לא משנה ציונים ולא מחליט." },
      { term: "Fallback", def: "אם אין ספק AI, נוצר מענה דטרמיניסטי — תמיד יש תשובה." },
    ],
    questions: [
      { q: "האם ה‑AI משנה נתונים?", a: "לא. הוא רק מסביר/מנסח/ממליץ לסוכן." },
    ],
    problems: [
      { p: "כפתורי AI לא מגיבים", fix: "ודא שמוגדר OPENAI_API_KEY או ANTHROPIC_API_KEY; אחרת פועל מצב fallback." },
    ],
    related: ["AI Office", "מרכז פיקוד"],
    keywords: ["copilot", "ai", "בינה", "ניסוח", "סיכום", "fallback"],
  },
  {
    slug: "office-intelligence", title: "Office Intelligence — מודיעין משרד", category: "ניהול",
    module: "office-intelligence", routes: ["/office-intelligence"], role: "manager",
    summary: "ביצועי המשרד והצוות: KPIs, לוחות מובילים, מרכז סיכונים, תחזיות, יעדים והמלצות ניהוליות.",
    whatItDoes: "מסכם פעילות, פייפליין ותוצאות, מדרג סוכנים ומצביע על דליפות הזדמנויות וסיכונים.",
    whoCanUse: "מנהל ומעלה. סוכן רגיל אינו רואה אנליטיקת צוות ניהולית.",
    whereToFind: "תפריט ניהול → 'מודיעין משרד' (/office-intelligence).",
    keyTerms: [
      { term: "KPI", def: "מדד ביצוע מרכזי — עסקאות, לידים שטופלו, זמן תגובה וכו'." },
      { term: "Leaderboard", def: "דירוג סוכנים לפי תרומה בפועל." },
      { term: "Risk Center", def: "ריכוז סיכונים ודליפות הזדמנויות לטיפול ניהולי." },
    ],
    questions: [
      { q: "מה זו דליפת הזדמנויות?", a: "הזדמנות שלא טופלה בזמן ועלולה ללכת לאיבוד — המסך מצביע עליה." },
    ],
    problems: [
      { p: "סוכן לא רואה את המסך", fix: "זו יכולת ניהולית — נדרשת הרשאת מנהל ומעלה." },
    ],
    related: ["מודיעין הנהלה", "צוות", "הכנסות"],
    keywords: ["office", "משרד", "kpi", "leaderboard", "סיכונים", "מנהל"],
  },
  {
    slug: "competitor-intelligence", title: "Competitor Intelligence — מודיעין מתחרים", category: "שוק ועסקאות",
    module: "competitors", routes: ["/competitors", "/competitor-intelligence", "/broker-intelligence"], role: "manager",
    summary: "מי פעיל באזור שלך, נתח שוק, מגמות ואיומים — כדי לדעת מול מי אתה מתחרה ואיפה יש פתח.",
    whatItDoes: "מזהה מתווכים/משרדים מתוך מודעות אמיתיות, מחשב נתח שוק ודומיננטיות ומתריע על איומים.",
    whoCanUse: "מנהל ומעלה.",
    whereToFind: "תפריט → 'מתחרים' (/competitors) ו'מודיעין מתווכים'.",
    keyTerms: [
      { term: "Market Share", def: "החלק היחסי של מתחרה מסך הפעילות באזור." },
      { term: "Threat", def: "מתחרה שמתחזק בטריטוריה שלך — אות לפעולה." },
    ],
    questions: [
      { q: "איך יודעים מי המתחרים?", a: "מתוך זיהוי מתווכים במודעות חיצוניות אמיתיות באזור ההתמחות." },
    ],
    problems: [
      { p: "אין מתחרים מזוהים", fix: "תלוי בזיהוי מתווכים מהסריקה — ודא שמודעות חיצוניות מסונכרנות." },
    ],
    related: ["מתחרים", "מודיעין מתווכים", "מודיעין משרד"],
    keywords: ["מתחרים", "competitor", "נתח שוק", "market share", "איום", "broker"],
  },
  {
    slug: "journey-automation", title: "Journey Builder & Automation — מסעות ואוטומציה", category: "ניהול",
    module: "journeys", routes: ["/journeys", "/journey-builder", "/journey-automation"], role: "manager",
    summary: "בונה מסעות לקוח עם טריגרים, תנאים ופעולות, כולל מצב סימולציה, SLA וגרסאות — אוטומציה מפוקחת אדם.",
    whatItDoes: "מתכנן רצף שלבים ופעולות אוטומטיות, ומריץ אותן באישור/פיקוח. כל פעולה הפיכה.",
    whoCanUse: "מנהל ומעלה לבנייה; סוכן רואה את המסעות שלו.",
    whereToFind: "/journeys (מסעות), /journey-builder (בנייה ויזואלית), /journey-automation.",
    keyTerms: [
      { term: "Trigger", def: "אירוע שמתחיל מסע (נכס חדש, ירידת מחיר, ליד חדש)." },
      { term: "Condition", def: "תנאי שצריך להתקיים כדי להמשיך בשלב." },
      { term: "Action", def: "פעולה שמתבצעת — לרוב טיוטה לאישור, לא שליחה אוטונומית." },
      { term: "Simulation Mode", def: "הרצה יבשה לראות מה יקרה בלי לבצע בפועל." },
      { term: "SLA", def: "זמן יעד לשלב — חריגה מסומנת." },
      { term: "Versions", def: "גרסאות מסע — אפשר לשחזר ולהשוות." },
    ],
    questions: [
      { q: "האם זה שולח לבד?", a: "ZONO מעדיף טיוטות לאישור. אין שליחה אוטונומית ללא פיקוח." },
    ],
    problems: [
      { p: "מסע לא מתקדם", fix: "בדוק שתנאי השלב מתקיים ושאין חריגת SLA או חסם." },
    ],
    related: ["מסעות לקוח", "Journey Builder", "אוטומציות"],
    keywords: ["journey", "מסע", "אוטומציה", "trigger", "sla", "simulation", "builder"],
  },
  {
    slug: "executive-intelligence", title: "Executive Intelligence — מודיעין הנהלה", category: "ניהול",
    module: "executive-intelligence", routes: ["/executive-intelligence"], role: "manager",
    summary: "תמונת‑על אסטרטגית: מגמות, תחזיות, פייפליין הכנסות ונקודות החלטה ברמת המשרד כולו.",
    whatItDoes: "מאחד את כל המנועים לתמונה ניהולית אחת לאורך זמן — לקבלת החלטות, לא לביצוע.",
    whoCanUse: "מנהל ומעלה.",
    whereToFind: "תפריט ניהול → 'מודיעין הנהלה' (/executive-intelligence).",
    keyTerms: [
      { term: "Pipeline", def: "סך ההזדמנויות הפתוחות עם שווי וסבירות סגירה." },
      { term: "Forecast", def: "תחזית הכנסות לפי הפייפליין והמגמות." },
    ],
    questions: [
      { q: "במה זה שונה ממודיעין משרד?", a: "ההנהלה אסטרטגית ולאורך זמן; המשרד תפעולי ויומיומי." },
    ],
    problems: [
      { p: "מעט נתונים", fix: "התמונה מתעשרת עם הצטברות עסקאות ופעילות לאורך זמן." },
    ],
    related: ["מודיעין משרד", "תחזית", "הכנסות"],
    keywords: ["executive", "הנהלה", "תחזית", "pipeline", "מגמות"],
  },
  {
    slug: "system-health", title: "System Health — בריאות המערכת", category: "מערכת",
    module: "system-health", routes: ["/system-health", "/admin/system-health"], role: "admin",
    summary: "מצב המנועים והריצות: מה רץ, מתי, האם הצליח, וכשלים אחרונים — לאבחון תקלות תשתית.",
    whatItDoes: "מציג engine_runs, סטטוס ספקים, ובדיקות בריאות לכל תת‑מערכת.",
    whoCanUse: "אדמין ומעלה.",
    whereToFind: "תפריט מערכת → 'בריאות מערכת' (/system-health).",
    keyTerms: [
      { term: "Engine Run", def: "ריצה של מנוע (סריקה/ניקוד/רענון) עם זמן וסטטוס." },
      { term: "Provider Health", def: "מצב חיבורי צד‑שלישי (Apify, מפות, AI)." },
    ],
    questions: [
      { q: "איך יודעים אם משהו נכשל?", a: "ריצה אחרונה עם סטטוס failed + הודעת שגיאה תופיע כאן." },
    ],
    problems: [
      { p: "ריצה תקועה ב‑running", fix: "ריצה יתומה נסגרת אוטומטית אחרי כ‑15 דקות (staleness guard)." },
    ],
    related: ["Platform Admin", "Provider QA"],
    keywords: ["system health", "בריאות", "engine", "ריצות", "תקלה"],
  },
  {
    slug: "platform-admin", title: "Platform Admin — ניהול פלטפורמה", category: "מערכת",
    module: "platform-admin", routes: ["/platform-admin"], role: "owner",
    summary: "כלי ניהול ברמת הפלטפורמה: דגלי פיצ'רים, audit log, התחזות (impersonation) והגדרות מערכת.",
    whatItDoes: "שולט ביכולות גלובליות, רואה יומן פעולות ומנהל הרשאות מתקדמות.",
    whoCanUse: "Owner בלבד (היכולות הרגישות ביותר).",
    whereToFind: "תפריט מערכת → 'Platform Admin' (/platform-admin).",
    keyTerms: [
      { term: "Feature Flag", def: "מתג להפעלה/כיבוי יכולת בלי פריסה מחדש." },
      { term: "Audit Log", def: "יומן פעולות רגישות — מי עשה מה ומתי." },
      { term: "Impersonation", def: "כניסה לצפייה כמשתמש לצורך תמיכה — מתועדת." },
    ],
    questions: [
      { q: "מי רואה את זה?", a: "Owner בלבד. סוכן/מנהל/אדמין לא נחשפים ליכולות אלה." },
    ],
    problems: [
      { p: "אין גישה", fix: "נדרשת הרשאת Owner; פנה לבעל הארגון." },
    ],
    related: ["בריאות מערכת", "הרשאות", "Feature Flags"],
    keywords: ["platform admin", "feature flag", "audit", "impersonation", "owner"],
  },
  {
    slug: "settings", title: "Settings — הגדרות", category: "מערכת",
    module: "settings", routes: ["/settings"], role: "agent",
    summary: "מרכז ההתאמות: אזורי התמחות, מיתוג, חיבורי הפצה, הגדרות רדאר נכסים והחבילה שלך.",
    whatItDoes: "קובע מה המערכת מנטרת עבורך ואיך היא נראית ומתחברת לשירותים חיצוניים.",
    whoCanUse: "כל סוכן להגדרות אישיות; חלק מההגדרות הניהוליות דורשות מנהל/אדמין.",
    whereToFind: "תפריט → 'הגדרות' (/settings) ותתי‑עמודים (brand, operating-areas, plan, distribution-connections, property-radar).",
    keyTerms: [
      { term: "אזור התמחות", def: "הערים/שכונות שבהן אתה פעיל — ZONO מנטר אותן." },
      { term: "מיתוג", def: "צבעים, לוגו וסגנון שמזינים את מנוע הקריאייטיב." },
    ],
    questions: [
      { q: "איך מגדירים רדאר נכסים?", a: "הגדרות → רדאר נכסים: בחר אזורים ומצב סריקה." },
      { q: "איך מגדירים אזור התמחות?", a: "הגדרות → אזורי התמחות, הוסף ערים/שכונות פעילות." },
    ],
    problems: [
      { p: "המפה/הרדאר ריקים", fix: "בלי אזור התמחות אין מה לנטר — הגדר אותו תחילה." },
    ],
    related: ["אזורי התמחות", "מיתוג", "חיבורי הפצה", "רדאר נכסים"],
    keywords: ["settings", "הגדרות", "מיתוג", "אזור התמחות", "חבילה", "plan"],
  },
  {
    slug: "onboarding", title: "Onboarding — תחילת עבודה", category: "ראשי",
    module: null, routes: ["/getting-started"], role: "agent",
    summary: "אשף ההתחלה: מגדיר פרופיל, אזורי התמחות, העדפות ומיתוג — כדי שהמנועים יתחילו לעבוד עבורך.",
    whatItDoes: "מוביל אותך צעד‑אחר‑צעד דרך ההגדרות ההכרחיות לפתיחת המערכת.",
    whoCanUse: "כל משתמש חדש.",
    whereToFind: "/getting-started, וכרטיס 'תחילת עבודה' בדף הבית עד להשלמה.",
    keyTerms: [
      { term: "Onboarding Completed", def: "סימון שהפרופיל הוגדר — פותח את כלל היכולות." },
    ],
    questions: [
      { q: "חייבים להשלים?", a: "מומלץ — בלי אזורי התמחות והעדפות המנועים לא מקבלים על מה לעבוד." },
    ],
    problems: [
      { p: "תקוע באמצע", fix: "אפשר לחזור ל‑/getting-started ולהשלים את השלבים החסרים." },
    ],
    related: ["הגדרות", "אזורי התמחות"],
    keywords: ["onboarding", "תחילת עבודה", "אשף", "getting started"],
  },
  {
    slug: "provider-qa", title: "Provider QA — בקרת ספקים", category: "מערכת",
    module: null, routes: ["/admin/provider-qa"], role: "admin",
    summary: "בקרת איכות אוטומטית על נתוני הסריקה: שדות חסרים, כפילויות, חריגות וסטטיסטיקות לכל ספק.",
    whatItDoes: "אחרי כל סריקה בודק את איכות הנתונים מהספק ומפיק דוח — כדי לתפוס בעיות מקור.",
    whoCanUse: "אדמין ומעלה.",
    whereToFind: "תפריט מערכת → /admin/provider-qa.",
    keyTerms: [
      { term: "Validator", def: "בדיקת תקינות שדות חובה בכל מודעה שיובאה." },
      { term: "Duplicate Detection", def: "זיהוי מודעות כפולות מאותו מקור." },
    ],
    questions: [
      { q: "מתי הבקרה רצה?", a: "אוטומטית אחרי כל סנכרון, best-effort, בלי לחסום את הייבוא." },
    ],
    problems: [
      { p: "הרבה שדות חסרים", fix: "ייתכן בעיה במיפוי הספק — בדוק את כלי ה‑debug של הספק." },
    ],
    related: ["רדאר נכסים", "בריאות מערכת"],
    keywords: ["provider qa", "בקרת איכות", "validator", "כפילויות", "סריקה"],
  },
  {
    slug: "maps", title: "Maps & Geocoding — מפות וגיאוקודינג", category: "מערכת",
    module: null, routes: ["/admin/geocoding"], role: "admin",
    summary: "המפות מציגות רק מיקומים אמיתיים. גיאוקודינג ממיר כתובת לקואורדינטות — בלי להמציא מיקום לעולם.",
    whatItDoes: "המפה (Maps JavaScript API) מציגה נכסים עם lat/lng; הגיאוקודינג (Geocoding API) ממלא קואורדינטות חסרות.",
    whoCanUse: "המפה — כל סוכן. כלי הגיאוקודינג — אדמין.",
    whereToFind: "מפת בית בדף הבית; כלי השלמת מיקומים ב‑/admin/geocoding.",
    keyTerms: [
      { term: "Maps JavaScript API", def: "מפתח דפדפן (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) — להצגת המפה. דורש referrers לדומיין." },
      { term: "Geocoding API", def: "מפתח שרת (GOOGLE_MAPS_GEOCODE_API_KEY) — להמרת כתובת לקואורדינטות. בלי referrers." },
      { term: "Confidence", def: "רמת דיוק המיקום — ROOFTOP מדויק, APPROXIMATE מרכז‑עיר." },
    ],
    questions: [
      { q: "למה המפה ריקה?", a: "אין נכסים עם קואורדינטות — מודעות חיצוניות צריכות גיאוקודינג ('גאוקד חוסרים')." },
      { q: "שני מפתחות שונים?", a: "כן: דפדפן למפה (עם referrers), שרת לגיאוקודינג (בלי referrers). אסור להחליף." },
    ],
    problems: [
      { p: "'שירות המפות לא זמין'", fix: "מפתח הדפדפן — ודא Maps JavaScript API מופעל ושה‑referrers כוללים את הדומיין." },
      { p: "'API key is invalid' בגיאוקודינג", fix: "הערך ב‑GOOGLE_MAPS_GEOCODE_API_KEY שגוי — הזן את מפתח השרת ועשה Redeploy." },
    ],
    related: ["רדאר נכסים", "הגדרות → אזורי התמחות"],
    keywords: ["מפה", "maps", "geocoding", "גיאוקודינג", "קואורדינטות", "api key", "referrer"],
  },
  {
    slug: "feature-flags", title: "Feature Flags — דגלי יכולות", category: "מערכת",
    module: null, routes: ["/platform-admin", "/admin/configuration"], role: "admin",
    summary: "מתגים להפעלה/כיבוי יכולות בלי פריסה מחדש — לשחרור הדרגתי, בטא, או כיבוי מהיר.",
    whatItDoes: "שולט אילו יכולות פעילות לארגון/משתמש, ומאפשר ניסוי בטוח של חדשות.",
    whoCanUse: "אדמין ומעלה.",
    whereToFind: "/platform-admin ו‑/admin/configuration.",
    keyTerms: [
      { term: "Flag", def: "מתג בוליאני שמפעיל/מכבה יכולת." },
      { term: "Beta", def: "יכולת בבדיקה — מופעלת בזהירות לקבוצה מצומצמת." },
    ],
    questions: [
      { q: "צריך פריסה מחדש?", a: "לא — דגלים נכנסים לתוקף מיידית בלי deploy." },
    ],
    problems: [
      { p: "יכולת לא מופיעה", fix: "ייתכן שהדגל כבוי או שאין הרשאת תפקיד מתאימה." },
    ],
    related: ["Platform Admin", "הרשאות"],
    keywords: ["feature flag", "דגל", "beta", "toggle", "configuration"],
  },
  {
    slug: "cron-sync", title: "Cron & Sync — סנכרון אוטומטי", category: "מערכת",
    module: null, routes: ["/property-radar", "/settings/property-radar"], role: "admin",
    summary: "משימות מתוזמנות שסורקות שוק, מרעננות עסקאות וגיאוקודות אוטומטית — כדי שהנתונים תמיד טריים בלי התערבות.",
    whatItDoes: "Vercel cron מפעיל סריקות וריענונים בלוח זמנים קבוע; כל ריצה מתועדת ב‑import_jobs.",
    whoCanUse: "אדמין שמגדיר/מנטר. הסוכן נהנה מהתוצאות.",
    whereToFind: "מצב ריצה אחרון ברדאר ובהגדרות → רדאר נכסים; הגדרת הזמנים ב‑vercel.json.",
    keyTerms: [
      { term: "CRON_SECRET", def: "סוד שמאמת שקריאת ה‑cron לגיטימית — חובה שיהיה מוגדר." },
      { term: "Import Job", def: "רשומת ריצת סנכרון עם סטטוס, נמצאו/עודכנו וזמני התחלה/סיום." },
    ],
    questions: [
      { q: "למה אין סריקה אוטומטית?", a: "ודא ש‑CRON_SECRET מוגדר, שה‑crons ב‑vercel.json פעילים, ושאין job תקוע." },
    ],
    problems: [
      { p: "השעון רץ ללא הפסקה", fix: "job יתום (timeout) — נסגר אוטומטית אחרי 15 דק'; מריצים סנכרון מחדש." },
    ],
    related: ["רדאר נכסים", "בריאות מערכת", "הגדרות → רדאר נכסים"],
    keywords: ["cron", "sync", "סנכרון", "תזמון", "import job", "cron_secret"],
  },
];

export const BUILTIN_VERSION = 1;

/** All built-in articles as seeds (system, published, global). */
export const BUILTIN_ARTICLES: KnowledgeArticleSeed[] = DEFS.map((d) => ({
  slug: d.slug,
  title: d.title,
  category: d.category,
  module: d.module,
  summary: d.summary,
  content: renderArticle(d),
  keywords: d.keywords,
  roleVisibility: d.role,
  sourceType: "system",
  sourcePath: "builtin",
  version: BUILTIN_VERSION,
  published: true,
  routes: d.routes,
}));

/** Built-in article keyword/term corpus — handy for the dev-check. */
export function builtinSlugs(): string[] { return BUILTIN_ARTICLES.map((a) => a.slug); }
