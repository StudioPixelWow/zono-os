// ============================================================================
// ZONO — Viewing FEEDBACK route (public, token-validated). The customer submits
// one post-viewing choice — מעניין / רוצה להתקדם / לא מתאים / לדבר עם הסוכן —
// which feeds real CRM + matching state via applyViewingFeedback. Token `kind`
// MUST be "feedback" — a confirm token is rejected. No client JS; plain form POST
// → 303 redirect back with a ?done= banner. Customer UI never mutates deal state.
// ============================================================================
import { NextResponse } from "next/server";
import { verifyViewingToken } from "@/lib/viewings/tokens";
import { applyViewingFeedback, type ViewingFeedbackChoice } from "@/lib/viewings/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: ViewingFeedbackChoice[] = ["interested", "advance", "not_suitable", "talk_to_agent"];

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = verifyViewingToken(token);
  if (!p || p.k !== "feedback") return NextResponse.json({ error: "invalid_token" }, { status: 400 });

  let action = "";
  try { action = String((await req.formData()).get("action") ?? ""); } catch { /* no body */ }
  if (!ALLOWED.includes(action as ViewingFeedbackChoice)) return NextResponse.redirect(new URL(`/v/${token}`, req.url), { status: 303 });

  await applyViewingFeedback(p.o, p.m, action as ViewingFeedbackChoice);
  return NextResponse.redirect(new URL(`/v/${token}?done=${action}`, req.url), { status: 303 });
}
