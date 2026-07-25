// INTERNAL messaging recovery: requeue abandoned READ jobs; abandoned SEND jobs go to
// manual review (never auto-replayed); exhausted → dead-letter. Bearer CRON_SECRET.
import { NextResponse, type NextRequest } from "next/server";
import { runMessagingRecoveryTick } from "@/lib/meta/messaging/service";
export const runtime = "nodejs"; export const maxDuration = 300;
function authorized(req: NextRequest): boolean { const s = process.env.CRON_SECRET; return !!s && req.headers.get("authorization") === `Bearer ${s}`; }
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runMessagingRecoveryTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "recover_failed" }, { status: 500 }); }
}
