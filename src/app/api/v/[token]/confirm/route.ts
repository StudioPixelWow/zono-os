// ============================================================================
// ZONO — Viewing CONFIRM route (public, token-validated). The customer confirms
// attendance ("confirm") or asks to change the time ("reschedule") from the
// secure /v page. Token `kind` MUST be "confirm" — a feedback token is rejected.
// No client JS; a plain form POST → 303 redirect back with a ?done= banner.
// ============================================================================
import { NextResponse } from "next/server";
import { verifyViewingToken } from "@/lib/viewings/tokens";
import { confirmViewing, requestViewingReschedule } from "@/lib/viewings/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["confirm", "reschedule"]);

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = verifyViewingToken(token);
  if (!p || p.k !== "confirm") return NextResponse.json({ error: "invalid_token" }, { status: 400 });

  let action = "";
  try { action = String((await req.formData()).get("action") ?? ""); } catch { /* no body */ }
  if (!ALLOWED.has(action)) return NextResponse.redirect(new URL(`/v/${token}`, req.url), { status: 303 });

  if (action === "confirm") await confirmViewing(p.o, p.m);
  else await requestViewingReschedule(p.o, p.m);

  return NextResponse.redirect(new URL(`/v/${token}?done=${action === "confirm" ? "confirmed" : "reschedule"}`, req.url), { status: 303 });
}
