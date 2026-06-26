import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { runImport } from "@/lib/external-listings/service";

// Apify scrapes are long (up to ~110s per city). Give the function the full
// serverless budget (clamped to the plan max) + the Node runtime so it can
// actually finish importing instead of being killed mid-scan — which would
// otherwise leave the import job stuck in "running" with 0 listings pulled.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Real Apify (Yad2 + Madlan) for all active org localities.
export async function POST(req: NextRequest) {
  const { profile } = await getSessionContext();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let localityId: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.localityId === "string") localityId = body.localityId;
  } catch { /* no body */ }
  try {
    const summary = await runImport({ localityId });
    return NextResponse.json({ ok: summary.success, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "import failed" }, { status: 500 });
  }
}
