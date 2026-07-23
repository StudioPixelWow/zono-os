// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — Gmail client (server-only).
//
// Gmail API v1 over authed fetch. Reads threads + messages, sends, and replies
// (preserving thread integrity via In-Reply-To / References), reports unread and
// participants, and lists attachment METADATA only. This REPLACES the Gmail
// contract stub: it produces GmailThreadLike records that map into the EXISTING
// Communication OS Conversation model through mapGmailConversation — no new
// email model is introduced (Part 3). Degrades to honest empty when not connected.
// ============================================================================
import "server-only";
import { getValidAccessToken } from "./tokens";
import { getMyConnection } from "./tokens";
import type { GoogleConnection, GmailMessage, GmailThread, GmailAttachmentMeta } from "./types";
import type { GmailThreadLike } from "@/lib/communication-os/adapters/mappers";

const BASE = "https://gmail.googleapis.com/gmail/v1";

async function call<T>(conn: GoogleConnection, path: string, init?: RequestInit & { query?: Record<string, string> }): Promise<T | null> {
  const token = await getValidAccessToken(conn);
  if (!token) return null;
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(init?.query ?? {})) if (v != null) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return null;
  }
}

// ── Header + payload parsing ──────────────────────────────────────────────────
interface RawMessagePart {
  filename?: string; mimeType?: string;
  headers?: { name?: string; value?: string }[];
  body?: { size?: number; attachmentId?: string };
  parts?: RawMessagePart[];
}
interface RawMessage {
  id?: string; threadId?: string; snippet?: string; labelIds?: string[]; internalDate?: string;
  payload?: RawMessagePart;
}
interface RawThread { id?: string; snippet?: string; messages?: RawMessage[] }

function header(msg: RawMessage, name: string): string | null {
  const h = msg.payload?.headers?.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

/** Parse a "Name <addr@x>" or "addr@x" header into name + address. */
export function parseAddress(raw: string | null): { name: string | null; address: string | null } {
  if (!raw) return { name: null, address: null };
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, address: m[2].trim() };
  const bare = raw.trim();
  return /@/.test(bare) ? { name: null, address: bare } : { name: bare || null, address: null };
}

function splitAddresses(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => parseAddress(s).address).filter((a): a is string => !!a);
}

function collectAttachments(part: RawMessagePart | undefined, out: GmailAttachmentMeta[] = []): GmailAttachmentMeta[] {
  if (!part) return out;
  if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
    out.push({ id: part.body.attachmentId, filename: part.filename, mimeType: part.mimeType ?? null, sizeBytes: part.body.size ?? null });
  }
  for (const p of part.parts ?? []) collectAttachments(p, out);
  return out;
}

function parseMessage(raw: RawMessage, selfEmail: string | null): GmailMessage {
  const from = parseAddress(header(raw, "From"));
  const labels = raw.labelIds ?? [];
  const sentAt = raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : new Date().toISOString();
  return {
    id: raw.id ?? "", threadId: raw.threadId ?? "", from, to: splitAddresses(header(raw, "To")),
    cc: splitAddresses(header(raw, "Cc")), subject: header(raw, "Subject"), snippet: raw.snippet ?? null,
    sentAt, unread: labels.includes("UNREAD"),
    outbound: labels.includes("SENT") || (!!selfEmail && from.address?.toLowerCase() === selfEmail.toLowerCase()),
    attachments: collectAttachments(raw.payload),
  };
}

// ── Threads + messages ────────────────────────────────────────────────────────
/** List recent threads as canonical thread summaries. `q` is a Gmail search
 *  query (e.g. "in:inbox"). Bounded to keep round-trips small. */
export async function listThreads(conn: GoogleConnection, opts: { q?: string; max?: number } = {}): Promise<GmailThread[]> {
  const list = await call<{ threads?: { id?: string }[] }>(conn, "/users/me/threads", {
    query: { q: opts.q ?? "in:inbox", maxResults: String(opts.max ?? 20) },
  });
  const ids = (list?.threads ?? []).map((t) => t.id).filter((x): x is string => !!x);
  const selfEmail = conn.email;
  const threads = await Promise.all(ids.map(async (id) => {
    const raw = await call<RawThread>(conn, `/users/me/threads/${encodeURIComponent(id)}`, { query: { format: "metadata", metadataHeaders: "From,To,Cc,Subject,Date" } });
    if (!raw?.messages?.length) return null;
    const msgs = raw.messages.map((m) => parseMessage(m, selfEmail));
    const last = msgs[msgs.length - 1];
    const first = msgs[0];
    const participants = Array.from(new Set(msgs.flatMap((m) => [m.from.address, ...m.to]).filter((a): a is string => !!a)));
    return {
      id, subject: first.subject, from: last.from, participants, lastAt: last.sentAt,
      unread: msgs.filter((m) => m.unread).length, snippet: raw.snippet ?? last.snippet, messageCount: msgs.length,
    } as GmailThread;
  }));
  return threads.filter((t): t is GmailThread => !!t).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

export async function loadThreadMessages(conn: GoogleConnection, threadId: string): Promise<GmailMessage[]> {
  const raw = await call<RawThread>(conn, `/users/me/threads/${encodeURIComponent(threadId)}`, { query: { format: "metadata", metadataHeaders: "From,To,Cc,Subject,Date" } });
  return (raw?.messages ?? []).map((m) => parseMessage(m, conn.email));
}

// ── Send + reply (thread integrity) ──────────────────────────────────────────
function buildRaw(headers: Record<string, string>, body: string): string {
  const lines = Object.entries(headers).map(([k, v]) => `${k}: ${v}`);
  const mime = `${lines.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(mime, "utf8").toString("base64url");
}

export interface SendResult { ok: boolean; id: string | null; threadId: string | null; error: string | null }

/** Send a NEW message. */
export async function sendMessage(conn: GoogleConnection, input: { to: string; subject: string; body: string }): Promise<SendResult> {
  const raw = buildRaw({ To: input.to, Subject: input.subject, "Content-Type": 'text/plain; charset="UTF-8"' }, input.body);
  const r = await call<{ id?: string; threadId?: string }>(conn, "/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw }) });
  if (!r?.id) return { ok: false, id: null, threadId: null, error: "send failed" };
  return { ok: true, id: r.id, threadId: r.threadId ?? null, error: null };
}

/**
 * Reply within a thread — preserves thread integrity by carrying In-Reply-To /
 * References (from the last message's Message-ID) and posting with the same
 * threadId, so Gmail keeps it in one conversation (Part 3).
 */
export async function replyToThread(conn: GoogleConnection, input: { threadId: string; to: string; subject: string; body: string }): Promise<SendResult> {
  // Find the last Message-ID to thread the reply correctly.
  const raw = await call<RawThread>(conn, `/users/me/threads/${encodeURIComponent(input.threadId)}`, { query: { format: "metadata", metadataHeaders: "Message-ID,References,Subject" } });
  const last = raw?.messages?.[raw.messages.length - 1];
  const lastMessageId = last ? header(last, "Message-ID") : null;
  const priorRefs = last ? header(last, "References") : null;
  const references = [priorRefs, lastMessageId].filter(Boolean).join(" ").trim() || undefined;
  const subject = input.subject.toLowerCase().startsWith("re:") ? input.subject : `Re: ${input.subject}`;
  const headers: Record<string, string> = { To: input.to, Subject: subject, "Content-Type": 'text/plain; charset="UTF-8"' };
  if (lastMessageId) headers["In-Reply-To"] = lastMessageId;
  if (references) headers["References"] = references;
  const rawMime = buildRaw(headers, input.body);
  const r = await call<{ id?: string; threadId?: string }>(conn, "/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw: rawMime, threadId: input.threadId }) });
  if (!r?.id) return { ok: false, id: null, threadId: null, error: "reply failed" };
  return { ok: true, id: r.id, threadId: r.threadId ?? input.threadId, error: null };
}

/** Mark a thread read/unread via label modify (Part 3 — unread state). */
export async function setThreadUnread(conn: GoogleConnection, threadId: string, unread: boolean): Promise<boolean> {
  const body = unread ? { addLabelIds: ["UNREAD"] } : { removeLabelIds: ["UNREAD"] };
  const r = await call<{ id?: string }>(conn, `/users/me/threads/${encodeURIComponent(threadId)}/modify`, { method: "POST", body: JSON.stringify(body) });
  return !!r;
}

// ── Communication OS bridge — GmailThreadLike (maps into the existing model) ──
/** Convert a canonical GmailThread into the Communication OS GmailThreadLike the
 *  existing mapGmailConversation mapper consumes. NO new model. */
export function toThreadLike(t: GmailThread): GmailThreadLike {
  return { id: t.id, subject: t.subject, fromName: t.from.name, fromAddress: t.from.address, lastAt: t.lastAt, unread: t.unread, snippet: t.snippet };
}

/** The connected user's inbox as GmailThreadLike records for the adapter.
 *  Honest empty when there is no live connection. */
export async function listThreadLikesForCurrentUser(max = 20): Promise<GmailThreadLike[]> {
  const conn = await getMyConnection();
  if (!conn || (conn.status !== "connected" && conn.status !== "syncing")) return [];
  const threads = await listThreads(conn, { q: "in:inbox", max });
  return threads.map(toThreadLike);
}

/** Load one thread's messages for the current user (adapter loadMessages). */
export async function loadThreadForCurrentUser(threadId: string): Promise<GmailMessage[]> {
  const conn = await getMyConnection();
  if (!conn || (conn.status !== "connected" && conn.status !== "syncing")) return [];
  return loadThreadMessages(conn, threadId);
}
