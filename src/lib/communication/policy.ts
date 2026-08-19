// ============================================================================
// ZONO — Communication Automation: POLICY + EVENT MATRIX (pure, deterministic).
// The single brain that decides, per real domain event: is this worth telling a
// human, WHO, on WHICH channel, and how often. Encodes the event-coverage matrix
// AS CODE (not docs). No provider calls, no DB — the server orchestrator resolves
// the recipient + preferences + quiet-hours and hands off to the existing
// notify/deliver dispatch. Principle: IMPORTANT → COMMUNICATE · USEFUL-NOT-URGENT
// → DIGEST · NOISE → DO NOT SEND. WhatsApp is opt-in-urgent by default.
// ============================================================================

export type CommPriority = "critical" | "important" | "digest" | "silent";
export type CommRecipientRole = "actor" | "assignee" | "manager" | "owner";
export type CommTemplateId =
  | "NEW_LEAD_URGENT" | "FOLLOWUP_ESCALATION" | "MORNING_BRIEF" | "MEETING_REMINDER"
  | "PUBLICATION_ATTENTION" | "SUPPORT_CREATED" | "SUPPORT_UPDATED" | "PAYMENT_FAILED"
  | "BILLING_UPDATE" | "DEAL_STALE" | "GENERIC";

export interface CommChannelPlan { inApp: boolean; email: boolean; whatsapp: boolean }

export interface CommRule {
  priority: CommPriority;
  recipient: CommRecipientRole;
  channels: CommChannelPlan;
  /** Suppress a repeat to the same recipient within this many minutes. */
  dedupWindowMin: number;
  /** Defer delivery by this many minutes (0 = immediate). */
  delayMin: number;
  /** Transactional template for external channels (null → plain title/body). */
  template: CommTemplateId | null;
  /** Deep link to the exact place to act (never a generic dashboard link). */
  deepLink: (entityId: string) => string;
}

// ── THE EVENT COVERAGE MATRIX ────────────────────────────────────────────────
// Any event_type not present here is SILENT (timeline/record only) — that is how
// noise is prevented by default. WhatsApp is enabled only where a human genuinely
// must act now; the orchestrator further gates it on the user's urgent-WhatsApp
// preference and quiet hours.
export const COMM_EVENT_MATRIX: Record<string, CommRule> = {
  // ── Leads / Follow-up engine ──────────────────────────────────────────────
  // (lead.created in-app is owned by the existing kernel notification-subscriber;
  // this layer does not duplicate it.)
  "lead.followup_due": {
    priority: "important", recipient: "assignee", channels: { inApp: true, email: false, whatsapp: false },
    dedupWindowMin: 720, delayMin: 0, template: null, deepLink: (id) => `/leads/${id}`,
  },
  "lead.followup_overdue": {
    priority: "important", recipient: "assignee", channels: { inApp: true, email: false, whatsapp: false },
    dedupWindowMin: 720, delayMin: 0, template: "FOLLOWUP_ESCALATION", deepLink: (id) => `/leads/${id}`,
  },
  "lead.sla_breached": {
    // The one lead event urgent enough for WhatsApp — a new lead unanswered past SLA.
    priority: "critical", recipient: "assignee", channels: { inApp: true, email: false, whatsapp: true },
    dedupWindowMin: 1440, delayMin: 0, template: "NEW_LEAD_URGENT", deepLink: (id) => `/leads/${id}`,
  },
  "lead.hot_without_next_action": {
    priority: "important", recipient: "assignee", channels: { inApp: true, email: false, whatsapp: false },
    dedupWindowMin: 1440, delayMin: 0, template: "FOLLOWUP_ESCALATION", deepLink: (id) => `/leads/${id}`,
  },
  "lead.unassigned": {
    // Manager exception — batched to digest unless it stays unresolved (escalation
    // upgrades it at the checkpoint; see escalate()).
    priority: "digest", recipient: "manager", channels: { inApp: true, email: false, whatsapp: false },
    dedupWindowMin: 1440, delayMin: 0, template: null, deepLink: () => `/leads`,
  },

  // ── Facebook / distribution ───────────────────────────────────────────────
  "publish.failed": {
    priority: "critical", recipient: "owner", channels: { inApp: true, email: false, whatsapp: true },
    dedupWindowMin: 720, delayMin: 0, template: "PUBLICATION_ATTENTION", deepLink: () => `/distribution/daily`,
  },
  // publish.succeeded intentionally absent → SILENT (no "post published" spam).

  // ── Support (ZI ticket flow) ──────────────────────────────────────────────
  "support.ticket_created": {
    priority: "important", recipient: "actor", channels: { inApp: true, email: true, whatsapp: false },
    dedupWindowMin: 0, delayMin: 0, template: "SUPPORT_CREATED", deepLink: () => `/help`,
  },
  "support.ticket_updated": {
    priority: "important", recipient: "actor", channels: { inApp: true, email: true, whatsapp: false },
    dedupWindowMin: 60, delayMin: 0, template: "SUPPORT_UPDATED", deepLink: () => `/help`,
  },
  "support.ticket_customer_action_required": {
    priority: "important", recipient: "actor", channels: { inApp: true, email: true, whatsapp: false },
    dedupWindowMin: 60, delayMin: 0, template: "SUPPORT_UPDATED", deepLink: () => `/help`,
  },
  "support.ticket_resolved": {
    priority: "important", recipient: "actor", channels: { inApp: true, email: true, whatsapp: false },
    dedupWindowMin: 0, delayMin: 0, template: "SUPPORT_UPDATED", deepLink: () => `/help`,
  },

  // ── Billing ───────────────────────────────────────────────────────────────
  "billing.payment_failed": {
    priority: "critical", recipient: "owner", channels: { inApp: true, email: true, whatsapp: true },
    dedupWindowMin: 1440, delayMin: 0, template: "PAYMENT_FAILED", deepLink: () => `/account`,
  },
  "billing.payment_verified": {
    priority: "important", recipient: "owner", channels: { inApp: true, email: true, whatsapp: false },
    dedupWindowMin: 1440, delayMin: 0, template: "BILLING_UPDATE", deepLink: () => `/account`,
  },
  "meeting.reminder": {
    priority: "important", recipient: "actor", channels: { inApp: true, email: false, whatsapp: false },
    dedupWindowMin: 0, delayMin: 0, template: "MEETING_REMINDER", deepLink: () => `/calendar`,
  },
  "billing.payment_succeeded": {
    priority: "important", recipient: "owner", channels: { inApp: true, email: true, whatsapp: false },
    dedupWindowMin: 1440, delayMin: 0, template: "BILLING_UPDATE", deepLink: () => `/account`,
  },
  "billing.subscription_activated": {
    priority: "important", recipient: "owner", channels: { inApp: true, email: true, whatsapp: false },
    dedupWindowMin: 1440, delayMin: 0, template: "BILLING_UPDATE", deepLink: () => `/account`,
  },
  "billing.subscription_cancelled": {
    priority: "important", recipient: "owner", channels: { inApp: true, email: true, whatsapp: false },
    dedupWindowMin: 1440, delayMin: 0, template: "BILLING_UPDATE", deepLink: () => `/account`,
  },

  // ── Deals (CRM lifecycle) — RESTRAINED. Only the exception that needs a human
  //    (a stale active deal) communicates, in-app only, once/day. deal.created /
  //    deal.stage_changed / deal.won / deal.lost are intentionally ABSENT → SILENT
  //    (timeline/record only) so the pipeline never becomes a notification firehose.
  "deal.stale": {
    priority: "important", recipient: "assignee", channels: { inApp: true, email: false, whatsapp: false },
    dedupWindowMin: 1440, delayMin: 0, template: "DEAL_STALE", deepLink: (id) => `/deals/${id}`,
  },

  // ── Inbound customer WhatsApp replies (Slice 2C) — RESTRAINED, in-app only to
  //    the responsible agent. NEVER WhatsApp the agent about every reply. A plain
  //    received reply is a light in-app notice; an actionable one (interested /
  //    viewing / callback) is important and surfaces in the brief.
  "customer.whatsapp_received": {
    priority: "digest", recipient: "assignee", channels: { inApp: true, email: false, whatsapp: false },
    dedupWindowMin: 30, delayMin: 0, template: null, deepLink: (id) => `/leads/${id}`,
  },
  "customer.whatsapp_action_required": {
    priority: "important", recipient: "assignee", channels: { inApp: true, email: false, whatsapp: false },
    dedupWindowMin: 0, delayMin: 0, template: null, deepLink: (id) => `/leads/${id}`,
  },
};

/** Synthetic (non-domain-event) comm kinds driven by the dispatcher, not the bus. */
export const COMM_SYNTHETIC = {
  MORNING_BRIEF: {
    priority: "digest" as CommPriority, recipient: "actor" as CommRecipientRole,
    channels: { inApp: false, email: true, whatsapp: false }, dedupWindowMin: 1440, delayMin: 0,
    template: "MORNING_BRIEF" as CommTemplateId, deepLink: () => `/`,
  } satisfies CommRule,
  MEETING_REMINDER: {
    priority: "important" as CommPriority, recipient: "assignee" as CommRecipientRole,
    channels: { inApp: true, email: false, whatsapp: false }, dedupWindowMin: 0, delayMin: 0,
    template: "MEETING_REMINDER" as CommTemplateId, deepLink: () => `/calendar`,
  } satisfies CommRule,
};

/** The rule for an event, or null when the event should never communicate. */
export function planFor(eventType: string): CommRule | null {
  return COMM_EVENT_MATRIX[eventType] ?? null;
}

/** Critical messages bypass quiet hours and channel-off preferences for account/security/billing. */
export function isForceDeliverable(priority: CommPriority, eventType: string): boolean {
  return priority === "critical" && (eventType.startsWith("billing.") || eventType === "lead.sla_breached" || eventType === "publish.failed");
}

// ── Escalation checkpoints — a persisting problem communicates again only here,
// never every reconcile run. Returns the checkpoint index (0 = none). ──────────
export const ESCALATION_CHECKPOINT_HOURS = [4, 24, 48] as const;
export function escalationCheckpoint(overdueHours: number): 0 | 1 | 2 | 3 {
  if (overdueHours >= ESCALATION_CHECKPOINT_HOURS[2]) return 3;
  if (overdueHours >= ESCALATION_CHECKPOINT_HOURS[1]) return 2;
  if (overdueHours >= ESCALATION_CHECKPOINT_HOURS[0]) return 1;
  return 0;
}

// ── Noise budget (acceptance guard) ──────────────────────────────────────────
export interface NoiseEstimate { whatsapp: number; email: number; inApp: number }
/**
 * Estimate one agent's daily message volume from a realistic per-event-type count
 * map, honoring dedup windows (an event that dedups within a day counts once).
 * The default matrix must keep WhatsApp in the low single digits.
 */
export function estimateAgentDailyNoise(eventCountsPerDay: Record<string, number>): NoiseEstimate {
  const out: NoiseEstimate = { whatsapp: 0, email: 0, inApp: 0 };
  for (const [type, count] of Object.entries(eventCountsPerDay)) {
    const rule = COMM_EVENT_MATRIX[type];
    if (!rule || count <= 0) continue;
    // Dedup ≥ a full day collapses repeats to 1/day per recipient.
    const effective = rule.dedupWindowMin >= 1440 ? Math.min(1, count) : count;
    if (rule.channels.inApp) out.inApp += effective;
    if (rule.channels.email) out.email += effective;
    if (rule.channels.whatsapp) out.whatsapp += effective;
  }
  return out;
}
