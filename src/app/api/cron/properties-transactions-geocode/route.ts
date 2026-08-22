import { NextResponse, type NextRequest } from "next/server";
import { runGeoBackfill } from "@/lib/geo/geo-pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * ZONO GEO — the ONE canonical geocoding cron for SUBJECT properties + SOLD
 * transactions. Runs the automatic fast pipeline (internal-first: cache → exact →
 * street → neighborhood → city → provider), which resolves most rows from real
 * evidence we already have and only calls the paid provider for genuine gaps —
 * bounded by a per-run provider ceiling + time budget. Real coordinates only;
 * failures are marked, never invented. Secured by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const metrics = await runGeoBackfill();
    return NextResponse.json({ ok: true, ...metrics });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
