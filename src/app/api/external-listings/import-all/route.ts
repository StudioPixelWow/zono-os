import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { runImport } from "@/lib/external-listings/service";

// Mock-safe: validates the session and runs mock imports from all providers.
export async function POST() {
  const { profile } = await getSessionContext();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const yad2 = await runImport("yad2");
    const madlan = await runImport("madlan");
    return NextResponse.json({ ok: true, mock: true, results: [yad2, madlan] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "import failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
