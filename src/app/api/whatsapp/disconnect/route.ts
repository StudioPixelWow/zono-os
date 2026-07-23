// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS — DISCONNECT (server route).
// POST /api/whatsapp/disconnect → clears the org's encrypted token (status →
// disconnected) and audits. Session + manager gated. Best-effort.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { clearConnection, setStatus, currentOrgId } from "@/lib/whatsapp/business/tokens";
import { logAudit } from "@/lib/audit/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = await createClient();
  const { data: isManager } = await db.rpc("has_min_role", { p_min: "manager" });
  if (isManager !== true) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const orgId = await currentOrgId();
  if (!orgId) return NextResponse.json({ ok: false, error: "no_org" }, { status: 400 });
  await clearConnection(orgId);
  await setStatus(orgId, "disconnected");
  await logAudit({ action: "whatsapp.disconnected", category: "configuration", entityType: "whatsapp_connection", summary: "WhatsApp Business disconnected" });
  return NextResponse.json({ ok: true });
}
