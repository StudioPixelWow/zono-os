// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · COMMENT WEBHOOK SIGNALS (PURE). Phase 1.
// ----------------------------------------------------------------------------
// Extracts comment SIGNALS from a verified webhook body — the parent post id +
// comment id + verb — WITHOUT trusting the payload for content or org. The webhook
// is only a trigger: the ingestion worker then pulls the authoritative comment set
// from the provider. This reuses (does not modify) the Batch-6.8 signature
// verification; it only adds comment-specific extraction the generic normalizer
// intentionally leaves inert. Pure: (parsed body) → signals. Never reads an org.
// ============================================================================
type Json = Record<string, unknown>;
const asObj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

export type CommentVerb = "add" | "edited" | "remove" | "hide" | "unknown";
export interface CommentSignal {
  platform: "facebook" | "instagram";
  postExternalId: string | null;   // the parent published object (for matching + sync)
  commentExternalId: string | null;
  parentExternalId: string | null;
  verb: CommentVerb;
}

function verbOf(v: string | null): CommentVerb {
  switch ((v ?? "").toLowerCase()) { case "add": case "create": return "add"; case "edit": case "edited": return "edited"; case "remove": case "delete": return "remove"; case "hide": return "hide"; default: return "unknown"; }
}

/** Extract comment signals from a webhook body. Returns [] for non-comment bodies. */
export function extractCommentSignals(body: unknown): CommentSignal[] {
  const root = asObj(body);
  if (!root) return [];
  const platform: CommentSignal["platform"] = str(root.object) === "instagram" ? "instagram" : "facebook";
  const out: CommentSignal[] = [];
  for (const eRaw of asArr(root.entry)) {
    const entry = asObj(eRaw); if (!entry) continue;
    for (const cRaw of asArr(entry.changes)) {
      const change = asObj(cRaw); if (!change) continue;
      const field = (str(change.field) ?? "").toLowerCase();
      const value = asObj(change.value) ?? {};
      const isComment = field === "comments" || (field === "feed" && str(value.item) === "comment");
      if (!isComment) continue;
      const media = asObj(value.media);
      out.push({
        platform,
        postExternalId: str(value.post_id) ?? str(media?.id) ?? null,
        commentExternalId: str(value.comment_id) ?? str(value.id) ?? null,
        parentExternalId: str(value.parent_id) ?? null,
        verb: verbOf(str(value.verb)),
      });
    }
  }
  return out;
}
