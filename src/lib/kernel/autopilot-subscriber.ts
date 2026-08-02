// ============================================================================
// 🚀 ZONO OS 2.0 — Batch 7 · Event Kernel · Autopilot subscriber (PURE).
// The proactive "deal/lead rescue" consumer of the domain_events outbox. Where
// the automation-subscriber asks "what workflow does this event trigger?", the
// Autopilot subscriber asks a sharper question: "does this event mean a deal,
// lead, seller or transaction step is about to be LOST — or a time-sensitive
// opportunity about to be MISSED — and if so, what is the rescue play and how
// urgent is it?".
//
// It classifies an event into a prioritized RESCUE PROPOSAL:
//   • signal      — the risk/opportunity kind (why this needs rescuing)
//   • severity    — critical | high | medium (rescue-queue ordering)
//   • playbook    — a canonical rescue-play key (the recommended sequence)
//   • slaHours    — how fast the rescue window closes (deadline pressure)
//   • reason      — Hebrew, human-facing line for the broker
//
// HARD RULES (identical spirit to the automation-subscriber):
//   • PURE + deterministic + offline-testable: no I/O, no env, no clock.
//   • NEVER executes. Every proposal is requiresApproval:true — a human runs it.
//     (Consistent with the platform's approval-gated ethos: Marketplace,
//      approval-bundles and automation all propose, never act.)
//   • HONEST: only events that carry a genuine risk/opportunity signal produce a
//     proposal. Everything else returns null (no fabricated urgency). A positive
//     event (deal.won, journey.completed) is never a "rescue".
//   • Stage-change events are only a rescue when the payload PROVES a regression
//     or stall — a forward step is progress, not a risk.
//
// The processor runs this behind the ZONO_AUTOPILOT_ENABLED flag and records the
// proposal in the per-subscriber delivery ledger (metadata), exactly as the
// automation candidate is recorded. Surfacing the queue in the Action Center is
// the next slice; this file is the pure, verifiable brain.
// ============================================================================
import type { DomainEventLike } from "./subscriber";

/** How urgently a rescue must happen — drives queue ordering + SLA countdown. */
export type RescueSeverity = "critical" | "high" | "medium";

/** The canonical rescue plays. NAMES ONLY — nothing here executes. */
export type RescuePlaybook =
  | "speed_to_lead"            // new lead — make first contact inside the golden window
  | "reengage_no_show"         // meeting no-show — re-engage before the lead cools
  | "reschedule_meeting"       // meeting cancelled — offer a new slot immediately
  | "retention_save"           // seller retention risk rose — save the mandate
  | "deal_unstick"             // deal stalled or regressed — targeted un-stick play
  | "winback"                  // deal lost — structured win-back sequence
  | "sla_recovery"             // task overdue — recover the slipped commitment
  | "price_drop_match"         // property price dropped — match to waiting buyers
  | "back_on_market_reapproach"// external listing returned — re-approach the seller
  | "document_recovery"        // document/transaction step failed — recover it
  | "journey_unblock";         // journey blocked — clear the blocker

/** A prioritized, approval-gated rescue proposal (classification only). */
export interface AutopilotRescue {
  /** Stable signal key (why this event needs rescuing). */
  signal:
    | "lead_going_cold" | "no_show" | "meeting_cancelled" | "seller_at_risk"
    | "deal_stalled" | "deal_lost" | "task_overdue" | "price_opportunity"
    | "back_on_market" | "document_failed" | "journey_blocked";
  severity: RescueSeverity;
  playbook: RescuePlaybook;
  /** Hours until the rescue window is effectively closed (deadline pressure). */
  slaHours: number;
  /** Always true — Autopilot proposes; a human approves and runs. */
  requiresApproval: boolean;
  entityType: string;
  entityId: string;
  /** Hebrew, human-facing explanation for the rescue queue. */
  reason: string;
  /** Idempotency key for any downstream surfacing (the domain event id). */
  dedupKey: string;
}

interface Rule {
  signal: AutopilotRescue["signal"];
  severity: RescueSeverity;
  playbook: RescuePlaybook;
  slaHours: number;
  reason: string;
}

// ── Signals that are ALWAYS a rescue the moment they occur ──────────────────
// (No payload inspection needed — the event type alone proves risk/opportunity.)
const DIRECT_RULES: Record<string, Rule> = {
  "lead.created": {
    signal: "lead_going_cold", severity: "high", playbook: "speed_to_lead", slaHours: 1,
    reason: "ליד חדש — צור קשר בתוך שעת הזהב לפני שהעניין מתקרר",
  },
  "meeting.no_show": {
    signal: "no_show", severity: "high", playbook: "reengage_no_show", slaHours: 4,
    reason: "אי-הגעה לפגישה — סיכון להתנתקות; פנייה חוזרת מיידית",
  },
  "meeting.cancelled": {
    signal: "meeting_cancelled", severity: "medium", playbook: "reschedule_meeting", slaHours: 12,
    reason: "הפגישה בוטלה — הצע מועד חלופי לפני שהמומנטום אובד",
  },
  "seller.risk_changed": {
    signal: "seller_at_risk", severity: "critical", playbook: "retention_save", slaHours: 6,
    reason: "סיכון שימור המוכר עלה — פעולת שימור לפני נטישת המנדט",
  },
  "task.overdue": {
    signal: "task_overdue", severity: "high", playbook: "sla_recovery", slaHours: 4,
    reason: "משימה באיחור — התחייבות ללקוח מחליקה; שחזור SLA",
  },
  "deal.lost": {
    signal: "deal_lost", severity: "medium", playbook: "winback", slaHours: 72,
    reason: "עסקה אבדה — הפעל רצף win-back מובנה לשימור הקשר",
  },
  "property.price_changed": {
    signal: "price_opportunity", severity: "high", playbook: "price_drop_match", slaHours: 8,
    reason: "מחיר הנכס ירד — התאם לקונים ממתינים לפני המתחרים",
  },
  "external_listing.returned": {
    signal: "back_on_market", severity: "medium", playbook: "back_on_market_reapproach", slaHours: 24,
    reason: "נכס חזר לשוק — הזדמנות לפנייה מחודשת למוכר",
  },
  "document.failed": {
    signal: "document_failed", severity: "high", playbook: "document_recovery", slaHours: 6,
    reason: "שלב מסמך/עסקה נכשל — שחזור לפני שהעסקה נתקעת",
  },
  "journey.blocked": {
    signal: "journey_blocked", severity: "critical", playbook: "journey_unblock", slaHours: 8,
    reason: "המסע נחסם — הסר את החסם לפני שהעסקה תוקעת",
  },
};

// Deal/buyer stage-change stall rules — ONLY fire when the payload proves the
// stage went backward or the journey is explicitly stalled. A forward step is
// progress and returns null (honest — no fabricated "rescue" on good news).
const STALL_EVENT_TYPES = new Set(["deal.stage_changed", "buyer.stage_changed", "lead.stage_changed"]);

/** True only when the payload carries explicit evidence of regression/stall. */
function provesStall(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (payload.regressed === true || payload.stalled === true) return true;
  // Numeric stage ordinals present and moving backward → regression.
  const from = payload.from_ordinal ?? payload.fromOrdinal;
  const to = payload.to_ordinal ?? payload.toOrdinal;
  if (typeof from === "number" && typeof to === "number" && to < from) return true;
  // An explicit direction hint.
  if (typeof payload.direction === "string" && payload.direction.toLowerCase() === "backward") return true;
  return false;
}

/**
 * Classify a domain event into a prioritized rescue proposal, or null when the
 * event carries no rescue-worthy signal. Deterministic: same input → same output.
 * Pure: no I/O, no env, no clock — the SLA is a duration, not a timestamp.
 */
export function projectEventToAutopilotRescue(evt: DomainEventLike): AutopilotRescue | null {
  if (!evt.id || !evt.organization_id || !evt.entity_type || !evt.entity_id) return null;

  const direct = DIRECT_RULES[evt.event_type];
  if (direct) {
    return {
      signal: direct.signal,
      severity: direct.severity,
      playbook: direct.playbook,
      slaHours: direct.slaHours,
      requiresApproval: true,
      entityType: evt.entity_type,
      entityId: evt.entity_id,
      reason: direct.reason,
      dedupKey: evt.id,
    };
  }

  if (STALL_EVENT_TYPES.has(evt.event_type) && provesStall(evt.payload)) {
    return {
      signal: "deal_stalled",
      severity: "high",
      playbook: "deal_unstick",
      slaHours: 12,
      requiresApproval: true,
      entityType: evt.entity_type,
      entityId: evt.entity_id,
      reason: "השלב נסוג לאחור — פעולת חילוץ ממוקדת להחזרת התנופה",
      dedupKey: evt.id,
    };
  }

  return null;
}
