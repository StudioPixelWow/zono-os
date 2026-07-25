// INTERNAL messaging dispatch+work: claim due jobs (SKIP LOCKED), sync reads / execute
// approved sends (single write). Bearer CRON_SECRET.
import { NextResponse, type NextRequest } from "next/server";
import { runMessagingDispatchTick } from "@/lib/meta/messaging/service";
export const runtime = "nodejs"; export const maxDuration = 300;
function authorized(req: NextRequest): boolean { const s = process.env.CRON_SECRET; return !!s && req.headers.get("authorization") === `Bearer ${s}`; }
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runMessagingDispatchTick()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "dispatch_failed" }, { status: 500 }); }
}
