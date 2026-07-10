import { NextResponse, type NextRequest } from "next/server";
import { drainDomainEvents } from "@/lib/kernel/processor";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * ZONO OS 2.0 — Stage 2 · Kernel outbox drain (Vercel Cron).
 * Projects pending domain_events into the activity timeline. Service-role,
 * idempotent, secured by CRON_SECRET. Safe to run frequently (every few min).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await drainDomainEvents(300);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "drain failed" }, { status: 500 });
  }
}
