// ============================================================================
// 🧠 ZONO — Copilot MEMORY extraction (pure). Phase 4. Deterministic, no LLM.
// ----------------------------------------------------------------------------
// Extracts the full customer-memory taxonomy from the CLIENT's messages (inbound
// = explicitly stated). Reuses extractEntities/detectObjections; adds Hebrew cues
// for personal / property / financing / behavior fields. Every value carries a
// provenance (explicit/inferred), a confidence, and its supporting message ids.
// ============================================================================
import { detectObjections, OBJECTION_LABELS } from "@/lib/comm-intelligence/engine";
import type { ConversationAnalysis } from "./analyze";
import type { ExtractedScalar, PartialMemory } from "./memory-types";

type Msg = ConversationAnalysis["transcript"][number];

const scalarCue = (inbound: Msg[], re: RegExp, toValue: (m: RegExpMatchArray, msg: Msg) => string, source: ExtractedScalar["source"], confidence: number): ExtractedScalar | null => {
  let hit: ExtractedScalar | null = null;
  for (const msg of inbound) { const m = msg.text.match(re); if (m) hit = { value: toValue(m, msg), confidence, source, evidenceMessageIds: [msg.messageRef] }; }
  return hit;                                   // last (latest) match wins
};
const listCue = (inbound: Msg[], re: RegExp, source: ExtractedScalar["source"], confidence: number): ExtractedScalar[] => {
  const out = new Map<string, ExtractedScalar>();
  for (const msg of inbound) for (const m of msg.text.matchAll(re)) {
    const v = m[0];
    const prev = out.get(v);
    if (prev) prev.evidenceMessageIds.push(msg.messageRef);
    else out.set(v, { value: v, confidence, source, evidenceMessageIds: [msg.messageRef] });
  }
  return [...out.values()];
};

export function extractMemory(a: ConversationAnalysis): PartialMemory {
  const inbound = a.transcript.filter((m) => m.direction === "inbound");
  const scalars: Record<string, ExtractedScalar> = {};
  const lists: Record<string, ExtractedScalar[]> = {};
  const set = (k: string, v: ExtractedScalar | null) => { if (v) scalars[k] = v; };
  const setL = (k: string, v: ExtractedScalar[]) => { if (v.length) lists[k] = v; };

  // ── Personal ──────────────────────────────────────────────────────────────
  set("personal.familyStatus", scalarCue(inbound, /(נשוי|נשואה|רווק|רווקה|גרוש|גרושה|אלמן|אלמנה|זוג צעיר|התגרשתי|מתגרש|נפרדתי)/, (m) => (/גרש|נפרד/.test(m[1]) ? "גרוש" : m[1]), "explicit", 85));
  set("personal.children", scalarCue(inbound, /(\d+)\s*ילדים|ללא ילדים|בלי ילדים/, (m) => (m[1] ? `${m[1]} ילדים` : "ללא ילדים"), "explicit", 82));
  set("personal.pets", scalarCue(inbound, /(כלב|חתול|חיית מחמד)/, (m) => m[1], "explicit", 78));
  set("personal.occupation", scalarCue(inbound, /(מהנדס|רופא|רופאה|עורך דין|עורכת דין|מורה|עצמאי|עצמאית|רואה חשבון|היי-?טק|הייטק)/, (m) => m[1], "explicit", 80));
  setL("personal.lifestyle", listCue(inbound, /(ספורט|כושר|טבע|שקט|חיי לילה|קרוב לים|מרכז העיר)/g, "explicit", 70));

  // ── Property ─────────────────────────────────────────────────────────────
  const ents = a.entities;
  const budget = ents.find((e) => e.kind === "budget");
  if (budget) set("property.budget", { value: budget.normalized, confidence: 80, source: "explicit", evidenceMessageIds: a.entityEvidence["budget:" + budget.normalized] ?? [] });
  const rooms = ents.find((e) => e.kind === "rooms");
  if (rooms) set("property.rooms", { value: rooms.normalized, confidence: 82, source: "explicit", evidenceMessageIds: a.entityEvidence["rooms:" + rooms.normalized] ?? [] });
  set("property.parking", scalarCue(inbound, /(חניה|חנייה)/, () => "yes", "explicit", 80));
  set("property.balcony", scalarCue(inbound, /(מרפסת)/, () => "yes", "explicit", 80));
  set("property.garden", scalarCue(inbound, /(גינה|חצר)/, () => "yes", "explicit", 80));
  set("property.elevator", scalarCue(inbound, /(מעלית)/, () => "yes", "explicit", 80));
  set("property.floor", scalarCue(inbound, /קומה\s*(\d+)|קומה גבוהה|קומה נמוכה/, (m) => (m[1] ? `קומה ${m[1]}` : m[0]), "explicit", 78));
  set("property.accessibility", scalarCue(inbound, /(נגישות|נגיש|כיסא גלגלים)/, () => "required", "explicit", 80));
  setL("property.cities", (a.entities.filter((e) => e.kind === "city")).map((e) => ({ value: e.normalized, confidence: 85, source: "explicit" as const, evidenceMessageIds: a.entityEvidence["city:" + e.normalized] ?? [] })));
  setL("property.neighborhoods", listCue(inbound, /(פלורנטין|נווה צדק|רמת אביב|בבלי|כרם התימנים|לב העיר|צפון ישן|צפון חדש|שפירא|יד אליהו)/g, "explicit", 82));
  setL("property.projects", listCue(inbound, /(תמ"א|התחדשות עירונית|פינוי בינוי)/g, "explicit", 72));
  setL("property.propertyTypes", listCue(inbound, /(פנטהאוז|דופלקס|דירת גן|וילה|מיני פנטהאוז|סטודיו)/g, "explicit", 80));

  // ── Financing ────────────────────────────────────────────────────────────
  set("financing.financingNeeded", scalarCue(inbound, /(צריך מימון|זקוק למימון|צריך משכנתא|אצטרך משכנתא)/, () => "yes", "explicit", 82));
  set("financing.mortgageStatus", scalarCue(inbound, /(בתהליך משכנתא|הגשתי משכנתא|ממתין לאישור משכנתא|בתהליך מול הבנק)/, () => "in_process", "explicit", 80));
  set("financing.financingApproved", scalarCue(inbound, /(אושרה המשכנתא|אישור עקרוני|מימון אושר|המשכנתא אושרה)/, () => "approved", "explicit", 88));
  set("financing.cashBuyer", scalarCue(inbound, /(קונה במזומן|יש לי את כל הסכום|ללא משכנתא|במזומן מלא)/, () => "yes", "explicit", 85));
  set("financing.existingPropertyToSell", scalarCue(inbound, /(יש לי דירה למכור|צריך למכור קודם|דירה קיימת למכירה)/, () => "yes", "explicit", 82));

  // ── Behavior ─────────────────────────────────────────────────────────────
  const urgencyKw = scalarCue(inbound, /(דחוף|בדחיפות|בהקדם|מיד)/, () => "high", "explicit", 82);
  const timelineEnt = ents.find((e) => e.kind === "timeline");
  if (urgencyKw) set("behavior.urgency", urgencyKw);
  else if (timelineEnt?.normalized === "immediate") set("behavior.urgency", { value: "high", confidence: 65, source: "inferred", evidenceMessageIds: a.entityEvidence["timeline:immediate"] ?? [] });
  if (timelineEnt) set("behavior.timeline", { value: timelineEnt.normalized, confidence: 72, source: "explicit", evidenceMessageIds: a.entityEvidence["timeline:" + timelineEnt.normalized] ?? [] });
  set("behavior.preferredCommunicationHours", scalarCue(inbound, /(בשעות הערב|בערב|בבוקר|רק אחרי \d+|רק בשעות|אחרי העבודה)/, (m) => m[0], "explicit", 76));
  setL("behavior.motivations", listCue(inbound, /(משפחה גדלה|השקעה|קרוב לעבודה|בית ספר|שדרוג|קרוב למשפחה)/g, "explicit", 75));
  setL("behavior.objections", detectObjections(inbound.map((m) => m.text).join("\n")).map((o) => ({ value: OBJECTION_LABELS[o.type] ?? o.type, confidence: 70, source: "explicit" as const, evidenceMessageIds: inbound.slice(-1).map((m) => m.messageRef) })));
  setL("behavior.dealBreakers", listCue(inbound, /(חובה \S+|תנאי הכרחי|בלי זה לא)/g, "explicit", 74));

  return { scalars, lists, budget: budget ? Number(budget.normalized) : null };
}
