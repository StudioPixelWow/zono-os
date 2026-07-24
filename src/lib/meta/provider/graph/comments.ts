// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · GRAPH COMMENTS (sealed). Phase 1.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: the ONLY place Graph comment endpoints + payloads exist. Reads
// (list comments/replies, cursor-paged, bounded) and moderation WRITES (reply /
// hide / unhide / delete) for Facebook Pages + Instagram. RULES: a read may retry
// a transient failure elsewhere, but a moderation WRITE is a single call that is
// NEVER auto-retried, and a write timeout after transmission is reported AMBIGUOUS
// (never silently re-sent); the Page/IG token is used server-side and never
// logged; NO raw Graph payload escapes — everything is mapped to canonical
// ProviderComment / ModerationResult. `fetchImpl` is injectable so QA runs offline.
// ============================================================================
import { graphEndpoint } from "./compat";
import { graphJson, type GraphFetch } from "./client";
import { isMetaProviderError, MetaProviderError, type MetaProviderErrorKind } from "../errors";
import type { CommentFetchRequest, CommentFetchResult, ProviderComment, ModerationRequest, ModerationResult, ProviderCommentError, CommentsGateway } from "../../engagement/provider-types";

export interface CommentsDeps { fetchImpl?: GraphFetch }

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const errKind = (e: unknown): MetaProviderErrorKind => (isMetaProviderError(e) ? (e as MetaProviderError).meta.kind : "internal");
function safeError(e: unknown): ProviderCommentError {
  if (isMetaProviderError(e)) { const m = (e as MetaProviderError).meta; return { kind: m.kind, safeMessage: m.safeMessage, providerCodeCategory: m.providerCodeCategory, retryClass: m.retryClass }; }
  return { kind: "internal", safeMessage: "comment operation failed", providerCodeCategory: null, retryClass: "non_retryable" };
}
const AMBIGUOUS_KINDS: ReadonlySet<MetaProviderErrorKind> = new Set(["timeout", "network"]);

// ── Read ───────────────────────────────────────────────────────────────────
interface FbCommentRaw { id?: string; message?: string; from?: { id?: string; name?: string }; created_time?: string; like_count?: number; comment_count?: number; is_hidden?: boolean; parent?: { id?: string } }
interface IgCommentRaw { id?: string; text?: string; username?: string; timestamp?: string; like_count?: number; hidden?: boolean; replies?: { data?: { id?: string }[] }; parent_id?: string }
interface Paged<T> { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }

const fbToCanonical = (c: FbCommentRaw): ProviderComment => ({ externalId: c.id ?? "", parentExternalId: c.parent?.id ?? null, message: c.message ?? "", authorExternalId: c.from?.id ?? null, authorDisplay: c.from?.name ?? null, createdTime: c.created_time ?? null, updatedTime: null, likeCount: c.like_count ?? 0, replyCount: c.comment_count ?? 0, isHidden: c.is_hidden === true, isFromPage: false, attachmentsSafe: [] });
const igToCanonical = (c: IgCommentRaw): ProviderComment => ({ externalId: c.id ?? "", parentExternalId: c.parent_id ?? null, message: c.text ?? "", authorExternalId: null, authorDisplay: c.username ?? null, createdTime: c.timestamp ?? null, updatedTime: null, likeCount: c.like_count ?? 0, replyCount: c.replies?.data?.length ?? 0, isHidden: c.hidden === true, isFromPage: false, attachmentsSafe: [] });

async function fetchComments(req: CommentFetchRequest, deps: CommentsDeps): Promise<CommentFetchResult> {
  const params: Record<string, string> = { access_token: req.tokenPlain, limit: String(Math.max(1, Math.min(100, req.limit))) };
  if (req.cursor) params.after = req.cursor;
  try {
    if (req.platform === "instagram") {
      params.fields = "id,text,username,timestamp,like_count,hidden,parent_id,replies{id}";
      const data = await graphJson<Paged<IgCommentRaw>>(graphEndpoint(`/${req.objectExternalId}/comments`) + "?" + q(params), { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
      return { ok: true, comments: (data?.data ?? []).map(igToCanonical).filter((c) => c.externalId), nextCursor: data?.paging?.cursors?.after ?? null, ambiguous: false, error: null, warnings: [] };
    }
    params.fields = "id,message,from{id,name},created_time,like_count,comment_count,is_hidden,parent{id}";
    const data = await graphJson<Paged<FbCommentRaw>>(graphEndpoint(`/${req.objectExternalId}/comments`) + "?" + q(params), { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
    return { ok: true, comments: (data?.data ?? []).map(fbToCanonical).filter((c) => c.externalId), nextCursor: data?.paging?.cursors?.after ?? null, ambiguous: false, error: null, warnings: [] };
  } catch (e) {
    return { ok: false, comments: [], nextCursor: null, ambiguous: AMBIGUOUS_KINDS.has(errKind(e)), error: safeError(e), warnings: [] };
  }
}

// ── Moderation writes (never auto-retried; timeout → ambiguous) ──────────────
async function writeOnce<T>(url: string, method: "POST" | "DELETE", deps: CommentsDeps, correlationId: string): Promise<{ data: T | null; ambiguousError: MetaProviderError | null }> {
  try { return { data: await graphJson<T>(url, { method, fetchImpl: deps.fetchImpl, correlationId }), ambiguousError: null }; }
  catch (e) { if (AMBIGUOUS_KINDS.has(errKind(e))) return { data: null, ambiguousError: e as MetaProviderError }; throw e; }
}

async function moderate(req: ModerationRequest, deps: CommentsDeps): Promise<ModerationResult> {
  const t = req.tokenPlain; const id = req.targetCommentExternalId;
  try {
    if (req.actionKind === "reply") {
      const path = req.platform === "instagram" ? `/${id}/replies` : `/${id}/comments`;
      const w = await writeOnce<{ id?: string }>(graphEndpoint(path) + "?" + q({ message: req.replyText ?? "", access_token: t }), "POST", deps, req.correlationId);
      if (w.ambiguousError) return { ok: false, providerResultId: null, ambiguous: true, error: safeError(w.ambiguousError), retryClass: "ambiguous" };
      if (!w.data?.id) return { ok: false, providerResultId: null, ambiguous: false, error: safeError(new Error("no id")), retryClass: "non_retryable" };
      return { ok: true, providerResultId: w.data.id, ambiguous: false, error: null, retryClass: "non_retryable" };
    }
    if (req.actionKind === "hide" || req.actionKind === "unhide") {
      const on = req.actionKind === "hide" ? "true" : "false";
      const params: Record<string, string> = { access_token: t };
      if (req.platform === "instagram") params.hide = on; else params.is_hidden = on;
      const w = await writeOnce<{ success?: boolean }>(graphEndpoint(`/${id}`) + "?" + q(params), "POST", deps, req.correlationId);
      if (w.ambiguousError) return { ok: false, providerResultId: null, ambiguous: true, error: safeError(w.ambiguousError), retryClass: "ambiguous" };
      return { ok: true, providerResultId: null, ambiguous: false, error: null, retryClass: "non_retryable" };
    }
    // delete
    const w = await writeOnce<{ success?: boolean }>(graphEndpoint(`/${id}`) + "?" + q({ access_token: t }), "DELETE", deps, req.correlationId);
    if (w.ambiguousError) return { ok: false, providerResultId: null, ambiguous: true, error: safeError(w.ambiguousError), retryClass: "ambiguous" };
    return { ok: true, providerResultId: null, ambiguous: false, error: null, retryClass: "non_retryable" };
  } catch (e) {
    return { ok: false, providerResultId: null, ambiguous: false, error: safeError(e), retryClass: safeError(e).retryClass };
  }
}

/** Build the sealed comments gateway (server wiring supplies a real fetch). */
export function createCommentsGateway(deps: CommentsDeps = {}): CommentsGateway {
  return { fetchComments: (req) => fetchComments(req, deps), moderate: (req) => moderate(req, deps) };
}
