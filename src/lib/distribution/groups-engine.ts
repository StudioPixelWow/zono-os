// ============================================================================
// ZONO — Facebook Groups Distribution Engine (PURE, deterministic, client-safe).
// ----------------------------------------------------------------------------
// Classification, performance scoring, property→group recommendations, duplicate
// fingerprinting and compliance checks. All inputs are REAL group/post/lead rows;
// nothing fabricates publishing or activity.
// ============================================================================

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// ── Classification (Hebrew heuristics over group name + notes) ───────────────
const TYPE_KEYWORDS: { type: string; words: string[] }[] = [
  { type: "garden_apartment", words: ["דירת גן", "גינה"] },
  { type: "penthouse", words: ["פנטהאוז", "פנטהאוס", "גג"] },
  { type: "private_house", words: ["בית פרטי", "וילה", "קוטג", "צמוד קרקע"] },
  { type: "duplex", words: ["דופלקס"] },
  { type: "commercial", words: ["מסחרי", "חנות", "עסק", "משרד", "נכס מניב"] },
  { type: "land", words: ["מגרש", "קרקע"] },
  { type: "apartment", words: ["דירה", "דירות", "להשכרה", "למכירה"] },
];

const CATEGORY_KEYWORDS: { category: string; words: string[] }[] = [
  { category: "real_estate", words: ["נדל\"ן", "נדלן", "דירות", "למכירה", "להשכרה", "נכסים", "דירה"] },
  { category: "community", words: ["קהילה", "תושבי", "שכונת", "ועד", "מודעות"] },
  { category: "city", words: ["תושבי", "העיר", "אזור"] },
  { category: "investors", words: ["משקיעים", "השקעות", "תשואה"] },
];

const CITY_REGION: Record<string, string> = {
  "תל אביב": "tel_aviv", "רמת גן": "tel_aviv", "גבעתיים": "tel_aviv", "בת ים": "tel_aviv", "חולון": "tel_aviv",
  "חיפה": "haifa", "קרית ביאליק": "haifa", "קרית מוצקין": "haifa", "קרית ים": "haifa", "קרית אתא": "haifa", "נשר": "haifa",
  "ירושלים": "jerusalem", "באר שבע": "south", "אשדוד": "south", "אשקלון": "south", "אילת": "eilat",
  "נתניה": "sharon", "כפר סבא": "sharon", "רעננה": "sharon", "הרצליה": "sharon", "הוד השרון": "sharon",
  "ראשון לציון": "center", "רחובות": "center", "רמלה": "center", "לוד": "center", "פתח תקווה": "center", "מודיעין": "center",
};

/** Map a city name → region (real Israeli geography); null if unknown. */
export function regionForCity(city?: string | null): string | null {
  if (!city) return null;
  const c = city.trim();
  if (CITY_REGION[c]) return CITY_REGION[c];
  for (const [name, r] of Object.entries(CITY_REGION)) if (c.includes(name) || name.includes(c)) return r;
  return null;
}

export interface GroupClassification { category: string | null; propertyTypes: string[]; region: string | null }

export function classifyGroup(name: string, notes?: string | null, city?: string | null): GroupClassification {
  const hay = `${name} ${notes ?? ""}`;
  const has = (w: string) => hay.includes(w);
  const propertyTypes = [...new Set(TYPE_KEYWORDS.filter((t) => t.words.some(has)).map((t) => t.type))];
  const category = CATEGORY_KEYWORDS.find((c) => c.words.some(has))?.category ?? "real_estate";
  let region: string | null = city ? CITY_REGION[city.trim()] ?? null : null;
  if (!region) { for (const [c, r] of Object.entries(CITY_REGION)) if (has(c)) { region = r; break; } }
  return { category, propertyTypes, region };
}

// ── Performance + lead scoring (from REAL post/lead stats) ───────────────────
export interface GroupStats {
  totalPosts: number;
  totalLeads: number;
  avgResponseRate: number | null;  // 0..1 (reactions+comments per post / members proxy)
  membersCount: number;
  spamRiskScore: number;           // 0..100
  daysSinceLastLead: number | null;
  daysSinceLastPost: number | null;
}

/** Overall group quality 0..100 — rewards real leads + engagement, penalizes spam/staleness. */
export function scoreGroupPerformance(s: GroupStats): number {
  if (s.totalPosts === 0) return 0; // no real activity → no score (honest)
  const leadRate = s.totalLeads / Math.max(1, s.totalPosts);     // leads per post
  const leadComponent = Math.min(45, leadRate * 90);              // up to 45
  const engagement = (s.avgResponseRate ?? 0) * 30;              // up to 30
  const reachComponent = Math.min(15, Math.log10(Math.max(10, s.membersCount)) * 4); // up to ~15
  const recency = s.daysSinceLastLead != null ? Math.max(0, 10 - s.daysSinceLastLead / 9) : 0; // up to 10
  const spamPenalty = (s.spamRiskScore / 100) * 25;
  return clamp(leadComponent + engagement + reachComponent + recency - spamPenalty);
}

/** Lead-generation quality 0..100 — purely how well the group converts to leads. */
export function scoreGroupLeads(s: GroupStats): number {
  if (s.totalPosts === 0) return 0;
  const leadRate = s.totalLeads / Math.max(1, s.totalPosts);
  return clamp(Math.min(80, leadRate * 100) + (s.totalLeads >= 5 ? 20 : s.totalLeads * 4));
}

// ── Property → group recommendation ──────────────────────────────────────────
export interface RecoGroupInput {
  id: string; name: string; city: string | null; region: string | null;
  propertyTypes: string[]; performanceScore: number; leadScore: number;
  membersCount: number; spamRiskScore: number; status: string;
  daysSinceLastPost: number | null;
}
export interface PropertyForReco { city: string | null; region: string | null; propertyType: string | null }
export interface GroupRecommendation {
  groupId: string; name: string; fitScore: number; expectedReach: number; expectedLeads: number;
  reasons: string[]; cautions: string[];
}

const MIN_DAYS_BETWEEN_POSTS = 3; // compliance: avoid spamming the same group

export function recommendGroupsForProperty(property: PropertyForReco, groups: RecoGroupInput[]): GroupRecommendation[] {
  const recos: GroupRecommendation[] = [];
  for (const g of groups) {
    if (g.status !== "active") continue;
    const reasons: string[] = [];
    const cautions: string[] = [];
    let fit = g.performanceScore * 0.5; // base on real performance

    const cityMatch = property.city && g.city && property.city.trim() === g.city.trim();
    const regionMatch = property.region && g.region && property.region === g.region;
    if (cityMatch) { fit += 25; reasons.push(`התאמה גאוגרפית מדויקת (${g.city})`); }
    else if (regionMatch) { fit += 12; reasons.push("התאמת אזור"); }

    if (property.propertyType && g.propertyTypes.includes(property.propertyType)) { fit += 18; reasons.push("מתמחה בסוג הנכס"); }
    else if (g.propertyTypes.length === 0) { fit += 4; }

    if (g.leadScore >= 60) { fit += 10; reasons.push(`מייצרת לידים (${g.leadScore})`); }
    if (g.membersCount >= 10000) reasons.push(`קהל גדול (${g.membersCount.toLocaleString("he-IL")})`);

    if (g.spamRiskScore >= 60) { fit -= 15; cautions.push("סיכון ספאם גבוה — פרסם בזהירות"); }
    if (g.daysSinceLastPost != null && g.daysSinceLastPost < MIN_DAYS_BETWEEN_POSTS) {
      cautions.push(`פורסם לאחרונה (לפני ${g.daysSinceLastPost} ימים) — המתן למניעת ספאם`);
      fit -= 10;
    }

    const fitScore = clamp(fit);
    const expectedReach = Math.round(g.membersCount * 0.08 * (fitScore / 100)); // conservative real-members-based estimate
    const expectedLeads = Math.round((g.leadScore / 100) * Math.max(1, expectedReach / 400));
    recos.push({ groupId: g.id, name: g.name, fitScore, expectedReach, expectedLeads, reasons, cautions });
  }
  return recos.sort((a, b) => b.fitScore - a.fitScore);
}

// ── Duplicate prevention ─────────────────────────────────────────────────────
/** Stable content fingerprint (normalized text) to block re-posting the same ad to a group. */
export function contentHash(text: string): string {
  const norm = (text || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 600);
  let h = 0;
  for (let i = 0; i < norm.length; i++) { h = (h * 31 + norm.charCodeAt(i)) | 0; }
  return `c${(h >>> 0).toString(36)}_${norm.length}`;
}

export interface ComplianceResult { allowed: boolean; warnings: string[] }
/** Per-group compliance gate before suggesting a post (user still confirms manually). */
export function checkCompliance(opts: {
  privacyLevel: string; daysSinceLastPost: number | null; spamRiskScore: number; duplicateExists: boolean;
}): ComplianceResult {
  const warnings: string[] = [];
  let allowed = true;
  if (opts.duplicateExists) { allowed = false; warnings.push("תוכן זהה כבר פורסם בקבוצה זו — נמנע כפילות."); }
  if (opts.daysSinceLastPost != null && opts.daysSinceLastPost < MIN_DAYS_BETWEEN_POSTS) {
    warnings.push(`פורסם בקבוצה לפני ${opts.daysSinceLastPost} ימים — מומלץ להמתין ${MIN_DAYS_BETWEEN_POSTS} ימים.`);
  }
  if (opts.spamRiskScore >= 70) warnings.push("סיכון ספאם גבוה בקבוצה זו.");
  if (opts.privacyLevel === "private") warnings.push("קבוצה פרטית — ודא עמידה בכללי הקבוצה לפני פרסום.");
  return { allowed, warnings };
}

export const REGION_LABEL: Record<string, string> = {
  north: "צפון", haifa: "חיפה", sharon: "שרון", center: "מרכז", tel_aviv: "תל אביב",
  jerusalem: "ירושלים", shfela: "שפלה", south: "דרום", west_bank: "יו\"ש", eilat: "אילת",
};
export const GROUP_CATEGORY_LABEL: Record<string, string> = {
  real_estate: "נדל\"ן", community: "קהילה", city: "עירונית", investors: "משקיעים",
};
