// ============================================================================
// ZONO Orchestrator — per-organization concurrency lock.
// Only one orchestrator run per org at a time. Locks expire after 10 minutes;
// a `force` run may take over an EXPIRED lock. Always released in a finally.
// Uses the service-role client so it works in both session and cron contexts.
// ============================================================================
import "server-only";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ORCHESTRATOR_LOCK_MS } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

export interface AcquiredLock { token: string }

/**
 * Try to acquire the org lock. Returns the lock token on success, or null if a
 * valid (non-expired) lock is already held. With `force`, an EXPIRED lock can be
 * taken over (a valid lock is never stolen).
 */
export async function acquireOrchestratorLock(
  organizationId: string,
  trigger: string,
  createdBy: string | null,
  force: boolean,
): Promise<AcquiredLock | null> {
  const db = createServiceRoleClient() as Db;
  const token = randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + ORCHESTRATOR_LOCK_MS).toISOString();

  // Fast path: insert a fresh lock (PK = organization_id → conflict if one exists).
  const ins = await db.from("zono_orchestrator_locks").insert({
    organization_id: organizationId, lock_token: token, expires_at: expiresAt,
    trigger, created_by: createdBy, locked_at: new Date(now).toISOString(),
  } as never);
  if (!ins.error) return { token };

  // A lock row already exists — inspect it.
  const { data: existing } = await db
    .from("zono_orchestrator_locks")
    .select("expires_at")
    .eq("organization_id", organizationId)
    .single();
  const existingExpiry = existing?.expires_at ? new Date(existing.expires_at).getTime() : 0;
  const expired = existingExpiry > 0 && existingExpiry < now;

  // Only take over an EXPIRED lock (force is required for take-over).
  if (expired && force) {
    const upd = await db
      .from("zono_orchestrator_locks")
      .update({ lock_token: token, expires_at: expiresAt, trigger, created_by: createdBy, locked_at: new Date(now).toISOString() } as never)
      .eq("organization_id", organizationId)
      .lt("expires_at", new Date(now).toISOString());
    if (!upd.error) return { token };
  }
  return null;
}

/** Release the lock — only if we still hold this exact token. Best-effort. */
export async function releaseOrchestratorLock(organizationId: string, token: string): Promise<void> {
  const db = createServiceRoleClient() as Db;
  try {
    await db.from("zono_orchestrator_locks").delete().eq("organization_id", organizationId).eq("lock_token", token);
  } catch { /* best-effort */ }
}
