// ============================================================================
// ☀️ ZONO Daily AI Operating System™ — types (client-safe). 40.0.
// The new default workspace: ONE daily operating system that RE-FRAMES the
// existing BrokerWorkspace (which already composes missions/inbox/whatsapp/
// facebook/website/territory/performance) into a briefing + merged timeline +
// unified ranked action feed + conversation/territory/marketing/deals/approvals,
// plus an executive mode from the Chief-of-Staff. No new engine, no schema.
// ============================================================================
import type { WsCommItem, ScoredEntity, BrokerTerritoryLite } from "@/lib/broker-workspace/types";

export const DAILY_OS_VERSION = "40.0";
export type Impact = "high" | "medium" | "low";

export interface DailyBriefing {
  greeting: string;
  dailyScore: number;
  focus: string;
  biggestOpportunity: { label: string; detail: string; href: string } | null;
  biggestRisk: { label: string; detail: string; href: string } | null;
  aiSummary: string;
}

export type TimelineSource = "meeting" | "mission" | "suggested";
export interface TimelineItem { at: string; source: TimelineSource; title: string; detail: string | null; icon: string; href: string }

/**
 * Batch 5.6F — the Daily ranked action.
 *
 * This is a CANONICAL Broker Intelligence recommendation, scheduled. Daily OS
 * may format and time-box it; it may NOT decide what matters. Every canonical
 * field below is carried through verbatim so the recommendation's identity,
 * evidence and provenance survive scheduling — Home / Agenda / Attention /
 * ⌘K all show the same item with the same reasons.
 *
 * Retired with the shadow engine: `kind: ActionKind` (a hand-rolled taxonomy)
 * and `priority: Impact` (a 3-level guess). The canonical `actionClass` and the
 * canonical 0..100 `priority` replace them.
 */
export interface DailyAction {
  /** Canonical recommendation id. */
  id: string;
  /** Stable cross-reload identity (entityType:entityId:actionClass) — what
   *  lifecycle decisions are persisted against. */
  recKey: string;
  /** Which intelligence engine produced it (acquisition/buyer/seller/deal/journey). */
  area: string;
  entityType: string;
  entityId: string;
  title: string;
  why: string;
  evidence: { label: string; source: string; weight?: number }[];
  confidence: number;
  /** Canonical 0..100 business-impact priority. THE ranking authority. */
  priority: number;
  urgency: "critical" | "high" | "medium" | "low";
  expectedImpact: string;
  suggestedAction: string;
  /** Structural action class — also the dedupe/scheduling key. */
  actionClass: string;
  /** How many engines corroborated this action. */
  mergedCount: number;
  contributingSources: string[];
  learningAdjustment?: number;
  /** Persisted lifecycle decision (accepted = in progress). Dismissed/snoozed/
   *  completed items never reach here — the shared queue already removed them. */
  lifecycle: { action: string; at: string; snoozeUntil?: string | null } | null;
  href: string | null;
  // ── Daily OS additions (scheduling/display only — never ranking) ───────────
  startTime: string | null;
  endTime: string | null;
  durationMin: number | null;
  /** FALSE when the action didn't fit the workday window (honest overflow). */
  scheduled: boolean;
}

/**
 * Batch 5.6F — work that is REAL but has no canonical Recommendation behind it.
 * Deliberately kept OUT of the ranked feed: it must never compete with
 * evidence-backed intelligence for "the one thing". Each is classified so the
 * gap is registered rather than hidden.
 */
export type OperationClass =
  | "operational_reminder"
  | "calendar_item"
  | "system_status"
  | "unsupported_legacy_suggestion";
export type OperationKind = "approve" | "reply_whatsapp" | "draft" | "facebook" | "mission" | "acquisition_street";
export interface OperationItem {
  id: string;
  title: string;
  kind: OperationKind;
  classification: OperationClass;
  why: string;
  href: string;
}

/**
 * Batch 5.6F — "בזמן שלא היית". PERSISTED FACTS ONLY.
 * Sourced from the domain_events ledger — what actually happened. Never derived
 * from the recommendation queue, because a recommendation is not an event: it
 * describes what SHOULD happen, not what DID. Claiming otherwise would tell the
 * broker ZONO did work it never did.
 */
export interface ActivityFact {
  at: string;
  eventType: string;
  entityType: string;
  entityId: string | null;
  label: string;
}

export interface DailyConversation {
  whatsappUnread: number; whatsappWaiting: number; facebookComments: number; facebookLeads: number;
  waiting: { name: string; reason: string; href: string }[];
  drafts: WsCommItem[];
}

export interface DailyMarketing { scheduledToday: number; commentsWaiting: number; leadApprovals: number; groupsToPublish: number; tasks: { title: string; detail: string; href: string }[] }

export interface DailyDeals { hotBuyers: ScoredEntity[]; sellersAtRisk: ScoredEntity[]; criticalListings: ScoredEntity[]; leadFollowUps: ScoredEntity[] }

export interface DailyPerformance {
  daily: number; weekly: number; conversionOpportunities: number; followUpRatePct: number;
  weakSpots: { title: string; detail: string; impact: Impact }[];
}

export interface ApprovalItem { id: string; title: string; why: string; source: string; href: string }

export interface DailyOS {
  version: string;
  brokerName: string;
  generatedAt: string;
  briefing: DailyBriefing;
  timeline: TimelineItem[];
  /** Batch 5.6F — THE ranked feed. Canonical Broker Intelligence queue items,
   *  scheduled. Daily OS does not rank; it schedules. Zero items is a valid,
   *  honest state (nothing is evidence-backed right now). */
  actionFeed: DailyAction[];
  /** Batch 5.6F — real work with no canonical Recommendation behind it. Kept
   *  OUT of the ranked feed so it can never become "the one thing". */
  operations: OperationItem[];
  /** Batch 5.6F — "בזמן שלא היית": persisted domain events only. */
  sinceYouWereAway: ActivityFact[];
  conversation: DailyConversation;
  territory: BrokerTerritoryLite;
  marketing: DailyMarketing;
  deals: DailyDeals;
  performance: DailyPerformance;
  approvals: ApprovalItem[];
  ask: string[];
  notes: string[];
  grounding?: DailyGrounding | null;   // shared-assembler grounding (set by the service)
}

/** Client-safe grounding the Daily OS narrative (Morning Voice / The One Thing) is
 *  traceable to — provenance counts + partial-context diagnostics from the ONE
 *  assembler. Mirrors ai-context GroundedSummary (kept local to avoid a server import). */
export interface DailyGrounding {
  mode: string;
  contextText: string;
  provenance: { total: number; explicit: number; derived: number; inferred: number };
  staleCount: number;
  failedLayers: string[];
  truncated: Record<string, number>;
}

// ── Executive mode (office managers) — mapped from the Chief-of-Staff ────────
export interface ExecRecLean { title: string; why: string; evidence: string[]; impact: Impact; urgency: number }
export interface ExecInsightLean { title: string; recommendation: string; modules: string[]; impact: Impact }
export interface ExecInput {
  orgScore: { overall: number; growth: number; execution: number; coverage: number; competitivePosition: number; confidence: number };
  priorities: ExecRecLean[]; risks: ExecRecLean[]; opportunities: ExecRecLean[];
  insights: ExecInsightLean[]; notes: string[];
}
export interface ExecutiveDaily {
  version: string; generatedAt: string;
  orgScore: ExecInput["orgScore"];
  officeHealth: "strong" | "fair" | "weak";
  priorities: ExecRecLean[]; risks: ExecRecLean[]; opportunities: ExecRecLean[]; insights: ExecInsightLean[];
  notes: string[];
}
