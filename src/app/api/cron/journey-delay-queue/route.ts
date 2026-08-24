import { NextResponse, type NextRequest } from "next/server";
import { runJourneyDelayQueue } from "@/lib/journey-automation/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * ZONO — Journey durable delay-queue drain (Vercel Cron).
 * Resumes DUE delayed journey branches in a BOUNDED batch. Service-role, org-
 * isolated per row, idempotent (each row is claimed + finalised, so a re-run never
 * double-executes), safe-retry (a poisoned row is re-queued 'pending', never blocks
 * the batch). Provider-free: the journey action handler only creates tasks/reminders
 * and records deterministic instructions — no external send / provider spend — so
 * there is nothing for the Billing gate to block here. Secured by CRON_SECRET.
 * Returns an HONEST scanned/due/executed/skipped/failed/remaining tally.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runJourneyDelayQueue(200);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "delay-queue drain failed" }, { status: 500 });
  }
}
