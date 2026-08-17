import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { debugProvider } from "@/lib/external-listings/service";

/**
 * Admin-only actor verification tool. Runs ONE provider against ONE city with a
 * tiny limit (≤5). Never triggers a full sync. APIFY_TOKEN stays server-only.
 *
 * Body: { provider: "yad2" | "madlan", city: string, limit?: number, saveSample?: boolean }
 */
export async function POST(req: NextRequest) {
  const { profile } = await getSessionContext();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Manager+ only (owner > admin > manager > agent > viewer).
  const supabase = await createClient();
  const { data: isManager } = await supabase.rpc("has_min_role", { p_min: "manager" });
  if (!isManager) return NextResponse.json({ error: "forbidden — manager role required" }, { status: 403 });

  let body: { provider?: string; city?: string; limit?: number; saveSample?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const provider = body.provider === "madlan" ? "madlan" : body.provider === "yad2" ? "yad2" : null;
  const city = typeof body.city === "string" ? body.city.trim() : "";
  if (!provider) return NextResponse.json({ error: "provider must be 'yad2' or 'madlan'" }, { status: 400 });
  if (!city) return NextResponse.json({ error: "city is required" }, { status: 400 });

  try {
    const report = await debugProvider(provider, city, body.limit ?? 5, body.saveSample === true);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "debug failed" }, { status: 500 });
  }
}

/**
 * Browser-friendly GET variant so a manager can MEASURE actor coverage in the URL
 * bar (no tooling): /api/external-listings/debug-provider?provider=yad2&city=Rehovot&limit=500
 * Same manager auth (via session cookie). Never saves. `datasetItems` in the
 * response is how many the actor actually returned — the answer to "is the actor
 * or our cap the bottleneck?".
 */
export async function GET(req: NextRequest) {
  const { profile } = await getSessionContext();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: isManager } = await supabase.rpc("has_min_role", { p_min: "manager" });
  if (!isManager) return NextResponse.json({ error: "forbidden — manager role required" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const provider = sp.get("provider") === "madlan" ? "madlan" : "yad2";
  const city = (sp.get("city") ?? "").trim();
  const limit = Math.max(1, Math.min(Number(sp.get("limit") ?? 50) || 50, 500));
  const deal: "buy" | "rent" = sp.get("deal") === "rent" ? "rent" : "buy";
  if (!city) return NextResponse.json({ error: "city query param is required" }, { status: 400 });

  try {
    const report = await debugProvider(provider, city, limit, false, deal);
    return NextResponse.json({ measured: { city, provider, requestedLimit: limit, deal }, hint: "datasetItems = how many the actor returned for this deal type", ...report });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "debug failed" }, { status: 500 });
  }
}
