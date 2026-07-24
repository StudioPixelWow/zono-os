// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · WEBHOOK NORMALIZATION (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Turns a verified Meta webhook body into provider-neutral canonical events. ONLY
// publishing-lifecycle / object-existence / permission-impact signals are
// surfaced; comments, mentions and messaging fields normalize to `ignored` /
// `unsupported` and NEVER activate any comments or messaging feature. Unknown
// shapes never crash — they yield an `unsupported` event or nothing. No raw Graph
// field names escape this module; the output is the canonical event only. Pure:
// (parsed body + now) → canonical events. The service computes the fingerprint.
// ============================================================================
import type { MetaCanonicalWebhookEvent, MetaCanonicalEventType, MetaChangeClass } from "./types";

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

/** Fields we act on (publishing/object/permission). Everything else is inert. */
const PUBLISHING_FIELDS = new Set(["feed", "media", "photos", "videos", "live_videos"]);
const PERMISSION_FIELDS = new Set(["permissions", "authorization", "connected_instagram_account"]);
// Explicitly inert — must NEVER activate comments/messaging behaviour.
const IGNORED_FIELDS = new Set(["comments", "mentions", "messages", "messaging", "message_reactions", "message_echoes", "standby", "reactions", "ratings"]);

function classifyVerb(verb: string | null, field: string): { type: MetaCanonicalEventType; change: MetaChangeClass } {
  if (PERMISSION_FIELDS.has(field)) return { type: "permission_change", change: "permission" };
  switch ((verb ?? "").toLowerCase()) {
    case "remove": case "delete": case "unpublished": return { type: "object_deleted", change: "removed" };
    case "hide": case "block": return { type: "object_hidden", change: "hidden" };
    case "edit": case "edited": case "update": case "updated": return { type: "object_updated", change: "updated" };
    case "add": case "publish": case "published": return { type: "publish_confirmed", change: "created" };
    default: return { type: "object_updated", change: "updated" };
  }
}

/**
 * Normalize a parsed webhook body to canonical events. `platform` is inferred
 * from the payload `object`. Non-publishing fields become `ignored`; unknown
 * fields become `unsupported`. Never throws on malformed input.
 */
export function normalizeWebhookBody(body: unknown, opts: { correlationId?: string | null } = {}): MetaCanonicalWebhookEvent[] {
  const root = asObj(body);
  if (!root) return [];
  const objectKind = str(root.object);
  const platform: MetaCanonicalWebhookEvent["platform"] = objectKind === "instagram" ? "instagram" : objectKind === "page" ? "facebook" : null;
  const out: MetaCanonicalWebhookEvent[] = [];
  for (const entryRaw of asArr(root.entry)) {
    const entry = asObj(entryRaw);
    if (!entry) continue;
    const assetExternalId = str(entry.id);
    const entryTime = typeof entry.time === "number" ? new Date(entry.time * 1000).toISOString() : null;
    for (const changeRaw of asArr(entry.changes)) {
      const change = asObj(changeRaw);
      if (!change) continue;
      const field = (str(change.field) ?? "").toLowerCase();
      const value = asObj(change.value) ?? {};
      const externalObjectId = str(value.post_id) ?? str(value.media_id) ?? str(value.id);
      const externalParentId = str(value.parent_id) ?? str(value.from_id) ?? null;
      const verb = str(value.verb);
      let type: MetaCanonicalEventType; let change2: MetaChangeClass;
      if (IGNORED_FIELDS.has(field)) { type = "ignored"; change2 = "none"; }
      else if (PUBLISHING_FIELDS.has(field) || PERMISSION_FIELDS.has(field)) { const c = classifyVerb(verb, field); type = c.type; change2 = c.change; }
      else { type = "unsupported"; change2 = "none"; }
      out.push({
        provider: "meta", platform, eventType: type,
        externalEventId: null, fingerprint: "",
        externalObjectId: type === "ignored" || type === "unsupported" ? null : externalObjectId,
        externalParentId, assetExternalId,
        providerEventTime: entryTime, changeClass: change2,
        matchConfidence: externalObjectId ? "high" : assetExternalId ? "medium" : "low",
        sourceWebhookEventId: null, correlationId: opts.correlationId ?? null,
      });
    }
  }
  return out;
}
