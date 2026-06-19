/**
 * Unified activity layer — client-safe shared types (no server imports).
 *
 * event_type / entity_type are open text in the DB; these constants document
 * the vocabulary and power the UI (icons, labels). New modules add values
 * without a migration.
 */
import type { Database } from "@/lib/supabase/types";

export type ActivityEventRow = Database["public"]["Tables"]["activity_events"]["Row"];
export type RelationshipRow = Database["public"]["Tables"]["entity_relationships"]["Row"];

export type EntityType =
  | "property"
  | "buyer"
  | "seller"
  | "lead"
  | "deal"
  | "task"
  | "meeting"
  | "document"
  | "organization";

/** Known event types (open set — strings beyond these are allowed). */
export const EVENT_TYPES = {
  propertyCreated: "property.created",
  propertyUpdated: "property.updated",
  propertyStageChanged: "property.stage_changed",
  propertyIntelligenceInitialized: "property.intelligence_initialized",
  propertyScoreChanged: "property.score_changed",
  propertyRiskCreated: "property.risk_created",
  propertyLeverCreated: "property.lever_created",
  propertyMissionCreated: "property.mission_created",
  taskCreated: "task.created",
  taskCompleted: "task.completed",
  meetingScheduled: "meeting.scheduled",
  noteCreated: "note.created",
  documentSent: "document.sent",
  documentOpened: "document.opened",
  sellerTouchpointCreated: "seller.touchpoint.created",
  buyerInteractionCreated: "buyer.interaction.created",
  propertyFileSent: "property.file_sent",
  propertyVisitScheduled: "property.visit_scheduled",
  propertyVisitCompleted: "property.visit_completed",
  calendarSuggestionCreated: "calendar.suggestion_created",
  offerCreated: "offer.created",
  statusChanged: "status.changed",
  scoreChanged: "score.changed",
  // Reserved for future Buyer Intelligence (supported, not yet emitted):
  buyerCreated: "buyer.created",
  buyerQualified: "buyer.qualified",
  buyerPreferenceUpdated: "buyer.preference_updated",
  buyerPropertyFileSent: "buyer.property_file_sent",
  buyerPropertyViewed: "buyer.property_viewed",
  buyerVisitScheduled: "buyer.visit_scheduled",
  buyerVisitCompleted: "buyer.visit_completed",
  buyerFeedbackReceived: "buyer.feedback_received",
  buyerOfferCreated: "buyer.offer_created",
  buyerLost: "buyer.lost",
} as const;

/** Known relationship types (open set). */
export const RELATIONSHIP_TYPES = {
  sellerOwnsProperty: "seller_owns_property",
  agentAssignedToProperty: "agent_assigned_to_property",
  buyerInterestedInProperty: "buyer_interested_in_property",
  buyerViewedProperty: "buyer_viewed_property",
  buyerVisitedProperty: "buyer_visited_property",
  buyerRejectedProperty: "buyer_rejected_property",
  buyerLikedProperty: "buyer_liked_property",
  buyerSentOffer: "buyer_sent_offer",
  sellerReceivedReport: "seller_received_report",
  documentRelatedToProperty: "document_related_to_property",
  taskRelatedToProperty: "task_related_to_property",
  meetingRelatedToBuyer: "meeting_related_to_buyer",
  opportunityRelatedToProperty: "opportunity_related_to_property",
} as const;

/** Map an event_type to a design-system icon name. */
export function eventIcon(eventType: string): string {
  const t = eventType;
  if (t.startsWith("task")) return "UserCheck";
  if (t.startsWith("meeting") || t.includes("visit")) return "Clock";
  if (t.startsWith("note")) return "MessageCircle";
  if (t.startsWith("document") || t.includes("file_sent")) return "Presentation";
  if (t.startsWith("seller")) return "Shield";
  if (t.startsWith("buyer")) return "Users";
  if (t.startsWith("offer")) return "Tag";
  if (t.includes("risk")) return "AlertTriangle";
  if (t.includes("lever")) return "TrendingUp";
  if (t.includes("score")) return "BarChart3";
  if (t.includes("stage") || t.includes("status") || t.includes("mission")) return "Route";
  if (t.startsWith("calendar")) return "Clock";
  if (t.startsWith("property")) return "Building2";
  return "Sparkles";
}

export interface LogActivityInput {
  eventType: string;
  entityType: EntityType | string;
  entityId: string;
  title: string;
  description?: string | null;
  relatedEntityType?: EntityType | string | null;
  relatedEntityId?: string | null;
  channel?: string | null;
  direction?: string | null;
  priority?: string | null;
  status?: string | null;
  sentiment?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

export interface ActivitySummary {
  lastActivityAt: string | null;
  daysWithoutActivity: number | null;
  tasksCompleted: number;
  meetingsScheduled: number;
  notesCreated: number;
  touchpoints: number;
  totalEvents: number;
}
