// ============================================================================
// ZONO — PLATFORM SUPPORT server layer (server-only). P5.7. The support control
// plane's read + mutation boundary. Pattern (P5.0):
//     assertPlatformCapability(cap) → tenancy check → service-role → audit → DTO.
// HARD RULES:
//   · Reads gated platform.support.read; every mutation gated platform.support.manage.
//   · Every ticket is explicitly org-bound; a user_id target is validated to
//     belong to the ticket's org (no cross-org leakage via a crafted id).
//   · Assignment targets MUST be ACTIVE platform_operators (never org users).
//   · Deterministic status transitions delegated to ../support/model.
//   · NO secrets, NO raw ops payloads — linked_ref is a short safe identifier only.
//   · A failed read → empty/unavailable, never a fabricated 0-tickets.
//   · NO impersonation (P5.8).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { assertPlatformCapability } from "./auth";
import { writePlatformAudit } from "./audit";
import {
  canTransition, isReopen, isClosing, isActive, requiresReason, isAssignableOperator,
  normalizeCategory, isValidStatus, isValidPriority, isOperatorCreatableSource,
  validateSubject, validateNote,
  type TicketStatus, type TicketPriority, type TicketSource,
} from "../support/model";

/** Expected support validation/authorization failure → safe Hebrew message. */
export class SupportError extends Error {
  constructor(message: string) { super(message); this.name = "SupportError"; }
}

// ── DTOs ────────────────────────────────────────────────────────────────────
export interface TicketRow {
  id: string; ticketNumber: string | null; orgId: string; orgName: string | null; userId: string | null;
  subject: string; status: TicketStatus; priority: TicketPriority; category: string; source: TicketSource;
  assignedOperatorId: string | null; assignedOperatorName: string | null;
  createdAt: string; updatedAt: string; closedAt: string | null;
}
export interface TicketDetail extends TicketRow { description: string | null; linkedRef: string | null; createdBy: string | null }
export interface TicketNote { id: string; authorOperatorId: string | null; authorName: string | null; note: string; internalOnly: boolean; createdAt: string }
export interface SupportInbox {
  tickets: TicketRow[];
  counts: { open: number; urgent: number; unassigned: number; waitingCustomer: number; resolvedRecently: number } | null;
  available: boolean;
}
export interface OperatorOption { userId: string; name: string | null; role: string }

interface RawTicket {
  id: string; ticket_number: string | null; org_id: string; user_id: string | null; subject: string; description: string | null;
  status: string; priority: string; category: string; source: string;
  assigned_operator_id: string | null; linked_ref: string | null; created_by: string | null;
  created_at: string; updated_at: string; closed_at: string | null;
}
const TICKET_COLS = "id,ticket_number,org_id,user_id,subject,description,status,priority,category,source,assigned_operator_id,linked_ref,created_by,created_at,updated_at,closed_at";

// ── Name resolution helpers (batched — no N+1) ──────────────────────────────
async function orgNames(db: ReturnType<typeof createServiceRoleClient>, ids: string[]): Promise<Map<string, string | null>> {
  const m = new Map<string, string | null>();
  if (!ids.length) return m;
  try { const { data } = await db.from("organizations").select("id,name").in("id", ids); for (const o of ((data ?? []) as { id: string; name: string | null }[])) m.set(o.id, o.name); } catch { /* degrade */ }
  return m;
}
async function operatorNames(db: ReturnType<typeof createServiceRoleClient>, ids: string[]): Promise<Map<string, string | null>> {
  const m = new Map<string, string | null>();
  const clean = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (!clean.length) return m;
  try { const { data } = await db.from("users").select("id,full_name").in("id", clean); for (const u of ((data ?? []) as { id: string; full_name: string | null }[])) m.set(u.id, u.full_name); } catch { /* degrade */ }
  return m;
}

function toRow(r: RawTicket, orgName: string | null, opName: string | null): TicketRow {
  return {
    id: r.id, ticketNumber: r.ticket_number, orgId: r.org_id, orgName, userId: r.user_id, subject: r.subject,
    status: r.status as TicketStatus, priority: r.priority as TicketPriority, category: r.category, source: r.source as TicketSource,
    assignedOperatorId: r.assigned_operator_id, assignedOperatorName: opName,
    createdAt: r.created_at, updatedAt: r.updated_at, closedAt: r.closed_at,
  };
}

// ── Inbox (spec §3) ─────────────────────────────────────────────────────────
export interface InboxFilters { status?: TicketStatus | null; priority?: TicketPriority | null; orgId?: string | null; assignee?: string | null; category?: string | null; unassigned?: boolean; limit?: number }

export async function getSupportInbox(filters: InboxFilters = {}): Promise<SupportInbox> {
  const operator = await assertPlatformCapability("platform.support.read");
  const db = createServiceRoleClient();
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);

  let rows: RawTicket[] = [];
  let available = true;
  try {
    let q = db.from("support_tickets" as never).select(TICKET_COLS).order("created_at", { ascending: false }).limit(limit);
    if (filters.status) q = q.eq("status" as never, filters.status as never);
    if (filters.priority) q = q.eq("priority" as never, filters.priority as never);
    if (filters.orgId) q = q.eq("org_id" as never, filters.orgId as never);
    if (filters.category) q = q.eq("category" as never, filters.category as never);
    if (filters.unassigned) q = q.is("assigned_operator_id" as never, null as never);
    else if (filters.assignee) q = q.eq("assigned_operator_id" as never, filters.assignee as never);
    const { data, error } = await q;
    if (error) available = false; else rows = ((data ?? []) as RawTicket[]);
  } catch { available = false; }

  const orgMap = await orgNames(db, rows.map((r) => r.org_id));
  const opMap = await operatorNames(db, rows.map((r) => r.assigned_operator_id).filter((x): x is string => !!x));
  const tickets = rows.map((r) => toRow(r, orgMap.get(r.org_id) ?? null, r.assigned_operator_id ? (opMap.get(r.assigned_operator_id) ?? null) : null));

  // Bounded aggregate counts (fail → null, never fake 0).
  let counts: SupportInbox["counts"] = null;
  if (available) {
    const all = tickets; // counts over the (bounded) working set; documented in UI.
    counts = {
      open: all.filter((t) => isActive(t.status)).length,
      urgent: all.filter((t) => t.priority === "urgent" && isActive(t.status)).length,
      unassigned: all.filter((t) => !t.assignedOperatorId && isActive(t.status)).length,
      waitingCustomer: all.filter((t) => t.status === "waiting_customer").length,
      resolvedRecently: all.filter((t) => t.status === "resolved").length,
    };
  }

  await writePlatformAudit({ operator, capability: "platform.support.read", action: "support.inbox", resourceType: "platform", metadata: { count: tickets.length, available } });
  return { tickets, counts, available };
}

// ── Ticket detail (spec §4) ─────────────────────────────────────────────────
export interface TicketWithNotes { ticket: TicketDetail; notes: TicketNote[] }
export async function getTicketDetail(ticketId: string): Promise<TicketWithNotes | null> {
  const operator = await assertPlatformCapability("platform.support.read");
  const db = createServiceRoleClient();
  let raw: RawTicket | null = null;
  try { const { data } = await db.from("support_tickets" as never).select(TICKET_COLS).eq("id" as never, ticketId as never).maybeSingle(); raw = (data as RawTicket | null) ?? null; } catch { raw = null; }
  if (!raw) { await writePlatformAudit({ operator, capability: "platform.support.read", action: "support.ticket.read", resourceType: "support_ticket", resourceId: ticketId, metadata: { found: false } }); return null; }

  let noteRows: { id: string; author_operator_id: string | null; note: string; internal_only: boolean; created_at: string }[] = [];
  try { const { data } = await db.from("support_ticket_notes" as never).select("id,author_operator_id,note,internal_only,created_at").eq("ticket_id" as never, ticketId as never).order("created_at", { ascending: false }).limit(200); noteRows = ((data ?? []) as typeof noteRows); } catch { noteRows = []; }

  const orgMap = await orgNames(db, [raw.org_id]);
  const opMap = await operatorNames(db, [raw.assigned_operator_id, ...noteRows.map((n) => n.author_operator_id)].filter((x): x is string => !!x));
  const ticket: TicketDetail = { ...toRow(raw, orgMap.get(raw.org_id) ?? null, raw.assigned_operator_id ? (opMap.get(raw.assigned_operator_id) ?? null) : null), description: raw.description, linkedRef: raw.linked_ref, createdBy: raw.created_by };
  const notes: TicketNote[] = noteRows.map((n) => ({ id: n.id, authorOperatorId: n.author_operator_id, authorName: n.author_operator_id ? (opMap.get(n.author_operator_id) ?? null) : null, note: n.note, internalOnly: n.internal_only, createdAt: n.created_at }));

  await writePlatformAudit({ operator, capability: "platform.support.read", action: "support.ticket.read", resourceType: "support_ticket", resourceId: ticketId, targetOrgId: raw.org_id, metadata: { found: true } });
  return { ticket, notes };
}

// ── Org support (Customer 360 · spec §5) ────────────────────────────────────
export async function getOrgSupport(orgId: string): Promise<SupportInbox> {
  return getSupportInbox({ orgId, limit: 200 });
}

// ── Assignable operators (spec §7) ──────────────────────────────────────────
export async function listAssignableOperators(): Promise<OperatorOption[]> {
  const operator = await assertPlatformCapability("platform.support.read");
  const db = createServiceRoleClient();
  let rows: { user_id: string; platform_role: string; status: string }[] = [];
  try { const { data } = await db.from("platform_operators" as never).select("user_id,platform_role,status").eq("status" as never, "active" as never).limit(200); rows = ((data ?? []) as typeof rows); } catch { rows = []; }
  const names = await operatorNames(db, rows.map((r) => r.user_id));
  await writePlatformAudit({ operator, capability: "platform.support.read", action: "support.operators.list", resourceType: "platform", metadata: { count: rows.length } });
  return rows.map((r) => ({ userId: r.user_id, name: names.get(r.user_id) ?? null, role: r.platform_role }));
}

// ── Internal helpers for mutations ──────────────────────────────────────────
async function loadTicketOrThrow(db: ReturnType<typeof createServiceRoleClient>, ticketId: string): Promise<RawTicket> {
  const { data, error } = await db.from("support_tickets" as never).select(TICKET_COLS).eq("id" as never, ticketId as never).maybeSingle();
  if (error) throw new SupportError("טעינת הפנייה נכשלה");
  const raw = (data as RawTicket | null) ?? null;
  if (!raw) throw new SupportError("הפנייה לא נמצאה");
  return raw;
}
async function assertActiveOperator(db: ReturnType<typeof createServiceRoleClient>, userId: string): Promise<void> {
  const { data } = await db.from("platform_operators" as never).select("user_id,status").eq("user_id" as never, userId as never).maybeSingle();
  if (!isAssignableOperator((data as { status: string } | null) ?? null)) throw new SupportError("ניתן לשייך רק מפעיל פלטפורמה פעיל");
}
async function assertUserInOrg(db: ReturnType<typeof createServiceRoleClient>, userId: string, orgId: string): Promise<void> {
  const { data } = await db.from("users").select("id,org_id").eq("id", userId).maybeSingle();
  const row = (data as { id: string; org_id: string | null } | null) ?? null;
  if (!row || row.org_id !== orgId) throw new SupportError("המשתמש אינו שייך לארגון הפנייה");
}

// ── Mutations (spec §7,§8,§9,§13) — all gated platform.support.manage ────────
export async function createTicket(input: { orgId: string; subject: string; description?: string; priority?: string; category?: string; source?: string; userId?: string | null; linkedRef?: string | null }): Promise<{ id: string }> {
  const operator = await assertPlatformCapability("platform.support.manage");
  const db = createServiceRoleClient();
  const subjErr = validateSubject(input.subject); if (subjErr) throw new SupportError(subjErr);
  const priority = (input.priority && isValidPriority(input.priority)) ? input.priority : "normal";
  const category = normalizeCategory(input.category);
  const source = (input.source && isOperatorCreatableSource(input.source)) ? input.source : "manual_platform";
  // Tenancy: org must exist; a user target must belong to that org.
  const { data: org } = await db.from("organizations").select("id").eq("id", input.orgId).maybeSingle();
  if (!org) throw new SupportError("ארגון לא קיים");
  if (input.userId) await assertUserInOrg(db, input.userId, input.orgId);

  const { data, error } = await db.from("support_tickets" as never).insert({
    org_id: input.orgId, user_id: input.userId ?? null, subject: input.subject.trim(), description: input.description?.trim() || null,
    status: "open", priority, category, source, linked_ref: input.linkedRef ?? null, created_by: operator.userId,
  } as never).select("id").maybeSingle();
  if (error || !data) throw new SupportError("יצירת הפנייה נכשלה");
  const id = (data as { id: string }).id;
  await writePlatformAudit({ operator, capability: "platform.support.manage", action: "support.ticket.create", resourceType: "support_ticket", resourceId: id, targetOrgId: input.orgId, metadata: { priority, category, source } });
  return { id };
}

export async function assignTicket(ticketId: string, assigneeId: string | null): Promise<void> {
  const operator = await assertPlatformCapability("platform.support.manage");
  const db = createServiceRoleClient();
  const t = await loadTicketOrThrow(db, ticketId);
  if (assigneeId) await assertActiveOperator(db, assigneeId);
  const { error } = await db.from("support_tickets" as never).update({ assigned_operator_id: assigneeId, updated_at: new Date().toISOString() } as never).eq("id" as never, ticketId as never);
  if (error) throw new SupportError("שיוך הפנייה נכשל");
  await writePlatformAudit({ operator, capability: "platform.support.manage", action: "support.ticket.assign", resourceType: "support_ticket", resourceId: ticketId, targetOrgId: t.org_id, metadata: { before: t.assigned_operator_id ?? null, after: assigneeId ?? null } });
}

export async function changeStatus(ticketId: string, to: string, reason?: string): Promise<void> {
  const operator = await assertPlatformCapability("platform.support.manage");
  const db = createServiceRoleClient();
  const t = await loadTicketOrThrow(db, ticketId);
  if (!isValidStatus(to)) throw new SupportError("סטטוס לא תקין");
  const from = t.status as TicketStatus;
  if (!canTransition(from, to)) throw new SupportError(`מעבר לא חוקי: ${from} → ${to}`);
  const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  if (isClosing(to)) patch.closed_at = new Date().toISOString();
  if (isReopen(from, to)) patch.closed_at = null;
  const { error } = await db.from("support_tickets" as never).update(patch as never).eq("id" as never, ticketId as never);
  if (error) throw new SupportError("שינוי הסטטוס נכשל");
  const action = isReopen(from, to) ? "support.ticket.reopen" : isClosing(to) ? "support.ticket.close" : "support.ticket.status.change";
  await writePlatformAudit({ operator, capability: "platform.support.manage", action, resourceType: "support_ticket", resourceId: ticketId, targetOrgId: t.org_id, reason: reason ?? null, metadata: { before: from, after: to } });
}

export async function changePriority(ticketId: string, to: string, reason?: string): Promise<void> {
  const operator = await assertPlatformCapability("platform.support.manage");
  const db = createServiceRoleClient();
  const t = await loadTicketOrThrow(db, ticketId);
  if (!isValidPriority(to)) throw new SupportError("עדיפות לא תקינה");
  const from = t.priority as TicketPriority;
  if (from === to) throw new SupportError("אין שינוי בעדיפות");
  if (requiresReason(from, to) && !(reason && reason.trim())) throw new SupportError("נדרש נימוק להסלמה לדחוף");
  const { error } = await db.from("support_tickets" as never).update({ priority: to, updated_at: new Date().toISOString() } as never).eq("id" as never, ticketId as never);
  if (error) throw new SupportError("שינוי העדיפות נכשל");
  await writePlatformAudit({ operator, capability: "platform.support.manage", action: "support.ticket.priority.change", resourceType: "support_ticket", resourceId: ticketId, targetOrgId: t.org_id, reason: reason ?? null, metadata: { before: from, after: to } });
}

export async function addNote(ticketId: string, note: string): Promise<void> {
  const operator = await assertPlatformCapability("platform.support.manage");
  const db = createServiceRoleClient();
  const t = await loadTicketOrThrow(db, ticketId);
  const noteErr = validateNote(note); if (noteErr) throw new SupportError(noteErr);
  const { error } = await db.from("support_ticket_notes" as never).insert({ ticket_id: ticketId, author_operator_id: operator.userId, note: note.trim(), internal_only: true } as never);
  if (error) throw new SupportError("הוספת ההערה נכשלה");
  await db.from("support_tickets" as never).update({ updated_at: new Date().toISOString() } as never).eq("id" as never, ticketId as never);
  await writePlatformAudit({ operator, capability: "platform.support.manage", action: "support.note.add", resourceType: "support_ticket", resourceId: ticketId, targetOrgId: t.org_id, metadata: { internalOnly: true } });
}
