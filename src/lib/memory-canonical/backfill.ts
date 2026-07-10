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

  return { perSource, totalCreated: perSource.reduce((a, x) => a + x.created, 0), finishedAt: new Date().toISOString() };
}
