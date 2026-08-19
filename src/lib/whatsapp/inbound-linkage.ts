/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Inbound WhatsApp → CRM linkage (server-only, DETERMINISTIC). Closes the
// two-way loop: an inbound reply is attached to the correct CRM identity ONLY by
// exact org-scoped phone match (never fuzzy, never name), linked onto the existing
// whatsapp_conversations + written to the canonical activity timeline, re-evaluates
// the Follow-up Engine, and — when identity AND property context are both exact —
// reuses the existing recommendation-feedback / task writers. Emits a canonical
// customer.whatsapp_received (+ _action_required) so Communication Automation
// notifies the responsible agent. No second CRM, no second inbox, no guessing.
// ============================================================================
import "server-only";
import { normalizePhone } from "./cloud/core";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import { setConsent } from "@/lib/customer-comm/consent";
import { applyRecommendationFeedback, type FeedbackAction } from "@/lib/customer-comm/recommendation-feedback";

export type ReplyIntent = "interested" | "not_interested" | "request_viewing" | "request_call" | "price_discussion" | "question" | "other" | "unknown";
export type IdentityConfidence = "exact" | "ambiguous" | "unmatched";

export interface WaIdentity {
  confidence: IdentityConfidence;
  canonicalPhone: string;
  buyerId: string | null;
  leadId: string | null;
  sellerId: string | null;
  ownerId: string | null;      // responsible agent
  name: string | null;
  primaryType: "buyer" | "lead" | "seller" | null;
  primaryId: string | null;
}

const BOUNDED = 2000;
const norm = (p: string | null | undefined) => normalizePhone(String(p ?? ""));

// ── Deterministic phrase sets (exact/common only — no vibes) ────────────────
const OPT_OUT = ["הסר", "הסירו", "להסרה", "אל תשלחו", "אל תשלח", "תפסיקו לשלוח", "תורידו אותי", "stop", "unsubscribe"];
const VIEWING = ["רוצה לראות", "אפשר לראות", "לתאם ביקור", "לקבוע ביקור", "רוצה ביקור", "לבקר בנכס", "סיור"];
const CALL = ["תחזרו אליי", "תחזור אליי", "תתקשרו", "תתקשר אליי", "רוצה שתתקשרו", "שיחה טלפונית", "call me"];
const INTERESTED = ["מעניין אותי", "מעוניין", "מתאים לי", "רוצה פרטים", "נשמע טוב", "interested"];
const NOT_INTERESTED = ["לא מתאים", "לא מעוניין", "לא רלוונטי", "לא תודה", "not interested"];
// Seller-side price-discussion cue. Feeds an agent task ONLY — never an auto price write.
const PRICE_DISCUSSION = ["להוריד מחיר", "הורדת מחיר", "לרדת במחיר", "לרדת מחיר", "לדבר על המחיר", "לשנות מחיר", "המחיר גבוה", "reduce price", "lower the price", "drop the price"];

function includesAny(t: string, arr: string[]): boolean { return arr.some((p) => t.includes(p)); }

export function isOptOutPhrase(text: string): boolean {
  return includesAny((text ?? "").toLowerCase().trim(), OPT_OUT);
}

/** Constrained, deterministic intent. AI is NOT used — identity/property stay exact. */
export function classifyReplyIntent(text: string): ReplyIntent {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return "unknown";
  if (includesAny(t, VIEWING)) return "request_viewing";
  if (includesAny(t, PRICE_DISCUSSION)) return "price_discussion";
  if (includesAny(t, CALL)) return "request_call";
  if (includesAny(t, NOT_INTERESTED)) return "not_interested";
  if (includesAny(t, INTERESTED)) return "interested";
  if (t.includes("?") || includesAny(t, ["כמה", "מתי", "איפה", "האם", "מה ה"])) return "question";
  return "other";
}

/** Ordinal referenced in a reply ("הראשונה"/"השנייה"/"השלישית") → 0-based index. */
function ordinalIndex(text: string): number | null {
  const t = text ?? "";
  if (/ראשונ|הראשו|\bפ1\b|(^|\D)1(\D|$)|first/.test(t)) return 0;
  if (/שניי?ה|השני|second/.test(t)) return 1;
  if (/שלישי|השליש|third/.test(t)) return 2;
  if (/רביעי|fourth/.test(t)) return 3;
  return null;
}

// ── Identity resolution — EXACT org-scoped phone only ───────────────────────
async function matchTable(db: any, table: string, orgId: string, wantNorm: string): Promise<Array<{ id: string; owner_id: string | null; full_name: string | null }>> {
  const { data } = await db.from(table).select("id,phone,owner_id,full_name")
    .eq("org_id", orgId).not("phone", "is", null).limit(BOUNDED);
  return ((data ?? []) as any[]).filter((r) => norm(r.phone) === wantNorm)
    .map((r) => ({ id: r.id as string, owner_id: (r.owner_id as string | null) ?? null, full_name: (r.full_name as string | null) ?? null }));
}

export async function resolveWhatsAppCustomerIdentity(db: any, orgId: string, phone: string): Promise<WaIdentity> {
  const canonicalPhone = norm(phone);
  const base: WaIdentity = { confidence: "unmatched", canonicalPhone, buyerId: null, leadId: null, sellerId: null, ownerId: null, name: null, primaryType: null, primaryId: null };
  if (!orgId || canonicalPhone.length < 6) return base;

  const [buyers, leads, sellers] = await Promise.all([
    matchTable(db, "buyers", orgId, canonicalPhone),
    matchTable(db, "leads", orgId, canonicalPhone),
    matchTable(db, "sellers", orgId, canonicalPhone),
  ]);
  // Multiple DISTINCT records in the same role = we cannot tell WHO safely → ambiguous.
  if (buyers.length > 1 || leads.length > 1 || sellers.length > 1) return { ...base, confidence: "ambiguous" };
  const buyer = buyers[0] ?? null, lead = leads[0] ?? null, seller = sellers[0] ?? null;
  if (!buyer && !lead && !seller) return base;   // unmatched

  // One-per-role = the same person's CRM representations (Phase 7) → keep all ids.
  const primary = lead ? { type: "lead" as const, r: lead } : buyer ? { type: "buyer" as const, r: buyer } : { type: "seller" as const, r: seller! };
  return {
    confidence: "exact", canonicalPhone,
    buyerId: buyer?.id ?? null, leadId: lead?.id ?? null, sellerId: seller?.id ?? null,
    ownerId: primary.r.owner_id, name: (buyer ?? lead ?? seller)?.full_name ?? null,
    primaryType: primary.type, primaryId: primary.r.id,
  };
}

// ── Bundle context: resolve a property ONLY when unambiguous ─────────────────
async function resolvePropertyFromBundle(db: any, orgId: string, contactType: "buyer" | "lead", contactId: string, text: string): Promise<string | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await db.from("customer_property_recommendations")
    .select("property_id,bundle_id,match_score,recommended_at")
    .eq("org_id", orgId).eq("contact_type", contactType).eq("contact_id", contactId)
    .gte("recommended_at", sevenDaysAgo).order("recommended_at", { ascending: false }).limit(60);
  const rows = (data ?? []) as Array<{ property_id: string; bundle_id: string; match_score: number | null; recommended_at: string }>;
  if (!rows.length) return null;
  const bundleIds = [...new Set(rows.map((r) => r.bundle_id))];
  if (bundleIds.length !== 1) return null;                     // multiple recent bundles → ambiguous → no guess
  const bundle = rows.slice().sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));   // email display order
  if (bundle.length === 1) return bundle[0].property_id;       // single-property bundle → unambiguous
  const idx = ordinalIndex(text);
  return idx != null && idx < bundle.length ? bundle[idx].property_id : null;   // ordinal only
}

const INTENT_TO_FEEDBACK: Partial<Record<ReplyIntent, FeedbackAction>> = {
  interested: "interested", not_interested: "rejected", request_viewing: "viewing_requested",
};

export interface InboundLinkageInput {
  orgId: string; conversationId: string | null; waMessageId: string;
  fromPhone: string; text: string; contactName: string | null;
}
export interface InboundLinkageResult { confidence: IdentityConfidence; intent: ReplyIntent; linked: boolean; propertyId: string | null; actionable: boolean }

/** MAIN entry — called (best-effort) by the webhook after an inbound row is stored. */
export async function processInboundWhatsAppLinkage(db: any, input: InboundLinkageInput): Promise<InboundLinkageResult> {
  const text = input.text ?? "";
  const intent = classifyReplyIntent(text);
  const optOut = isOptOutPhrase(text);
  const id = await resolveWhatsAppCustomerIdentity(db, input.orgId, input.fromPhone);

  // Non-exact → keep the message safely stored + flag for triage; never guess.
  if (id.confidence !== "exact" || !id.primaryId || !id.primaryType) {
    if (input.conversationId) {
      try { await db.from("whatsapp_conversations").update({ state: id.confidence === "ambiguous" ? "requires_link" : "requires_reply" } as never).eq("organization_id", input.orgId).eq("id", input.conversationId); } catch { /* best-effort */ }
    }
    return { confidence: id.confidence, intent, linked: false, propertyId: null, actionable: false };
  }
  const contactType: "buyer" | "lead" | "seller" = id.primaryType;

  // OPT-OUT wins immediately for FUTURE marketing; inbound NEVER grants opt-in.
  if (optOut) {
    try { if (contactType !== "seller") await setConsent(input.orgId, contactType, id.primaryId, "whatsapp", "opted_out", "inbound_reply", db); } catch { /* best-effort */ }
  }

  // Property context — only when exact + unambiguous bundle.
  let propertyId: string | null = null;
  if ((contactType === "buyer" || contactType === "lead") && !optOut) {
    propertyId = await resolvePropertyFromBundle(db, input.orgId, contactType, id.primaryId, text);
  }

  // Link the CRM ids onto the existing conversation (no second inbox).
  if (input.conversationId) {
    try {
      await db.from("whatsapp_conversations").update({
        buyer_id: id.buyerId, lead_id: id.leadId, seller_id: id.sellerId, property_id: propertyId,
        assigned_agent_id: id.ownerId, state: "requires_reply", detected_role: contactType,
      } as never).eq("organization_id", input.orgId).eq("id", input.conversationId);
    } catch { /* best-effort */ }
  }

  // Canonical CRM timeline entry (appears automatically on the entity cockpit).
  try {
    await db.from("activity_events").insert({
      org_id: input.orgId, actor_type: "system", event_type: "communication.received",
      entity_type: contactType, entity_id: id.primaryId,
      related_entity_type: propertyId ? "property" : null, related_entity_id: propertyId,
      title: "הודעת וואטסאפ נכנסת", description: text.slice(0, 500),
      channel: "whatsapp", direction: "inbound",
      occurred_at: new Date().toISOString(),
      metadata: { wa_message_id: input.waMessageId, intent, confidence: id.confidence, property_id: propertyId, opt_out: optOut },
    } as never);
  } catch { /* best-effort */ }

  // Follow-up re-evaluation: an inbound reply is meaningful contact.
  if (id.leadId) {
    try {
      const { data: lrow } = await db.from("leads").select("stage").eq("id", id.leadId).eq("org_id", input.orgId).maybeSingle();
      const stage = (lrow?.stage as string | null) ?? null;
      await db.from("leads").update({ last_activity_at: new Date().toISOString(), stage: stage === "new" ? "contacted" : stage } as never).eq("id", id.leadId).eq("org_id", input.orgId);
    } catch { /* best-effort */ }
  }

  // Deterministic actions — identity exact; property exact where required.
  let actionable = false;
  if (!optOut) {
    const feedback = propertyId ? INTENT_TO_FEEDBACK[intent] : undefined;
    if (feedback && (contactType === "buyer" || contactType === "lead") && propertyId) {
      // Phase 16: explicit /r feedback stays authoritative — never overwrite it.
      const { data: rec } = await db.from("customer_property_recommendations").select("status")
        .eq("org_id", input.orgId).eq("contact_type", contactType).eq("contact_id", id.primaryId).eq("property_id", propertyId).maybeSingle();
      const cur = (rec?.status as string | null) ?? null;
      const explicit = cur === "interested" || cur === "rejected" || cur === "viewing_requested";
      if (!explicit) { try { await applyRecommendationFeedback(input.orgId, contactType, id.primaryId, propertyId, feedback); } catch { /* best-effort */ } }
      actionable = true;
    }
    if (intent === "request_call") { await ensureWaTask(db, input.orgId, id, "callback", "בקשת חזרה טלפונית מלקוח (וואטסאפ)"); actionable = true; }
    if (intent === "price_discussion") {
      // Seller (or buyer) asks to discuss price → agent task. NEVER writes properties.price.
      const title = contactType === "seller" ? "בעל הנכס מבקש לדון במחיר (וואטסאפ)" : "בקשת דיון במחיר (וואטסאפ)";
      await ensureWaTask(db, input.orgId, id, "price_discussion", title);
      actionable = true;
    }
    if (intent === "request_viewing" && !propertyId) {
      await ensureWaTask(db, input.orgId, id, "viewing", "בקשת ביקור מלקוח (וואטסאפ)");
      // Canonical viewing.requested (property unresolved — a bare request the agent schedules).
      if (contactType === "buyer" || contactType === "lead") {
        try { await emitBusinessEvent({ type: DOMAIN_EVENTS.viewingRequested, entityType: contactType, entityId: id.primaryId, orgId: input.orgId, payload: { leadName: id.name, propertyId: null }, idempotencyKey: `viewing.requested:wa:${input.waMessageId}` }); } catch { /* best-effort */ }
      }
      actionable = true;
    }
    if (intent === "interested" && !propertyId) { actionable = true; }
  }

  // Emit — Communication Automation decides notification (in-app to the owner).
  const evtBase = { entityType: contactType, entityId: id.primaryId, orgId: input.orgId,
    payload: { intent, propertyId, name: id.name, leadId: id.leadId, buyerId: id.buyerId, sellerId: id.sellerId } };
  try {
    await emitBusinessEvent({ type: DOMAIN_EVENTS.customerWhatsappReceived, ...evtBase, idempotencyKey: `customer.whatsapp_received:${input.waMessageId}` });
    if (actionable) await emitBusinessEvent({ type: DOMAIN_EVENTS.customerWhatsappActionRequired, ...evtBase, idempotencyKey: `customer.whatsapp_action_required:${input.waMessageId}` });
  } catch { /* best-effort */ }

  return { confidence: "exact", intent, linked: true, propertyId, actionable };
}

export interface RecentReply { conversationId: string; name: string | null; lastMessage: string | null; at: string | null; role: string | null; buyerId: string | null; leadId: string | null; sellerId: string | null; ownerId: string | null }

/** Recent LINKED inbound WhatsApp replies (for ZI + the Morning Brief). Org-scoped;
 *  optionally narrowed to one agent's own contacts. Bounded. */
export async function listRecentWhatsAppReplies(db: any, orgId: string, opts?: { ownerId?: string | null; unreadOnly?: boolean; limit?: number }): Promise<RecentReply[]> {
  let q = db.from("whatsapp_conversations")
    .select("id,contact_name,last_message,last_message_at,detected_role,buyer_id,lead_id,seller_id,assigned_agent_id")
    .eq("organization_id", orgId).not("detected_role", "is", null)
    .order("last_message_at", { ascending: false }).limit(opts?.limit ?? 20);
  if (opts?.unreadOnly) q = q.eq("unread", true);
  if (opts?.ownerId) q = q.eq("assigned_agent_id", opts.ownerId);
  const { data } = await q;
  return ((data ?? []) as any[]).map((c) => ({
    conversationId: c.id, name: c.contact_name ?? null, lastMessage: c.last_message ?? null, at: c.last_message_at ?? null,
    role: c.detected_role ?? null, buyerId: c.buyer_id ?? null, leadId: c.lead_id ?? null, sellerId: c.seller_id ?? null, ownerId: c.assigned_agent_id ?? null,
  }));
}

/** Manual same-org link of a conversation to a CRM contact (agent triage). Caller
 *  MUST have already verified org ownership of BOTH sides. Writes the link + a
 *  timeline entry. */
export async function linkConversationToContact(db: any, orgId: string, conversationId: string, targetType: "buyer" | "lead" | "seller", targetId: string, ownerId: string | null): Promise<void> {
  const patch: any = { detected_role: targetType, assigned_agent_id: ownerId, state: "requires_reply" };
  patch[`${targetType}_id`] = targetId;
  await db.from("whatsapp_conversations").update(patch as never).eq("organization_id", orgId).eq("id", conversationId);
  try {
    await db.from("activity_events").insert({
      org_id: orgId, actor_type: "user", event_type: "communication.received", entity_type: targetType, entity_id: targetId,
      title: "שיוך שיחת וואטסאפ לאיש קשר", channel: "whatsapp", direction: "inbound", occurred_at: new Date().toISOString(),
      metadata: { conversation_id: conversationId, manual_link: true },
    } as never);
  } catch { /* best-effort */ }
}

/** Idempotent WhatsApp-derived agent task (callback / viewing) on the owner. */
async function ensureWaTask(db: any, orgId: string, id: WaIdentity, kind: "callback" | "viewing" | "price_discussion", title: string): Promise<void> {
  const source = `wa:${kind}:${id.primaryType}:${id.primaryId}`;
  try {
    const { data: existing } = await db.from("tasks").select("id")
      .eq("org_id", orgId).eq("intelligence_source", source).in("status", ["todo", "in_progress", "blocked"]).limit(1).maybeSingle();
    if (existing?.id) return;
    const row: any = { org_id: orgId, assignee_id: id.ownerId, title, status: "todo", priority: "high", intelligence_source: source, is_automatable: true };
    if (id.leadId) row.lead_id = id.leadId;
    if (id.buyerId) row.buyer_id = id.buyerId;
    if (id.sellerId) row.seller_id = id.sellerId;
    await db.from("tasks").insert(row);
  } catch { /* best-effort */ }
}
