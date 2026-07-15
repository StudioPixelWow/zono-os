// ============================================================================
// 🔁 ZONO OS 2.0 — Stage 4 · Batch 4.4 · Canonical AI Memory · backfill (server).
// Seeds canonical ai_memory from CURRENT verified facts (buyer/seller records) —
// explicit, attributable, evidence-backed — using the SAME identity + conflict
// path as the live subscriber, so it's idempotent (re-running is safe, no dupes).
// Never infers historical facts from missing data. Never throws. Legacy rows
// (ai_memory / zono_org_memory*) are left intact; only current facts are bridged.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MemoryOpIntent } from "./types";
import { memoryIdentityKey, normalizeFact } from "./identity";
import { resolveMemoryConflict } from "./conflict";
import { readActiveByIdentity, createMemory, supersedeMemory } from "./repository";
import { isJourneyType, stageDef, stageLabel, type JourneyType } from "@/lib/journey-canonical";

export interface MemoryBackfillDiagnostics {
  source: string;
  scanned: number;
  created: number;
  superseded: number;
  skippedInsufficientEvidence: number;
  duplicatesSkipped: number;
  crossOrgAnomalies: number;
  invalidLinks: number;
  errors: number;
}

export interface MemoryBackfillResult {
  perSource: MemoryBackfillDiagnostics[];
  totalCreated: number;
  finishedAt: string;
}

type Db = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;

function s(v: unknown): string | null { return typeof v === "string" && v.trim() ? v.trim() : (typeof v === "number" && Number.isFinite(v) ? String(v) : null); }
function rowOrg(row: Row): string | null { const v = row["org_id"] ?? row["organization_id"]; return typeof v === "string" ? v : null; }

async function apply(db: Db, org: string, intent: MemoryOpIntent, eventId: string | null, d: MemoryBackfillDiagnostics): Promise<void> {
  const identityKey = memoryIdentityKey(org, intent);
  const normalized = normalizeFact(intent.fact);
  const existing = await readActiveByIdentity(db, org, identityKey);
  const decision = resolveMemoryConflict(existing, { fact: intent.fact, provenance: intent.provenance, sourceEventId: eventId ?? "backfill" });
  if (decision.action === "create") { const id = await createMemory(db, org, intent, identityKey, normalized, eventId, null); if (id) d.created++; else d.errors++; }
  else if (decision.action === "supersede") { const id = await supersedeMemory(db, org, intent, identityKey, normalized, eventId, null); if (id) d.superseded++; else d.errors++; }
  else d.duplicatesSkipped++; // reinforce/skip → already present, idempotent no-op
}

/** Backfill canonical memory from current buyer + seller facts (bounded, idempotent). */
export async function backfillMemory(opts: { orgId?: string; limitPerSource?: number } = {}): Promise<MemoryBackfillResult> {
  const db = createServiceRoleClient();
  const limit = opts.limitPerSource ?? 1000;
  const perSource: MemoryBackfillDiagnostics[] = [];

  // Buyers → budget / preferred area preferences (explicit).
  {
    const d: MemoryBackfillDiagnostics = { source: "buyers", scanned: 0, created: 0, superseded: 0, skippedInsufficientEvidence: 0, duplicatesSkipped: 0, crossOrgAnomalies: 0, invalidLinks: 0, errors: 0 };
    try {
      const { data } = await db.from("buyers" as never).select("*").limit(limit);
      for (const raw of (data as unknown as Row[]) ?? []) {
        d.scanned++;
        const org = rowOrg(raw); const id = s(raw["id"]);
        if (!org || !id) { d.invalidLinks++; continue; }
        if (opts.orgId && org !== opts.orgId) { d.crossOrgAnomalies++; continue; }
        const budget = s(raw["budget"]) ?? s(raw["budget_max"]) ?? s(raw["max_budget"]);
        const area = s(raw["preferred_area"]) ?? s(raw["city"]);
        let any = false;
        if (budget) { any = true; await apply(db, org, { scope: "entity", entityType: "buyer", entityId: id, userId: null, memoryType: "preference", title: "תקציב קונה", fact: `תקציב: ${budget}`, normalizedFactKey: "budget", confidence: 90, sensitivity: "confidential", provenance: "explicit", sourceEntityRefs: [] }, null, d); }
        if (area) { any = true; await apply(db, org, { scope: "entity", entityType: "buyer", entityId: id, userId: null, memoryType: "preference", title: "אזור מועדף", fact: `אזור מועדף: ${area}`, normalizedFactKey: "preferred_area", confidence: 90, sensitivity: "internal", provenance: "explicit", sourceEntityRefs: [] }, null, d); }
        if (!any) d.skippedInsufficientEvidence++;
      }
    } catch { d.errors++; }
    perSource.push(d);
  }

  // Sellers → communication preference / pricing position (explicit).
  {
    const d: MemoryBackfillDiagnostics = { source: "sellers", scanned: 0, created: 0, superseded: 0, skippedInsufficientEvidence: 0, duplicatesSkipped: 0, crossOrgAnomalies: 0, invalidLinks: 0, errors: 0 };
    try {
      const { data } = await db.from("sellers" as never).select("*").limit(limit);
      for (const raw of (data as unknown as Row[]) ?? []) {
        d.scanned++;
        const org = rowOrg(raw); const id = s(raw["id"]);
        if (!org || !id) { d.invalidLinks++; continue; }
        if (opts.orgId && org !== opts.orgId) { d.crossOrgAnomalies++; continue; }
        const comm = s(raw["communication_preference"]) ?? s(raw["comm_pref"]);
        let any = false;
        if (comm) { any = true; await apply(db, org, { scope: "entity", entityType: "seller", entityId: id, userId: null, memoryType: "communication_preference", title: "העדפת תקשורת מוכר", fact: `העדפת תקשורת: ${comm}`, normalizedFactKey: "comm_pref", confidence: 90, sensitivity: "internal", provenance: "explicit", sourceEntityRefs: [] }, null, d); }
        if (!any) d.skippedInsufficientEvidence++;
      }
    } catch { d.errors++; }
    perSource.push(d);
  }

  // Canonical Journeys → terminal-outcome / blocked memory (Batch 5.6D).
  perSource.push(await backfillJourneyMemorySource(db, opts.orgId, limit));

  return { perSource, totalCreated: perSource.reduce((a, x) => a + x.created, 0), finishedAt: new Date().toISOString() };
}

/**
 * Backfill canonical Journey memory — Batch 5.6D. ONLY where evidence supports
 * it: a journey whose current stage is terminal-WON (matching the journey.completed
 * event semantics: `t.status === "won"` → outcome "completed"), or one carrying a
 * persisted blocked state. Non-terminal journeys are NEVER remembered — the current
 * stage is transient state owned by `journeys` (no second lifecycle truth). Uses
 * the SAME identity + conflict path as the live subscriber, so re-running is
 * idempotent and converges with event-created memory. An honest ZERO is valid.
 */
export async function backfillJourneyMemorySource(db: Db, orgId?: string, limit = 1000): Promise<MemoryBackfillDiagnostics> {
  const d: MemoryBackfillDiagnostics = { source: "journeys", scanned: 0, created: 0, superseded: 0, skippedInsufficientEvidence: 0, duplicatesSkipped: 0, crossOrgAnomalies: 0, invalidLinks: 0, errors: 0 };
  try {
    let q = db.from("journeys" as never).select("*").limit(limit);
    if (orgId) q = q.eq("org_id", orgId);
    const { data } = await q;
    for (const raw of (data as unknown as Row[]) ?? []) {
      d.scanned++;
      const org = rowOrg(raw);
      const jtRaw = s(raw["journey_type"]) ?? s(raw["entity_type"]);
      const subjectType = s(raw["entity_type"]);
      const subjectId = s(raw["entity_id"]);
      const journeyId = s(raw["id"]);
      if (!org || !journeyId) { d.invalidLinks++; continue; }
      if (orgId && org !== orgId) { d.crossOrgAnomalies++; continue; }
      if (!jtRaw || !isJourneyType(jtRaw) || !subjectType || !subjectId) { d.invalidLinks++; continue; }
      const jt = jtRaw as JourneyType;
      const stage = s(raw["current_stage"]);
      const def = stage ? stageDef(jt, stage) : undefined;
      const meta = (raw["metadata"] && typeof raw["metadata"] === "object" ? raw["metadata"] : {}) as Row;
      const blocked = meta["blocked"] === true || s(raw["status"]) === "blocked";
      // Only a WON terminal (what journey.completed represents) earns outcome memory.
      const won = !!def && def.terminal && def.kind === "won";
      if (!won && !blocked) { d.skippedInsufficientEvidence++; continue; }
      const stageLbl = stage ? stageLabel(jt, stage) : null;
      const refs = [{ type: "journey", id: journeyId }, { type: subjectType, id: subjectId }];
      await apply(db, org, {
        scope: "entity", entityType: subjectType, entityId: subjectId, userId: null,
        memoryType: blocked ? "risk" : "outcome",
        title: blocked ? "מסע נחסם" : "מסע הושלם",
        fact: `${blocked ? "המסע נחסם" : "המסע הושלם"}${stageLbl ? ` בשלב ${stageLbl}` : ""}`,
        normalizedFactKey: blocked ? "journey_blocked" : "journey_outcome",
        confidence: 60, sensitivity: "internal", provenance: "derived", sourceEntityRefs: refs,
      }, null, d);
    }
  } catch { d.errors++; }
  return d;
}
