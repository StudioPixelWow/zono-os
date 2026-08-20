// ============================================================================
// ZI Expert™ — SUPPORT TICKET BRIDGE, server (Phase ZI-CS P6). Customer-facing
// ticket creation: unlike the platform-operator DAL (support.ts, which requires
// platform.support.manage), THIS opens a ticket ON BEHALF OF the signed-in user,
// strictly scoped to their own org. Zero-repetition escalation (directive §17):
// the ZI transcript + AI summary + context + diagnostics are attached, so the
// human agent sees who/what/where/what-failed without the customer re-explaining.
//   source = "customer_report" (valid enum) · linked_ref = zi:<conversationId>
// Idempotent: one active ticket per ZI conversation.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import type { SupportClassification } from "./support-intent";
import { buildZiTicketDraft, ziConversationLinkRef, type ZiTranscriptTurn } from "./support-bridge-core";

export interface ZiTicketResult { ok: boolean; ticketId?: string; ticketNumber?: string; existing?: boolean; error?: string }

export interface OpenTicketInput {
  conversationId: string;
  classification: SupportClassification;
  question: string;
  transcript?: ZiTranscriptTurn[];
  summary?: string | null;
  context?: { route?: string | null; moduleLabel?: string | null; roleLabel?: string | null; plan?: string | null };
  diagnostics?: string[] | null;
}

const ACTIVE_STATUSES = ["open", "in_progress", "waiting_customer"] as const;

/**
 * Open (or reuse) a support ticket for the current user's org from a ZI support
 * conversation. Org-scoped and fail-closed: no session/org → no ticket. Reuses an
 * existing ACTIVE ticket linked to the same conversation instead of duplicating —
 * and APPENDS the new turn (question + transcript + diagnostics) as an internal
 * note + bumps updated_at, so the human agent sees the follow-up and the ticket
 * resurfaces as recently active. The customer's new message is never dropped.
 */
export async function openSupportTicketFromZi(input: OpenTicketInput): Promise<ZiTicketResult> {
  const { profile, user } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) return { ok: false, error: "unauthorized" };

  const db = createServiceRoleClient();
  const linkRef = ziConversationLinkRef(input.conversationId);

  // Idempotency: an active ticket already exists for this conversation → reuse it.
  try {
    const { data: existing } = await db.from("support_tickets" as never)
      .select("id,ticket_number" as never)
      .eq("org_id" as never, orgId as never)
      .eq("linked_ref" as never, linkRef as never)
      .in("status" as never, ACTIVE_STATUSES as never)
      .order("created_at" as never, { ascending: false } as never)
      .limit(1)
      .maybeSingle();
    const ex = existing as { id: string; ticket_number?: string } | null;
    if (ex?.id) {
      // Append the new turn to the existing ticket (internal note — there is no
      // customer-visible thread yet, by design) and bump updated_at. Its OWN
      // try/catch: a notes failure must never fall through and create a duplicate.
      try {
        const followUp = buildZiTicketDraft(input);
        await db.from("support_ticket_notes" as never).insert({
          ticket_id: ex.id, author_operator_id: null, note: followUp.description, internal_only: true,
        } as never);
        await db.from("support_tickets" as never)
          .update({ updated_at: new Date().toISOString() } as never)
          .eq("id" as never, ex.id as never);
      } catch { /* append is best-effort — the ticket already exists either way */ }
      return { ok: true, ticketId: ex.id, ticketNumber: ex.ticket_number, existing: true };
    }
  } catch {
    // fall through to create — a lookup failure must not block escalation
  }

  const draft = buildZiTicketDraft(input);
  try {
    const { data, error } = await db.from("support_tickets" as never).insert({
      org_id: orgId,
      user_id: profile?.id ?? user?.id ?? null,
      subject: draft.subject,
      description: draft.description,
      status: "open",
      priority: draft.priority,
      category: draft.category,
      source: "customer_report",
      linked_ref: linkRef,
      created_by: profile?.id ?? null,
    } as never).select("id,ticket_number" as never).maybeSingle();
    if (error || !data) return { ok: false, error: "create_failed" };
    const row = data as { id: string; ticket_number?: string };
    // Downstream communication (email + in-app) — best-effort, never blocks the ticket.
    await emitBusinessEvent({
      type: DOMAIN_EVENTS.supportTicketCreated, entityType: "support", entityId: row.id,
      orgId, actorUserId: profile?.id ?? user?.id ?? null,
      payload: { ticketId: row.id, ticketNumber: row.ticket_number ?? null, subject: draft.subject, status: "open", actionRequired: false },
      idempotencyKey: `support.created:${row.id}`,
    });
    return { ok: true, ticketId: row.id, ticketNumber: row.ticket_number };
  } catch {
    return { ok: false, error: "create_failed" };
  }
}


// ── Customer-facing status labels (directive §14) ────────────────────────────
const STATUS_HE: Record<string, string> = { open: "פתוח", in_progress: "בטיפול", waiting_customer: "ממתין ללקוח", resolved: "נפתר", closed: "נסגר" };
export function ticketStatusHe(status: string): string { return STATUS_HE[status] ?? status; }

export interface MyTicket { ticketNumber: string | null; subject: string; status: string; statusHe: string; category: string | null; updatedAt: string | null }

/** Look up ONE ticket by its human-readable number — strictly within the caller's
 *  org (a number from another tenant simply returns null → "not found"). §16/§21. */
export async function getMyTicketByNumber(ticketNumber: string): Promise<MyTicket | null> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId || !ticketNumber) return null;
  const db = createServiceRoleClient();
  const { data } = await db.from("support_tickets" as never)
    .select("ticket_number,subject,status,category,updated_at" as never)
    .eq("org_id" as never, orgId as never)
    .eq("ticket_number" as never, ticketNumber as never)
    .maybeSingle();
  const r = data as { ticket_number: string; subject: string; status: string; category: string | null; updated_at: string | null } | null;
  if (!r) return null;
  return { ticketNumber: r.ticket_number, subject: r.subject, status: r.status, statusHe: ticketStatusHe(r.status), category: r.category, updatedAt: r.updated_at };
}

/** The current user's OWN open tickets (org + user scoped). §17. */
export async function listMyOpenTickets(limit = 6): Promise<MyTicket[]> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  const uid = profile?.id ?? null;
  if (!orgId || !uid) return [];
  const db = createServiceRoleClient();
  const { data } = await db.from("support_tickets" as never)
    .select("ticket_number,subject,status,category,updated_at" as never)
    .eq("org_id" as never, orgId as never)
    .or(`user_id.eq.${uid},created_by.eq.${uid}` as never)
    .in("status" as never, ACTIVE_STATUSES as never)
    .order("updated_at" as never, { ascending: false } as never)
    .limit(limit);
  return ((data ?? []) as Array<{ ticket_number: string; subject: string; status: string; category: string | null; updated_at: string | null }>)
    .map((r) => ({ ticketNumber: r.ticket_number, subject: r.subject, status: r.status, statusHe: ticketStatusHe(r.status), category: r.category, updatedAt: r.updated_at }));
}

/** Classification → whether ZI should tell the user a ticket was opened. Pure
 *  re-export convenience so callers don't import two modules. */
export { shouldEscalate } from "./support-intent";
export type { SupportClassification } from "./support-intent";
