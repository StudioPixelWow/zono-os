// ============================================================================
// 🕸️ ZONO Multi-Agent Orchestrator™ — types (pure). 29.8.
// ----------------------------------------------------------------------------
// Coordinates every ZONO AI agent. Agents no longer act alone — the Orchestrator
// turns their scorecards into an internal EVENT BUS, routes events to subscribed
// agents, reasons ACROSS agents to form OPPORTUNITY CHAINS (hot buyer + ready
// seller + healthy listing = potential deal), prioritizes competing actions,
// resolves conflicts, merges playbooks into one execution plan and renders a
// Multi-Agent Dashboard. CONSUMES the existing agent scorecards read-only — no
// agent/engine modified, no business logic duplicated. Everything stays
// approval-gated; NOTHING auto-executes. Evidence-only.
// ============================================================================
export const AGENT_ORCHESTRATOR_VERSION = "29.8";
export type Impact = "high" | "medium" | "low";
export type AgentId = "listing" | "buyer" | "seller" | "lead" | "office" | "chief_of_staff";
export const AGENT_HE: Record<AgentId, string> = {
  listing: "סוכן מודעות", buyer: "סוכן קונים", seller: "סוכן מוכרים", lead: "סוכן לידים", office: "סוכן צמיחת המשרד", chief_of_staff: "צ׳יף אוף סטאף",
};

// ── Part 1 — the event bus vocabulary ───────────────────────────────────────
export type EventType =
  | "BUYER_HOT" | "BUYER_READY_TO_CLOSE" | "SELLER_HIGH_CHURN" | "SELLER_READY_TO_SIGN"
  | "LISTING_STALE" | "LISTING_CRITICAL" | "PROPERTY_OVERPRICED" | "LEAD_DUPLICATED"
  | "MISSION_COMPLETED" | "BROKER_INACTIVE" | "TERRITORY_CHANGED" | "MARKET_SHIFTED";
export const EVENT_HE: Record<EventType, string> = {
  BUYER_HOT: "קונה נהיה חם", BUYER_READY_TO_CLOSE: "קונה מוכן לסגירה", SELLER_HIGH_CHURN: "מוכר בסיכון נטישה", SELLER_READY_TO_SIGN: "מוכר מוכן לחתימה",
  LISTING_STALE: "נכס מתיישן", LISTING_CRITICAL: "נכס במצב קריטי", PROPERTY_OVERPRICED: "נכס מתומחר יתר", LEAD_DUPLICATED: "ליד כפול",
  MISSION_COMPLETED: "משימה הושלמה", BROKER_INACTIVE: "מתווך לא פעיל", TERRITORY_CHANGED: "שינוי טריטוריה", MARKET_SHIFTED: "תזוזת שוק",
};

export interface AgentEvent {
  id: string; type: EventType; source: AgentId;
  entityType: string; entityId: string; entityName: string; propertyId: string | null;
  summary: string; impact: Impact; confidence: number; truth: number; urgency: number;
}

// ── Part 2 — subscriptions ──────────────────────────────────────────────────
export interface CrossAgentReaction { eventId: string; eventType: EventType; subscriber: AgentId; reaction: string; why: string }

// ── Part 4 + 8 — opportunity chains ─────────────────────────────────────────
export type ChainType = "potential_deal" | "buyer_listing_match" | "reengage_stale" | "defend_market" | "capacity_reallocation";
export interface ChainLink { agent: AgentId; role: string; entityType: string; entityId: string; entityName: string }
export interface OpportunityChain {
  id: string; type: ChainType; title: string;
  links: ChainLink[];
  opportunityScore: number; confidence: number; businessImpact: Impact;
  requiredApprovals: string[]; why: string; evidence: string[];
}

// ── Part 5 — priority engine ────────────────────────────────────────────────
export interface PriorityItem {
  id: string; kind: "opportunity" | "recommendation"; title: string;
  sources: AgentId[]; impact: Impact; urgency: number; truth: number; confidence: number;
  dependencies: string[]; priorityScore: number; why: string;
}

// ── Part 7 — conflict resolution ────────────────────────────────────────────
export type Stance = "wait" | "proceed" | "hold" | "sell_now" | "reduce_price" | "keep";
export const STANCE_HE: Record<Stance, string> = {
  wait: "המתן", proceed: "התקדם", hold: "החזק", sell_now: "מכור עכשיו", reduce_price: "הורד מחיר", keep: "שמור מחיר",
};
export interface ConflictPosition { agent: AgentId; stance: Stance; action: string; why: string; weight: number }
export interface Conflict {
  id: string; entityLabel: string; propertyId: string | null;
  positions: ConflictPosition[];
  resolution: { winner: AgentId; action: string; why: string }; confidence: number;
}

// ── Part 6 — orchestrated (merged) playbooks ────────────────────────────────
export interface PlanStep { order: number; action: string; missionType: string; owner: AgentId; durationDays: number | null; why: string }
export interface ExecutionPlan { id: string; chainId: string | null; title: string; steps: PlanStep[]; requiredApprovals: string[]; note: string }

// ── Part 9 — dashboard ──────────────────────────────────────────────────────
export interface OrchestratorDashboard {
  version: string; generatedAt: string;
  events: AgentEvent[]; reactions: CrossAgentReaction[];
  opportunities: OpportunityChain[]; priorityQueue: PriorityItem[];
  conflicts: Conflict[]; executionPlans: ExecutionPlan[];
  totals: { events: number; opportunities: number; potentialDeals: number; conflicts: number; plans: number; highPriority: number };
  notes: string[];
}

// ── Normalized input (assembled by the service from every agent scorecard) ──
export interface OBuyer { id: string; name: string; hot: boolean; closing: boolean; strategy: string; stance: Stance; impact: Impact; confidence: number; truth: number; matchListingIds: string[] }
export interface OSeller { id: string; name: string; ready: boolean; atRisk: boolean; priceIssue: boolean; strategy: string; stance: Stance; impact: Impact; confidence: number; truth: number; propertyId: string | null; propertyHealthy: boolean; marketScore: number | null; matchingBuyerIds: string[] }
export interface OListing { id: string; name: string; city: string | null; stale: boolean; critical: boolean; healthy: boolean; overpriced: boolean; strategy: string; stance: Stance; impact: Impact; confidence: number; truth: number }
export interface OLead { id: string; name: string; duplicate: boolean; hot: boolean; convertReady: boolean; routing: string }
export interface ODecision { type: string; title: string; impact: Impact; why: string }
export interface OOffice { name: string; strategy: string; strategyHe: string; confidence: number; marketShiftPct: number; territoryChanged: boolean; inactiveBrokers: string[]; decisions: ODecision[]; risks: { title: string; severity: Impact }[]; missionsCompleted: number }
export interface OrchestratorInput {
  buyers: OBuyer[]; sellers: OSeller[]; listings: OListing[]; leads: OLead[]; office: OOffice | null;
}
