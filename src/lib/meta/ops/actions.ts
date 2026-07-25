// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 7 · Production GA) · OPS ACTION (server-only).
// ----------------------------------------------------------------------------
// The single gated entrypoint the Ops Console page calls. Resolves the session,
// enforces the admin/owner role gate (canViewOps), and returns a safe summary or
// a localized permission error. Read-only: it never mutates anything.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { canViewOps } from "./roles";
import { getMetaOpsSummary, type MetaOpsSummary } from "./summary";

export type OpsSummaryResult = { ok: true; data: MetaOpsSummary } | { ok: false; error: string };

export async function getMetaOpsSummaryAction(): Promise<OpsSummaryResult> {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return { ok: false, error: "נדרשת התחברות." };
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  if (!canViewOps(role)) return { ok: false, error: "אין הרשאה לצפייה במרכז התפעול." };
  return { ok: true, data: await getMetaOpsSummary(sc.profile.org_id) };
}
