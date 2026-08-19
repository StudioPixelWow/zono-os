// ============================================================================
// ZONO — Match Bundle customer FEEDBACK endpoint (POST, public + token-scoped).
// Receives a plain form post (propertyId + action) from /r/[token], validates the
// signed token, records the feedback into real CRM state, and redirects back to
// the view. The server layer validates the (org, contact, property) relationship
// before mutating — the customer UI can never touch privileged deal state.
// ============================================================================
import { NextResponse } from "next/server";
import { verifyRecoToken } from "@/lib/customer-comm/recommend-tokens";
import { applyRecommendationFeedback, type FeedbackAction } from "@/lib/customer-comm/recommendation-feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: FeedbackAction[] = ["interested", "rejected", "viewing_requested", "talk_to_agent"];

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = verifyRecoToken(token);
  if (!p) return NextResponse.redirect(new URL(`/r/${token}`, req.url), { status: 303 });

  let propertyId = "", action = "";
  try {
    const form = await req.formData();
    propertyId = String(form.get("propertyId") ?? "");
    action = String(form.get("action") ?? "");
  } catch { /* no body */ }

  if (!propertyId || !ALLOWED.includes(action as FeedbackAction)) {
    return NextResponse.redirect(new URL(`/r/${token}`, req.url), { status: 303 });
  }

  await applyRecommendationFeedback(p.o, p.t, p.c, propertyId, action as FeedbackAction);
  return NextResponse.redirect(new URL(`/r/${token}?done=${action}`, req.url), { status: 303 });
}
