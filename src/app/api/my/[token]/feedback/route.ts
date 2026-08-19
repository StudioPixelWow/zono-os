// ============================================================================
// ZONO — Buyer portal FEEDBACK (POST, public + token-scoped). Reuses the canonical
// applyRecommendationFeedback writer (no parallel feedback model). The server
// re-validates the (org, contact, property) recommendation relationship before
// mutating — the portal token can never touch an un-recommended property or
// privileged CRM state. No client JS; plain form post → 303 redirect back.
// ============================================================================
import { NextResponse } from "next/server";
import { verifyPortalToken } from "@/lib/customer-portal/portal-tokens";
import { applyRecommendationFeedback, type FeedbackAction } from "@/lib/customer-comm/recommendation-feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: FeedbackAction[] = ["interested", "rejected", "viewing_requested", "talk_to_agent"];

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = verifyPortalToken(token);
  if (!p) return NextResponse.json({ error: "invalid_token" }, { status: 400 });

  let propertyId = "", action = "";
  try {
    const form = await req.formData();
    propertyId = String(form.get("propertyId") ?? "");
    action = String(form.get("action") ?? "");
  } catch { /* no body */ }

  if (!propertyId || !ALLOWED.includes(action as FeedbackAction)) {
    return NextResponse.redirect(new URL(`/my/${token}`, req.url), { status: 303 });
  }
  await applyRecommendationFeedback(p.o, p.t, p.c, propertyId, action as FeedbackAction);
  return NextResponse.redirect(new URL(`/my/${token}?done=${action}`, req.url), { status: 303 });
}
