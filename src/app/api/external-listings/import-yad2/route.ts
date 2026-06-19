import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { runImport } from "@/lib/external-listings/service";

// Mock-safe: validates the session and runs a mock Yad2 import (no Apify yet).
export async function POST() {
  const { profile } = await getSessionContext();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runImport("yad2");
    return NextResponse.json({ ok: true, mock: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "import failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
