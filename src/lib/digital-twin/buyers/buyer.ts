// ============================================================================
// 👤 Buyer Digital Twin — profile · learning · decisions · missions · classify.
// 28.1. Parts 3–7, 10. Evidence-only: no activity/data → conservative profile +
// low confidence (never fabricated). Reuses the framework primitives.
// ============================================================================
import { clamp } from "../core";
import type { TwinActivity, TwinDecisionSignal, TwinMissionSignal, TwinLearning } from "../types";
import type { BuyerSeed, BuyerActivityInput, BuyerProfile, BuyerBehavior, ExpectedWindow } from "./types";

const DAY = 86400000;
const LUXURY_BUDGET = 3_500_000;

// Map raw activity kinds → canonical activity kinds.
const KIND_MAP: Record<string, string> = {
  view: "view", viewed: "view", save: "save", saved: "save", favorite: "save",
  reject: "reject", rejected: "reject", dismiss: "reject",
  call: "call", phone: "call", meeting: "meeting", meet: "meeting",
  message: "message", whatsapp: "message", sms: "message", email: "message",
  visit: "visit", tour: "visit", offer: "offer", bid: "offer", search: "search", note: "note", task: "task",
};
export function canonicalKind(raw: string): string {
  const k = (raw || "").toLowerCase();
  for (const key of Object.keys(KIND_MAP)) if (k.includes(key)) return KIND_MAP[key];
  return "other";
}
export function toTwinActivities(acts: BuyerActivityInput[]): TwinActivity[] {
  return acts.map((a) => { const kind = canonicalKind(a.kind); return { id: a.id, kind, at: a.at, summary: a.summary || kind, weight: kind === "offer" || kind === "visit" ? 3 : kind === "meeting" || kind === "call" ? 2 : 1 }; });
}

function behaviorFrom(acts: TwinActivity[]): BuyerBehavior {
  const c = (k: string) => acts.filter((a) => a.kind === k).length;
  return { views: c("view"), saves: c("save"), rejects: c("reject"), visits: c("visit"), offers: c("offer"), calls: c("call"), meetings: c("meeting"), messages: c("message"), searches: c("search") };
}

const TEMP_READINESS: Record<string, number> = { hot: 80, warm: 55, cold: 30 };

/** Part 3 — compute the Buyer profile from real seed + activities (evidence-only). */
export function computeBuyerProfile(seed: BuyerSeed, activities: TwinActivity[], now: number = Date.now()): BuyerProfile {
  const b = behaviorFrom(activities);
  const sortedAts = activities.map((a) => a.at).sort();
  const lastAt = sortedAts.length ? sortedAts[sortedAts.length - 1] : null;
  const daysSinceLast = lastAt ? (now - new Date(lastAt).getTime()) / DAY : null;

  // Completeness — key fields present.
  const fields = [seed.budgetMax != null || seed.budgetMin != null, seed.preferredAreas.length > 0, seed.preferredTypes.length > 0, seed.roomsMin != null || seed.roomsMax != null, seed.hasPhone || seed.hasEmail];
  const completeness = clamp((fields.filter(Boolean).length / fields.length) * 100);

  const budgetConfidence = clamp((seed.budgetMin != null && seed.budgetMax != null ? 60 : seed.budgetMax != null ? 40 : 15) + b.offers * 12 + b.visits * 5);

  const engagement = clamp(Math.min(100, activities.length * 9) + b.visits * 6 + b.offers * 10);
  const recency = daysSinceLast == null ? 0 : daysSinceLast <= 3 ? 100 : daysSinceLast <= 14 ? 75 : daysSinceLast <= 30 ? 45 : daysSinceLast <= 90 ? 20 : 5;

  const readiness = clamp((TEMP_READINESS[seed.temperature ?? ""] ?? 40) * 0.5 + engagement * 0.3 + completeness * 0.2 + b.offers * 5);
  const urgency = clamp(recency * 0.5 + (seed.temperature === "hot" ? 30 : seed.temperature === "warm" ? 15 : 0) + Math.min(30, activities.filter((a) => a.at && (now - new Date(a.at).getTime()) / DAY <= 14).length * 8));
  const risk = clamp((100 - completeness) * 0.4 + (100 - recency) * 0.3 + Math.min(40, b.rejects * 8) * 0.3);
  const trust = clamp(40 + (seed.hasPhone ? 15 : 0) + (seed.hasEmail ? 10 : 0) + Math.min(30, activities.length * 3) - Math.min(20, b.rejects * 4));
  const communicationHealth = clamp(Math.min(100, (b.calls + b.meetings + b.messages) * 15) * 0.7 + recency * 0.3);
  const probabilityToBuy = clamp(readiness * 0.35 + urgency * 0.2 + engagement * 0.2 + budgetConfidence * 0.15 + (100 - risk) * 0.1);

  const expectedWindow: ExpectedWindow = urgency >= 70 ? "0-1m" : urgency >= 45 ? "1-3m" : urgency >= 25 ? "3-6m" : "6m+";
  const timeline = { "0-1m": "0–1 חודשים", "1-3m": "1–3 חודשים", "3-6m": "3–6 חודשים", "6m+": "מעל 6 חודשים" }[expectedWindow];

  const luxury = (seed.budgetMax ?? 0) >= LUXURY_BUDGET;
  const investor = seed.preferredTypes.length >= 2 || seed.preferredTypes.some((t) => /commercial|מסחר|office|משרד/i.test(t));
  const family = (seed.roomsMin ?? 0) >= 3 || seed.mustHaveSafeRoom;
  const motivation = investor ? "השקעה" : luxury ? "יוקרה/שדרוג" : family ? "מגורים למשפחה" : "מגורים";

  const decisionStyle = b.views >= 6 && b.offers === 0 ? "אנליטי (הרבה צפיות)" : b.offers > 0 ? "החלטי (הגיש הצעה)" : b.visits > 0 ? "מעורב" : "טרם ידוע";

  return {
    budget: { min: seed.budgetMin, max: seed.budgetMax }, budgetConfidence, motivation,
    readiness, timeline, urgency, risk, trust, decisionStyle, communicationHealth, probabilityToBuy, expectedWindow,
    preferences: { areas: seed.preferredAreas, types: seed.preferredTypes, roomsMin: seed.roomsMin, roomsMax: seed.roomsMax, mustHave: [seed.mustHaveParking ? "חניה" : "", seed.mustHaveElevator ? "מעלית" : "", seed.mustHaveSafeRoom ? "ממ״ד" : ""].filter(Boolean) },
    behavior: b, completeness,
  };
}

// ── Part 5 — learning / drift detection ──────────────────────────────────────
let _l = 0;
const lid = () => `bl-${++_l}`;
export function detectBuyerLearning(profile: BuyerProfile, activities: TwinActivity[], now: number = Date.now()): TwinLearning[] {
  _l = 0;
  const out: TwinLearning[] = [];
  const b = profile.behavior;
  const recent14 = activities.filter((a) => a.at && (now - new Date(a.at).getTime()) / DAY <= 14).length;
  const prev = activities.filter((a) => a.at && (now - new Date(a.at).getTime()) / DAY > 14 && (now - new Date(a.at).getTime()) / DAY <= 60).length;

  if (recent14 >= 3 && recent14 > prev) out.push({ id: lid(), type: "urgency_up", note: `עלייה בפעילות (${recent14} ב-14 יום מול ${prev} קודם) — דחיפות עולה`, confidence: 70, evidence: [`${recent14} פעילויות אחרונות`] });
  if (recent14 === 0 && activities.length > 0) out.push({ id: lid(), type: "dormant", note: "אין פעילות ב-14 יום — הקונה מצטנן", confidence: 65, evidence: [`${activities.length} פעילויות היסטוריות`] });
  if (b.rejects >= 3) out.push({ id: lid(), type: "preference_drift", note: `${b.rejects} דחיות — ייתכן שינוי בהעדפות; בדוק אזור/סוג/תקציב`, confidence: 60, evidence: [`${b.rejects} נכסים נדחו`] });
  if (b.views >= 8 && b.saves === 0) out.push({ id: lid(), type: "repeated_behavior", note: "צפיות רבות ללא שמירה — קריטריונים לא מסופקים", confidence: 62, evidence: [`${b.views} צפיות`] });
  if (b.offers > 0) out.push({ id: lid(), type: "intent_up", note: "הוגשה הצעה — כוונת קנייה חזקה", confidence: 80, evidence: [`${b.offers} הצעות`] });
  return out;
}

// ── Part 6 — decision signals (reuses framework ranking) ─────────────────────
let _d = 0;
const did = () => `bd-${++_d}`;
export function buyerDecisionSignals(profile: BuyerProfile, recencyScore: number): TwinDecisionSignal[] {
  _d = 0;
  const out: TwinDecisionSignal[] = [];
  const b = profile.behavior;
  if (profile.completeness < 60) out.push({ id: did(), action: "אסוף מידע חסר", priority: clamp(70 + (60 - profile.completeness)), reason: `שלמות פרופיל ${profile.completeness}%`, evidence: [`חסרים שדות מפתח`], readiness: "needs_info" });
  if (profile.probabilityToBuy >= 55 && recencyScore <= 45) out.push({ id: did(), action: "התקשר לקונה", priority: clamp(60 + profile.urgency * 0.3), reason: "קונה חם ללא מגע אחרון", evidence: [`הסתברות ${profile.probabilityToBuy}%`], readiness: "ready" });
  if (profile.readiness >= 50 && profile.preferences.areas.length && profile.preferences.types.length) out.push({ id: did(), action: "שלח נכסים מתאימים", priority: clamp(50 + profile.readiness * 0.4), reason: "מוכנות והעדפות ברורות", evidence: [`מוכנות ${profile.readiness}`], readiness: "ready" });
  if (b.saves > 0) out.push({ id: did(), action: "קבע ביקור בנכס", priority: clamp(55 + b.saves * 6), reason: `${b.saves} נכסים שמורים`, evidence: [`${b.saves} שמירות`], readiness: "ready" });
  if (b.meetings > 0 || b.offers > 0) out.push({ id: did(), action: "קבע הערכת שווי לנכס הנוכחי", priority: 45, reason: "אינדיקציה למכירה/שדרוג", evidence: [`${b.meetings} פגישות · ${b.offers} הצעות`], readiness: "ready" });
  if (profile.readiness < 40 && profile.urgency < 40) out.push({ id: did(), action: "המתן — טפח את הליד", priority: 30, reason: "מוכנות ודחיפות נמוכות", evidence: [`מוכנות ${profile.readiness}`], readiness: "wait" });
  return out.sort((a, b2) => b2.priority - a.priority);
}

// ── Part 7 — mission signals (integrate Mission Engine types) ────────────────
let _m = 0;
const mid = () => `bm-${++_m}`;
export function buyerMissionSignals(profile: BuyerProfile): TwinMissionSignal[] {
  _m = 0;
  const out: TwinMissionSignal[] = [];
  const b = profile.behavior;
  if (profile.completeness < 60) out.push({ id: mid(), missionType: "BUYER_QUALIFICATION", title: "הסמכת קונה", priority: 70, reason: "השלמת פרופיל" });
  if (profile.probabilityToBuy >= 50) out.push({ id: mid(), missionType: "BUYER_FOLLOWUP", title: "מעקב קונה", priority: clamp(50 + profile.probabilityToBuy * 0.3), reason: "קונה בעל פוטנציאל" });
  if (b.saves > 0) out.push({ id: mid(), missionType: "PROPERTY_FOLLOWUP", title: "תיאום ביקור", priority: clamp(55 + b.saves * 5), reason: "נכסים שמורים" });
  if (b.offers > 0) { out.push({ id: mid(), missionType: "BUYER_NEGOTIATION", title: "ניהול משא ומתן", priority: 78, reason: "הוגשה הצעה" }); out.push({ id: mid(), missionType: "BUYER_CLOSING", title: "סגירת עסקה", priority: 74, reason: "עסקה בהתהוות" }); out.push({ id: mid(), missionType: "BUYER_DOCUMENTS", title: "איסוף מסמכים", priority: 60, reason: "הכנה לסגירה" }); }
  return out.sort((a, b2) => b2.priority - a.priority);
}

// ── Part 10 — Chief-of-Staff classification ──────────────────────────────────
export function classifyBuyer(seed: BuyerSeed, profile: BuyerProfile, recencyScore: number, totalActivities: number): string[] {
  const tags: string[] = [];
  if (seed.temperature === "hot" || profile.probabilityToBuy >= 65) tags.push("קונה חם");
  if (seed.temperature === "cold" || profile.probabilityToBuy < 30) tags.push("קונה קר");
  if (totalActivities > 0 && recencyScore <= 10) tags.push("רדום");
  if ((seed.budgetMax ?? 0) >= 3_500_000) tags.push("יוקרה");
  if (seed.preferredTypes.length >= 2 || seed.preferredTypes.some((t) => /commercial|מסחר|office|משרד/i.test(t))) tags.push("משקיע");
  if ((seed.roomsMin ?? 0) >= 3 || seed.mustHaveSafeRoom) tags.push("משפחה");
  if ((seed.budgetMax ?? 0) >= 5_500_000 || (profile.probabilityToBuy >= 70 && (seed.budgetMax ?? 0) >= 3_500_000)) tags.push("ערך גבוה");
  return [...new Set(tags)];
}
