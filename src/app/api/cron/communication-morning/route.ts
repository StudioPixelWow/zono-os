// ============================================================================
// 🌅 ZONO — MORNING BRIEF email cron (GET). Fires around 08:00 Asia/Jerusalem on
// workdays; the in-code window gate makes exactly one send even though the cron
// is scheduled at two UTC hours to cover DST. Idempotent (one brief/user/day).
// GET + Bearer CRON_SECRET.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { sendMorningBriefs, isMorningWindow } from "@/lib/communication/morning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const s = process.env.CRON_SECRET;
  return !!s && req.headers.get("authorization") === `Bearer ${s}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const nowIso = new Date().toISOString();
  if (!isMorningWindow(nowIso)) return NextResponse.json({ ok: true, skipped: "outside_morning_window" });
  try {
    const r = await sendMorningBriefs({ orgLimit: 300 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "morning_brief_failed" }, { status: 500 });
  }
}
