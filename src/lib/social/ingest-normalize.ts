// ============================================================================
// ZONO — P4.2: pure normalization/validation for inbound social interactions.
// No server imports, no DB — safe to unit-test offline. The producer (ingest.ts)
// consumes the normalized value. Every field here is UNTRUSTED client input;
// tenancy/attribution ids (org/property/campaign/group) are deliberately NOT read
// from the payload — they are resolved server-side in the producer.
// ============================================================================

export interface RawInteractionInput {
  platform?: unknown;
  interactionType?: unknown;
  externalCommentId?: unknown;
  externalPostId?: unknown;
  externalPostUrl?: unknown;
  personName?: unknown;
  profileUrl?: unknown;
  messageText?: unknown;
  sourcePostId?: unknown;
  rawPayload?: unknown;
}

export interface NormalizedInteraction {
  platform: string | null;
  interactionType: string;
  externalCommentId: string | null;
  externalPostId: string | null;
  externalPostUrl: string | null;
  personName: string | null;
  profileUrl: string | null;
  messageText: string | null;
  sourcePostId: string | null; // validated uuid shape or null
  rawPayload: Record<string, unknown>;
}

export type NormalizeResult =
  | { ok: true; value: NormalizedInteraction }
  | { ok: false; error: "invalid_payload" | "empty_interaction" };

const PLATFORMS = new Set(["facebook", "instagram"]);
const TYPES = new Set(["comment", "message", "reaction"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TEXT = 4000;
const MAX_NAME = 200;
const MAX_URL = 2000;
const MAX_ID = 300;

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

export function normalizeInteractionInput(input: RawInteractionInput): NormalizeResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_payload" };

  const interactionType =
    typeof input.interactionType === "string" && TYPES.has(input.interactionType) ? input.interactionType : "comment";
  const platform = typeof input.platform === "string" && PLATFORMS.has(input.platform) ? input.platform : null;

  const externalCommentId = str(input.externalCommentId, MAX_ID);
  const messageText = str(input.messageText, MAX_TEXT);

  // Reject empty captures: an interaction must carry at least an external id OR text.
  // (Reactions have no text but must supply an external id.)
  if (!externalCommentId && !messageText) return { ok: false, error: "empty_interaction" };

  // A malformed (non-uuid) source post id is treated as absent → attribution becomes
  // unresolved server-side rather than erroring on a uuid comparison.
  const rawSource = str(input.sourcePostId, MAX_ID);
  const sourcePostId = rawSource && UUID_RE.test(rawSource) ? rawSource : null;

  const rawPayload =
    input.rawPayload && typeof input.rawPayload === "object" && !Array.isArray(input.rawPayload)
      ? (input.rawPayload as Record<string, unknown>)
      : {};

  return {
    ok: true,
    value: {
      platform,
      interactionType,
      externalCommentId,
      externalPostId: str(input.externalPostId, MAX_ID),
      externalPostUrl: str(input.externalPostUrl, MAX_URL),
      personName: str(input.personName, MAX_NAME),
      profileUrl: str(input.profileUrl, MAX_URL),
      messageText,
      sourcePostId,
      rawPayload,
    },
  };
}
