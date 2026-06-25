// ============================================================================
// ZI Expert™ — knowledge base (Phase 22, PURE / client-safe).
// Deterministic product knowledge: per-page explanations, glossary terms and
// page-aware starter questions. This is also the source of the FALLBACK answers
// used whenever the AI provider is unavailable — so ZI always works.
// Knowledge is about FEATURES, never about a specific organization's data.
// ============================================================================
import type { ZiKnowledgeEntry, ZiSuggestion } from "./types";

// Shared glossary terms reused across pages.
const TERM_OPPORTUNITY: { term: string; definition: string } = {
  term: "Opportunity Score (ציון הזדמנות)",
  definition:
    "ציון 0–100 שמחושב על ידי המנוע הדטרמיניסטי של ZONO לפי סימני שוק אמיתיים: נכס פרטי, ימים בשוק, ירידות מחיר, פער מול מחיר שוק וכמות קונים מתאימים. ככל שהציון גבוה יותר — ההזדמנות חמה יותר וכדאי לפעול מהר.",
};
const TERM_BUYER_MATCH: { term: string; definition: string } = {
  term: "Buyer Matching (התאמת קונים)",
  definition:
    "התאמה אוטומטית בין נכסים לקונים פעילים לפי תקציב, אזור, סוג נכס, חדרים והעדפות. המנוע מחשב תאימות ומדרג קונים — ZI מסביר את ההיגיון אך לעולם לא מחליט עבורך מי מתאים למי.",
};

const DEFAULT_SUGGESTIONS: ZiSuggestion[] = [
  { id: "what-page", label: "מה המסך הזה עושה?", question: "מה המסך הזה עושה ואיך הוא עוזר לי?" },
  { id: "how-start", label: "איך מתחילים?", question: "מאיפה כדאי שאתחיל בעמוד הזה?" },
  { id: "key-terms", label: "הסבר מושגים", question: "אילו מושגים חשוב שאכיר בעמוד הזה?" },
];

export const ZI_KNOWLEDGE: ZiKnowledgeEntry[] = [
  {
    pageKey: "home",
    matchModuleIds: ["home"],
    matchRoutes: ["/"],
    title: "בית — מרכז העבודה היומי",
    summary:
      "דף הבית מרכז את מה שדורש את תשומת הלב שלך היום: נכסים חמים, משימות, הזדמנויות והמלצות מבוססות הנתונים שלך.",
    details: [
      "הכרטיסים העליונים מציגים מדדים חיים מהמערכת — לא נתוני דמו.",
      "אזור 'מה דורש טיפול היום' מרכז פריטים פתוחים לפי דחיפות.",
      "מפת הנכסים החיה מציגה נכסים פנימיים וחיצוניים באזור ההתמחות שלך.",
    ],
    glossary: [TERM_OPPORTUNITY],
    suggestions: [
      { id: "home-today", label: "מה דורש טיפול היום?", question: "מה הדברים החשובים ביותר שדורשים טיפול ממני היום?" },
      { id: "home-map", label: "איך עובדת מפת החום?", question: "איך עובדת מפת הנכסים החיה בדף הבית?" },
      { id: "home-kpi", label: "מה המדדים למעלה?", question: "מה המשמעות של המדדים המוצגים בראש דף הבית?" },
    ],
  },
  {
    pageKey: "property-radar",
    matchModuleIds: ["property-radar-live"],
    matchRoutes: ["/property-radar", "/exclusive-opportunities"],
    title: "Property Radar — רדאר נכסים חי",
    summary:
      "רדאר הנכסים סורק את השוק בזמן אמת ומציף נכסים חדשים, ירידות מחיר, עסקאות חמות ונכסים פרטיים — מדורגים לפי ציון הזדמנות.",
    details: [
      "כל נכס מקבל Opportunity Score לפי סימני שוק אמיתיים.",
      "נכסים פרטיים (ללא תיווך) מסומנים כי בהם פוטנציאל הבלעדיות הגבוה ביותר.",
      "התאמת קונים מראה כמה קונים פעילים מתאימים לכל נכס.",
    ],
    glossary: [
      TERM_OPPORTUNITY,
      TERM_BUYER_MATCH,
      {
        term: "Exclusive Probability (סבירות בלעדיות)",
        definition:
          "הערכה כמה סביר שתצליח לקבל בלעדיות על נכס, לפי האם הוא פרטי, משך הזמן בשוק וסימני מצוקה של המוכר. גבוהה = שווה לפנות מוקדם.",
      },
    ],
    suggestions: [
      { id: "pr-opp", label: "מה זה ציון הזדמנות?", question: "מה זה Opportunity Score ואיך הוא מחושב?" },
      { id: "pr-why", label: "למה הנכס הזה חשוב?", question: "למה נכס מסוים מסומן כחשוב או חם ברדאר?" },
      { id: "pr-match", label: "הסבר התאמת קונים", question: "איך עובדת התאמת הקונים ברדאר הנכסים?" },
    ],
  },
  {
    pageKey: "journeys",
    matchModuleIds: ["journeys", "journey-builder", "journey-automation"],
    matchRoutes: ["/journeys", "/journey-builder", "/journey-automation"],
    title: "Journeys — מסעות לקוח ו-Journey Builder",
    summary:
      "מסעות לקוח מנהלים את שלבי ההתקדמות של נכס, קונה או עסקה — מהשלב הראשון ועד הסגירה — עם בריאות, מהירות וחסמים לכל מסע.",
    details: [
      "כל מסע בנוי משלבים; המערכת מתקדמת אוטומטית לפי אירועים אמיתיים.",
      "ציון בריאות המסע מצביע אם משהו תקוע או דורש טיפול.",
      "Journey Builder מאפשר לתכנן את רצף השלבים והפעולות המומלצות.",
    ],
    glossary: [
      {
        term: "Journey Health (בריאות מסע)",
        definition: "מדד שמסכם אם מסע מתקדם בקצב תקין או נתקע — לפי זמן בשלב, פעילות אחרונה וחסמים שזוהו.",
      },
    ],
    suggestions: [
      { id: "j-how", label: "איך עובדים מסעות?", question: "איך עובדים מסעות לקוח (Journeys) ב-ZONO?" },
      { id: "j-build", label: "איך בונים מסע?", question: "איך אני בונה מסע חדש ב-Journey Builder?" },
      { id: "j-stuck", label: "מתי מסע תקוע?", question: "איך אני יודע שמסע תקוע ומה לעשות?" },
    ],
  },
  {
    pageKey: "office-intelligence",
    matchModuleIds: ["office-intelligence"],
    matchRoutes: ["/office-intelligence"],
    title: "Office Intelligence — מודיעין משרד",
    summary:
      "מודיעין המשרד מציג את הביצועים של המשרד והצוות: KPIs, מובילים, יעדים, פערים והמלצות ניהוליות — מבוסס הנתונים האמיתיים שלך.",
    details: [
      "ה-KPIs מסכמים פעילות, פייפליין ותוצאות לתקופה.",
      "לוחות המובילים מדרגים סוכנים לפי תרומה בפועל.",
      "ההמלצות הניהוליות מצביעות היכן יש דליפת הזדמנויות.",
    ],
    glossary: [
      {
        term: "KPI (מדד ביצוע מרכזי)",
        definition: "מספר שמודד תוצאה עסקית חשובה — כמו עסקאות שנסגרו, לידים שטופלו או זמן תגובה — ועוזר לראות מגמות.",
      },
    ],
    suggestions: [
      { id: "oi-kpi", label: "הסבר את ה-KPIs של היום", question: "מה המשמעות של ה-KPIs המוצגים במודיעין המשרד?" },
      { id: "oi-leak", label: "מה זה דליפת הזדמנויות?", question: "מה זו דליפת הזדמנויות וכיצד מזהים אותה כאן?" },
      { id: "oi-team", label: "איך מדורג הצוות?", question: "איך מחושב דירוג הסוכנים בלוח המובילים?" },
    ],
  },
  {
    pageKey: "executive-intelligence",
    matchModuleIds: ["executive-intelligence"],
    matchRoutes: ["/executive-intelligence"],
    title: "Executive Intelligence — מודיעין הנהלה",
    summary:
      "מודיעין ההנהלה נותן תמונת-על אסטרטגית: מגמות, תחזיות, פייפליין הכנסות ונקודות החלטה ברמת המשרד כולו.",
    details: [
      "מסכם את כל המנועים לכדי תמונה ניהולית אחת.",
      "מציג מגמות לאורך זמן ולא רק תמונת רגע.",
      "מיועד לקבלת החלטות — לא לביצוע פעולות.",
    ],
    glossary: [
      {
        term: "Pipeline (פייפליין)",
        definition: "סך ההזדמנויות והעסקאות הפתוחות בשלבים שונים, עם הערכת שווי וסבירות סגירה.",
      },
    ],
    suggestions: [
      { id: "ei-trends", label: "מה המגמות המרכזיות?", question: "אילו מגמות מרכזיות מודיעין ההנהלה מציג?" },
      { id: "ei-forecast", label: "איך עובדת התחזית?", question: "איך מחושבת תחזית ההכנסות במודיעין ההנהלה?" },
    ],
  },
  {
    pageKey: "competitor-intelligence",
    matchModuleIds: ["competitor-intelligence", "competitors", "broker-intelligence"],
    matchRoutes: ["/competitor-intelligence", "/competitors", "/broker-intelligence"],
    title: "Competitor Intelligence — מודיעין מתחרים",
    summary:
      "מודיעין המתחרים מנתח מי פעיל באזור שלך, נתח שוק, מגמות ואיומים — כדי שתדע מול מי אתה מתחרה ואיפה יש פתח.",
    details: [
      "מזהה מתווכים ומשרדים פעילים מתוך מודעות אמיתיות בשוק.",
      "מחשב נתח שוק ודומיננטיות לפי אזור.",
      "מתריע על איומים — מתחרה שמתחזק בטריטוריה שלך.",
    ],
    glossary: [
      {
        term: "Market Share (נתח שוק)",
        definition: "החלק היחסי של מתחרה מתוך כלל הפעילות באזור — מספר מודעות/עסקאות שלו חלקי הסך הכולל.",
      },
    ],
    suggestions: [
      { id: "ci-who", label: "מי המתחרים שלי?", question: "איך מודיעין המתחרים יודע מי המתחרים שלי באזור?" },
      { id: "ci-threat", label: "מה זה איום?", question: "מה נחשב לאיום תחרותי וכיצד מזהים אותו?" },
    ],
  },
  {
    pageKey: "settings",
    matchModuleIds: ["settings", "settings-brand", "settings-areas", "settings-plan"],
    matchRoutes: ["/settings"],
    title: "Settings — הגדרות",
    summary:
      "מסך ההגדרות מרכז את כל ההתאמות שלך: אזורי התמחות, מיתוג, חיבורי הפצה, הגדרות רדאר נכסים והחבילה שלך.",
    details: [
      "אזורי התמחות קובעים אילו ערים ושכונות המערכת מנטרת עבורך.",
      "מיתוג מזין את מנוע הקריאייטיב בצבעים, לוגו וסגנון.",
      "חיבורי הפצה ורדאר נקבעים גם הם כאן.",
    ],
    glossary: [
      {
        term: "אזור התמחות",
        definition: "הערים והשכונות שבהן אתה פעיל. ZONO מנטר אותן עבורך — נכסים, עסקאות, ביקוש ומתחרים.",
      },
    ],
    suggestions: [
      { id: "s-radar", label: "איך מגדירים רדאר נכסים?", question: "עזור לי להגדיר את רדאר הנכסים בהגדרות." },
      { id: "s-area", label: "איך מגדירים אזור התמחות?", question: "איך אני מגדיר את אזור ההתמחות שלי?" },
      { id: "s-brand", label: "איך מגדירים מיתוג?", question: "איך אני מגדיר את המיתוג של המשרד?" },
    ],
  },
  {
    pageKey: "properties",
    matchModuleIds: ["properties"],
    matchRoutes: ["/properties"],
    title: "נכסים — ניהול המלאי",
    summary:
      "מסך הנכסים מנהל את כל הנכסים שלך: סטטוס, מקור, תמחור, שיווק ומסע — במקום אחד.",
    details: [
      "כל נכס מציג מקור (פנימי/חיצוני) וסטטוס פרסום.",
      "מתוך נכס ניתן ליצור פוסט פרסום, הערכת שווי או התאמות קונים.",
    ],
    glossary: [TERM_BUYER_MATCH],
    suggestions: [
      { id: "p-add", label: "איך מוסיפים נכס?", question: "איך אני מוסיף נכס חדש למערכת?" },
      { id: "p-market", label: "איך משווקים נכס?", question: "איך אני משווק נכס מתוך המסך הזה?" },
    ],
  },
  {
    pageKey: "buyers",
    matchModuleIds: ["buyers"],
    matchRoutes: ["/buyers"],
    title: "קונים — CRM קונים",
    summary:
      "מסך הקונים מנהל את הקונים הפעילים שלך, ההעדפות שלהם וההתאמות לנכסים במלאי.",
    details: ["לכל קונה מוגדרות העדפות שמזינות את מנוע ההתאמות.", "ZONO מדרג קונים לפי בשלות וסבירות סגירה."],
    glossary: [TERM_BUYER_MATCH],
    suggestions: [
      { id: "b-add", label: "איך מוסיפים קונה?", question: "איך אני מוסיף קונה חדש?" },
      { id: "b-match", label: "איך מתבצעות התאמות?", question: "איך המערכת מתאימה קונים לנכסים?" },
    ],
  },
  {
    pageKey: "valuation",
    matchModuleIds: ["valuation"],
    matchRoutes: ["/valuation"],
    title: "הערכת שווי — Price Intelligence",
    summary:
      "מנוע הערכת השווי מחשב טווח מחיר לנכס לפי עסקאות אמיתיות באזור, מאפייני הנכס ומגמות שוק.",
    details: ["ההערכה מבוססת עסקאות שבוצעו בפועל, לא הערכה שרירותית.", "ניתן להפיק דוח שווי ממותג ולשלוח למוכר."],
    glossary: [],
    suggestions: [
      { id: "v-how", label: "איך מחושב השווי?", question: "איך מנוע הערכת השווי מחשב את המחיר?" },
      { id: "v-report", label: "איך מפיקים דוח?", question: "איך אני מפיק דוח הערכת שווי ללקוח?" },
    ],
  },
];

const DEFAULT_ENTRY: ZiKnowledgeEntry = {
  pageKey: "general",
  matchModuleIds: [],
  matchRoutes: [],
  title: "ZONO",
  summary:
    "ZONO היא מערכת ההפעלה של סוכן הנדל\"ן: נכסים, קונים, מוכרים, עסקאות, שיווק, מודיעין ו-AI במקום אחד.",
  details: [
    "כל מנוע ב-ZONO דטרמיניסטי — מבוסס נתונים אמיתיים, לא ניחוש.",
    "ZI כאן כדי להסביר, להדריך ולענות — אני לא מבצע פעולות במקומך.",
  ],
  glossary: [TERM_OPPORTUNITY, TERM_BUYER_MATCH],
  suggestions: DEFAULT_SUGGESTIONS,
};

/** Find the knowledge entry for a module id (smart page detection). Pure. */
export function knowledgeForModule(moduleId: string | null): ZiKnowledgeEntry {
  if (moduleId) {
    const hit = ZI_KNOWLEDGE.find((k) => k.matchModuleIds.includes(moduleId));
    if (hit) return hit;
  }
  return DEFAULT_ENTRY;
}

/** Find the knowledge entry by route (prefix match). Pure. */
export function knowledgeForRoute(route: string | null): ZiKnowledgeEntry {
  if (!route) return DEFAULT_ENTRY;
  // Exact first, then longest-prefix match (so "/settings/brand" → settings).
  const exact = ZI_KNOWLEDGE.find((k) => k.matchRoutes.includes(route));
  if (exact) return exact;
  let best: ZiKnowledgeEntry | null = null;
  let bestLen = 0;
  for (const k of ZI_KNOWLEDGE) {
    for (const r of k.matchRoutes) {
      if (r !== "/" && route.startsWith(r) && r.length > bestLen) { best = k; bestLen = r.length; }
    }
  }
  return best ?? DEFAULT_ENTRY;
}

export function defaultKnowledge(): ZiKnowledgeEntry { return DEFAULT_ENTRY; }
export function defaultSuggestions(): ZiSuggestion[] { return DEFAULT_SUGGESTIONS; }
