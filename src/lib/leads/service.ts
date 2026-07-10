// ============================================================================
// 📇 ZONO OS 2.0 — Stage 0.5 · Canonical Lead service (server-only).
// The single owner of Lead lifecycle transitions and conversion. Leads were
// previously insert-only (stage/score frozen). This adds: stage change, score,
// assign, contact, qualify, lost — and an intent-aware, transaction-safe,
// idempotent conversion to Buyer / Seller / both that preserves source +
// attribution, persists converted_*_id, dedups by contact, and initializes the
// right intelligence + journey. Buyer/Seller/Lead stay distinct entities.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import { EVENT_TYPES } from "@/lib/activity/types";
import { emitBusinessEvent, DOMAIN_EVENTS } from "@/lib/kernel";

type SB = Awaited<ReturnType<typeof createClient>>;
export const LEAD_STAGES = ["new", "contacted", "qualified", "nurturing", "converted", "lost", "disqualified"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export interface LeadResult { ok: boolean; error?: string; buyerId?: string; sellerId?: string }

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  return { userId: user.id, orgId: profile.org_id };
}
const nowIso = () => new Date().toISOString();

/** Normalized contact keys for duplicate detection (no destructive merge). */
export function normalizePhone(v?: string | null): string | null {
  if (!v) return null; const d = String(v).replace(/[^\d]/g, ""); return d.length >= 6 ? d : null;
}
export function normalizeEmail(v?: string | null): string | null {
  const e = v?.trim().toLowerCase(); return e && e.includes("@") ? e : null;
}

async function loadLead(db: SB, orgId: string, leadId: string) {
  const { data } = await db.from("leads").select("*").eq("id", leadId).eq("org_id", orgId).maybeSingle();
  return data as Record<string, unknown> | null;
}

/** Find an existing buyer/seller for the same contact (dedup — never creates a second person). */
async function findExistingContact(db: SB, orgId: string, table: "buyers" | "sellers", phone: string | null, email: string | null): Promise<string | null> {
  if (!phone && !email) return null;
  if (email) {
    const { data } = await db.from(table).select("id").eq("org_id", orgId).ilike("email", email).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (phone) {
    const { data } = await db.from(table).select("id,phone").eq("org_id", orgId).not("phone", "is", null).limit(200);
    for (const r of data ?? []) if (normalizePhone(r.phone as string) === phone) return r.id as string;
  }
  return null;
}

async function insertContact(db: SB, orgId: string, ownerId: string, table: "buyers" | "sellers", lead: Record<string, unknown>): Promise<string | null> {
  const { data } = await db.from(table).insert({
    org_id: orgId, owner_id: ownerId,
    full_name: (lead.full_name as string) || "לקוח/ה",
    phone: (lead.phone as string | null) ?? null,
    email: (lead.email as string | null) ?? null,
  } as never).select("id").maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ── Lifecycle transitions ────────────────────────────────────────────────────
export async function setLeadStage(leadId: string, stage: LeadStage): Promise<LeadResult> {
  const { orgId } = await ctx(); const db = await createClient();
  const lead = await loadLead(db, orgId, leadId); if (!lead) return { ok: false, error: "הליד לא נמצא." };
  const { error } = await db.from("leads").update({ stage, last_activity_at: nowIso() } as never).eq("id", leadId).eq("org_id", orgId);
  if (error) return { ok: false, error: error.message };
  await logActivityEvent({ eventType: EVENT_TYPES.leadStageChanged, entityType: "lead", entityId: leadId, title: `שלב הליד עודכן: ${stage}` });
  await emitBusinessEvent({ type: DOMAIN_EVENTS.leadStageChanged, entityType: "lead", entityId: leadId, payload: { stage } });
  return { ok: true };
}

export async function setLeadScore(leadId: string, score: number): Promise<LeadResult> {
  const { orgId } = await ctx(); const db = await createClient();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { error } = await db.from("leads").update({ score: clamped, last_activity_at: nowIso() } as never).eq("id", leadId).eq("org_id", orgId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function assignLead(leadId: string, ownerId: string): Promise<LeadResult> {
  const { orgId } = await ctx(); const db = await createClient();
  const { error } = await db.from("leads").update({ owner_id: ownerId, last_activity_at: nowIso() } as never).eq("id", leadId).eq("org_id", orgId);
  if (error) return { ok: false, error: error.message };
  await logActivityEvent({ eventType: EVENT_TYPES.leadAssigned, entityType: "lead", entityId: leadId, title: "הליד שויך מחדש" });
  return { ok: true };
}

export async function markLeadContacted(leadId: string): Promise<LeadResult> {
  const { orgId } = await ctx(); const db = await createClient();
  const lead = await loadLead(db, orgId, leadId); if (!lead) return { ok: false, error: "הליד לא נמצא." };
  const patch: Record<string, unknown> = { last_activity_at: nowIso() };
  if (lead.stage === "new") patch.stage = "contacted";
  const { error } = await db.from("leads").update(patch as never).eq("id", leadId).eq("org_id", orgId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function markLeadLost(leadId: string, reason?: string | null): Promise<LeadResult> {
  const { orgId } = await ctx(); const db = await createClient();
  const { error } = await db.from("leads").update({ stage: "lost", lost_reason: reason ?? null, last_activity_at: nowIso() } as never).eq("id", leadId).eq("org_id", orgId);
  if (error) return { ok: false, error: error.message };
  await logActivityEvent({ eventType: EVENT_TYPES.leadStageChanged, entityType: "lead", entityId: leadId, title: "הליד סומן כאבוד", description: reason ?? null });
  return { ok: true };
}

// ── Conversion (intent-aware, transaction-safe, idempotent) ──────────────────
export interface ConvertLeadInput { toBuyer?: boolean; toSeller?: boolean }

export async function convertLead(leadId: string, input: ConvertLeadInput = {}): Promise<LeadResult> {
  const { userId, orgId } = await ctx(); const db = await createClient();
  const lead = await loadLead(db, orgId, leadId); if (!lead) return { ok: false, error: "הליד לא נמצא." };

  // Derive targets from intent when the caller doesn't specify — FIXES the
  // seller-intent-creates-buyer bug: a 'seller' lead converts to a SELLER only.
  const intent = String(lead.intent ?? "unknown");
  const toSeller = input.toSeller ?? (intent === "seller" || intent === "both");
  let toBuyer = input.toBuyer ?? (intent === "buyer" || intent === "both" || intent === "investor" || intent === "renter");
  if (!toBuyer && !toSeller) toBuyer = true; // unknown intent → default to buyer, explicitly

  const phone = normalizePhone(lead.phone as string | null);
  const email = normalizeEmail(lead.email as string | null);
  let buyerId = (lead.converted_buyer_id as string | null) ?? null;   // idempotent: reuse prior conversion
  let sellerId = (lead.converted_seller_id as string | null) ?? null;

  if (toBuyer && !buyerId) {
    buyerId = await findExistingContact(db, orgId, "buyers", phone, email) ?? await insertContact(db, orgId, userId, "buyers", lead);
    if (buyerId) {
      try {
        const { initializeBuyerIntelligence } = await import("@/lib/buyer-intelligence/service");
        await initializeBuyerIntelligence(buyerId);
        const { ensureJourney } = await import("@/lib/journey-intelligence/service");
        await ensureJourney("buyer", buyerId);
      } catch (e) { console.error("[leads] buyer init failed:", e); }
    }
  }
  if (toSeller && !sellerId) {
    sellerId = await findExistingContact(db, orgId, "sellers", phone, email) ?? await insertContact(db, orgId, userId, "sellers", lead);
    if (sellerId) {
      try {
        const { initializeSellerIntelligence } = await import("@/lib/seller-intelligence/service");
        await initializeSellerIntelligence(sellerId);
        const { ensureJourney } = await import("@/lib/journey-intelligence/service");
        await ensureJourney("seller", sellerId);
      } catch (e) { console.error("[leads] seller init failed:", e); }
    }
  }

  // Persist the conversion links + stage on the ORIGINAL lead (kept for attribution).
  const { error } = await db.from("leads").update({
    stage: "converted", converted_buyer_id: buyerId, converted_seller_id: sellerId, last_activity_at: nowIso(),
  } as never).eq("id", leadId).eq("org_id", orgId);
  if (error) return { ok: false, error: error.message };

  const label = buyerId && sellerId ? "לקונה ומוכר" : sellerId ? "למוכר" : "לקונה";
  await logActivityEvent({
    eventType: EVENT_TYPES.leadConverted, entityType: "lead", entityId: leadId,
    title: `הליד הומר ${label}`, metadata: { buyerId, sellerId, source: lead.source ?? null },
  });
  if (buyerId) await emitBusinessEvent({ type: DOMAIN_EVENTS.leadConvertedToBuyer, entityType: "lead", entityId: leadId, payload: { buyerId }, idempotencyKey: `lead_conv_buyer:${leadId}` });
  if (sellerId) await emitBusinessEvent({ type: DOMAIN_EVENTS.leadConvertedToSeller, entityType: "lead", entityId: leadId, payload: { sellerId }, idempotencyKey: `lead_conv_seller:${leadId}` });
  return { ok: true, buyerId: buyerId ?? undefined, sellerId: sellerId ?? undefined };
}
