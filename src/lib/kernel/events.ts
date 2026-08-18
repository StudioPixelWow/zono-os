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
  // Follow-up engine — canonical events for the (future) communication layer.
  leadFollowupDue: "lead.followup_due",
  leadFollowupOverdue: "lead.followup_overdue",
  leadUnassigned: "lead.unassigned",
  leadHotWithoutNextAction: "lead.hot_without_next_action",
  leadSlaBreached: "lead.sla_breached",
  // Support (customer-facing ticket lifecycle → communication layer)
  supportTicketCreated: "support.ticket_created",
  supportTicketUpdated: "support.ticket_updated",
  supportTicketCustomerActionRequired: "support.ticket_customer_action_required",
  supportTicketResolved: "support.ticket_resolved",
  // Billing (provider-verified server state only)
  billingPaymentFailed: "billing.payment_failed",
  billingPaymentVerified: "billing.payment_verified",
  billingSubscriptionActivated: "billing.subscription_activated",
  billingSubscriptionCancelled: "billing.subscription_cancelled",
  // Meetings (dispatcher-scheduled reminder)
  meetingReminder: "meeting.reminder",
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
  dealStale: "deal.stale",
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
  // ── P6.0 telemetry taxonomy additions (additive; back the meaningful-usage set) ──
  // Property engagement
  propertyViewed: "property.viewed",
  // Matching / recommendations
  matchingExecuted: "matching.executed",
  buyerMatchesReady: "buyer.matches_ready",
  recommendationGenerated: "recommendation.generated",
  recommendationOpened: "recommendation.opened",
  // Distribution / campaigns
  campaignCreated: "campaign.created",
  publishRequested: "publish.requested",
  publishSucceeded: "publish.succeeded",
  publishFailed: "publish.failed",
  // WhatsApp operational (NEVER message content — operational metadata only)
  whatsappMessageSent: "whatsapp.message_sent",
  whatsappMessageFailed: "whatsapp.message_failed",
  // Integrations (connect/disconnect + sync outcomes)
  integrationConnected: "integration.connected",
  integrationDisconnected: "integration.disconnected",
  integrationSyncSucceeded: "integration.sync_succeeded",
  integrationSyncFailed: "integration.sync_failed",
  // AI feature invocation (P6.0 tracks invocation only — cost/tokens is P6.1)
  aiInvoked: "ai.invoked",
  aiCompleted: "ai.completed",
  aiFailed: "ai.failed",
  // Auth / session (tracked for security analytics; EXCLUDED from meaningful DAU/WAU/MAU)
  authLogin: "auth.login",
} as const;

export type DomainEventType = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

/** The entity an event is about (used for entity-scoped timelines/search/graph). */
export type DomainEntityType =
  | "organization" | "agent" | "buyer" | "seller" | "lead" | "property"
  | "external_listing" | "deal" | "task" | "meeting" | "journey" | "document"
  | "support" | "billing"
  | "facebook" | "whatsapp" | "communication" | "automation"
  // P6.0 telemetry taxonomy entities
  | "matching" | "recommendation" | "campaign" | "publish" | "integration" | "ai" | "session";
