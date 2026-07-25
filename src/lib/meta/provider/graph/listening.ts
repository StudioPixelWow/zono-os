// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · GRAPH LISTENING (sealed, READ-ONLY). Phase 5.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: the ONLY place Graph mention/tag endpoints, raw fields, and paging
// cursors exist. Read-only pulls of provider-SUPPORTED mentions + tagged media for
// a CONNECTED asset, mapped to canonical, provider-neutral mentions. RULES: this
// gateway is READ-ONLY (no write/reply/hide/delete/follow/like/send method exists);
// pagination is bounded + cursor-based; a transient failure is `ambiguous` (retried
// on a bounded cadence, never recorded as empty); Retry-After is surfaced; the token
// is used server-side and never logged; NO raw Graph payload / field / cursor
// escapes. `fetchImpl` is injectable so QA runs offline. NO open-web scraping — only
// the connected asset's own supported surface is ever read.
// ============================================================================
import { graphEndpoint } from "./compat";
import { graphJson, type GraphFetch } from "./client";
import { isMetaProviderError, MetaProviderError, type MetaProviderErrorKind } from "../errors";
import type { ListeningFetchRequest, ListeningFetchResult, ListeningFetchError, ListeningGateway } from "../../listening/provider-types";
import type { CanonicalMention } from "../../listening/normalize";

export interface ListeningDeps { fetchImpl?: GraphFetch }

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const errKind = (e: unknown): MetaProviderErrorKind => (isMetaProviderError(e) ? (e as MetaProviderError).meta.kind : "internal");
const AMBIGUOUS_KINDS: ReadonlySet<MetaProviderErrorKind> = new Set(["timeout", "network", "rate_limited", "transient_provider", "unavailable"]);
function safeError(e: unknown): ListeningFetchError {
  if (isMetaProviderError(e)) { const m = (e as MetaProviderError).meta; return { kind: m.kind, safeMessage: m.safeMessage, providerCodeCategory: m.providerCodeCategory, retryClass: m.retryClass, retryAfterMs: (m as unknown as { retryAfterMs?: number | null }).retryAfterMs ?? null }; }
  return { kind: "internal", safeMessage: "listening fetch failed", providerCodeCategory: null, retryClass: "non_retryable", retryAfterMs: null };
}

// Raw Graph edge (sealed here). Narrow field selection only.
const SURFACE_EDGE: Record<string, string> = { page_mentions: "tagged", account_mentions: "tags", tagged_media: "tags" };
const FIELDS = "id,message,caption,permalink_url,permalink,created_time,timestamp,from,username";

interface RawItem { id?: string; message?: string; caption?: string; permalink_url?: string; permalink?: string; created_time?: string; timestamp?: string; from?: { id?: string; name?: string }; username?: string }
interface RawPage { data?: RawItem[]; paging?: { cursors?: { after?: string }; next?: string } }

function toCanonical(platform: string, surface: string, r: RawItem): CanonicalMention {
  const kind = surface === "tagged_media" || surface === "account_mentions" ? (platform === "instagram" ? "tagged_media" : "media_tag") : "page_mention";
  return {
    externalMentionId: String(r.id ?? ""),
    mentionKind: kind,
    sourceObjectRef: r.id ? String(r.id) : null,
    authorExternalId: r.from?.id ? String(r.from.id) : null,
    authorDisplay: r.from?.name ?? r.username ?? null,
    text: String(r.message ?? r.caption ?? ""),
    attachments: [],
    permalink: r.permalink_url ?? r.permalink ?? null,
    providerCreatedAt: r.created_time ?? r.timestamp ?? null,
  };
}

async function fetchMentions(req: ListeningFetchRequest, deps: ListeningDeps): Promise<ListeningFetchResult> {
  try {
    const edge = SURFACE_EDGE[req.surface] ?? "tags";
    const params: Record<string, string> = { fields: FIELDS, limit: String(Math.max(1, Math.min(50, req.pageLimit))), access_token: req.tokenPlain };
    if (req.cursorRef) params.after = req.cursorRef;
    const raw = await graphJson<RawPage>(graphEndpoint(`/${req.assetExternalId}/${edge}`) + "?" + q(params), { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
    const items = (raw?.data ?? []).filter((r) => r.id).map((r) => toCanonical(req.platform, req.surface, r));
    return { ok: true, mentions: items, nextCursorRef: raw?.paging?.cursors?.after ?? null, ambiguous: false, error: null };
  } catch (e) {
    return { ok: false, mentions: [], nextCursorRef: null, ambiguous: AMBIGUOUS_KINDS.has(errKind(e)), error: safeError(e) };
  }
}

/** Build the sealed READ-ONLY listening gateway (server wiring supplies a real fetch). */
export function createListeningGateway(deps: ListeningDeps = {}): ListeningGateway {
  return { fetchMentions: (req) => fetchMentions(req, deps) };
}
