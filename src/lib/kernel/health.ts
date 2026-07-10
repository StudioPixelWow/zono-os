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
