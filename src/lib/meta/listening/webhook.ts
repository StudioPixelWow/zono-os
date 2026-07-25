// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · LISTENING WEBHOOK SIGNAL EXTRACTION (PURE). Phase 5.
// ----------------------------------------------------------------------------
// Parses a VERIFIED webhook body into secret-free mention SIGNALS. It reads only
// the fields needed to (a) identify the trusted ASSET (never the org — the org is
// derived from the trusted asset→org mapping downstream) and (b) enqueue a bounded
// pull. It NEVER trusts a payload org id, NEVER copies the raw payload, and NEVER
// performs a provider pull. Only supported mention/tag topics are promoted.
// ============================================================================
export interface MentionSignal {
  assetExternalId: string;             // trusted asset the change belongs to (verified upstream)
  platform: "facebook" | "instagram";
  topic: string;                       // provider-neutral supported topic (mentions | tags)
  externalMentionId: string | null;    // when the payload carries it
  sourceObjectRef: string | null;      // object the mention lives on, when present
}

const SUPPORTED_TOPICS = new Set(["mentions", "mention", "tags", "tagged", "story_insights"]);
const asStr = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

/** Extract supported mention/tag signals from a verified webhook payload (pure). */
export function extractMentionSignals(parsed: unknown): MentionSignal[] {
  const out: MentionSignal[] = [];
  if (!parsed || typeof parsed !== "object") return out;
  const root = parsed as { object?: unknown; entry?: unknown };
  const platform: "facebook" | "instagram" = root.object === "instagram" ? "instagram" : "facebook";
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const entry = e as { id?: unknown; changes?: unknown };
    const assetExternalId = asStr(entry.id);
    if (!assetExternalId) continue;                 // no trusted asset anchor → skip
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const c of changes) {
      if (!c || typeof c !== "object") continue;
      const change = c as { field?: unknown; value?: unknown };
      const field = asStr(change.field) ?? "";
      if (!SUPPORTED_TOPICS.has(field)) continue;    // only supported mention/tag topics promoted
      const value = (change.value && typeof change.value === "object") ? change.value as Record<string, unknown> : {};
      const topic = field.startsWith("tag") ? "tags" : "mentions";
      out.push({ assetExternalId, platform, topic, externalMentionId: asStr(value.mention_id) ?? asStr(value.media_id) ?? asStr(value.comment_id), sourceObjectRef: asStr(value.media_id) ?? asStr(value.post_id) ?? null });
    }
  }
  return out;
}
