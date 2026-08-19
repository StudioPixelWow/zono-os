/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Viewing automation: CUSTOMER dispatch (server-only). Slice 3.
// Sends the two customer-facing viewing links — a CONFIRMATION request for an
// upcoming scheduled viewing, and a POST-VIEWING FEEDBACK request after one
// completes. Runs from a CRON over the meetings table (never from the booking/
// completion write path) so a slow/failed provider can never break a core write.
// Every send passes the conservative consent gate (transactional purpose → unless
// opted_out) and is idempotent per (org, dedup_key) on notification_deliveries —
// no second ledger, no double-send. Email is the working channel today; WhatsApp
// business-initiated confirmation is added on top of this same gate later.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendCustomerEmail } from "@/lib/customer-comm/send";
import { viewingUrl } from "./tokens";
import { heViewingTime } from "./lifecycle";

const VIEWING_TYPES = ["viewing", "open_house"];

export interface ViewingDispatchResult {
  scannedConfirm: number; sentConfirm: number;
  scannedFeedback: number; sentFeedback: number;
  skipped: number; durationMs?: number;
}

type ContactRef = { type: "buyer" | "lead"; id: string; name: string | null; email: string | null };

async function bulkContacts(db: any, buyerIds: string[], leadIds: string[]): Promise<Map<string, { name: string | null; email: string | null }>> {
  const out = new Map<string, { name: string | null; email: string | null }>();
  if (buyerIds.length) {
    const { data } = await db.from("buyers").select("id,full_name,email").in("id", buyerIds);
    for (const b of (data ?? []) as any[]) out.set(`buyer:${b.id}`, { name: b.full_name ?? null, email: b.email ?? null });
  }
  if (leadIds.length) {
    const { data } = await db.from("leads").select("id,full_name,email").in("id", leadIds);
    for (const l of (data ?? []) as any[]) out.set(`lead:${l.id}`, { name: l.full_name ?? null, email: l.email ?? null });
  }
  return out;
}

async function bulkPropertyTitles(db: any, propertyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!propertyIds.length) return out;
  const { data } = await db.from("properties").select("id,title").in("id", propertyIds);
  for (const p of (data ?? []) as any[]) if (p.title) out.set(p.id, p.title);
  return out;
}

function contactOf(m: any): ContactRef | null {
  if (m.buyer_id) return { type: "buyer", id: m.buyer_id, name: null, email: null };
  if (m.lead_id) return { type: "lead", id: m.lead_id, name: null, email: null };
  return null;
}

function htmlDoc(title: string, bodyLines: string[], cta: { label: string; url: string }): string {
  const lines = bodyLines.map((l) => `<p style="margin:0 0 10px;color:#334155;font-size:15px;line-height:1.6">${l}</p>`).join("");
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:28px">
<h1 style="margin:0 0 14px;color:#0f172a;font-size:20px;font-weight:900">${title}</h1>
${lines}
<a href="${cta.url}" style="display:inline-block;margin-top:12px;background:#6d28d9;color:#fff;text-decoration:none;border-radius:12px;padding:12px 22px;font-size:15px;font-weight:800">${cta.label}</a>
</div></body></html>`;
}

/** Send confirmation requests for upcoming scheduled viewings + feedback requests
 *  for recently completed ones. Global (service-role) scan, bounded, idempotent. */
export async function runViewingDispatch(opts?: { scheduledWithinDays?: number; completedWithinDays?: number; limit?: number }): Promise<ViewingDispatchResult> {
  const db: any = createServiceRoleClient();
  const started = Date.now();
  const scheduledWithinDays = opts?.scheduledWithinDays ?? 14;
  const completedWithinDays = opts?.completedWithinDays ?? 3;
  const limit = opts?.limit ?? 300;
  const nowIso = new Date().toISOString();
  const res: ViewingDispatchResult = { scannedConfirm: 0, sentConfirm: 0, scannedFeedback: 0, sentFeedback: 0, skipped: 0 };

  // ── 1) Confirmation requests: upcoming, still 'scheduled' viewings ───────────
  const confirmToIso = new Date(Date.now() + scheduledWithinDays * 86_400_000).toISOString();
  const { data: confirmRows } = await db.from("meetings")
    .select("id,org_id,title,type,status,start_at,buyer_id,lead_id,property_id")
    .in("type", VIEWING_TYPES).eq("status", "scheduled")
    .gte("start_at", nowIso).lte("start_at", confirmToIso)
    .order("start_at", { ascending: true }).limit(limit);
  const confirm = (confirmRows ?? []) as any[];

  // ── 2) Feedback requests: recently 'completed' viewings ──────────────────────
  const feedbackFromIso = new Date(Date.now() - completedWithinDays * 86_400_000).toISOString();
  const { data: feedbackRows } = await db.from("meetings")
    .select("id,org_id,title,type,status,start_at,completed_at,buyer_id,lead_id,property_id")
    .in("type", VIEWING_TYPES).eq("status", "completed")
    .gte("completed_at", feedbackFromIso)
    .order("completed_at", { ascending: false }).limit(limit);
  const feedback = (feedbackRows ?? []) as any[];

  const all = [...confirm, ...feedback];
  const buyerIds = [...new Set(all.filter((m) => m.buyer_id).map((m) => m.buyer_id as string))];
  const leadIds = [...new Set(all.filter((m) => m.lead_id && !m.buyer_id).map((m) => m.lead_id as string))];
  const propIds = [...new Set(all.filter((m) => m.property_id).map((m) => m.property_id as string))];
  const [contacts, propTitles] = await Promise.all([bulkContacts(db, buyerIds, leadIds), bulkPropertyTitles(db, propIds)]);

  for (const m of confirm) {
    res.scannedConfirm++;
    const c = contactOf(m); if (!c) { res.skipped++; continue; }
    const info = contacts.get(`${c.type}:${c.id}`); const email = info?.email ?? null;
    if (!email) { res.skipped++; continue; }
    const url = viewingUrl({ o: m.org_id, m: m.id, k: "confirm" });
    if (!url) { res.skipped++; continue; }
    const when = heViewingTime(m.start_at);
    const propTitle = m.property_id ? propTitles.get(m.property_id) ?? null : null;
    const name = info?.name ?? null;
    const text = `שלום${name ? ` ${name}` : ""}, נקבע עבורך ביקור${when ? ` ל-${when}` : ""}${propTitle ? ` בנכס: ${propTitle}` : ""}. לאישור ההגעה או לתיאום מועד אחר: ${url}`;
    const html = htmlDoc("אישור הגעה לביקור", [
      `שלום${name ? ` ${name}` : ""},`,
      `נקבע עבורך ביקור${when ? ` ל-<strong>${when}</strong>` : ""}${propTitle ? ` בנכס <strong>${propTitle}</strong>` : ""}.`,
      "אפשר לאשר את ההגעה או לבקש מועד אחר בלחיצה:",
    ], { label: "לאישור הביקור", url });
    const r = await sendCustomerEmail({
      orgId: m.org_id, contact: { type: c.type, id: c.id, name, email }, purpose: "transactional",
      subject: "אישור הגעה לביקור בנכס", text, html, dedupKey: `viewing-confirm:${m.id}`,
    }, db);
    if (r.sent) res.sentConfirm++; else res.skipped++;
  }

  for (const m of feedback) {
    res.scannedFeedback++;
    const c = contactOf(m); if (!c) { res.skipped++; continue; }
    const info = contacts.get(`${c.type}:${c.id}`); const email = info?.email ?? null;
    if (!email) { res.skipped++; continue; }
    const url = viewingUrl({ o: m.org_id, m: m.id, k: "feedback" });
    if (!url) { res.skipped++; continue; }
    const propTitle = m.property_id ? propTitles.get(m.property_id) ?? null : null;
    const name = info?.name ?? null;
    const text = `שלום${name ? ` ${name}` : ""}, נשמח לשמוע איך היה הביקור${propTitle ? ` בנכס: ${propTitle}` : ""}. למשוב קצר: ${url}`;
    const html = htmlDoc("איך היה הביקור?", [
      `שלום${name ? ` ${name}` : ""},`,
      `נשמח לשמוע איך היה הביקור${propTitle ? ` בנכס <strong>${propTitle}</strong>` : ""}.`,
      "המשוב עוזר לנו להתאים לך את הנכסים הבאים:",
    ], { label: "לשליחת משוב", url });
    const r = await sendCustomerEmail({
      orgId: m.org_id, contact: { type: c.type, id: c.id, name, email }, purpose: "transactional",
      subject: "איך היה הביקור בנכס?", text, html, dedupKey: `viewing-feedback:${m.id}`,
    }, db);
    if (r.sent) res.sentFeedback++; else res.skipped++;
  }

  res.durationMs = Date.now() - started;
  return res;
}
