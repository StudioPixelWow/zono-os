// ============================================================================
// 🕸️ ZONO OS 2.0 — Batch 5.6C · Canonical Journey graph backfill (server-only).
// Seeds one HAS_JOURNEY edge (subject → journey) per canonical journey on the
// EXISTING entity_relationships substrate — idempotent upsert on the same 6-part
// key the kernel graph subscriber uses. Batched subject resolution (no N+1).
// Reuses 5.6B's buildJourneySearchDocument for the readable node label. No new
// table, no new graph engine. Never throws — returns diagnostics.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildJourneySearchDocument, SEARCH_CONFIG, SEARCH_TABLE_MAP, pick } from "@/lib/search-projection";
import { isJourneyType, stageDef, stageLabel, statusForKind, type JourneyType } from "@/lib/journey-canonical";

type Row = Record<string, unknown>;
type Db = ReturnType<typeof createServiceRoleClient>;

export interface JourneyGraphBackfillDiagnostics {
  scanned: number;
  primaryEdgesUpserted: number;
  missingSubjects: number;
  invalidJourneyTypes: number;
  crossOrgAnomalies: number;
  terminalJourneys: number;
  secondaryEdgesCreated: number;      // 0 — no persisted journey→capability link exists yet
  unsupportedSecondaryRelations: number;
  errors: number;
  finishedAt: string;
}

function str(row: Row, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function rowOrg(row: Row): string | null {
  const v = row["org_id"] ?? row["organization_id"];
  return typeof v === "string" ? v : null;
}

/**
 * Backfill HAS_JOURNEY edges for every canonical journey. `orgId` confines the
 * sweep to one org (omitted = all orgs, service-role). Idempotent + batched.
 */
export async function backfillJourneyGraph(orgId?: string, limit = 5000): Promise<JourneyGraphBackfillDiagnostics> {
  const db: Db = createServiceRoleClient();
  const d: JourneyGraphBackfillDiagnostics = {
    scanned: 0, primaryEdgesUpserted: 0, missingSubjects: 0, invalidJourneyTypes: 0,
    crossOrgAnomalies: 0, terminalJourneys: 0, secondaryEdgesCreated: 0,
    unsupportedSecondaryRelations: 0, errors: 0, finishedAt: new Date().toISOString(),
  };
  try {
    let jq = db.from("journeys" as never).select("*").limit(limit);
    if (orgId) jq = jq.eq("org_id", orgId);
    const { data: jdata, error: jerr } = await jq;
    if (jerr) { d.errors++; d.finishedAt = new Date().toISOString(); return d; }
    const journeys = (jdata as unknown as Row[]) ?? [];

    // Batched subject resolution (one query per subject table — no N+1).
    const idsByType = new Map<string, Set<string>>();
    for (const j of journeys) {
      const st = str(j, "entity_type"); const sid = str(j, "entity_id");
      if (st && sid && SEARCH_TABLE_MAP[st]) (idsByType.get(st) ?? idsByType.set(st, new Set()).get(st)!).add(sid);
    }
    const subjectRows = new Map<string, Row>();
    for (const [st, ids] of idsByType) {
      const table = SEARCH_TABLE_MAP[st];
      const { data: sdata } = await db.from(table as never).select("*").in("id", [...ids] as never);
      for (const r of (sdata as unknown as Row[]) ?? []) { const id = str(r, "id"); if (id) subjectRows.set(`${st}:${id}`, r); }
    }

    const now = new Date().toISOString();
    for (const j of journeys) {
      d.scanned++;
      const org = rowOrg(j);
      const journeyId = str(j, "id");
      if (!org || !journeyId) { d.errors++; continue; }
      if (orgId && org !== orgId) { d.crossOrgAnomalies++; continue; }

      const jtRaw = str(j, "journey_type") ?? str(j, "entity_type");
      if (!jtRaw || !isJourneyType(jtRaw)) { d.invalidJourneyTypes++; continue; }
      const jt = jtRaw as JourneyType;
      const subjectType = str(j, "entity_type") ?? jt;
      const subjectId = str(j, "entity_id");
      if (!subjectId) { d.missingSubjects++; continue; }
      const subject = subjectRows.get(`${subjectType}:${subjectId}`) ?? null;
      if (!subject) { d.missingSubjects++; continue; }
      const so = rowOrg(subject); if (so && so !== org) { d.crossOrgAnomalies++; continue; }

      // Readable label — reuse 5.6B's canonical journey title + stage label.
      const { doc } = buildJourneySearchDocument(j, subject, org, null);
      const stage = str(j, "current_stage");
      const stageLbl = stage ? stageLabel(jt, stage) : null;
      const subjectTitle = SEARCH_CONFIG[subjectType] ? pick(subject, SEARCH_CONFIG[subjectType].title) : null;
      const targetName = doc ? `${doc.title}${stageLbl ? ` · ${stageLbl}` : ""}` : `מסע · ${stageLbl ?? ""}`.trim();

      const def = stage ? stageDef(jt, stage) : undefined;
      const terminal = def ? def.terminal : false;
      const jStatus = str(j, "status") ?? (def ? statusForKind(def.kind) : "active");
      const edgeInactive = terminal || ["won", "lost", "inactive"].includes(jStatus);
      if (terminal) d.terminalJourneys++;

      const metadata: Record<string, unknown> = {
        journeyType: jt,
        subjectType,
        currentStage: stage,
        canonicalStageLabel: stageLbl,
        status: jStatus,
        terminal,
        stageEnteredAt: str(j, "stage_entered_at"),
        source: "canonical_graph_backfill",
        source_name: subjectTitle,
        target_name: targetName,
      };

      const { error: upErr } = await db.from("entity_relationships" as never).upsert({
        org_id: org,
        source_entity_type: subjectType, source_entity_id: subjectId,
        target_entity_type: "journey", target_entity_id: journeyId,
        relationship_type: "has_journey",
        status: edgeInactive ? "inactive" : "active",
        strength_score: 0,
        metadata,
        last_seen_at: now,
        valid_to: edgeInactive ? now : null,
      } as never, { onConflict: "org_id,source_entity_type,source_entity_id,target_entity_type,target_entity_id,relationship_type" });
      if (upErr) d.errors++; else d.primaryEdgesUpserted++;
    }
  } catch { d.errors++; }
  d.finishedAt = new Date().toISOString();
  return d;
}
