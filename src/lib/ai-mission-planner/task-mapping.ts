// ============================================================================
// 🔁 Mission draft → CRM task mapping (pure). Phase 27.5.
// ----------------------------------------------------------------------------
// Deterministic, side-effect-free. Decides whether a draft may convert and maps
// it onto the EXISTING tasks table shape. Creating a task is the ONLY allowed
// side effect (performed in conversion.ts) — nothing here sends/changes anything.
// ============================================================================
import type { MissionDraft, MissionPriority } from "./types";
import type { TaskPriority } from "@/lib/supabase/types";

export interface ConversionVerdict { ok: boolean; reason?: string }

/** A draft may convert only when approved, not already converted, with evidence. */
export function evaluateConversion(draft: Pick<MissionDraft, "status" | "convertedTaskId" | "evidence">): ConversionVerdict {
  if (draft.status === "converted" && draft.convertedTaskId) return { ok: false, reason: "already_converted" };
  if (draft.status !== "approved") return { ok: false, reason: "not_approved" };
  if (!Array.isArray(draft.evidence) || draft.evidence.length === 0) return { ok: false, reason: "no_evidence" };
  return { ok: true };
}

// Mission priority ↔ existing task priority (1:1).
export function mapPriority(p: MissionPriority): TaskPriority { return p; }

const DAY = 86_400_000;
/** Optional due date by priority. urgent→today, high→+1d, medium→+3d, low→+7d. */
export function mapDueDate(p: MissionPriority, now: Date = new Date()): string {
  const offset = p === "urgent" ? 0 : p === "high" ? 1 : p === "medium" ? 3 : 7;
  return new Date(now.getTime() + offset * DAY).toISOString();
}

const DISCLAIMER = "נוצר מטיוטת משימה מבוססת ראיות. לא בוצעה פעולה אוטומטית.";

/** Compose the task description: summary + action + outcome + evidence + disclaimer. */
export function buildTaskDescription(draft: MissionDraft): string {
  const parts: string[] = [];
  if (draft.summary) parts.push(draft.summary);
  if (draft.recommendedAction) parts.push(`פעולה מומלצת: ${draft.recommendedAction}`);
  if (draft.expectedOutcome) parts.push(`תוצאה צפויה: ${draft.expectedOutcome}`);
  if (draft.evidence.length) {
    const ev = draft.evidence.map((e) => `• ${e.label}${e.value ? `: ${e.value}` : ""} (${e.source})`).join("\n");
    parts.push(`ראיות:\n${ev}`);
  }
  parts.push(`— ${DISCLAIMER}`);
  return parts.join("\n\n");
}

const CRM_FK_BY_TYPE: Record<string, "property_id" | "buyer_id" | "seller_id" | "lead_id" | "deal_id"> = {
  property: "property_id", buyer: "buyer_id", seller: "seller_id", lead: "lead_id", deal: "deal_id",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fields to insert into the existing tasks table (excluding org/created_by). */
export interface TaskInsertFields {
  title: string;
  description: string;
  priority: TaskPriority;
  status: "todo";
  due_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  impact_score: number | null;
  intelligence_source: string;
  property_id?: string;
  buyer_id?: string;
  seller_id?: string;
  lead_id?: string;
  deal_id?: string;
}

export function buildTaskFromDraft(draft: MissionDraft, now: Date = new Date()): TaskInsertFields {
  const fields: TaskInsertFields = {
    title: draft.title.trim(),
    description: buildTaskDescription(draft),
    priority: mapPriority(draft.priority),
    status: "todo",
    due_at: mapDueDate(draft.priority, now),
    entity_type: draft.relatedEntity.type,
    entity_id: draft.relatedEntity.id,
    related_entity_type: draft.relatedEntity.type,
    related_entity_id: draft.relatedEntity.id,
    impact_score: Number.isFinite(draft.confidence) ? Math.round(draft.confidence) : null,
    intelligence_source: "ai_mission_planner",
  };
  // Link a real CRM FK only when the entity type is a CRM type AND the id is a UUID.
  const type = draft.relatedEntity.type ?? "";
  const id = draft.relatedEntity.id ?? "";
  const fk = CRM_FK_BY_TYPE[type];
  if (fk && UUID_RE.test(id)) fields[fk] = id;
  return fields;
}
