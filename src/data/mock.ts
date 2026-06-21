/**
 * Mock data for the ZONO home dashboard. In-memory only — no backend calls.
 * Content is tailored to the dashboard reference (Rehovot / center-Israel).
 */
import type {
  BuyerMatch,
  HeatNeighborhood,
  HotOpportunity,
  JourneyProperty,
  JourneyRailStage,
  MapPin,
  MarketStat,
  NavItem,
  QuickAction,
  RecentDeal,
  RecommendedProperty,
} from "@/types";

/** The agent viewing the dashboard. */
export const currentAgent = {
  name: "טל כהן",
  role: "מנהל משרד",
  greeting: "בוקר טוב, טל",
};

export const newOpportunitiesToday = 17;

/* ── Navigation ─────────────────────────────────────────── */
export const navItems: NavItem[] = [
  { id: "home", label: "בית", icon: "Home", active: true },
  { id: "command", label: "מרכז פיקוד", icon: "Flame" },
  { id: "map", label: "מפה חכמה", icon: "Map" },
  { id: "properties", label: "נכסים", icon: "Building2" },
  { id: "buyers", label: "קונים", icon: "Users" },
  { id: "sellers", label: "מוכרים", icon: "UserCheck" },
  { id: "matches", label: "התאמות", icon: "Sparkles" },
  { id: "deals", label: "ניהול עסקאות", icon: "Handshake" },
  { id: "transactions", label: "עסקאות בעיר", icon: "Landmark" },
  { id: "transactions-streets", label: "מודיעין רחובות", icon: "Route" },
  { id: "transactions-radar", label: "רדאר הזדמנויות", icon: "Flame" },
  { id: "forecast", label: "תחזית עסקאות", icon: "TrendingUp" },
  { id: "revenue", label: "מודיעין הכנסות", icon: "BarChart3" },
  { id: "acquisition", label: "גיוס נכסים", icon: "Building" },
  { id: "competitors", label: "מתחרים", icon: "BarChart3" },
  { id: "marketing", label: "מודיעין שיווק", icon: "Megaphone" },
  { id: "distribution", label: "קהילות והפצה", icon: "Send" },
  { id: "social-leads", label: "לידים חברתיים", icon: "MessageCircle" },
  { id: "routing", label: "ניתוב לידים", icon: "Route" },
  { id: "team", label: "מודיעין צוות", icon: "UserCheck" },
  { id: "graph", label: "מפת קשרים", icon: "Sparkles" },
  { id: "operating-areas", label: "אזורי פעילות", icon: "MapPin" },
  { id: "journey", label: "מסע נכס", icon: "Route" },
  { id: "marketing", label: "שיווק", icon: "Megaphone" },
  { id: "reports", label: "דוחות", icon: "BarChart3" },
  { id: "settings", label: "הגדרות", icon: "Settings" },
];

/** Subset shown in the mobile bottom nav. */
export const mobileNavItems: NavItem[] = [
  { id: "home", label: "בית", icon: "Home", active: true },
  { id: "map", label: "מפה", icon: "Map" },
  { id: "properties", label: "נכסים", icon: "Building2" },
  { id: "matches", label: "התאמות", icon: "Sparkles" },
  { id: "more", label: "עוד", icon: "Menu" },
];

/* ── Hero map pins ──────────────────────────────────────── */
export const mapPins: MapPin[] = [
  { id: "p1", label: "נכסים", count: 18, tone: "purple", xPct: 70, yPct: 22 },
  { id: "p2", label: "קונים", count: 24, tone: "blue", xPct: 52, yPct: 38 },
  { id: "p3", label: "הזדמנויות", count: 15, tone: "gold", xPct: 36, yPct: 55 },
  { id: "p4", label: "עסקאות", count: 12, tone: "green", xPct: 66, yPct: 62 },
  { id: "p5", label: "ירידות מחיר", count: 9, tone: "red", xPct: 80, yPct: 48 },
];

export const heroAssistantMessage = "מצאתי 4 קונים מתאימים לנכס בהרצל 18";

/* ── Hot opportunities strip ────────────────────────────── */
export const hotOpportunities: HotOpportunity[] = [
  {
    id: "o1",
    kind: "ירידת מחיר",
    tone: "red",
    icon: "TrendingDown",
    title: "דירת 4 חדרים ירדה ב־180,000 ₪",
    relation: "הרצל 18, רחובות",
    cta: "בדוק התאמות",
    score: 92,
  },
  {
    id: "o2",
    kind: "נכס חדש",
    tone: "purple",
    icon: "Sparkles",
    title: "נכס חדש עלה ברחוב המדע",
    relation: "המדע 12, רחובות",
    cta: "פתח נכס",
    score: 88,
  },
  {
    id: "o3",
    kind: "קונה חם",
    tone: "gold",
    icon: "Flame",
    title: "קונה פתח תיק נכס 3 פעמים",
    relation: "רון לוי · תקציב ₪4.2M",
    cta: "צור קשר",
    score: 90,
  },
  {
    id: "o4",
    kind: "מוכר שלא עודכן",
    tone: "blue",
    icon: "Clock",
    title: "המוכר לא קיבל עדכון 14 יום",
    relation: "ויצמן 4, נס ציונה",
    cta: "שלח דוח",
    score: 76,
  },
  {
    id: "o5",
    kind: "נכס תקוע",
    tone: "purple",
    icon: "AlertTriangle",
    title: "45 ימים ללא הצעה",
    relation: "פלורנטין, תל אביב",
    cta: "המלצת זונו",
    score: 71,
  },
];

/* ── Recommended properties ─────────────────────────────── */
export const recommendedProperties: RecommendedProperty[] = [
  {
    id: "rp1",
    tag: "ירידת מחיר",
    tagTone: "red",
    type: "דירת 4 חדרים",
    street: "רח׳ הרצל 18",
    city: "רחובות",
    price: 4450000,
    rooms: 4,
    sqm: 108,
    floor: 3,
    buyerMatches: 4,
    score: 92,
    gradient: "from-violet-200 via-purple-100 to-indigo-200",
  },
  {
    id: "rp2",
    tag: "נכס חדש",
    tagTone: "purple",
    type: "דירת 5 חדרים",
    street: "רח׳ המדע 12",
    city: "רחובות",
    price: 6950000,
    rooms: 5,
    sqm: 142,
    floor: 6,
    buyerMatches: 6,
    score: 88,
    gradient: "from-fuchsia-100 via-purple-100 to-violet-200",
  },
  {
    id: "rp3",
    tag: "עסקה חמה",
    tagTone: "gold",
    type: "פנטהאוז 6 חדרים",
    street: "רח׳ ויצמן 4",
    city: "נס ציונה",
    price: 9800000,
    rooms: 6,
    sqm: 210,
    floor: 12,
    buyerMatches: 3,
    score: 94,
    gradient: "from-amber-100 via-violet-100 to-purple-200",
  },
  {
    id: "rp4",
    tag: "התאמה גבוהה",
    tagTone: "green",
    type: "דירת 3 חדרים",
    street: "פלורנטין",
    city: "תל אביב",
    price: 2680000,
    rooms: 3,
    sqm: 72,
    floor: 2,
    buyerMatches: 5,
    score: 81,
    gradient: "from-emerald-100 via-violet-100 to-purple-200",
  },
];

/* ── Neighborhood demand heatmap ────────────────────────── */
export const heatNeighborhoods: HeatNeighborhood[] = [
  {
    id: "n1",
    name: "מערב רחובות",
    changePct: 8.4,
    tone: "green",
    label: "ביקוש גבוה",
    points: "20,40 200,30 210,150 60,170 20,120",
    labelX: 110,
    labelY: 100,
  },
  {
    id: "n2",
    name: "רחובות המדע",
    changePct: 6.7,
    tone: "green",
    label: "ביקוש גבוה",
    points: "210,30 380,50 370,160 210,150",
    labelX: 295,
    labelY: 100,
  },
  {
    id: "n3",
    name: "מרכז העיר",
    changePct: -2.1,
    tone: "red",
    label: "ירידה",
    points: "60,170 210,150 230,290 90,300",
    labelX: 150,
    labelY: 230,
  },
  {
    id: "n4",
    name: "קריית משה",
    changePct: 1.8,
    tone: "gold",
    label: "יציב",
    points: "230,160 370,160 390,300 230,290",
    labelX: 310,
    labelY: 230,
  },
  {
    id: "n5",
    name: "צפון נס ציונה",
    changePct: 4.3,
    tone: "purple",
    label: "הזדמנות",
    points: "390,50 540,70 540,300 390,300 370,160",
    labelX: 465,
    labelY: 185,
  },
];

export const heatmapInsight =
  "זונו מזהה עלייה בביקוש לדירות 5 חדרים במערב רחובות.";

/* ── Property journeys ──────────────────────────────────── */
export const journeyStages: JourneyRailStage[] = [
  { key: "new", label: "נכס חדש", count: 4, state: "done" },
  { key: "prep", label: "הכנה לשיווק", count: 6, state: "done" },
  { key: "media", label: "צילום ומדיה", count: 5, state: "done" },
  { key: "publish", label: "פרסום", count: 14, state: "done" },
  { key: "visits", label: "ביקורים", count: 32, state: "active" },
  { key: "offers", label: "הצעות", count: 8, state: "risk" },
  { key: "contract", label: "חוזה", count: 3, state: "upcoming" },
  { key: "sold", label: "נמכר", count: 9, state: "upcoming" },
];

export const journeyProperties: JourneyProperty[] = [
  {
    id: "jp1",
    address: "הרצל 18, רחובות",
    stage: "ביקורים",
    progressLabel: "שלב 5 מתוך 8",
    score: 74,
    nextAction: "שלח דוח מוכר היום",
    gradient: "from-violet-200 to-purple-100",
  },
  {
    id: "jp2",
    address: "המדע 12, רחובות",
    stage: "פרסום",
    progressLabel: "שלב 4 מתוך 8",
    score: 86,
    nextAction: "קדם בפייסבוק",
    gradient: "from-fuchsia-100 to-violet-200",
  },
  {
    id: "jp3",
    address: "ויצמן 4, נס ציונה",
    stage: "הצעות",
    progressLabel: "שלב 6 מתוך 8",
    score: 63,
    nextAction: "חזור למציע השני",
    gradient: "from-amber-100 to-violet-100",
  },
  {
    id: "jp4",
    address: "פלורנטין 21, תל אביב",
    stage: "צילום ומדיה",
    progressLabel: "שלב 3 מתוך 8",
    score: 80,
    nextAction: "אשר גלריית תמונות",
    gradient: "from-emerald-100 to-violet-200",
  },
  {
    id: "jp5",
    address: "ביאליק 48, רמת גן",
    stage: "חוזה",
    progressLabel: "שלב 7 מתוך 8",
    score: 91,
    nextAction: "תאם חתימה אצל עו״ד",
    gradient: "from-sky-100 to-violet-200",
  },
];

/* ── Buyer matching ─────────────────────────────────────── */
export const buyerMatches: BuyerMatch[] = [
  {
    id: "bm1",
    name: "משפחת כהן",
    budgetLabel: "תקציב עד ₪5,000,000",
    want: "מחפשים 4–5 חדרים ברחובות",
    property: "הרצל 18, רחובות",
    score: 95,
    reasons: ["תקציב מתאים", "אזור מועדף", "מספר חדרים"],
  },
  {
    id: "bm2",
    name: "דנה ישראלי",
    budgetLabel: "תקציב עד ₪6,500,000",
    want: "מחפשת פנטהאוז",
    property: "ויצמן 4, נס ציונה",
    score: 94,
    reasons: ["סוג נכס", "נוף פתוח", "דחיפות גבוהה"],
  },
  {
    id: "bm3",
    name: "רון לוי",
    budgetLabel: "תקציב עד ₪4,200,000",
    want: "מחפש 3–4 חדרים",
    property: "פלורנטין, תל אביב",
    score: 91,
    reasons: ["תקציב מתאים", "התנהגות צפייה", "אזור"],
  },
];

export const matchingNote =
  "ההתאמות מבוססות על תקציב, אזור, התנהגות צפייה ודחיפות.";

/* ── Recent deals ───────────────────────────────────────── */
export const recentDeals: RecentDeal[] = [
  {
    id: "d1",
    type: "דירת 4 חדרים",
    city: "רחובות",
    price: 4150000,
    when: "לפני יומיים",
    xPct: 32,
    yPct: 40,
  },
  {
    id: "d2",
    type: "דירת 5 חדרים",
    city: "נס ציונה",
    price: 6600000,
    when: "לפני 4 ימים",
    xPct: 58,
    yPct: 30,
  },
  {
    id: "d3",
    type: "פנטהאוז 6 חדרים",
    city: "תל אביב",
    price: 10250000,
    when: "לפני שבוע",
    xPct: 70,
    yPct: 60,
  },
];

/* ── Market intelligence ────────────────────────────────── */
export const marketStats: MarketStat[] = [
  {
    id: "m1",
    label: "מחיר ממוצע למ״ר",
    value: "₪53,800",
    changePct: 2.4,
    positiveIsGood: true,
    tone: "purple",
    chart: "line",
    series: [0.3, 0.4, 0.35, 0.5, 0.55, 0.6, 0.58, 0.7],
  },
  {
    id: "m2",
    label: "עסקאות החודש",
    value: "1,248",
    changePct: 8.7,
    positiveIsGood: true,
    tone: "blue",
    chart: "bar",
    series: [0.4, 0.55, 0.45, 0.6, 0.65, 0.7, 0.8, 0.85],
  },
  {
    id: "m3",
    label: "זמן שיווק ממוצע",
    value: "68",
    unit: "ימים",
    changePct: -5.5,
    positiveIsGood: true,
    tone: "green",
    chart: "line",
    series: [0.8, 0.75, 0.7, 0.72, 0.6, 0.55, 0.5, 0.45],
  },
  {
    id: "m4",
    label: "ביקוש פעיל",
    value: "4,732",
    changePct: 12.3,
    positiveIsGood: true,
    tone: "gold",
    chart: "bar",
    series: [0.5, 0.45, 0.55, 0.6, 0.5, 0.7, 0.75, 0.9],
  },
  {
    id: "m5",
    label: "ירידות מחיר השבוע",
    value: "37",
    changePct: 4.1,
    positiveIsGood: false,
    tone: "red",
    chart: "line",
    series: [0.3, 0.35, 0.4, 0.38, 0.45, 0.5, 0.55, 0.6],
  },
];

/* ── Bottom AI command ──────────────────────────────────── */
export const quickActions: QuickAction[] = [
  { id: "qa1", label: "מצא נכסים חמים", icon: "Flame" },
  { id: "qa2", label: "מצא קונים", icon: "Users" },
  { id: "qa3", label: "בנה מצגת", icon: "Presentation" },
  { id: "qa4", label: "שלח פולואפ", icon: "Send" },
  { id: "qa5", label: "נתח אזור", icon: "MapPin" },
  { id: "qa6", label: "בדוק מחיר", icon: "Tag" },
  { id: "qa7", label: "בנה מסע נכס", icon: "Route" },
];
