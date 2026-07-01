// ============================================================================
// 🧠 Chief of Staff — cross-module reasoning + executive recommendations (pure).
// 27.6. Chains signals ACROSS engines into explainable insights, ranks the
// top priorities / risks / opportunities / missions, derives execution-
// coordinator interventions, and distills organizational (not LLM) memory.
// Every output carries the evidence it came from. Nothing is fabricated.
// ============================================================================
import type {
  OrgSignals, CrossModuleInsight, ExecutiveRecommendation, ExecutiveRecommendations,
  BusinessMemory, Impact,
} from "./types";
import { clamp } from "./score";

// ── Structured inputs the service assembles from the existing engines ─────────
export interface CityPriority { city: string; category: string; title: string; why: string; evidence: string; priority: number; readiness: string }
export interface CityRisk { city: string; title: string; evidence: string; severity: string }
export interface CityOpportunity { city: string; title: string; evidence: string; area: string | null }
export interface CompetitorSignal { city: string; name: string; growthPct: number }
export interface MissionLite { missionType: string; goal: string; entity: string; priority: number; status: string }

export interface ReasoningInput {
  signals: OrgSignals;
  decliningCities: { city: string; trendPct: number }[];
  growingCompetitors: CompetitorSignal[];
  decliningCompetitors: CompetitorSignal[];
  emergingAreas: CityOpportunity[];
  weakCoverageCities: { city: string; businessScore: number }[];
  priorities: CityPriority[];
  risks: CityRisk[];
  opportunities: CityOpportunity[];
  blockedMissions: MissionLite[];
  waitingMissions: MissionLite[];
}

let _n = 0;
const rid = (p: string) => `${p}-${++_n}`;
const impactFromScore = (n: number): Impact => (n >= 66 ? "high" : n >= 40 ? "medium" : "low");

// ── Part 3 — cross-module reasoning chains ───────────────────────────────────
export function crossModuleInsights(input: ReasoningInput): CrossModuleInsight[] {
  _n = 0;
  const out: CrossModuleInsight[] = [];
  const sig = input.signals;

  // Chain A: declining market + growing competitor + coverage gap → recruit + campaign.
  if (input.growingCompetitors.length && (input.weakCoverageCities.length || input.decliningCities.length)) {
    const comp = input.growingCompetitors[0];
    const gapCity = input.weakCoverageCities[0]?.city ?? input.decliningCities[0]?.city ?? comp.city;
    out.push({
      id: rid("insight"), title: `מתחרה צומח מול כיסוי חלש ב${gapCity}`,
      chain: [
        `מתחרה ${comp.name} צומח +${comp.growthPct}% ב${comp.city}`,
        `כיסוי המשרד ב${gapCity} חלש`,
        "פער כיסוי מאפשר למתחרה לתפוס נתח שוק",
        "המלצה: גייס מתווך + השק קמפיין באזור",
      ],
      evidence: [`${comp.name} +${comp.growthPct}% ב-60 יום`, `ציון עסקי נמוך ב${gapCity}`],
      recommendation: `גייס מתווך ל${gapCity} והשק קמפיין מיצוב לפני שהמתחרה מתבסס`,
      confidence: clamp(50 + comp.growthPct), businessImpact: "high",
      affectedEntities: [gapCity, comp.name], modules: ["Competitive", "Territory", "Mission"],
    });
  }

  // Chain B: market inventory decline + risks → retention focus.
  if (input.decliningCities.length && sig.market.riskCount > 0) {
    const c = input.decliningCities[0];
    out.push({
      id: rid("insight"), title: `שוק בירידה ב${c.city} — עבור לשימור`,
      chain: [
        `מגמת מלאי ${c.trendPct}% ב${c.city}`,
        `${sig.market.riskCount} סיכוני שוק פעילים`,
        "ירידת מלאי מקטינה זרם עסקאות חדשות",
        "המלצה: התמקד בשימור מלאי ולקוחות קיימים",
      ],
      evidence: [`מגמת מלאי ${c.trendPct}%`, `${sig.market.riskCount} סיכונים`],
      recommendation: `הפעל תוכנית שימור מלאי ולקוחות ב${c.city}`,
      confidence: clamp(55 + Math.abs(c.trendPct)), businessImpact: "high",
      affectedEntities: [c.city], modules: ["Market", "Decision", "Mission"],
    });
  }

  // Chain C: execution bottleneck — blocked/waiting missions stall the pipeline.
  const stalled = input.blockedMissions.length + input.waitingMissions.length;
  if (stalled >= 2) {
    out.push({
      id: rid("insight"), title: "צוואר בקבוק בביצוע — משימות תקועות",
      chain: [
        `${input.blockedMissions.length} משימות חסומות · ${input.waitingMissions.length} ממתינות לאישור`,
        "משימות תקועות מעכבות מימוש החלטות",
        "ציון הביצוע יורד וההזדמנויות מתיישנות",
        "המלצה: שחרר חסימות ואשר משימות ממתינות",
      ],
      evidence: [
        ...input.blockedMissions.slice(0, 2).map((m) => `חסום: ${m.goal || m.missionType} (${m.entity})`),
        ...input.waitingMissions.slice(0, 2).map((m) => `ממתין: ${m.goal || m.missionType} (${m.entity})`),
      ],
      recommendation: "כנס לסקירת חסימות: אשר/שחרר את המשימות התקועות",
      confidence: clamp(60 + stalled * 4), businessImpact: stalled >= 4 ? "high" : "medium",
      affectedEntities: [...new Set([...input.blockedMissions, ...input.waitingMissions].map((m) => m.entity))].slice(0, 5),
      modules: ["Mission", "Decision"],
    });
  }

  // Chain D: emerging area + low coverage → expansion.
  if (input.emergingAreas.length && input.weakCoverageCities.length) {
    const area = input.emergingAreas[0];
    out.push({
      id: rid("insight"), title: `אזור מתפתח ב${area.city} עם כיסוי דל`,
      chain: [
        `אזור מתפתח: ${area.area ?? area.title} (${area.city})`,
        "כניסת שחקנים נמוכה + כיסוי משרד דל",
        "חלון הזדמנות לתפוס נתח מוקדם",
        "המלצה: הרחב טריטוריה + גייס/הקצה מתווך",
      ],
      evidence: [area.evidence, `כיסוי דל ב${area.city}`],
      recommendation: `הרחב פעילות לאזור ${area.area ?? area.title} ב${area.city}`,
      confidence: 62, businessImpact: "medium",
      affectedEntities: [area.city, area.area ?? area.title], modules: ["Territory", "Competitive", "Mission"],
    });
  }

  // Chain E: low data quality undermines every recommendation.
  if (sig.dataQualityScore < 55) {
    out.push({
      id: rid("insight"), title: "איכות נתונים נמוכה מגבילה את כל ההמלצות",
      chain: [
        `ציון איכות נתונים ${clamp(sig.dataQualityScore)}`,
        `כיסוי קישורים ${clamp(sig.linkCoveragePct)}% · פתרון מתווכים ${clamp(sig.resolutionRatePct)}%`,
        "ראיות חסרות מורידות ביטחון בכל מודול",
        "המלצה: הרץ שיוך נכסי סוכנים ומחקר עיר",
      ],
      evidence: [`איכות נתונים ${clamp(sig.dataQualityScore)}`, `כיסוי קישורים ${clamp(sig.linkCoveragePct)}%`],
      recommendation: "הרץ שיוך נכסי סוכנים למשרד + מחקר עיר להעלאת שלמות הגרף",
      confidence: 70, businessImpact: "high",
      affectedEntities: ["הארגון"], modules: ["Discovery", "Knowledge Graph", "Data Quality"],
    });
  }

  return out;
}

// ── Part 4 — ranked executive recommendations ────────────────────────────────
function priorityToRec(p: CityPriority): ExecutiveRecommendation {
  return {
    id: rid("rec"), kind: "priority", title: p.title, why: p.why,
    evidence: [p.evidence, `עיר: ${p.city}`].filter(Boolean),
    affectedEntities: [p.city], expectedOutcome: p.why,
    confidence: clamp(p.priority), businessImpact: impactFromScore(p.priority),
    urgency: clamp(p.priority), alternatives: [], sourceModule: `Decision · ${p.category}`,
  };
}
function riskToRec(r: CityRisk): ExecutiveRecommendation {
  const sev = r.severity === "high" ? 85 : r.severity === "moderate" ? 60 : 40;
  return {
    id: rid("rec"), kind: "risk", title: r.title, why: r.evidence,
    evidence: [r.evidence, `עיר: ${r.city}`], affectedEntities: [r.city],
    expectedOutcome: "צמצום חשיפה עסקית", confidence: sev, businessImpact: impactFromScore(sev),
    urgency: sev, alternatives: ["המשך ניטור", "העברת משאבים לאזור יציב"], sourceModule: "Decision · Risk",
  };
}
function oppToRec(o: CityOpportunity): ExecutiveRecommendation {
  return {
    id: rid("rec"), kind: "opportunity", title: o.title, why: o.evidence,
    evidence: [o.evidence, `עיר: ${o.city}`], affectedEntities: [o.area ?? o.city],
    expectedOutcome: "תפיסת נתח שוק מוקדם", confidence: 60, businessImpact: "medium",
    urgency: 55, alternatives: ["המתן לאימות ביקוש נוסף"], sourceModule: "Decision · Opportunity",
  };
}
function missionToRec(m: MissionLite): ExecutiveRecommendation {
  return {
    id: rid("rec"), kind: "mission", title: m.goal || m.missionType, why: `משימה בסטטוס ${m.status}`,
    evidence: [`ישות: ${m.entity}`, `סוג: ${m.missionType}`], affectedEntities: [m.entity],
    expectedOutcome: "קידום ביצוע ההחלטה", confidence: clamp(m.priority),
    businessImpact: impactFromScore(m.priority), urgency: clamp(m.priority),
    alternatives: [], sourceModule: "Mission",
  };
}

export function buildExecutiveRecommendations(input: ReasoningInput, openMissions: MissionLite[]): ExecutiveRecommendations {
  const byUrgency = (a: ExecutiveRecommendation, b: ExecutiveRecommendation) => b.urgency - a.urgency;
  const roiScore = (r: ExecutiveRecommendation) => r.urgency * (r.businessImpact === "high" ? 1.3 : r.businessImpact === "medium" ? 1 : 0.6);

  const priorities = input.priorities.map(priorityToRec).sort(byUrgency);
  const risks = input.risks.map(riskToRec).sort(byUrgency);
  const opps = input.opportunities.map(oppToRec).sort(byUrgency);
  const missions = [...openMissions].sort((a, b) => b.priority - a.priority).map(missionToRec);

  const all = [...priorities, ...risks, ...opps, ...missions];
  const highestRoi = [...all].sort((a, b) => roiScore(b) - roiScore(a)).slice(0, 10);
  const highestUrgency = [...all].sort(byUrgency).slice(0, 10);

  return {
    topPriorities: priorities.slice(0, 10),
    topRisks: risks.slice(0, 10),
    topOpportunities: opps.slice(0, 10),
    topMissions: missions.slice(0, 10),
    highestRoi, highestUrgency,
  };
}

// ── Part 6 — Execution Coordinator interventions (recommend, never execute) ───
export function buildInterventions(input: ReasoningInput): ExecutiveRecommendation[] {
  const out: ExecutiveRecommendation[] = [];
  for (const m of input.blockedMissions.slice(0, 5)) {
    out.push({
      id: rid("intv"), kind: "intervention", title: `שחרר חסימה: ${m.goal || m.missionType}`,
      why: "משימה חסומה מעכבת מימוש החלטה", evidence: [`ישות: ${m.entity}`, "סטטוס: חסום"],
      affectedEntities: [m.entity], expectedOutcome: "המשך ביצוע המשימה",
      confidence: 70, businessImpact: impactFromScore(m.priority), urgency: clamp(m.priority + 10),
      alternatives: ["בטל את המשימה אם אינה רלוונטית"], sourceModule: "Mission · Coordinator",
    });
  }
  for (const m of input.waitingMissions.slice(0, 5)) {
    out.push({
      id: rid("intv"), kind: "intervention", title: `אשר משימה ממתינה: ${m.goal || m.missionType}`,
      why: "משימה ממתינה לאישור — עיכוב פוגע בהזדמנות", evidence: [`ישות: ${m.entity}`, "סטטוס: ממתין לאישור"],
      affectedEntities: [m.entity], expectedOutcome: "התנעת ביצוע",
      confidence: 68, businessImpact: impactFromScore(m.priority), urgency: clamp(m.priority),
      alternatives: ["דחה אם אין קיבולת"], sourceModule: "Mission · Coordinator",
    });
  }
  return out.sort((a, b) => b.urgency - a.urgency);
}

// ── Part 5 — organizational (not LLM) memory ─────────────────────────────────
export interface MemoryInput {
  completed: { missionType: string; goal: string }[];
  cancelled: { missionType: string; goal: string }[];
  active: { missionType: string }[];
}
function tally(items: { missionType: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.missionType, (map.get(it.missionType) ?? 0) + 1);
  return map;
}
export function buildBusinessMemory(mem: MemoryInput): BusinessMemory {
  const completedByType = tally(mem.completed);
  const cancelledByType = tally(mem.cancelled);

  const successfulStrategies = [...completedByType.entries()]
    .filter(([, c]) => c >= 1).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([key, count]) => ({ key, count, note: `הושלמה ${count} פעמים — אסטרטגיה מוכחת` }));

  const repeatedProblems = [...cancelledByType.entries()]
    .filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([key, count]) => ({ key, count, note: `בוטלה ${count} פעמים — בעיה חוזרת, בחן גישה חלופית` }));

  const notes: string[] = [];
  if (!mem.completed.length && !mem.cancelled.length) notes.push("אין היסטוריית משימות עדיין — הזיכרון הארגוני ייבנה עם הזמן.");

  return {
    completedMissions: mem.completed.length,
    failedMissions: mem.cancelled.length,
    repeatedProblems, successfulStrategies,
    summary: `${mem.completed.length} משימות הושלמו · ${mem.cancelled.length} בוטלו · ${mem.active.length} פעילות`,
    notes,
  };
}
