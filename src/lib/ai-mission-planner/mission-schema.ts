// ============================================================================
// 📐 Mission draft schema + the 10 supported mission kinds (pure). Phase 27.4.
// Validates planner output. A draft with no evidence is never valid.
// ============================================================================
import type { MissionCategory, MissionDraftInput, MissionPriority } from "./types";

/** Minimum confidence (0–100) required to propose a draft. */
export const MISSION_CONFIDENCE_MIN = 50;

export interface MissionKind { kind: string; label: string; category: MissionCategory; defaultPriority: MissionPriority }

/** The 10 supported draft mission kinds. */
export const MISSION_KINDS: MissionKind[] = [
  { kind: "call_seller", label: "התקשר למוכר", category: "seller_risk", defaultPriority: "high" },
  { kind: "follow_up_buyer", label: "מעקב מול קונה", category: "follow_up", defaultPriority: "medium" },
  { kind: "review_price_reduction", label: "בדוק ירידת מחיר", category: "pricing", defaultPriority: "high" },
  { kind: "investigate_new_listing", label: "בדוק מודעה חדשה", category: "acquisition", defaultPriority: "medium" },
  { kind: "watch_competitor", label: "עקוב אחר מתחרה", category: "competition", defaultPriority: "low" },
  { kind: "prepare_valuation", label: "הכן הערכת שווי", category: "valuation", defaultPriority: "medium" },
  { kind: "create_marketing_draft", label: "טיוטת שיווק", category: "marketing", defaultPriority: "low" },
  { kind: "check_market_exit", label: "בדוק יציאה צפויה מהשוק", category: "seller_risk", defaultPriority: "medium" },
  { kind: "contact_lead", label: "צור קשר עם ליד", category: "follow_up", defaultPriority: "high" },
  { kind: "review_broker_opportunity", label: "בדוק הזדמנות משרד/סוכן", category: "acquisition", defaultPriority: "medium" },
];

const PRIORITIES: ReadonlySet<string> = new Set(["urgent", "high", "medium", "low"]);
const CATEGORIES: ReadonlySet<string> = new Set([
  "acquisition", "pricing", "follow_up", "market_watch", "seller_risk",
  "buyer_match", "competition", "valuation", "marketing", "admin",
]);

export function validateMissionDraft(input: MissionDraftInput): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input.title || !input.title.trim()) errors.push("missing title");
  if (!PRIORITIES.has(input.priority)) errors.push(`invalid priority: ${input.priority}`);
  if (!CATEGORIES.has(input.category)) errors.push(`invalid category: ${input.category}`);
  if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence)) errors.push("invalid confidence");
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) errors.push("no evidence");
  else if (input.evidence.some((e) => !e.source || !e.label)) errors.push("evidence item missing source/label");
  if (!input.relatedEntity) errors.push("missing relatedEntity");
  return { ok: errors.length === 0, errors };
}

/** Dedupe identity: org + source_type + source_id + category + related entity. */
export function dedupeKey(orgId: string, input: Pick<MissionDraftInput, "sourceType" | "sourceId" | "category" | "relatedEntity">): string {
  return [orgId, input.sourceType, input.sourceId ?? "", input.category, input.relatedEntity?.id ?? ""].join("|");
}
