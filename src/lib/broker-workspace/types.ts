// ============================================================================
// 👤 ZONO Broker Personal Workspace™ — types (client-safe). 35.0.
// The per-broker daily operating center. This layer does NOT re-implement any
// engine — it defines the LEAN inputs the pure assembler consumes (mapped from
// the existing org-scoped engines in the server service) and the broker-scoped
// output shape. Broker = the signed-in user; scoping is by owner_id / mission
// owner. Nothing here auto-sends or auto-books.
// ============================================================================

export const BROKER_WORKSPACE_VERSION = "35.0";

export type Impact = "high" | "medium" | "low";
export type EntityKind = "buyer" | "seller" | "lead" | "property";

/** The set of entity ids owned by the current broker (owner_id = brokerUserId). */
export interface OwnedSets {
  buyerIds: string[];
  sellerIds: string[];
  leadIds: string[];
  propertyIds: string[];
}

/** A lean, uniform view of one scored entity (mapped from an agent scorecard). */
export interface ScoredEntity {
  kind: EntityKind;
  id: string;
  name: string;
  healthScore: number | null;      // 0..100
  healthLabel: string | null;
  score: number | null;            // domain score (urgency / zonoScore / conversion)
  stage: string | null;
  reason: string | null;           // next-best-action / why it matters (from engine)
  lastActivityAt: string | null;
  riskLabel: string | null;        // e.g. "churn risk", "stale"
  href: string;                    // deep link to the entity page
}

/** Lean mission (mapped from Mission Engine action center). */
export interface WsMission {
  id: string;
  title: string;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  owner: string | null;
  priority: Impact;
  status: string;
  reason: string | null;
  dueAt: string | null;
}

/** Lean agent-inbox recommendation / pending approval. */
export interface WsInboxItem {
  id: string;
  agentName: string | null;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  recommendation: string;
  reason: string | null;
  impact: Impact;
  confidence: number | null;
  status: string;                  // pending | approved | rejected | blocked
  requiresApproval: boolean;
}

/** Lean active workflow. */
export interface WsWorkflow {
  id: string;
  name: string;
  entityType: string | null;
  entityId: string | null;
  status: string;
}

/** A real calendar meeting (from the meetings table). */
export interface WsMeeting {
  id: string;
  title: string;
  type: string | null;
  status: string | null;
  startAt: string | null;
  endAt: string | null;
  entityLabel: string | null;      // linked buyer/seller/property, if any
}

/** A SUGGESTED calendar item (property_calendar_plans) — never auto-booked. */
export interface WsSuggestedEvent {
  id: string;
  propertyId: string | null;
  title: string;
  planType: string | null;
  suggestedDate: string | null;
  status: string;                  // pending until the broker approves
}

/** A communication the broker should send — draft-only, approval-gated. */
export interface WsCommItem {
  kind: EntityKind;
  entityId: string;
  entityName: string;
  intent: string;                  // first_response | follow_up | update | reengage
  why: string;
  channelHint: "whatsapp" | "message";
  href: string;                    // Communication Studio deep link (draft, not send)
}

// ── Assembled broker workspace ──────────────────────────────────────────────

export interface BrokerDashboard {
  todaysPriorities: WsMission[];
  hotBuyers: ScoredEntity[];
  sellersAtRisk: ScoredEntity[];
  criticalListings: ScoredEntity[];
  leadFollowUps: ScoredEntity[];
  pendingApprovals: WsInboxItem[];
  activeWorkflows: WsWorkflow[];
  upcomingMeetings: WsMeeting[];
}

export interface BrokerBriefingItem { question: string; answer: string; evidence: string[]; targets: { label: string; href: string }[] }
export interface BrokerBriefing { generatedAt: string; items: BrokerBriefingItem[] }

export interface BrokerCalendar {
  upcoming: WsMeeting[];
  suggested: WsSuggestedEvent[];
  note: string;                    // "no automatic booking without approval"
}

export interface BrokerComms {
  items: WsCommItem[];
  note: string;                    // "drafts only — no auto-send"
}

export interface BrokerPerformance {
  activeListings: number;
  activeBuyers: number;
  activeSellers: number;
  leadsHandled: number;
  followUpRatePct: number;         // share of owned people with recent activity
  conversionOpportunities: number; // hot buyers close to closing
  weakSpots: { title: string; detail: string; impact: Impact }[];
}

export interface BrokerWhatsappSummary {
  unread: number; waiting: number; urgent: number; today: number;
  waitingConversations: { id: string; contactName: string; reason: string; href: string; urgency: number }[];
}

export interface BrokerFacebookSummary {
  scheduledToday: number; commentsWaiting: number; leadApprovals: number; groupsToPublish: number;
  tasks: { title: string; detail: string; href: string }[];
}

export interface BrokerWebsiteSummaryLite {
  hasSite: boolean; published: boolean; healthScore: number;
  seoAlerts: number; landingDrafts: number; approvalsPending: number;
  alerts: { title: string; detail: string }[];
}

export interface BrokerWorkspace {
  version: string;
  brokerId: string | null;
  brokerName: string;
  generatedAt: string;
  dashboard: BrokerDashboard;
  briefing: BrokerBriefing;
  calendar: BrokerCalendar;
  comms: BrokerComms;
  inbox: WsInboxItem[];
  performance: BrokerPerformance;
  whatsapp: BrokerWhatsappSummary;
  facebook: BrokerFacebookSummary;
  website: BrokerWebsiteSummaryLite;
  notes: string[];
}

/** Everything the pure assembler needs — mapped from the org engines + DB. */
export interface BrokerWorkspaceInput {
  brokerId: string | null;
  brokerName: string;
  owned: OwnedSets;
  buyers: ScoredEntity[];
  sellers: ScoredEntity[];
  listings: ScoredEntity[];
  leads: ScoredEntity[];
  missions: WsMission[];
  inbox: WsInboxItem[];
  workflows: WsWorkflow[];
  meetings: WsMeeting[];
  suggested: WsSuggestedEvent[];
  whatsapp?: BrokerWhatsappSummary;
  facebook?: BrokerFacebookSummary;
  website?: BrokerWebsiteSummaryLite;
  notes: string[];
  now?: number;
}
