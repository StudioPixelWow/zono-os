import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { runImport } from "@/lib/external-listings/service";

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
