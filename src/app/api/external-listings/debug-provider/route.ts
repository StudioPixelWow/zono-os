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
