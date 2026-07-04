// ============================================================================
// 👤 ZONO Broker Personal Workspace™ — server actions. 35.0.
// Thin delegators. Workspace assembly + scoped Ask ZONO reuse the service; the
// approve/reject path REUSES the Agent Framework's approval-gated functions
// (no duplicated approval logic). Org is resolved from the session server-side.
// Nothing auto-sends or auto-books.
// ============================================================================
"use server";
import { getSessionContext } from "@/lib/auth/session";
import { getBrokerWorkspace, askBrokerZono } from "./service";
import { approveInboxItem, rejectInboxItem } from "@/lib/agent-framework/service";
import type { BrokerWorkspace } from "./types";

async function orgAndUser(): Promise<{ orgId: string | null; userId: string | null }> {
  const s = await getSessionContext();
  return { orgId: s.profile?.org_id ?? s.organization?.id ?? null, userId: s.user?.id ?? null };
}

export async function getBrokerWorkspaceAction(): Promise<{ ok: boolean; result?: BrokerWorkspace; error?: string }> {
  try { return { ok: true, result: await getBrokerWorkspace() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

export async function askBrokerZonoAction(query: string): Promise<{ ok: boolean; result?: Awaited<ReturnType<typeof askBrokerZono>>; error?: string }> {
  const q = (query ?? "").trim();
  if (!q) return { ok: false, error: "empty" };
  try { return { ok: true, result: await askBrokerZono(q) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

/** Approve an agent recommendation — reuses the Agent Framework approval gate. */
export async function approveBrokerInboxAction(itemId: string): Promise<{ ok: boolean; note?: string; createdMissionId?: string | null }> {
  const { orgId, userId } = await orgAndUser();
  try { const r = await approveInboxItem(orgId, itemId, userId); return { ok: r.ok, note: r.note, createdMissionId: r.createdMissionId }; }
  catch (e) { return { ok: false, note: e instanceof Error ? e.message : "failed" }; }
}

/** Reject an agent recommendation — reuses the Agent Framework path. */
export async function rejectBrokerInboxAction(itemId: string, reason: string): Promise<{ ok: boolean; note?: string }> {
  const { orgId } = await orgAndUser();
  try { const r = await rejectInboxItem(orgId, itemId, reason || "נדחה על ידי הסוכן"); return { ok: r.ok, note: r.note }; }
  catch (e) { return { ok: false, note: e instanceof Error ? e.message : "failed" }; }
}
