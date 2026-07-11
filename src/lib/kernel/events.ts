// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 1 · Event Kernel · typed event registry (pure).
// The single, versioned catalog of business event types. Every emitter uses a
// value from here; every future subscriber matches against it. Payloads are
// versioned via `event_version` on the row (default 1). Adding a new event =
// adding a key here (never a free string at the call site).
// ============================================================================

export const DOMAIN_EVENTS = {
  // Organization / Agent
  organizationCreated: "organization.created",
  organizationUpdated: "organization.updated",
  agentInvited: "agent.invited",
  agentActivated: "agent.activated",
  agentDeactivated: "agent.deactivated",
  agentRoleChanged: "agent.role_changed",
  agentProfileUpdated: "agent.profile_updated",
  // Buyer
  buyerCreated: "buyer.created",
  buyerUpdated: "buyer.updated",
  buyerStageChanged: "buyer.stage_changed",
  buyerArchived: "buyer.archived",
  // Seller
  sellerCreated: "seller.created",
  sellerUpdated: "seller.updated",
  sellerLinkedToProperty: "seller.linked_to_property",
  sellerUnlinkedFromProperty: "seller.unlinked_from_property",
  sellerRiskChanged: "seller.risk_changed",
  // Lead
  leadCreated: "lead.created",
  leadUpdated: "lead.updated",
  leadStageChanged: "lead.stage_changed",
  leadAssigned: "lead.assigned",
  leadConvertedToBuyer: "lead.converted_to_buyer",
  leadConvertedToSeller: "lead.converted_to_seller",
  // Property
  propertyCreated: "property.created",
  propertyUpdated: "property.updated",
  propertyPublished: "property.published",
  propertyPriceChanged: "property.price_changed",
  propertyStatusChanged: "property.status_changed",
  /**
   * Batch 5.5E — the MISSING SIBLING of buyer/lead/deal.stage_changed. Its absence
   * is why the property cockpit wrote `property_journeys` directly: there was no
   * canonical event a broker's "advance stage" click could ride. Now there is, and
   * the UI never touches a journey table again.
   */
  propertyStageChanged: "property.stage_changed",
  propertySold: "property.sold",
  propertyArchived: "property.archived",
  // External listing
  externalListingIngested: "external_listing.ingested",
  externalListingUpdated: "external_listing.updated",
  externalListingPromoted: "external_listing.promoted",
  externalListingDisappeared: "external_listing.disappeared",
  externalListingReturned: "external_listing.returned",
  // Deal
  dealCreated: "deal.created",
  dealStageChanged: "deal.stage_changed",
  dealWon: "deal.won",
  dealLost: "deal.lost",
  dealUpdated: "deal.updated",
  // Task
  taskCreated: "task.created",
  taskAssigned: "task.assigned",
  taskCompleted: "task.completed",
  taskOverdue: "task.overdue",
  // Meeting
  meetingCreated: "meeting.created",
  meetingRescheduled: "meeting.rescheduled",
  meetingCompleted: "meeting.completed",
  meetingCancelled: "meeting.cancelled",
  meetingNoShow: "meeting.no_show",
  // Journey
  journeyCreated: "journey.created",
  journeyStageChanged: "journey.stage_changed",
  journeyCompleted: "journey.completed",
  journeyBlocked: "journey.blocked",
  // Document
  documentCreated: "document.created",
  documentApprovalRequested: "document.approval_requested",
  documentApproved: "document.approved",
  documentSent: "document.sent",
  documentViewed: "document.viewed",
  documentSigned: "document.signed",
  documentCompleted: "document.completed",
  documentFailed: "document.failed",
  // Channels
  facebookConnected: "facebook.connected",
  facebookDisconnected: "facebook.disconnected",
  whatsappConnected: "whatsapp.connected",
  whatsappDisconnected: "whatsapp.disconnected",
  communicationReceived: "communication.received",
  communicationSent: "communication.sent",
  // Automation
  automationActivated: "automation.activated",
  automationRunRequested: "automation.run_requested",
  automationRunCompleted: "automation.run_completed",
  automationRunFailed: "automation.run_failed",
} as const;

export type DomainEventType = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

/** The entity an event is about (used for entity-scoped timelines/search/graph). */
export type DomainEntityType =
  | "organization" | "agent" | "buyer" | "seller" | "lead" | "property"
  | "external_listing" | "deal" | "task" | "meeting" | "journey" | "document"
  | "facebook" | "whatsapp" | "communication" | "automation";
