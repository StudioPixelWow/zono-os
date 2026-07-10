// ============================================================================
// 🩺 ZONO OS 2.0 — Event Kernel · outbox health (server-only, read-only).
// Org-scoped observability for the domain_events outbox: how many events are
// pending / processing / done / failed, plus the oldest unprocessed timestamp
// (drain lag). Lets a dashboard confirm the Stage 2/3 subscribers are draining.
// Never throws — returns zeros when the table isn't present yet (pre-migration).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export interface KernelOutboxHealth {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  total: number;
  oldestPendingAt: string | null;
}

const EMPTY: KernelOutboxHealth = { pending: 0, processing: 0, done: 0, failed: 0, total: 0, oldestPendingAt: null };

/** Count domain_events by processing_status for the current org (best-effort). */
export async function getKernelOutboxHealth(): Promise<KernelOutboxHealth> {
  try {
    const { profile } = await getSessionContext();
    const orgId = profile?.org_id;
    if (!orgId) return EMPTY;
    const db = await createClient();

    const statuses: (keyof KernelOutboxHealth)[] = ["pending", "processing", "done", "failed"];
    const out: KernelOutboxHealth = { ...EMPTY };
    for (const status of statuses) {
      const { count } = await db
        .from("domain_events" as never)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("processing_status", status);
      const n = count ?? 0;
      (out[status] as number) = n;
      out.total += n;
    }

    // Oldest still-unprocessed event = current drain lag.
    const { data } = await db
      .from("domain_events" as never)
      .select("occurred_at")
      .eq("organization_id", orgId)
      .in("processing_status", ["pending", "failed"] as never)
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    out.oldestPendingAt = (data as { occurred_at: string } | null)?.occurred_at ?? null;

    return out;
  } catch {
    return EMPTY;
  }
}

// ── Stage 2 · Timeline subscriber observability (internal, read-only) ────────
export interface TimelineKernelHealth extends KernelOutboxHealth {
  /** When the most recent event finished draining. */
  lastProcessedAt: string | null;
  /** Avg drain latency (ms) over a recent sample: processed_at − occurred_at. */
  avgLatencyMs: number | null;
  /** done / (done + failed) over the outbox — the subscriber success rate (0..1). */
  subscriberSuccessRate: number | null;
  /** Canonical timeline rows the kernel has projected (source='kernel'). */
  kernelTimelineRows: number;
}

/**
 * Richer kernel health for an internal admin surface (never shown to brokers).
 * Adds drain latency, last-processed, subscriber success rate and projected
 * timeline row count on top of the outbox status counts. Best-effort.
 */
export async function getTimelineKernelHealth(): Promise<TimelineKernelHealth> {
  const base = await getKernelOutboxHealth();
  const out: TimelineKernelHealth = {
    ...base, lastProcessedAt: null, avgLatencyMs: null, subscriberSuccessRate: null, kernelTimelineRows: 0,
  };
  try {
    const { profile } = await getSessionContext();
    const orgId = profile?.org_id;
    if (!orgId) return out;
    const db = await createClient();

    // Latest processed + a latency sample from recently-done events.
    const { data: doneRows } = await db
      .from("domain_events" as never)
      .select("occurred_at,processed_at")
      .eq("organization_id", orgId)
      .eq("processing_status", "done")
      .order("processed_at", { ascending: false })
      .limit(100);
    const rows = (doneRows as { occurred_at: string; processed_at: string | null }[] | null) ?? [];
    if (rows.length) {
      out.lastProcessedAt = rows[0].processed_at;
      const lats = rows
        .filter((r) => r.processed_at)
        .map((r) => new Date(r.processed_at as string).getTime() - new Date(r.occurred_at).getTime())
        .filter((n) => Number.isFinite(n) && n >= 0);
      if (lats.length) out.avgLatencyMs = Math.round(lats.reduce((s, n) => s + n, 0) / lats.length);
    }

    const settled = base.done + base.failed;
    out.subscriberSuccessRate = settled > 0 ? base.done / settled : null;

    // Canonical timeline rows the kernel has projected for this org.
    const { count } = await db
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("source" as never, "kernel" as never);
    out.kernelTimelineRows = count ?? 0;

    return out;
  } catch {
    return out;
  }
}
