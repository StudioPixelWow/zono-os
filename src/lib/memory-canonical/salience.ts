// ============================================================================
// 🧭 ZONO OS 2.0 — Stage 4 · Batch 4.4 · Canonical AI Memory · salience (PURE).
// Classifies a domain event into ZERO OR MORE durable memory intents. Only
// events carrying real, salient facts become memory — never every low-level
// event, never raw payloads/tokens/secrets. When the payload lacks the evidence
// a memory needs, it yields nothing (the caller records a skip). Pure +
// deterministic + offline-testable.
// ============================================================================
import type { DomainEventLike } from "@/lib/kernel/subscriber";
import type { EntityRef, MemoryOpIntent, MemoryType, Provenance, Sensitivity } from "./types";
import { isJourneyType, stageLabel, type JourneyType } from "@/lib/journey-canonical";

function str(v: unknown): string | null { return typeof v === "string" && v.trim() ? v.trim() : null; }
function numOrStr(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return str(v);
}
function pick(p: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) { const v = numOrStr(p[k]); if (v) return v; }
  return null;
}
const CONF: Record<Provenance, number> = { explicit: 90, derived: 60, inferred: 40 };

// Related entity ids carried by a payload → refs (evidence, not fabricated).
const REF_KEYS: [string, string[]][] = [
  ["property", ["propertyId", "property_id"]], ["buyer", ["buyerId", "buyer_id"]],
  ["seller", ["sellerId", "seller_id"]], ["lead", ["leadId", "lead_id"]],
  ["deal", ["dealId", "deal_id"]], ["meeting", ["meetingId", "meeting_id"]],
  ["document", ["documentId", "document_id"]],
];
function refs(p: Record<string, unknown>, subjectType: string, subjectId: string): EntityRef[] {
  const out: EntityRef[] = [];
  const seen = new Set([`${subjectType}:${subjectId}`]);
  for (const [type, keys] of REF_KEYS) {
    const id = pick(p, ...keys);
    if (id && !seen.has(`${type}:${id}`)) { seen.add(`${type}:${id}`); out.push({ type, id }); }
  }
  return out;
}

/** Classify a domain event into durable memory intents (0..n). Deterministic. */
export function classifyMemory(evt: DomainEventLike): MemoryOpIntent[] {
  if (!evt.id || !evt.organization_id || !evt.entity_type || !evt.entity_id) return [];
  const p = evt.payload ?? {};
  const out: MemoryOpIntent[] = [];
  const entRefs = refs(p, evt.entity_type, evt.entity_id);

  const entity = (memoryType: MemoryType, key: string, title: string, fact: string, prov: Provenance, sens: Sensitivity = "internal", conf?: number) =>
    out.push({ scope: "entity", entityType: evt.entity_type, entityId: evt.entity_id, userId: null, memoryType, title, fact, normalizedFactKey: key, confidence: conf ?? CONF[prov], sensitivity: sens, provenance: prov, sourceEntityRefs: entRefs });
  const org = (memoryType: MemoryType, key: string, title: string, fact: string, prov: Provenance, sens: Sensitivity = "normal") =>
    out.push({ scope: "organization", entityType: null, entityId: null, userId: null, memoryType, title, fact, normalizedFactKey: key, confidence: CONF[prov], sensitivity: sens, provenance: prov, sourceEntityRefs: [] });

  switch (evt.event_type) {
    case "buyer.updated": {
      const budget = pick(p, "budget", "budgetMax", "budget_max", "maxBudget");
      const area = pick(p, "preferredArea", "preferred_area", "area", "city");
      const fin = pick(p, "financing", "preapproval", "hasPreapproval", "has_preapproval");
      const must = pick(p, "mustHave", "must_have");
      if (budget) entity("preference", "budget", "תקציב קונה", `תקציב: ${budget}`, "explicit", "confidential");
      if (area) entity("preference", "preferred_area", "אזור מועדף", `אזור מועדף: ${area}`, "explicit");
      if (fin) entity("preference", "financing", "מימון/אישור עקרוני", `מימון: ${fin}`, "explicit", "confidential");
      if (must) entity("constraint", "must_have", "דרישת חובה", `חובה: ${must}`, "explicit");
      break;
    }
    case "seller.updated": {
      const comm = pick(p, "communicationPreference", "communication_preference", "commPref");
      const commit = pick(p, "commitment");
      const pricing = pick(p, "pricingPosition", "pricing_position", "askingPrice", "asking_price");
      if (comm) entity("communication_preference", "comm_pref", "העדפת תקשורת מוכר", `העדפת תקשורת: ${comm}`, "explicit");
      if (commit) entity("commitment", "commitment", "התחייבות מוכר", `${commit}`, "explicit");
      if (pricing) entity("preference", "pricing_position", "עמדת תמחור", `תמחור: ${pricing}`, "explicit", "confidential");
      break;
    }
    case "seller.risk_changed": {
      // Derived from the risk engine — only WITH evidence (a risk value present).
      const risk = pick(p, "risk", "riskScore", "churnRisk", "churn_risk");
      if (risk) entity("risk", "risk", "סיכון שימור מוכר", `סיכון שימור: ${risk}`, "derived", "internal", Number(risk) || CONF.derived);
      break;
    }
    case "property.price_changed": {
      const from = pick(p, "oldPrice", "from", "previous");
      const to = pick(p, "newPrice", "to", "price");
      if (to) entity("milestone", "price", "שינוי מחיר נכס", from ? `מחיר עודכן מ-${from} ל-${to}` : `מחיר עודכן ל-${to}`, "explicit");
      break;
    }
    case "property.status_changed": {
      const st = pick(p, "toStatus", "status", "to");
      if (st) entity("milestone", "status", "שינוי סטטוס נכס", `סטטוס: ${st}`, "explicit");
      break;
    }
    case "deal.stage_changed": {
      const stage = pick(p, "toStage", "stage", "to");
      if (stage) entity("milestone", "stage", "שלב עסקה", `שלב: ${stage}`, "explicit");
      break;
    }
    case "deal.won":
      entity("outcome", "outcome", "עסקה נסגרה", "העסקה נסגרה בהצלחה", "explicit", "internal");
      break;
    case "deal.lost":
      entity("outcome", "outcome", "עסקה אבדה", "העסקה אבדה", "explicit", "internal");
      break;
    case "meeting.completed": {
      const outcome = pick(p, "outcome", "summary", "nextStep", "next_step", "result");
      if (outcome) entity("meeting_outcome", "outcome", "תוצאת פגישה", `${outcome}`, "explicit", "internal");
      break;
    }
    case "document.signed":
      entity("document_fact", "signed", "מסמך נחתם", "המסמך נחתם", "explicit", "internal");
      break;
    case "document.completed":
      entity("milestone", "document_completed", "מסמך הושלם", "המסמך הושלם", "explicit", "internal");
      break;
    case "lead.converted_to_buyer": {
      const buyerId = pick(p, "buyerId", "buyer_id");
      if (buyerId) entity("relationship", "converted", "ליד הומר לקונה", `הליד הומר לקונה ${buyerId}`, "explicit");
      break;
    }
    case "lead.converted_to_seller": {
      const sellerId = pick(p, "sellerId", "seller_id");
      if (sellerId) entity("relationship", "converted", "ליד הומר למוכר", `הליד הומר למוכר ${sellerId}`, "explicit");
      break;
    }
    case "agent.profile_updated": {
      // Broker preference — only if a real preference field is present.
      const style = pick(p, "workingStyle", "working_style", "focusArea", "focus_area");
      if (style) out.push({ scope: "user", entityType: null, entityId: null, userId: evt.entity_id, memoryType: "broker_preference", title: "העדפת סוכן", fact: `${style}`, normalizedFactKey: "broker_style", confidence: CONF.explicit, sensitivity: "internal", provenance: "explicit", sourceEntityRefs: [] });
      break;
    }
    case "organization.updated": {
      const rule = pick(p, "businessRule", "business_rule", "policy", "branding", "brand");
      if (rule) org("business_rule", "org_rule", "כלל עסקי ארגוני", `${rule}`, "explicit", "internal");
      break;
    }
    // ── Batch 5.6D — Canonical Journey → durable AI memory ────────────────────
    // ONLY terminal outcomes (journey.completed) and blocks (journey.blocked)
    // are remembered. journey.created / journey.stage_changed are DELIBERATELY
    // NOT remembered: the current stage is transient state whose single source
    // of truth is `journeys` + the shared Journey context layer — persisting
    // every stage change would create a second, staleable lifecycle truth.
    // Subject-scoped (the fact is about the property/buyer/…), never scoped to
    // the journey id. Derived provenance (canonical spine, not user-stated).
    case "journey.completed":
    case "journey.blocked": {
      const jtRaw = str(p.journeyType) ?? str(p.subjectType);
      const subjectType = str(p.subjectType);
      const subjectId = str(p.subjectId);
      if (!jtRaw || !isJourneyType(jtRaw) || !subjectType || !subjectId) break; // missing subject → skip honestly
      const jt = jtRaw as JourneyType;
      const toStage = str(p.toStage);
      const stageLbl = toStage ? stageLabel(jt, toStage) : null;
      const blocked = evt.event_type === "journey.blocked";
      // Source refs: the journey + the subject (evidence, never fabricated).
      const jRefs: EntityRef[] = [{ type: "journey", id: evt.entity_id }, { type: subjectType, id: subjectId }];
      out.push({
        scope: "entity",
        entityType: subjectType,          // the SUBJECT, not the journey id
        entityId: subjectId,
        userId: null,
        memoryType: blocked ? "risk" : "outcome",
        title: blocked ? "מסע נחסם" : "מסע הושלם",
        // Concise + deterministic. No raw notes / transition evidence / payloads.
        fact: `${blocked ? "המסע נחסם" : "המסע הושלם"}${stageLbl ? ` בשלב ${stageLbl}` : ""}`,
        normalizedFactKey: blocked ? "journey_blocked" : "journey_outcome",
        confidence: CONF.derived,
        sensitivity: "internal",
        provenance: "derived",
        sourceEntityRefs: jRefs,
      });
      break;
    }
    case "facebook.connected":
      org("milestone", "provider_facebook", "פייסבוק חובר", "חשבון פייסבוק חובר (זמינות בלבד)", "explicit", "normal");
      break;
    case "whatsapp.connected":
      org("milestone", "provider_whatsapp", "וואטסאפ חובר", "וואטסאפ חובר (זמינות בלבד)", "explicit", "normal");
      break;
    default:
      break;
  }
  return out;
}
