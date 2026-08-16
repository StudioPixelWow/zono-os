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
import type { SupportClassification } from "./support-intent";
import { buildZiTicketDraft, ziConversationLinkRef, type ZiTranscriptTurn } from "./support-bridge-core";

export interface ZiTicketResult { ok: boolean; ticketId?: string; existing?: boolean; error?: string }

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
 * existing ACTIVE ticket linked to the same conversation instead of duplicating.
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
      .select("id" as never)
      .eq("org_id" as never, orgId as never)
      .eq("linked_ref" as never, linkRef as never)
      .in("status" as never, ACTIVE_STATUSES as never)
      .order("created_at" as never, { ascending: false } as never)
      .limit(1)
      .maybeSingle();
    const ex = existing as { id: string } | null;
    if (ex?.id) return { ok: true, ticketId: ex.id, existing: true };
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
    } as never).select("id" as never).maybeSingle();
    if (error || !data) return { ok: false, error: "create_failed" };
    return { ok: true, ticketId: (data as { id: string }).id };
  } catch {
    return { ok: false, error: "create_failed" };
  }
}

/** Classification → whether ZI should tell the user a ticket was opened. Pure
 *  re-export convenience so callers don't import two modules. */
export { shouldEscalate } from "./support-intent";
export type { SupportClassification } from "./support-intent";
