/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Commissions & Collections · Service (server-only)
// ----------------------------------------------------------------------------
// The commercial truth of a deal: a commission (side, gross, VAT, net, per-party
// shares) with a manager approval gate, and collections against it (due/collected,
// dates, payment status, invoice/receipt refs). Reversals are NON-DESTRUCTIVE —
// new rows in collection_events (append-only). Org-isolated; approve/cancel need
// the manager role. Tables are newer than the generated types → loose db client;
// public API stays typed.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export type CommissionStatus = "draft" | "pending_approval" | "approved" | "cancelled";
export type PaymentStatus = "pending" | "partial" | "paid" | "overdue";

export interface CommissionInput {
  dealId: string; side?: "buy" | "sell" | "both"; grossAmount: number; vatPct?: number;
  officeShare?: number; agentShare?: number; managerShare?: number; cooperatingBrokerShare?: number;
  referralShare?: number; adjustments?: number; notes?: string | null;
}
export interface CollectionSummary {
  id: string; amount_due: number; amount_collected: number; due_date: string | null;
  collection_date: string | null; payment_status: PaymentStatus; invoice_ref: string | null; receipt_ref: string | null;
}
export interface CommissionSummary {
  id: string; deal_id: string; deal_title: string | null; side: string; status: CommissionStatus;
  gross_amount: number; vat_amount: number; net_amount: number;
  office_share: number; agent_share: number; manager_share: number; cooperating_broker_share: number; referral_share: number; adjustments: number;
  approved_at: string | null; totalDue: number; totalCollected: number; collections: CollectionSummary[];
}
export interface DealOption { id: string; title: string; value: number | null }
export interface CommissionsCommandCenter {
  commissions: CommissionSummary[]; deals: DealOption[]; isManager: boolean;
  pendingApproval: number; approved: number; totalDue: number; totalCollected: number;
}

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("לא מחובר/ת");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default agent */ }
  const db = supabase as any;
  return { userId: user.id, orgId: profile.org_id, isManager, db };
}
type DB = any;
const round = (n: number) => Math.round(n);
const num = (n: number | undefined | null) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? round(n) : 0);

function computeVatNet(gross: number, vatPct: number, adjustments: number) {
  const g = num(gross);
  const vat_amount = round((g * vatPct) / 100);
  const net_amount = Math.max(0, g + adjustments);
  return { gross_amount: g, vat_amount, net_amount };
}

function derivePaymentStatus(due: number, collected: number, current: PaymentStatus): PaymentStatus {
  if (due > 0 && collected >= due) return "paid";
  if (collected > 0) return "partial";
  if (current === "overdue") return "overdue";
  return "pending";
}

// ── reads ────────────────────────────────────────────────────────────────────
function mapCollection(c: Record<string, unknown>): CollectionSummary {
  return {
    id: c.id as string, amount_due: (c.amount_due as number) ?? 0, amount_collected: (c.amount_collected as number) ?? 0,
    due_date: (c.due_date as string) ?? null, collection_date: (c.collection_date as string) ?? null,
    payment_status: ((c.payment_status as string) ?? "pending") as PaymentStatus,
    invoice_ref: (c.invoice_ref as string) ?? null, receipt_ref: (c.receipt_ref as string) ?? null,
  };
}

export async function listCommissions(): Promise<CommissionSummary[]> {
  const { orgId, db } = await ctx();
  const { data: comm } = await db.from("commissions").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(300);
  const rows = (comm ?? []) as Record<string, unknown>[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const dealIds = Array.from(new Set(rows.map((r) => r.deal_id as string).filter(Boolean)));
  const [{ data: cols }, { data: deals }] = await Promise.all([
    db.from("collections").select("*").eq("org_id", orgId).in("commission_id", ids),
    dealIds.length ? db.from("deals").select("id,title").eq("org_id", orgId).in("id", dealIds) : Promise.resolve({ data: [] }),
  ]);
  const colByComm = new Map<string, Record<string, unknown>[]>();
  for (const c of (cols ?? []) as Record<string, unknown>[]) {
    const k = c.commission_id as string;
    const arr = colByComm.get(k) ?? [];
    arr.push(c);
    colByComm.set(k, arr);
  }
  const titleById = new Map<string, string>();
  for (const d of (deals ?? []) as { id: string; title: string }[]) titleById.set(d.id, d.title);
  return rows.map((r) => {
    const cs = (colByComm.get(r.id as string) ?? []).map(mapCollection);
    return {
      id: r.id as string, deal_id: r.deal_id as string, deal_title: titleById.get(r.deal_id as string) ?? null,
      side: (r.side as string) ?? "sell", status: ((r.status as string) ?? "draft") as CommissionStatus,
      gross_amount: (r.gross_amount as number) ?? 0, vat_amount: (r.vat_amount as number) ?? 0, net_amount: (r.net_amount as number) ?? 0,
      office_share: (r.office_share as number) ?? 0, agent_share: (r.agent_share as number) ?? 0, manager_share: (r.manager_share as number) ?? 0,
      cooperating_broker_share: (r.cooperating_broker_share as number) ?? 0, referral_share: (r.referral_share as number) ?? 0, adjustments: (r.adjustments as number) ?? 0,
      approved_at: (r.approved_at as string) ?? null,
      totalDue: cs.reduce((s, c) => s + c.amount_due, 0), totalCollected: cs.reduce((s, c) => s + c.amount_collected, 0), collections: cs,
    };
  });
}

export async function getCommissionsCommandCenter(): Promise<CommissionsCommandCenter> {
  const { orgId, isManager, db } = await ctx();
  const commissions = await listCommissions();
  const { data: deals } = await db.from("deals").select("id,title,value").eq("org_id", orgId).eq("status", "open").order("created_at", { ascending: false }).limit(100);
  const dealOpts: DealOption[] = ((deals ?? []) as { id: string; title: string; value: number | null }[]).map((d) => ({ id: d.id, title: d.title, value: d.value ?? null }));
  return {
    commissions, deals: dealOpts, isManager,
    pendingApproval: commissions.filter((c) => c.status === "pending_approval").length,
    approved: commissions.filter((c) => c.status === "approved").length,
    totalDue: commissions.reduce((s, c) => s + c.totalDue, 0),
    totalCollected: commissions.reduce((s, c) => s + c.totalCollected, 0),
  };
}

// ── commission lifecycle ─────────────────────────────────────────────────────
export async function createCommission(input: CommissionInput): Promise<{ id: string }> {
  const { orgId, userId, db } = await ctx();
  if (!input.dealId) throw new Error("יש לבחור עסקה");
  const vatPct = typeof input.vatPct === "number" ? input.vatPct : 18;
  const adjustments = typeof input.adjustments === "number" ? round(input.adjustments) : 0;
  const { gross_amount, vat_amount, net_amount } = computeVatNet(input.grossAmount, vatPct, adjustments);
  const { data, error } = await db.from("commissions").insert({
    org_id: orgId, owner_id: userId, created_by: userId, deal_id: input.dealId, side: input.side ?? "sell",
    gross_amount, vat_pct: vatPct, vat_amount, net_amount, adjustments,
    office_share: num(input.officeShare), agent_share: num(input.agentShare), manager_share: num(input.managerShare),
    cooperating_broker_share: num(input.cooperatingBrokerShare), referral_share: num(input.referralShare),
    status: "draft", notes: input.notes ?? null,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "יצירת העמלה נכשלה");
  return { id: (data as { id: string }).id };
}

async function loadCommission(db: DB, orgId: string, id: string): Promise<Record<string, unknown>> {
  const { data } = await db.from("commissions").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!data) throw new Error("העמלה לא נמצאה");
  return data as Record<string, unknown>;
}

/** Recalculate figures — allowed only BEFORE approval. */
export async function recalcCommission(id: string, input: Omit<CommissionInput, "dealId">): Promise<void> {
  const { orgId, db } = await ctx();
  const c = await loadCommission(db, orgId, id);
  if (c.status === "approved" || c.status === "cancelled") throw new Error("לא ניתן לחשב מחדש עמלה מאושרת/מבוטלת");
  const vatPct = typeof input.vatPct === "number" ? input.vatPct : (c.vat_pct as number) ?? 18;
  const adjustments = typeof input.adjustments === "number" ? round(input.adjustments) : (c.adjustments as number) ?? 0;
  const { gross_amount, vat_amount, net_amount } = computeVatNet(input.grossAmount, vatPct, adjustments);
  const { error } = await db.from("commissions").update({
    side: input.side ?? c.side, gross_amount, vat_pct: vatPct, vat_amount, net_amount, adjustments,
    office_share: num(input.officeShare), agent_share: num(input.agentShare), manager_share: num(input.managerShare),
    cooperating_broker_share: num(input.cooperatingBrokerShare), referral_share: num(input.referralShare), notes: input.notes ?? c.notes,
  }).eq("org_id", orgId).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function submitCommissionForApproval(id: string): Promise<void> {
  const { orgId, db } = await ctx();
  const c = await loadCommission(db, orgId, id);
  if (c.status !== "draft") throw new Error("ניתן לשלוח לאישור רק עמלת טיוטה");
  await db.from("commissions").update({ status: "pending_approval" }).eq("org_id", orgId).eq("id", id);
}

export async function approveCommission(id: string): Promise<void> {
  const { orgId, userId, isManager, db } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול לאשר עמלה");
  const c = await loadCommission(db, orgId, id);
  if (c.status === "cancelled") throw new Error("העמלה בוטלה");
  await db.from("commissions").update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", id);
}

export async function cancelCommission(id: string): Promise<void> {
  const { orgId, isManager, db } = await ctx();
  if (!isManager) throw new Error("רק מנהל יכול לבטל עמלה");
  await db.from("commissions").update({ status: "cancelled" }).eq("org_id", orgId).eq("id", id);
}

// ── collections ──────────────────────────────────────────────────────────────
async function appendColEvent(db: DB, orgId: string, userId: string, collectionId: string, eventType: string, amount: number, note?: string | null) {
  await db.from("collection_events").insert({ org_id: orgId, collection_id: collectionId, actor_id: userId, event_type: eventType, amount: round(amount), note: note ?? null });
}

export async function createCollection(commissionId: string, input: { amountDue: number; dueDate?: string | null; invoiceRef?: string | null }): Promise<{ id: string }> {
  const { orgId, userId, db } = await ctx();
  const c = await loadCommission(db, orgId, commissionId);
  if (c.status !== "approved") throw new Error("יש לאשר את העמלה לפני יצירת גבייה");
  const { data, error } = await db.from("collections").insert({
    org_id: orgId, commission_id: commissionId, amount_due: num(input.amountDue), due_date: input.dueDate ?? null,
    invoice_ref: input.invoiceRef ?? null, payment_status: "pending", created_by: userId,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "יצירת הגבייה נכשלה");
  const id = (data as { id: string }).id;
  await appendColEvent(db, orgId, userId, id, "created", num(input.amountDue), "גבייה נוצרה");
  return { id };
}

async function loadCollection(db: DB, orgId: string, id: string): Promise<Record<string, unknown>> {
  const { data } = await db.from("collections").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!data) throw new Error("הגבייה לא נמצאה");
  return data as Record<string, unknown>;
}

/** Record a (possibly partial) collection — appends an event; never overwrites. */
export async function recordCollection(collectionId: string, amount: number, opts?: { receiptRef?: string | null; note?: string | null }): Promise<void> {
  const { orgId, userId, db } = await ctx();
  const amt = num(amount);
  if (amt <= 0) throw new Error("סכום הגבייה חייב להיות חיובי");
  const c = await loadCollection(db, orgId, collectionId);
  const due = (c.amount_due as number) ?? 0;
  const collected = ((c.amount_collected as number) ?? 0) + amt;
  const status = derivePaymentStatus(due, collected, (c.payment_status as PaymentStatus) ?? "pending");
  await db.from("collections").update({
    amount_collected: collected, payment_status: status,
    collection_date: status === "paid" ? new Date().toISOString().slice(0, 10) : (c.collection_date ?? null),
    receipt_ref: opts?.receiptRef ?? c.receipt_ref ?? null,
  }).eq("org_id", orgId).eq("id", collectionId);
  await appendColEvent(db, orgId, userId, collectionId, collected >= due && due > 0 ? "recorded" : "partial", amt, opts?.note ?? null);
}

export async function reverseCollection(collectionId: string, amount: number, note?: string | null): Promise<void> {
  const { orgId, userId, db } = await ctx();
  const amt = num(amount);
  if (amt <= 0) throw new Error("סכום ההיפוך חייב להיות חיובי");
  const c = await loadCollection(db, orgId, collectionId);
  const collected = Math.max(0, ((c.amount_collected as number) ?? 0) - amt);
  const due = (c.amount_due as number) ?? 0;
  const status = derivePaymentStatus(due, collected, "pending");
  await db.from("collections").update({ amount_collected: collected, payment_status: status }).eq("org_id", orgId).eq("id", collectionId);
  await appendColEvent(db, orgId, userId, collectionId, "reversed", amt, note ?? "היפוך גבייה");
}

export async function markCollectionPaid(collectionId: string): Promise<void> {
  const { orgId, userId, db } = await ctx();
  const c = await loadCollection(db, orgId, collectionId);
  const due = (c.amount_due as number) ?? 0;
  await db.from("collections").update({ amount_collected: due, payment_status: "paid", collection_date: new Date().toISOString().slice(0, 10) }).eq("org_id", orgId).eq("id", collectionId);
  await appendColEvent(db, orgId, userId, collectionId, "marked_paid", due, "סומן כשולם במלואו");
}

export async function markCollectionOverdue(collectionId: string): Promise<void> {
  const { orgId, userId, db } = await ctx();
  await db.from("collections").update({ payment_status: "overdue" }).eq("org_id", orgId).eq("id", collectionId);
  await appendColEvent(db, orgId, userId, collectionId, "marked_overdue", 0, "סומן כפגר תשלום");
}

export interface CollectionEventDTO { event_type: string; amount: number; note: string | null; created_at: string }
export async function getCollectionEvents(collectionId: string): Promise<CollectionEventDTO[]> {
  const { orgId, db } = await ctx();
  const { data } = await db.from("collection_events").select("event_type,amount,note,created_at").eq("org_id", orgId).eq("collection_id", collectionId).order("created_at", { ascending: false }).limit(50);
  return ((data ?? []) as Record<string, unknown>[]).map((e) => ({ event_type: e.event_type as string, amount: (e.amount as number) ?? 0, note: (e.note as string) ?? null, created_at: e.created_at as string }));
}
