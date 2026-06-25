// ============================================================================
// ZONO — central audit recorder (server-only). One entry point for the whole
// platform: who / what / when / old → new / source / correlation. Append-only.
// Best-effort: an audit failure never breaks the originating operation.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createPlatformRepository } from "./repository";
import { createLogger } from "../logging/logger";
import { newCorrelationId } from "../logging/ids";

const log = createLogger({ module: "audit" });

export interface RecordAuditInput {
  orgId: string;
  actorUserId: string | null;
  actorLabel?: string | null;
  action: string;                 // e.g. "flag.update", "sync.start"
  entityType: string;             // e.g. "feature_flag", "property"
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  source?: string;                // app/cron/api/system (default "app")
  correlationId?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Persist one audit entry. Never throws — logs and swallows on failure. */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const db = createServiceRoleClient();
    await createPlatformRepository(db).insertAudit({
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      source: input.source ?? "app",
      correlationId: input.correlationId ?? newCorrelationId(),
      requestId: input.requestId ?? null,
      traceId: input.traceId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (e) {
    log.error("audit_insert_failed", { action: input.action, entityType: input.entityType, error: e instanceof Error ? e.message : String(e) });
  }
}
