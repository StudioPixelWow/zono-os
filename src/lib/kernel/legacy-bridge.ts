// ============================================================================
// 🌉 ZONO OS 2.0 — Stage 2 · Legacy timeline bridge (PURE).
// Projects historical rows from EXISTING source ledgers into the canonical
// activity timeline WITHOUT deleting or duplicating those ledgers. We only bring
// forward user-facing MILESTONES (not raw channel history) for records that
// predate the Event Kernel. Each bridged row gets a DETERMINISTIC synthetic
// event_id (md5→uuid of a stable seed) so it flows through the same idempotency
// unique index as kernel projections — re-running the backfill can never create
// a duplicate. Pure + deterministic + offline-testable; the service does the I/O.
// ============================================================================
import { createHash } from "crypto";
import type { TimelineVisibility } from "./subscriber";

/** A ready-to-insert activity_events row bridged from a legacy source. */
export interface BridgedProjection {
  org_id: string;
  event_id: string;                    // deterministic synthetic id (idempotency)
  event_type: string;
  entity_type: string;
  entity_id: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  title: string;
  description: string | null;
  actor_user_id: string | null;
  occurred_at: string;
  visibility: TimelineVisibility;
  source: "backfill";
  metadata: Record<string, unknown>;
}

/** Deterministic uuid-shaped id from a stable seed (idempotent backfill key). */
export function syntheticEventId(seed: string): string {
  const h = createHash("md5").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ── Legacy `activities` (buyer_id/seller_id/lead_id/property_id/deal_id + type) ──
const ACTIVITY_TITLES: Record<string, string> = {
  status_change: "שינוי סטטוס",
  note: "הערה נוספה",
  call: "שיחת טלפון",
  email: "אימייל",
  meeting: "פגישה",
  task: "משימה",
  whatsapp: "וואטסאפ",
};

/** Resolve the primary subject of a legacy activities row from its entity FKs. */
function activitySubject(row: Record<string, unknown>): { type: string; id: string } | null {
  const candidates: [string, string][] = [
    ["property", "property_id"], ["buyer", "buyer_id"], ["seller", "seller_id"],
    ["lead", "lead_id"], ["deal", "deal_id"],
  ];
  for (const [type, col] of candidates) {
    const id = str(row[col]);
    if (id) return { type, id };
  }
  return null;
}

export interface LegacyActivityRow {
  id: string; org_id: string; actor_id: string | null; type: string | null;
  subject: string | null; body: string | null; occurred_at: string | null;
  buyer_id: string | null; seller_id: string | null; lead_id: string | null;
  property_id: string | null; deal_id: string | null;
}

export function bridgeLegacyActivity(row: LegacyActivityRow): BridgedProjection | null {
  if (!row.org_id || !row.id) return null;
  const subject = activitySubject(row as unknown as Record<string, unknown>);
  if (!subject) return null; // unresolved entity link — caller counts it
  const type = row.type ?? "note";
  const title = str(row.subject) ?? ACTIVITY_TITLES[type] ?? "פעילות";
  return {
    org_id: row.org_id,
    event_id: syntheticEventId(`activities:${row.id}:${subject.type}:${subject.id}`),
    event_type: `legacy.${type}`,
    entity_type: subject.type,
    entity_id: subject.id,
    related_entity_type: null,
    related_entity_id: null,
    title,
    description: str(row.body),
    actor_user_id: str(row.actor_id),
    occurred_at: row.occurred_at ?? new Date(0).toISOString(),
    visibility: "internal",
    source: "backfill",
    metadata: { bridgedFrom: "activities", legacyId: row.id, legacyType: type },
  };
}

// ── `journey_events` (entity_type/entity_id + from/to stage) ──────────────────
export interface JourneyEventRow {
  id: string; org_id: string; journey_id: string | null;
  entity_type: string | null; entity_id: string | null;
  event_type: string | null; from_stage: string | null; to_stage: string | null;
  title: string | null; detail: string | null; occurred_at: string | null;
}

export function bridgeJourneyEvent(row: JourneyEventRow): BridgedProjection | null {
  if (!row.org_id || !row.id || !row.entity_type || !row.entity_id) return null;
  const stage = row.to_stage ? (row.from_stage ? `${row.from_stage} ← ${row.to_stage}` : row.to_stage) : null;
  return {
    org_id: row.org_id,
    event_id: syntheticEventId(`journey_events:${row.id}`),
    event_type: `journey.${row.event_type ?? "event"}`,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    related_entity_type: row.journey_id ? "journey" : null,
    related_entity_id: row.journey_id,
    title: str(row.title) ?? "אירוע במסע הלקוח",
    description: str(row.detail) ?? stage,
    actor_user_id: null, // journey_events has no actor
    occurred_at: row.occurred_at ?? new Date(0).toISOString(),
    visibility: "internal",
    source: "backfill",
    metadata: { bridgedFrom: "journey_events", legacyId: row.id },
  };
}

// ── `document_audit_logs` (document milestones onto the document's timeline) ──
const DOC_MILESTONES = new Set(["sent", "viewed", "signed", "completed", "failed", "approved"]);
const DOC_TITLES: Record<string, string> = {
  sent: "מסמך נשלח", viewed: "מסמך נצפה", signed: "מסמך נחתם",
  completed: "מסמך הושלם", failed: "טיפול במסמך נכשל", approved: "מסמך אושר",
};

export interface DocumentAuditRow {
  id: string; organization_id: string; document_id: string | null;
  event: string | null; detail: string | null; actor_user_id: string | null;
  created_at: string | null;
}

export function bridgeDocumentAudit(row: DocumentAuditRow): BridgedProjection | null {
  if (!row.organization_id || !row.id || !row.document_id) return null;
  const ev = (row.event ?? "").toLowerCase();
  if (!DOC_MILESTONES.has(ev)) return null; // only user-facing milestones, not raw audit noise
  return {
    org_id: row.organization_id,
    event_id: syntheticEventId(`document_audit_logs:${row.id}`),
    event_type: `document.${ev}`,
    entity_type: "document",
    entity_id: row.document_id,
    related_entity_type: null,
    related_entity_id: null,
    title: DOC_TITLES[ev] ?? "אירוע מסמך",
    description: str(row.detail),
    actor_user_id: str(row.actor_user_id),
    occurred_at: row.created_at ?? new Date(0).toISOString(),
    visibility: "internal",
    source: "backfill",
    metadata: { bridgedFrom: "document_audit_logs", legacyId: row.id },
  };
}
