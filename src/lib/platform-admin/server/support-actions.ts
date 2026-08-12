"use server";
// ============================================================================
// ZONO — PLATFORM SUPPORT server actions (P5.7). "use server": exports ONLY
// async functions. Every action delegates to the audited support DAL (capability
// + tenancy + validation + audit live there) and never touches a service-role
// client directly. Expected failures surface a safe Hebrew message; anything
// else (incl. authorization) returns a generic denial so the platform surface is
// never revealed.
// ============================================================================
import { revalidatePath } from "next/cache";
import { createTicket, assignTicket, changeStatus, changePriority, addNote, SupportError } from "./support";

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof SupportError) return { ok: false, error: e.message };
  return { ok: false, error: "הפעולה נכשלה או שאין לך הרשאה" };
}

export async function supportCreateTicketAction(input: { orgId: string; subject: string; description?: string; priority?: string; category?: string; source?: string; userId?: string | null; linkedRef?: string | null }): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const r = await createTicket(input);
    revalidatePath("/platform/support");
    revalidatePath(`/platform/customers/${input.orgId}/support`);
    return { ok: true, id: r.id };
  } catch (e) { return fail(e); }
}

export async function supportAssignTicketAction(ticketId: string, assigneeId: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    await assignTicket(ticketId, assigneeId);
    revalidatePath(`/platform/support/${ticketId}`);
    revalidatePath("/platform/support");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function supportChangeStatusAction(ticketId: string, to: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await changeStatus(ticketId, to, reason);
    revalidatePath(`/platform/support/${ticketId}`);
    revalidatePath("/platform/support");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function supportChangePriorityAction(ticketId: string, to: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await changePriority(ticketId, to, reason);
    revalidatePath(`/platform/support/${ticketId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function supportAddNoteAction(ticketId: string, note: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await addNote(ticketId, note);
    revalidatePath(`/platform/support/${ticketId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}
