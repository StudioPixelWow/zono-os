// ============================================================================
// 🧠 ZONO — AI Broker Brain — types (pure, client-safe). PHASE 50.0.
// The ACTION brain: a broker states a strategic goal ("הבא לי 10 בלעדיות החודש",
// "יש לי שעתיים פנויות", "איך אני שולט ברחובות מערב", "הגדל סיכוי לסגור עסקה")
// and ZONO returns an evidence-backed plan — priorities, reasons, approval-gated
// actions, calendar proposals, territory targets and success metrics.
//
// It NEVER recomputes metrics. The pure assembler consumes a NORMALIZED context
// (built by the service from existing engines) and composes the plan. Nothing
// auto-executes: every action is approval-gated and labeled.
// ============================================================================

export const BROKER_BRAIN_VERSION = "50.0";

export type BrokerIntent =
  | "exclusive_listings"      // acquire exclusive mandates
  | "free_time"               // "I have N free hours — what should I do?"
  | "close_deal"              // maximize chance of closing this week
  | "territory_domination"    // dominate a neighborhood / city
  | "seller_risk"             // handle sellers at risk of churn
  | "hot_buyer"               // push hot buyers to close
  | "stale_listing"           // revive stuck listings
  | "general";                // fallback → today's priorities

export type Timeframe = "today" | "this_week" | "this_month" | "now" | "any";
export type Impact = "high" | "medium" | "low";

/** The parsed strategic goal (pure router output). */
export interface ClassifiedGoal {
  intent: BrokerIntent;
  timeframe: Timeframe;
  hours: number | null;   // for free_time
  count: number | null;   // for exclusive_listings ("10 בלעדיות")
  city: string | null;    // for territory_domination
  confidence: number;     // 0..100
  matched: string[];      // keywords that fired
}

// ── Normalized context (engine-agnostic; the service maps engines → this) ─────
export interface CtxEntity {
  kind: "buyer" | "seller" | "lead" | "property";
  id: string; name: string;
  score: number | null; reason: string | null; riskLabel: string | null; href: string;
}
export interface CtxRec {
  id: string; title: string; why: string; evidence: string[];
  confidence: number; impact: Impact; urgency: number; source: string;
}
export interface CtxAcquisition {
  kind: string; label: string; city: string | null; score: number;
  priority: Impact; why: string; evidence: string[]; href: string; ctaLabel: string;
}
export interface CtxCalendar {
  date: string; freeAfter: string | null;
  slots: { title: string; when: string | null; reason: string }[];
  overdue: number;
}
export interface BrokerBrainContext {
  orgScore: number | null;
  hotBuyers: CtxEntity[];
  sellersAtRisk: CtxEntity[];
  staleListings: CtxEntity[];
  leadFollowUps: CtxEntity[];
  priorities: CtxRec[];       // Chief-of-Staff briefing.todaysPriorities
  risks: CtxRec[];            // Chief-of-Staff recommendations.topRisks
  opportunities: CtxRec[];    // Chief-of-Staff recommendations.topOpportunities
  territory: {
    city: string | null; score: number | null; band: string | null;
    acquisition: CtxAcquisition[]; recommendations: CtxRec[];
  } | null;
  calendar: CtxCalendar | null;
  marketing: { scheduledToday: number; commentsWaiting: number; leadApprovals: number; groupsToPublish: number } | null;
}

// ── Plan output ───────────────────────────────────────────────────────────────
export interface PlanEntityRef { kind: string; id: string; name: string; href: string }
export interface PlanPriority {
  rank: number; title: string; why: string; evidence: string[];
  confidence: number; impact: Impact; entity: PlanEntityRef | null;
}

export type PlanActionKind =
  | "whatsapp_draft" | "calendar_booking" | "facebook_assist" | "mission"
  | "territory" | "landing" | "marketing" | "review";

/** A bundle resolved by the service from the EXISTING Approval Bundle Engine (44.0). */
export interface ResolvedBundle {
  bundleId: string; title: string; priority: number; status: string;
  actions: { type: string; label: string; requiresApproval: boolean; canExecute: boolean; reason: string }[];
}
export interface PlanActionSlot {
  id: string; label: string; kind: PlanActionKind; targetSystem: string;
  requiresApproval: boolean;   // ALWAYS true — nothing auto-executes
  canExecute: boolean;         // true → creates an approval-gated artifact; false → link/suggestion
  reason: string; evidence: string[];
  href: string | null; entity: PlanEntityRef | null;
  // Filled by the service: which bundle to build, and the resolved bundle.
  bundleRequest: { eventType: string; entityType: string; entityId: string } | null;
  bundle: ResolvedBundle | null;
}

export interface CalendarProposalLite { title: string; suggestion: string; when: string | null; note: string }
export interface SuccessMetric { label: string; target: string; basis: string }
export interface ProgressStep { label: string; done: boolean }
export interface ProgressModel { goalKey: string; steps: ProgressStep[]; completionPct: number; note: string }

/** Client-safe grounding summary: the plan's link to the ONE shared assembler —
 *  provenance counts + partial-context diagnostics (no raw private content). */
export interface BrokerGrounding {
  mode: string;
  contextText: string;                    // permission-safe rendered block (or "")
  provenance: { total: number; explicit: number; derived: number; inferred: number };
  staleCount: number;
  failedLayers: string[];
  truncated: Record<string, number>;
}

export interface BrokerPlan {
  version: string;
  goal: string;
  intent: BrokerIntent;
  timeframe: Timeframe;
  generatedAt: string | null;   // set by the service (kept null in pure assembly)
  headline: string;
  summary: string;
  confidence: number;
  priorities: PlanPriority[];
  actions: PlanActionSlot[];
  calendarProposals: CalendarProposalLite[];
  territoryTargets: CtxAcquisition[];
  metrics: SuccessMetric[];
  progress: ProgressModel;
  reasons: string[];
  hasPlan: boolean;
  notes: string[];
  grounding?: BrokerGrounding | null;   // set by the service from the shared assembler
}

export const APPROVAL_ONLY_NOTE =
  "כל הפעולות בתוכנית דורשות אישור מפורש שלך. זונו מכין ומציע — שום דבר לא נשלח, מתפרסם, מתוזמן או מבוצע אוטומטית.";
