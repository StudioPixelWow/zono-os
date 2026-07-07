// ============================================================================
// 🏢 ZONO — Office AI Manager — types (pure, client-safe). PHASE 55.0.
// One operational command center for office managers, COMPOSED from existing
// engines (Executive OS, Calendar team availability, CRM ownership, Approval
// Bundles) — it never recomputes their scores. Surfaces: morning briefing, per-
// broker workload/capacity, follow-up compliance, risk-by-broker, delegation
// SUGGESTIONS (approval-gated, never auto-assigned) and the approval center.
// ============================================================================

export const OFFICE_MANAGER_VERSION = "55.0";

export type AvailabilityState = "free" | "busy" | "meeting" | "field" | "vacation" | "offline";
export type WorkloadLevel = "low" | "balanced" | "high" | "overloaded";

export const AVAIL_HE: Record<AvailabilityState, string> = {
  free: "פנוי", busy: "עסוק", meeting: "בפגישה", field: "בשטח", vacation: "בחופשה", offline: "לא פעיל",
};
export const WORKLOAD_HE: Record<WorkloadLevel, string> = { low: "עומס נמוך", balanced: "מאוזן", high: "עומס גבוה", overloaded: "עומס יתר" };

/** Normalized per-broker input (the service maps existing engines → this). */
export interface BrokerInput {
  id: string; name: string;
  score: number | null; scoreLabel: string | null; note: string | null;
  state: AvailabilityState;
  todayEvents: number;
  nextFreeAt: string | null;
  activeBuyers: number; activeSellers: number; openLeads: number;
  sellersAtRisk: number; hotBuyers: number;
  lastActiveAt: string | null;
}

export interface OfficeInput {
  brokers: BrokerInput[];
  teamFollowUpRatePct: number | null;
  losingMoney: string[];           // org-level "where the office is losing money" signals
  orgScore: number | null;
  approvals: { count: number; bundles: { title: string; priority: number; href: string | null }[] };
  generatedAt?: string | null;
}

// ── Output ────────────────────────────────────────────────────────────────────
export interface BrokerCard {
  id: string; name: string; score: number | null; scoreLabel: string | null; note: string | null;
  state: AvailabilityState; stateHe: string;
  workloadLevel: WorkloadLevel; workloadHe: string; workloadScore: number;
  todayEvents: number; activeBuyers: number; activeSellers: number; openLeads: number;
  sellersAtRisk: number; hotBuyers: number;
  isOverloaded: boolean; isInactive: boolean; isOnVacation: boolean; hasCapacity: boolean;
  followUpConcern: boolean;
  flags: string[];
}

export interface DelegationSuggestion {
  fromBrokerId: string; fromName: string;
  toBrokerId: string | null; toName: string | null;  // null when no broker has capacity
  item: string; reason: string;
  requiresApproval: true;   // ALWAYS — nothing is auto-assigned
  autoAssign: false;        // explicit: manager assigns manually
}

export interface OfficeBriefing {
  headline: string;
  needsHelp: { name: string; reason: string }[];
  overloaded: { name: string; workloadHe: string }[];
  todayFocus: string;
  losingMoney: string[];
}

export interface FollowUpCompliance {
  teamRatePct: number | null;
  brokersAtRisk: { name: string; openLeads: number }[];
  note: string;
}

export interface RiskByBroker { name: string; sellersAtRisk: number; hotBuyers: number; openLeads: number }

export interface VacationView { onVacation: { name: string; state: string }[]; note: string }

export interface OfficeManagerReport {
  version: string; generatedAt: string | null;
  orgScore: number | null;
  briefing: OfficeBriefing;
  brokers: BrokerCard[];
  delegations: DelegationSuggestion[];
  followUp: FollowUpCompliance;
  riskByBroker: RiskByBroker[];
  vacation: VacationView;
  approvals: { count: number; bundles: { title: string; priority: number; href: string | null }[] };
  totals: { brokers: number; overloaded: number; inactive: number; onVacation: number };
  hasData: boolean;
  notes: string[];
}

export const NO_AUTO_ASSIGN_NOTE =
  "ZONO ממליץ בלבד — אף משימה, ליד או לקוח לא מוקצה אוטומטית לסוכן. כל האצלה או שינוי שיוך מתבצע על ידך, לאחר אישור מפורש.";
