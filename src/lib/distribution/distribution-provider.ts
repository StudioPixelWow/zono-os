// ============================================================================
// ZONO — DistributionProvider interface (Phase 6, server-only).
// ----------------------------------------------------------------------------
// The compliant integration contract every distribution channel implements
// (Facebook Groups/Pages/Marketplace, Instagram, WhatsApp, future). This is the
// ONLY layer that would ever talk to an official Meta API. Until an approved API
// connection exists, providers are safe STUBS:
//   • validateConnection → not_connected
//   • publishPost → manual_publish_required / not_connected — NEVER a fake success
//   • getComments / getAnalytics → not_connected (empty)
// No scraping, no unofficial automation, no Meta-policy bypass — ever.
// ============================================================================
import "server-only";

export type DestinationKind =
  | "facebook_group" | "facebook_page" | "facebook_marketplace" | "instagram" | "whatsapp";

export const DESTINATION_KINDS: DestinationKind[] = [
  "facebook_group", "facebook_page", "facebook_marketplace", "instagram", "whatsapp",
];

export type ProviderConnectionStatus = "not_connected" | "pending" | "connected" | "error";

export interface ConnectionResult {
  status: ProviderConnectionStatus;
  message: string;
  /** Whether the agent must be a member/admin of the destination to post. */
  requiresMembership: boolean;
}

export interface ProviderDestination {
  id: string; kind: DestinationKind; name: string; url: string | null;
  requiresMembership: boolean;
}

/** Everything a person needs to publish ONE post by hand (manual flow). */
export interface PreparedPost {
  text: string;            // copy-ready post body
  hashtags: string[];
  imageUrl: string | null;
  destinationUrl: string | null;
  scheduledAt: string | null;
  checklist: string[];     // compliance + step checklist
}

/** publishPost NEVER returns "published" from a stub — the agent publishes by hand. */
export type PublishOutcome =
  | { status: "manual_publish_required"; message: string }
  | { status: "not_connected"; message: string };

export interface ProviderPostStatus { status: ProviderConnectionStatus | "manual"; externalPostUrl: string | null }

export interface PreparePostInput {
  text: string; hashtags: string[]; imageUrl: string | null;
  destinationUrl: string | null; destinationName: string | null; scheduledAt: string | null;
}

export interface DistributionProvider {
  /** Provider key (a single provider may serve several DestinationKinds). */
  readonly key: string;
  readonly label: string;
  readonly kinds: DestinationKind[];

  /** Is there a live, approved API connection for this org? (stub → not_connected) */
  validateConnection(orgId: string): Promise<ConnectionResult>;
  /** Destinations the connected account could post to (stub → []). */
  getAvailableDestinations(orgId: string): Promise<ProviderDestination[]>;
  /** Assemble the copy-ready manual-publish package (pure, always works). */
  preparePost(input: PreparePostInput): PreparedPost;
  /** Publish — stub returns manual_publish_required / not_connected, never fake success. */
  publishPost(input: PreparePostInput): Promise<PublishOutcome>;
  /** External post status (stub → manual / null). */
  getPostStatus(externalPostUrl: string | null): Promise<ProviderPostStatus>;
  /** Comments for a published post (stub → not_connected, empty). */
  getComments(externalPostUrl: string | null): Promise<{ status: ProviderConnectionStatus; comments: never[]; message: string }>;
  /** Analytics for a published post (stub → not_connected). */
  getAnalytics(externalPostUrl: string | null): Promise<{ status: ProviderConnectionStatus; message: string }>;
}

// ── Compliance layer (surfaced in the Publish Assistant UI) ───────────────────
export const COMPLIANCE_WARNINGS: string[] = [
  "יש להיות חבר/מנהל בקבוצה או בעמוד לפני פרסום — אל תפרסם במקום שאין לך הרשאה.",
  "כבד את חוקי הקבוצה והנהלים שלה. פוסט שיווקי במקום אסור עלול להוביל לחסימה.",
  "הימנע מספאם: אל תפרסם את אותו תוכן בהרבה קבוצות בו-זמנית.",
  "השתמש בתזמון הדרגתי — ZONO מפזר פרסומים כדי לשמור על מוניטין החשבון.",
  "אין פרסום המוני ללא אישור מפורש מהקבוצה/העמוד.",
  "אין שיתוף סיסמאות או פרטי התחברות — הפרסום מתבצע ידנית על ידך בלבד.",
];

/** Default manual-publish checklist appended to every PreparedPost. */
export function buildChecklist(requiresMembership: boolean, destinationName: string | null): string[] {
  return [
    requiresMembership ? `ודא שאתה חבר/מנהל ב${destinationName ?? "יעד הפרסום"}` : "ודא הרשאת פרסום ביעד",
    "העתק את הטקסט המוכן",
    "פתח את היעד והדבק את הטקסט",
    "צרף את תמונת המודעה",
    "פרסם ידנית",
    "הדבק בחזרה את קישור הפוסט שפורסם",
    "סמן כפורסם ב-ZONO",
  ];
}
