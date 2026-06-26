// ============================================================================
// ZONO — Agency Signal Intelligence repository (Phase 26.6, SERVER-ONLY).
// Dedupe-aware writes (one ACTIVE signal per dedupe_key — updated in place),
// status lifecycle, previous-metric reconstruction, and importance-gated
// timeline upserts. Org-scoped; RLS enforces isolation.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { materiallyChanged } from "./agencySignalDedupe";
import type { DetectedAgencySignal, AgencySignalStatus } from "./agencySignalTypes";

const COLS =
  "id,organization_id,agency_id,signal_type,severity,title,description,metadata,entity_type,entity_id," +
  "territory_type,city,neighborhood,street,score_before,score_after,importance,confidence,status,dedupe_key," +
  "detected_at,resolved_at,expires_at,created_at";

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export interface AgencyIntelSignalRow {
  id: string; agencyId: string; signalType: string; severity: string | null;
  title: string; description: string | null; metadata: Record<string, unknown>;
  territoryType: string | null; city: string | null; neighborhood: string | null; street: string | null;
  scoreBefore: number | null; scoreAfter: number | null; importance: number | null; confidence: number | null;
  status: string; dedupeKey: string | null; detectedAt: string; createdAt: string;
}

export function toIntelSignal(r: Obj): AgencyIntelSignalRow {
  return {
    id: r.id as string, agencyId: r.agency_id as string, signalType: r.signal_type as string,
    severity: (r.severity as string) ?? null, title: r.title as string, description: (r.description as string) ?? null,
    metadata: asObj(r.metadata), territoryType: (r.territory_type as string) ?? null,
    city: (r.city as string) ?? null, neighborhood: (r.neighborhood as string) ?? null, street: (r.street as string) ?? null,
    scoreBefore: num(r.score_before), scoreAfter: num(r.score_after), importance: num(r.importance), confidence: num(r.confidence),
    status: (r.status as string) ?? "active", dedupeKey: (r.dedupe_key as string) ?? null,
    detectedAt: (r.detected_at as string) ?? (r.created_at as string), createdAt: r.created_at as string,
  };
}

/** Rebuild the last-known numeric value per metric key from prior signals. */
export async function buildPrevMetrics(agencyId: string): Promise<Record<string, number>> {
  const db = await createClient();
  const { data } = await db.from("agency_signals")
    .select("metadata,score_after,created_at").eq("agency_id", agencyId)
    .order("created_at", { ascending: false }).limit(500);
  const map: Record<string, number> = {};
  for (const r of (data as Obj[] | null) ?? []) {
    const mk = (asObj(r.metadata).metricKey as string) ?? null;
    const after = num(r.score_after);
    if (mk && after != null && !(mk in map)) map[mk] = after; // first (latest) wins
  }
  return map;
}

export interface UpsertSignalResult { created: number; updated: number; skipped: number; ids: string[] }

/**
 * Upsert a batch of detected signals by dedupe_key. An existing ACTIVE signal is
 * updated in place only when it changed materially; otherwise it is left as-is.
 */
export async function upsertDetectedSignals(signals: DetectedAgencySignal[]): Promise<UpsertSignalResult> {
  const res: UpsertSignalResult = { created: 0, updated: 0, skipped: 0, ids: [] };
  if (signals.length === 0) return res;
  const org = await currentOrgId();
  const db = await createClient();
  const now = new Date().toISOString();

  // Load existing ACTIVE signals for these dedupe keys in one query.
  const keys = [...new Set(signals.map((s) => s.dedupeKey))];
  const { data: existingRows } = await db.from("agency_signals").select(COLS)
    .eq("organization_id", org).eq("status", "active").in("dedupe_key", keys);
  const existing = new Map<string, AgencyIntelSignalRow>(
    ((existingRows as Obj[] | null) ?? []).map((r) => [r.dedupe_key as string, toIntelSignal(r)]),
  );

  for (const s of signals) {
    const prior = existing.get(s.dedupeKey);
    const payload = {
      organization_id: org, agency_id: s.agencyId, signal_type: s.signalType, severity: s.severity,
      title: s.title, description: s.description,
      metadata: { ...s.metadata, metricKey: s.metricKey },
      territory_type: s.territoryType, city: s.city, neighborhood: s.neighborhood, street: s.street,
      score_before: s.scoreBefore, score_after: s.scoreAfter, importance: s.importance, confidence: s.confidence,
      status: "active", dedupe_key: s.dedupeKey, detected_at: now,
    };
    if (!prior) {
      const { data, error } = await db.from("agency_signals").insert(payload as never).select("id").single();
      if (!error && data) { res.created++; res.ids.push((data as { id: string }).id); }
    } else if (materiallyChanged(prior, s)) {
      const { error } = await db.from("agency_signals").update(payload as never).eq("id", prior.id);
      if (!error) { res.updated++; res.ids.push(prior.id); }
    } else {
      res.skipped++;
    }
  }
  return res;
}

export async function listActiveSignals(agencyId: string, limit = 100): Promise<AgencyIntelSignalRow[]> {
  const db = await createClient();
  const { data } = await db.from("agency_signals").select(COLS)
    .eq("agency_id", agencyId).eq("status", "active")
    .order("importance", { ascending: false, nullsFirst: false }).order("detected_at", { ascending: false }).limit(limit);
  return ((data as Obj[] | null) ?? []).map(toIntelSignal);
}

export interface OrgSignalFilters { status?: AgencySignalStatus; signalType?: string; minImportance?: number; severity?: string; limit?: number }
export async function listOrgSignals(filters: OrgSignalFilters = {}): Promise<AgencyIntelSignalRow[]> {
  const org = await currentOrgId();
  const db = await createClient();
  let req = db.from("agency_signals").select(COLS).eq("organization_id", org);
  req = req.eq("status", filters.status ?? "active");
  if (filters.signalType) req = req.eq("signal_type", filters.signalType);
  if (filters.severity) req = req.eq("severity", filters.severity);
  if (filters.minImportance != null) req = req.gte("importance", filters.minImportance);
  const { data } = await req.order("importance", { ascending: false, nullsFirst: false }).limit(filters.limit ?? 200);
  return ((data as Obj[] | null) ?? []).map(toIntelSignal);
}

export async function getSignalById(signalId: string): Promise<AgencyIntelSignalRow | null> {
  const db = await createClient();
  const { data } = await db.from("agency_signals").select(COLS).eq("id", signalId).maybeSingle();
  return data ? toIntelSignal(data as unknown as Obj) : null;
}

export async function setSignalStatus(signalId: string, status: AgencySignalStatus): Promise<void> {
  const db = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "resolved") patch.resolved_at = new Date().toISOString();
  const { error } = await db.from("agency_signals").update(patch as never).eq("id", signalId);
  if (error) throw new Error(error.message);
}

/** Importance-gated timeline upsert (dedupe_key unique). Returns true if written. */
export async function upsertTimelineFromSignal(signal: AgencyIntelSignalRow, eventType: string): Promise<boolean> {
  const org = await currentOrgId();
  const db = await createClient();
  const key = `tl::${signal.dedupeKey ?? signal.id}`;
  const { data: existing } = await db.from("agency_timeline").select("id,importance").eq("dedupe_key", key).maybeSingle();
  const payload = {
    organization_id: org, agency_id: signal.agencyId, event_type: eventType, title: signal.title,
    description: signal.description, metadata: { ...signal.metadata, signalId: signal.id },
    territory_type: signal.territoryType, city: signal.city, neighborhood: signal.neighborhood, street: signal.street,
    importance: signal.importance, dedupe_key: key, event_date: new Date().toISOString(),
  };
  if (existing) {
    const { error } = await db.from("agency_timeline").update(payload as never).eq("id", (existing as { id: string }).id);
    return !error;
  }
  const { error } = await db.from("agency_timeline").insert(payload as never);
  return !error;
}

export interface TimelineIntelItem {
  id: string; eventType: string; title: string; description: string | null;
  importance: number | null; territoryType: string | null; city: string | null;
  neighborhood: string | null; street: string | null; eventDate: string; metadata: Record<string, unknown>;
}
export async function listTimelineIntelligence(agencyId: string, limit = 100): Promise<TimelineIntelItem[]> {
  const db = await createClient();
  const { data } = await db.from("agency_timeline")
    .select("id,event_type,title,description,importance,territory_type,city,neighborhood,street,event_date,metadata")
    .eq("agency_id", agencyId).order("importance", { ascending: false, nullsFirst: false }).order("event_date", { ascending: false }).limit(limit);
  return ((data as Obj[] | null) ?? []).map((r) => ({
    id: r.id as string, eventType: r.event_type as string, title: r.title as string, description: (r.description as string) ?? null,
    importance: num(r.importance), territoryType: (r.territory_type as string) ?? null, city: (r.city as string) ?? null,
    neighborhood: (r.neighborhood as string) ?? null, street: (r.street as string) ?? null,
    eventDate: r.event_date as string, metadata: asObj(r.metadata),
  }));
}
