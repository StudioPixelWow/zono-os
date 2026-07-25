// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · GRAPH MESSAGING (sealed). Phase 6.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: the ONLY place Graph messaging endpoints, raw fields, and paging
// cursors exist. Bounded READS of Messenger + IG-DM conversations/messages, and a
// SINGLE approval-gated SEND, mapped to/from canonical, provider-neutral contracts.
// RULES: reads are bounded + cursor-based; the token is used server-side and NEVER
// logged; NO raw Graph payload / field / cursor escapes; a transient failure is
// `ambiguous` (retried on a bounded cadence, never a fabricated empty); the send is
// a SINGLE write only invoked by the engine after explicit approval + window +
// policy-tag + capability checks. `fetchImpl` is injectable so QA runs offline.
// ============================================================================
import { graphEndpoint } from "./compat";
import { graphJson, type GraphFetch } from "./client";
import { isMetaProviderError, MetaProviderError, type MetaProviderErrorKind } from "../errors";
import type { MessagingReadRequest, ConversationsResult, MessagesResult, SendRequest, SendResult, MessagingError, MessagingGateway } from "../../messaging/provider-types";
import type { CanonicalConversation, CanonicalMessage } from "../../messaging/normalize";

export interface MessagingDeps { fetchImpl?: GraphFetch }

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const errKind = (e: unknown): MetaProviderErrorKind => (isMetaProviderError(e) ? (e as MetaProviderError).meta.kind : "internal");
const AMBIGUOUS_KINDS: ReadonlySet<MetaProviderErrorKind> = new Set(["timeout", "network", "rate_limited", "transient_provider", "unavailable"]);
function safeError(e: unknown): MessagingError {
  if (isMetaProviderError(e)) { const m = (e as MetaProviderError).meta; return { kind: m.kind, safeMessage: m.safeMessage, providerCodeCategory: m.providerCodeCategory, retryClass: m.retryClass, retryAfterMs: (m as unknown as { retryAfterMs?: number | null }).retryAfterMs ?? null }; }
  return { kind: "internal", safeMessage: "messaging op failed", providerCodeCategory: null, retryClass: "non_retryable", retryAfterMs: null };
}

interface RawConv { id?: string; participants?: { data?: { id?: string; name?: string; username?: string }[] }; updated_time?: string }
interface RawMsg { id?: string; message?: string; from?: { id?: string }; created_time?: string; is_echo?: boolean }
interface RawPage<T> { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }

function toCanonicalConv(r: RawConv): CanonicalConversation {
  const other = (r.participants?.data ?? [])[0];
  return { externalThreadId: String(r.id ?? ""), participantExternalId: other?.id ?? null, participantDisplay: other?.name ?? other?.username ?? null, lastInboundAt: null, lastMessageAt: r.updated_time ?? null };
}
function toCanonicalMsg(r: RawMsg): CanonicalMessage {
  return { externalMessageId: String(r.id ?? ""), direction: r.is_echo ? "outbound" : "inbound", senderExternalId: r.from?.id ? String(r.from.id) : null, body: String(r.message ?? ""), attachments: [], providerCreatedAt: r.created_time ?? null };
}

async function fetchConversations(req: MessagingReadRequest, deps: MessagingDeps): Promise<ConversationsResult> {
  try {
    const params: Record<string, string> = { fields: "id,participants,updated_time", limit: String(Math.max(1, Math.min(50, req.pageLimit))), access_token: req.tokenPlain };
    if (req.cursorRef) params.after = req.cursorRef;
    if (req.platform === "instagram") params.platform = "instagram";
    const raw = await graphJson<RawPage<RawConv>>(graphEndpoint(`/${req.assetExternalId}/conversations`) + "?" + q(params), { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
    return { ok: true, conversations: (raw?.data ?? []).filter((c) => c.id).map(toCanonicalConv), nextCursorRef: raw?.paging?.cursors?.after ?? null, ambiguous: false, error: null };
  } catch (e) { return { ok: false, conversations: [], nextCursorRef: null, ambiguous: AMBIGUOUS_KINDS.has(errKind(e)), error: safeError(e) }; }
}
async function fetchMessages(req: MessagingReadRequest, deps: MessagingDeps): Promise<MessagesResult> {
  try {
    const params: Record<string, string> = { fields: "messages{id,message,from,created_time,is_echo}", limit: String(Math.max(1, Math.min(50, req.pageLimit))), access_token: req.tokenPlain };
    if (req.cursorRef) params.after = req.cursorRef;
    const raw = await graphJson<{ messages?: RawPage<RawMsg> }>(graphEndpoint(`/${req.threadExternalId}`) + "?" + q(params), { method: "GET", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
    const msgs = (raw?.messages?.data ?? []).filter((m) => m.id).map(toCanonicalMsg);
    return { ok: true, conversation: null, messages: msgs, nextCursorRef: raw?.messages?.paging?.cursors?.after ?? null, ambiguous: false, error: null };
  } catch (e) { return { ok: false, conversation: null, messages: [], nextCursorRef: null, ambiguous: AMBIGUOUS_KINDS.has(errKind(e)), error: safeError(e) }; }
}
async function sendMessage(req: SendRequest, deps: MessagingDeps): Promise<SendResult> {
  try {
    const params: Record<string, string> = { recipient: JSON.stringify({ id: req.recipientExternalId }), message: JSON.stringify({ text: req.body }), messaging_type: req.policyTag ? "MESSAGE_TAG" : "RESPONSE", access_token: req.tokenPlain };
    if (req.policyTag) params.tag = req.policyTag;
    const raw = await graphJson<{ message_id?: string; recipient_id?: string }>(graphEndpoint(`/${req.assetExternalId}/messages`) + "?" + q(params), { method: "POST", fetchImpl: deps.fetchImpl, correlationId: req.correlationId });
    const id = raw?.message_id ?? null;
    return id ? { ok: true, providerMessageId: id, ambiguous: false, error: null } : { ok: false, providerMessageId: null, ambiguous: true, error: { kind: "ambiguous", safeMessage: "no message id returned", providerCodeCategory: null, retryClass: "ambiguous", retryAfterMs: null } };
  } catch (e) { return { ok: false, providerMessageId: null, ambiguous: AMBIGUOUS_KINDS.has(errKind(e)), error: safeError(e) }; }
}

/** Build the sealed messaging gateway (server wiring supplies a real fetch). */
export function createMessagingGateway(deps: MessagingDeps = {}): MessagingGateway {
  return { fetchConversations: (r) => fetchConversations(r, deps), fetchMessages: (r) => fetchMessages(r, deps), sendMessage: (r) => sendMessage(r, deps) };
}
