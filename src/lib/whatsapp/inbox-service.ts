// ============================================================================
// 💬 ZONO WhatsApp — Unified Inbox service (server-only). 36.0.
// Thin READ layer over the EXISTING whatsapp_* tables + mission-engine. Groups
// conversations by CRM entity, assembles the intelligence card from ALREADY-
// STORED signals, and merges a per-conversation timeline from whatsapp_messages
// + whatsapp_call_events + whatsapp_drafts + meetings + missions. Adds NO table,
// NO scoring engine, NO auto-send. Never throws (degrades to empty).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { listEntityMissions } from "@/lib/mission-engine/service";
import { getPhoneReceivedPending } from "@/lib/distribution/comment-journey-service";
import { groupConversations, mergeTimeline, buildConversationCard, classifyKind, type WaConv, type UnifiedInbox, type TimelineEvent, type ConversationCard, type ConvKind, type BrokerWhatsapp } from "./inbox";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const bool = (v: unknown): boolean => v === true;

async function ctx(): Promise<{ db: Awaited<ReturnType<typeof createClient>>; orgId: string | null; userId: string | null }> {
  const sc = await getSessionContext();
  const db = await createClient();
  return { db, orgId: sc.profile?.org_id ?? sc.organization?.id ?? null, userId: sc.user?.id ?? null };
}

const CONV_COLS = "id,contact_name,buyer_id,seller_id,lead_id,property_id,assigned_agent_id,detected_role,state,intent,lead_score,urgency_score,intent_score,unread,missed_call_flag,needs_response,last_message,last_message_at,next_best_action";

function toWaConv(r: Row): WaConv {
  return {
    id: s(r.id) ?? "", contactName: s(r.contact_name),
    buyerId: s(r.buyer_id), sellerId: s(r.seller_id), leadId: s(r.lead_id), propertyId: s(r.property_id),
    assignedAgentId: s(r.assigned_agent_id), detectedRole: s(r.detected_role), state: s(r.state), intent: s(r.intent),
    leadScore: num(r.lead_score), urgencyScore: num(r.urgency_score), intentScore: num(r.intent_score),
    unread: bool(r.unread), missedCall: bool(r.missed_call_flag), needsResponse: bool(r.needs_response),
    lastMessage: s(r.last_message), lastMessageAt: s(r.last_message_at), nextBestAction: s(r.next_best_action),
  };
}

async function loadConversations(limit = 300): Promise<WaConv[]> {
  const { db, orgId } = await ctx();
  if (!orgId) return [];
  try {
    const { data } = await db.from("whatsapp_conversations" as never).select(CONV_COLS as never)
      .eq("organization_id" as never, orgId as never).order("last_message_at" as never, { ascending: false }).limit(limit);
    return ((data ?? []) as unknown as Row[]).map(toWaConv);
  } catch { return []; }
}

/** The full unified WhatsApp inbox, grouped by CRM entity with intelligence cards. */
export async function getUnifiedInbox(): Promise<UnifiedInbox> {
  const [convs, phonePending] = await Promise.all([
    loadConversations(),
    getPhoneReceivedPending().catch(() => ({ count: 0, items: [] as never[] })),
  ]);
  return { ...groupConversations(convs), facebookPhoneReceived: phonePending.count };
}

export interface ConversationDetail {
  conversation: WaConv | null;
  kind: ConvKind;
  card: ConversationCard | null;
  entityHref: string | null;
  timeline: TimelineEvent[];
  notes: string[];
}

/** One conversation + its merged cross-source timeline. */
export async function getConversationDetail(conversationId: string): Promise<ConversationDetail> {
  const { db, orgId } = await ctx();
  const notes: string[] = [];
  if (!orgId || !conversationId) return { conversation: null, kind: "unknown", card: null, entityHref: null, timeline: [], notes: ["לא זוהתה שיחה."] };

  let conv: WaConv | null = null;
  try {
    const { data } = await db.from("whatsapp_conversations" as never).select(CONV_COLS as never)
      .eq("organization_id" as never, orgId as never).eq("id" as never, conversationId as never).limit(1).maybeSingle();
    conv = data ? toWaConv(data as unknown as Row) : null;
  } catch { conv = null; }
  if (!conv) return { conversation: null, kind: "unknown", card: null, entityHref: null, timeline: [], notes: ["השיחה לא נמצאה."] };

  const raw: Array<Omit<TimelineEvent, "icon">> = [];

  // WhatsApp messages
  try {
    const { data } = await db.from("whatsapp_messages" as never).select("direction,body,created_at" as never)
      .eq("organization_id" as never, orgId as never).eq("conversation_id" as never, conversationId as never).order("created_at" as never, { ascending: false }).limit(80);
    for (const r of (data ?? []) as unknown as Row[]) raw.push({ at: s(r.created_at) ?? "", source: "whatsapp", title: s(r.direction) === "inbound" ? "הודעה נכנסת" : "הודעה יוצאת", detail: s(r.body), direction: s(r.direction) === "inbound" ? "inbound" : "outbound" });
  } catch { /* table absent */ }

  // Call events
  try {
    const { data } = await db.from("whatsapp_call_events" as never).select("event_type,recovery_status,occurred_at" as never)
      .eq("organization_id" as never, orgId as never).eq("conversation_id" as never, conversationId as never).order("occurred_at" as never, { ascending: false }).limit(20);
    for (const r of (data ?? []) as unknown as Row[]) raw.push({ at: s(r.occurred_at) ?? "", source: "call", title: s(r.event_type) === "missed" ? "שיחה שלא נענתה" : "שיחה", detail: s(r.recovery_status), direction: null });
  } catch { /* absent */ }

  // Drafts (approval-gated; never auto-sent)
  try {
    const { data } = await db.from("whatsapp_drafts" as never).select("body,send_status,approval_status,created_at" as never)
      .eq("organization_id" as never, orgId as never).eq("conversation_id" as never, conversationId as never).order("created_at" as never, { ascending: false }).limit(20);
    for (const r of (data ?? []) as unknown as Row[]) raw.push({ at: s(r.created_at) ?? "", source: "draft", title: `טיוטה (${s(r.approval_status) ?? "—"})`, detail: s(r.body), direction: "outbound" });
  } catch { /* absent */ }

  // Meetings linked to the same CRM entity
  const kind = classifyKind(conv);
  const entityId = conv.buyerId ?? conv.sellerId ?? conv.leadId ?? conv.propertyId;
  if (entityId) {
    const col = conv.buyerId ? "buyer_id" : conv.sellerId ? "seller_id" : conv.leadId ? "lead_id" : "property_id";
    try {
      const { data } = await db.from("meetings" as never).select("title,type,start_at" as never)
        .eq("organization_id" as never, orgId as never).eq(col as never, entityId as never).order("start_at" as never, { ascending: false }).limit(15);
      for (const r of (data ?? []) as unknown as Row[]) raw.push({ at: s(r.start_at) ?? "", source: "meeting", title: s(r.title) ?? "פגישה", detail: s(r.type), direction: null });
    } catch { /* absent */ }
  }

  // Missions linked to the CRM entity (reuse mission-engine)
  if (entityId && (kind === "buyer" || kind === "seller" || kind === "lead")) {
    try {
      const missions = await listEntityMissions(kind, entityId, orgId);
      for (const m of missions) raw.push({ at: m.createdAt, source: "mission", title: m.goal || m.reason || m.missionType, detail: m.status, direction: null });
    } catch { /* engine unavailable */ }
  }

  if (raw.length === 0) notes.push("אין עדיין אירועים בשיחה זו.");
  return { conversation: conv, kind, card: buildConversationCard(conv), entityHref: conv.buyerId ? `/buyers/${conv.buyerId}` : conv.sellerId ? `/sellers/${conv.sellerId}` : conv.leadId ? `/leads/${conv.leadId}` : conv.propertyId ? `/properties/${conv.propertyId}` : null, timeline: mergeTimeline(raw), notes };
}

// ── Broker-scoped WhatsApp summary (for /my integration) ────────────────────
/** WhatsApp slice for one broker (assigned_agent_id = broker), reusing the inbox grouping. */
export async function getBrokerWhatsapp(brokerId: string | null): Promise<BrokerWhatsapp> {
  const empty: BrokerWhatsapp = { unread: 0, waiting: 0, urgent: 0, today: 0, waitingConversations: [] };
  if (!brokerId) return empty;
  const all = await loadConversations(500);
  const mine = all.filter((c) => c.assignedAgentId === brokerId);
  const inbox = groupConversations(mine);
  const now = Date.now();
  const isToday = (iso: string | null) => { const t = iso ? Date.parse(iso) : NaN; if (!Number.isFinite(t)) return false; const d = new Date(t), n = new Date(now); return d.toDateString() === n.toDateString(); };
  const waitingConversations = inbox.groups.flatMap((g) => g.conversations)
    .filter((c) => c.needsResponse || c.state === "requires_reply")
    .sort((a, b) => b.card.urgency - a.card.urgency).slice(0, 8)
    .map((c) => ({ id: c.id, contactName: c.contactName ?? "ללא שם", reason: c.card.recommendedAction, href: `/whatsapp/inbox?c=${c.id}`, urgency: c.card.urgency }));
  return {
    unread: inbox.totals.unread, waiting: inbox.totals.waiting, urgent: inbox.totals.urgent,
    today: mine.filter((c) => isToday(c.lastMessageAt)).length, waitingConversations,
  };
}

// ── Ask ZONO for WhatsApp (Part 14) — reuses stored conversation intelligence ─
export interface WaAnswer { question: string; answer: string; conversations: { id: string; name: string; why: string; href: string }[] }

/** Answers the canonical WhatsApp questions from ALREADY-STORED signals. */
export async function answerWhatsappQuestion(question: string): Promise<WaAnswer> {
  const q = (question || "").trim();
  const all = await loadConversations(500);
  const inbox = groupConversations(all);
  const flat = inbox.groups.flatMap((g) => g.conversations);
  const ref = (c: (typeof flat)[number], why: string) => ({ id: c.id, name: c.contactName ?? "ללא שם", why, href: `/whatsapp/inbox?c=${c.id}` });

  let picked = flat; let label = "שיחות";
  if (/מחכ|תשוב|לא חזר|מענה/.test(q)) {
    picked = flat.filter((c) => c.needsResponse || c.state === "requires_reply").sort((a, b) => b.card.urgency - a.card.urgency);
    label = "ממתינים לתשובה";
  } else if (/נטוש|מתקרר|סיכון|לאבד/.test(q)) {
    picked = flat.filter((c) => c.card.risk === "מתקרר" || c.card.health < 45).sort((a, b) => a.card.health - b.card.health);
    label = "בסיכון נטישה";
  } else if (/חם|הכי חם|לוהט|קרוב/.test(q)) {
    picked = flat.filter((c) => c.state === "hot_lead" || c.card.urgencyLabel === "high").sort((a, b) => b.card.urgency - a.card.urgency);
    label = "השיחות החמות";
  } else {
    picked = flat.filter((c) => c.needsResponse).sort((a, b) => b.card.urgency - a.card.urgency);
    label = "דורשות טיפול";
  }

  const top = picked.slice(0, 8);
  const answer = top.length ? `${top.length} ${label}. התחל מ-${top[0].contactName ?? "הראשון"}.` : `אין כרגע ${label}.`;
  return { question: q, answer, conversations: top.map((c) => ref(c, c.card.recommendedAction + (c.card.risk ? ` · ${c.card.risk}` : ""))) };
}
