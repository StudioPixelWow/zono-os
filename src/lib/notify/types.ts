// ============================================================================
// 🔔 ZONO OS — Batch 6.6 · NOTIFICATION DELIVERY — provider layer types.
//
// The canonical EXTERNAL notification delivery abstraction. This does NOT
// replace the in-app notifications table or the kernel notification-subscriber
// (those stay). It sits alongside them: any ZONO notification can additionally
// be DELIVERED over an external channel. WhatsApp is the first real provider;
// email / push / sms are declared channels with future-ready providers so a new
// channel plugs in without touching business logic.
// ============================================================================

export type NotificationChannel = "whatsapp" | "email" | "push" | "sms";

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ["whatsapp", "email", "push", "sms"] as const;

export type DeliveryStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "skipped";

/** One delivery request — channel-agnostic facts. */
export interface DeliveryRequest {
  orgId: string;
  userId?: string | null;
  notificationId?: string | null;   // links to the in-app notifications row when present
  channel: NotificationChannel;
  to: string;                        // phone / email / device token (channel-specific)
  title?: string | null;
  body: string;
  /** Optional approved template + variables (required for business-initiated WhatsApp). */
  template?: { name: string; language?: string; variables?: string[] } | null;
  /** Idempotency key — one delivery per (notification, channel, target). */
  dedupKey: string;
}

export type DeliveryResult =
  | { ok: true; status: DeliveryStatus; providerMessageId: string | null }
  | { ok: false; status: "failed" | "skipped"; error: string };

/** The contract every channel provider implements. */
export interface DeliveryProvider {
  readonly channel: NotificationChannel;
  /** Whether this provider is configured for the org (else deliveries are skipped honestly). */
  isConfigured(orgId: string): Promise<boolean>;
  deliver(req: DeliveryRequest): Promise<DeliveryResult>;
}
