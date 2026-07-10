// ============================================================================
// 🌉 ZONO OS 2.0 — Stage 2 · Legacy timeline backfill (server-only).
// Brings historical milestones from the source ledgers (legacy activities,
// journey_events, document_audit_logs) forward into the canonical activity
// timeline, using the PURE legacy-bridge mappers. Idempotent: every bridged row
// carries a deterministic synthetic event_id, so re-running is a no-op (dupes
// are counted, never re-inserted). Runs under the service role. Never throws —
// returns diagnostics. Source ledgers are READ ONLY here; nothing is deleted.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  bridgeLegacyActivity, bridgeJourneyEvent, bridgeDocumentAudit,
  type BridgedProjection, type LegacyActivityRow, type JourneyEventRow, type DocumentAuditRow,
} from "./legacy-bridge";

export interface BackfillDiagnostics {
  source: string;
  scanned: number;
  projected: number;
  duplicatesSkipped: number;
  unresolvedLinks: number;
  crossOrgAnomalies: number;
  errors: number;
}

export interface BackfillResult {
  perSource: BackfillDiagnostics[];
  totalProjected: number;
  totalScanned: number;
  finishedAt: string;
}

type Db = ReturnType<typeof createServiceRoleClient>;

function isDuplicate(err: { code?: string; message?: string }): boolean {
  return err.code === "23505" || (err.message ?? "").toLowerCase().includes("duplicate key");
}

/** Insert a bridged projection, counting idempotent dupes as skips (not errors). */
async function insertBridged(db: Db, p: BridgedProjection, d: BackfillDiagnostics): Promise<void> {
  const { error } = await db.from("activity_events").insert({
    org_id: p.org_id, event_id: p.event_id, event_type: p.event_type,
    entity_type: p.entity_type, entity_id: p.entity_id,
    related_entity_type: p.related_entity_type, related_entity_id: p.related_entity_id,
    title: p.title, description: p.description, actor_user_id: p.actor_user_id,
    occurred_at: p.occurred_at, visibility: p.visibility, source: p.source, metadata: p.metadata,
  } as never);
  if (error) { if (isDuplicate(error)) d.duplicatesSkipped++; else d.errors++; return; }
  d.projected++;
}

/**
 * Backfill one page of a source. `orgId` (optional) confines the scan to a
 * single org; omitted = all orgs (service-role sweep). Deterministic + idempotent.
 */
export async function backfillTimeline(opts: { orgId?: string; limit?: number } = {}): Promise<BackfillResult> {
  const db = createServiceRoleClient();
  const limit = opts.limit ?? 1000;
  const perSource: BackfillDiagnostics[] = [];

  // 1) legacy activities
  {
    const d: BackfillDiagnostics = { source: "activities", scanned: 0, projected: 0, duplicatesSkipped: 0, unresolvedLinks: 0, crossOrgAnomalies: 0, errors: 0 };
    try {
      let q = db.from("activities" as never)
        .select("id,org_id,actor_id,type,subject,body,occurred_at,buyer_id,seller_id,lead_id,property_id,deal_id")
        .order("occurred_at", { ascending: true }).limit(limit);
      if (opts.orgId) q = q.eq("org_id", opts.orgId);
      const { data } = await q;
      for (const row of (data as unknown as LegacyActivityRow[]) ?? []) {
        d.scanned++;
        if (opts.orgId && row.org_id !== opts.orgId) { d.crossOrgAnomalies++; continue; }
        const p = bridgeLegacyActivity(row);
        if (!p) { d.unresolvedLinks++; continue; }
        await insertBridged(db, p, d);
      }
    } catch { d.errors++; }
    perSource.push(d);
  }

  // 2) journey_events
  {
    const d: BackfillDiagnostics = { source: "journey_events", scanned: 0, projected: 0, duplicatesSkipped: 0, unresolvedLinks: 0, crossOrgAnomalies: 0, errors: 0 };
    try {
      let q = db.from("journey_events" as never)
        .select("id,org_id,journey_id,entity_type,entity_id,event_type,from_stage,to_stage,title,detail,occurred_at")
        .order("occurred_at", { ascending: true }).limit(limit);
      if (opts.orgId) q = q.eq("org_id", opts.orgId);
      const { data } = await q;
      for (const row of (data as unknown as JourneyEventRow[]) ?? []) {
        d.scanned++;
        if (opts.orgId && row.org_id !== opts.orgId) { d.crossOrgAnomalies++; continue; }
        const p = bridgeJourneyEvent(row);
        if (!p) { d.unresolvedLinks++; continue; }
        await insertBridged(db, p, d);
      }
    } catch { d.errors++; }
    perSource.push(d);
  }

  // 3) document_audit_logs (milestones only)
  {
    const d: BackfillDiagnostics = { source: "document_audit_logs", scanned: 0, projected: 0, duplicatesSkipped: 0, unresolvedLinks: 0, crossOrgAnomalies: 0, errors: 0 };
    try {
      let q = db.from("document_audit_logs" as never)
        .select("id,organization_id,document_id,event,detail,actor_user_id,created_at")
        .order("created_at", { ascending: true }).limit(limit);
      if (opts.orgId) q = q.eq("organization_id", opts.orgId);
      const { data } = await q;
      for (const row of (data as unknown as DocumentAuditRow[]) ?? []) {
        d.scanned++;
        if (opts.orgId && row.organization_id !== opts.orgId) { d.crossOrgAnomalies++; continue; }
        const p = bridgeDocumentAudit(row);
        if (!p) { d.unresolvedLinks++; continue; } // non-milestone rows are skipped, not projected
        await insertBridged(db, p, d);
      }
    } catch { d.errors++; }
    perSource.push(d);
  }

  return {
    perSource,
    totalProjected: perSource.reduce((s, d) => s + d.projected, 0),
    totalScanned: perSource.reduce((s, d) => s + d.scanned, 0),
    finishedAt: new Date().toISOString(),
  };
}
