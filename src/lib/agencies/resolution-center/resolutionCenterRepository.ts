// ============================================================================
// ZONO — PHASE 26.12: Resolution Center repository (SERVER-ONLY). Org-scoped.
// Reads the resolution queue + enriched candidate evidence, and performs the
// conservative data moves for merge/split (reassign FK rows). NEVER deletes data.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { reviewerContext } from "./_ctx";
import type {
  ResolutionCandidate, CandidateDetail, AgencyLite, EvidenceItem, ResolutionStatus,
} from "./resolutionCenterFormat";

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const CAND_COLS = "id,raw_text,normalized_name,source,source_ref,status,confidence,matched_agency_id,evidence,created_at";

// ── Queue ────────────────────────────────────────────────────────────────────
export async function listQueue(limit = 200): Promise<ResolutionCandidate[]> {
  const { orgId } = await reviewerContext();
  const db = await createClient();
  const { data } = await db.from("agency_resolution_candidates").select(CAND_COLS)
    .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(limit);
  const rows = (data as Obj[] | null) ?? [];
  const agencyIds = [...new Set(rows.map((r) => r.matched_agency_id).filter((x): x is string => !!x))];
  const agencyById = new Map<string, { name: string; city: string | null }>();
  if (agencyIds.length) {
    const { data: ag } = await db.from("agencies").select("id,name,display_name,headquarters_city").in("id", agencyIds);
    for (const a of (ag as Obj[] | null) ?? []) {
      agencyById.set(a.id as string, { name: (str(a.display_name) ?? (a.name as string)), city: str(a.headquarters_city) });
    }
  }
  return rows.map((r) => {
    const matched = r.matched_agency_id ? agencyById.get(r.matched_agency_id as string) : undefined;
    return {
      id: r.id as string, detectedName: (r.raw_text as string) ?? "", normalizedName: (r.normalized_name as string) ?? "",
      suggestedAgencyId: str(r.matched_agency_id), suggestedAgencyName: matched?.name ?? null,
      confidence: num(r.confidence), source: str(r.source), detectionMethod: str((asObj(r.evidence).aliasMatch) ? "alias" : "name_match"),
      status: (r.status as ResolutionStatus) ?? "pending", city: matched?.city ?? null, createdAt: (r.created_at as string) ?? "",
    };
  });
}

// ── Candidate detail (+ evidence + matched-agency counts + timeline) ─────────
export async function getDetail(candidateId: string): Promise<CandidateDetail | null> {
  const { orgId } = await reviewerContext();
  const db = await createClient();
  const { data } = await db.from("agency_resolution_candidates").select(CAND_COLS)
    .eq("organization_id", orgId).eq("id", candidateId).maybeSingle();
  if (!data) return null;
  const r = data as Obj;
  const evidence = asObj(r.evidence);

  let matchedAgency: AgencyLite | null = null;
  const timeline: { title: string; date: string }[] = [];
  if (r.matched_agency_id) {
    matchedAgency = await getAgencyLite(r.matched_agency_id as string);
    const { data: tl } = await db.from("agency_timeline").select("title,event_date")
      .eq("organization_id", orgId).eq("agency_id", r.matched_agency_id as string).order("event_date", { ascending: false }).limit(8);
    for (const e of (tl as Obj[] | null) ?? []) timeline.push({ title: (e.title as string) ?? "", date: (e.event_date as string) ?? "" });
  }

  const evidenceItems: EvidenceItem[] = [];
  for (const c of asArr(evidence.candidates)) {
    const cc = asObj(c);
    evidenceItems.push({
      source: "התאמת שם", weight: num(cc.confidence), confidence: num(cc.confidence),
      reason: (asArr(cc.reasons) as string[]).join(" · ") || "דמיון שם",
    });
  }
  if (evidence.aliasMatch === true) evidenceItems.push({ source: "כינוי קיים", weight: 1, confidence: 1, reason: "התאמה מדויקת לכינוי שמור" });
  if (str(r.source)) evidenceItems.push({ source: "מקור איתור", weight: null, confidence: null, reason: r.source as string });

  const confidenceBreakdown = asArr(evidence.candidates).slice(0, 5).map((c) => {
    const cc = asObj(c);
    return { label: (asArr(cc.reasons) as string[])[0] ?? "התאמה", value: Math.round((num(cc.confidence) ?? 0) * 100) };
  });

  return {
    id: r.id as string, detectedName: (r.raw_text as string) ?? "", normalizedName: (r.normalized_name as string) ?? "",
    suggestedAgencyId: str(r.matched_agency_id), suggestedAgencyName: matchedAgency?.name ?? null,
    confidence: num(r.confidence), source: str(r.source), detectionMethod: evidence.aliasMatch ? "alias" : "name_match",
    status: (r.status as ResolutionStatus) ?? "pending", city: matchedAgency?.city ?? null, createdAt: (r.created_at as string) ?? "",
    detectedText: (r.raw_text as string) ?? "", normalizedText: (r.normalized_name as string) ?? "",
    matchedAgency, evidence: evidenceItems, timeline, confidenceBreakdown,
  };
}

export async function getAgencyLite(agencyId: string): Promise<AgencyLite | null> {
  const { orgId } = await reviewerContext();
  const db = await createClient();
  const { data } = await db.from("agencies").select("id,name,display_name,headquarters_city,website,phone,email")
    .eq("organization_id", orgId).eq("id", agencyId).maybeSingle();
  if (!data) return null;
  const a = data as Obj;
  const [{ count: propertyCount }, { count: agentCount }, { data: aliasRows }] = await Promise.all([
    db.from("agency_entity_relationships").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("agency_id", agencyId).eq("entity_type", "property"),
    db.from("agency_agents").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("agency_id", agencyId),
    db.from("agency_aliases").select("alias").eq("organization_id", orgId).eq("agency_id", agencyId).limit(20),
  ]);
  return {
    id: a.id as string, name: a.name as string, displayName: str(a.display_name), city: str(a.headquarters_city),
    website: str(a.website), phone: str(a.phone), email: str(a.email),
    propertyCount: propertyCount ?? 0, agentCount: agentCount ?? 0,
    aliases: ((aliasRows as Obj[] | null) ?? []).map((x) => x.alias as string),
  };
}

// ── Conservative data moves (merge/split). Reassign FK rows; never delete. ───
const MOVABLE_TABLES = ["agency_agents", "agency_entity_relationships", "agency_signals", "agency_timeline", "agency_aliases"] as const;

export async function reassignAllChildren(fromAgencyId: string, toAgencyId: string): Promise<Record<string, number>> {
  const { orgId } = await reviewerContext();
  const db = await createClient();
  const moved: Record<string, number> = {};
  for (const table of MOVABLE_TABLES) {
    const { data } = await db.from(table).update({ agency_id: toAgencyId } as never)
      .eq("organization_id", orgId).eq("agency_id", fromAgencyId).select("id");
    moved[table] = ((data as Obj[] | null) ?? []).length;
  }
  return moved;
}

export async function reassignSelected(toAgencyId: string, selection: { table: typeof MOVABLE_TABLES[number]; ids: string[] }[]): Promise<Record<string, number>> {
  const { orgId } = await reviewerContext();
  const db = await createClient();
  const moved: Record<string, number> = {};
  for (const sel of selection) {
    if (!sel.ids.length) { moved[sel.table] = 0; continue; }
    const { data } = await db.from(sel.table).update({ agency_id: toAgencyId } as never)
      .eq("organization_id", orgId).in("id", sel.ids).select("id");
    moved[sel.table] = ((data as Obj[] | null) ?? []).length;
  }
  return moved;
}

export async function setIdentityStatus(agencyId: string, identityStatus: string, deactivate = false): Promise<void> {
  const { orgId } = await reviewerContext();
  const db = await createClient();
  const patch: Obj = { identity_status: identityStatus };
  if (deactivate) patch.active = false;
  await db.from("agencies").update(patch as never).eq("organization_id", orgId).eq("id", agencyId);
}

/** Write Phase-26.2 identity columns not covered by the base updateAgency. */
export async function setAgencyIdentityFields(agencyId: string, fields: { displayName?: string | null; brandName?: string | null; franchiseName?: string | null }): Promise<void> {
  const { orgId } = await reviewerContext();
  const db = await createClient();
  const patch: Obj = {};
  if (fields.displayName !== undefined) patch.display_name = fields.displayName;
  if (fields.brandName !== undefined) patch.brand_name = fields.brandName;
  if (fields.franchiseName !== undefined) patch.franchise_name = fields.franchiseName;
  if (Object.keys(patch).length) await db.from("agencies").update(patch as never).eq("organization_id", orgId).eq("id", agencyId);
}

// ── Helpers for the merge/split dialogs ──────────────────────────────────────
export interface AgencyChildItem { id: string; label: string }
export interface AgencyChildren { agents: AgencyChildItem[]; relationships: AgencyChildItem[]; signals: AgencyChildItem[]; aliases: AgencyChildItem[] }

export async function searchAgenciesLite(query: string, limit = 12): Promise<{ id: string; name: string; city: string | null }[]> {
  const { orgId } = await reviewerContext();
  const db = await createClient();
  let q = db.from("agencies").select("id,name,display_name,headquarters_city").eq("organization_id", orgId).eq("active", true);
  const term = query.trim();
  if (term) q = q.or(`name.ilike.%${term.replace(/[%,]/g, " ")}%,display_name.ilike.%${term.replace(/[%,]/g, " ")}%`);
  const { data } = await q.limit(limit);
  return ((data as Obj[] | null) ?? []).map((a) => ({ id: a.id as string, name: (str(a.display_name) ?? (a.name as string)), city: str(a.headquarters_city) }));
}

export async function listAgencyChildren(agencyId: string): Promise<AgencyChildren> {
  const { orgId } = await reviewerContext();
  const db = await createClient();
  const [agents, rels, signals, aliases] = await Promise.all([
    db.from("agency_agents").select("id,agent_id,role").eq("organization_id", orgId).eq("agency_id", agencyId).limit(100),
    db.from("agency_entity_relationships").select("id,entity_type,relationship_type").eq("organization_id", orgId).eq("agency_id", agencyId).eq("active", true).limit(100),
    db.from("agency_signals").select("id,title").eq("organization_id", orgId).eq("agency_id", agencyId).eq("status", "active").limit(100),
    db.from("agency_aliases").select("id,alias").eq("organization_id", orgId).eq("agency_id", agencyId).limit(100),
  ]);
  return {
    agents: ((agents.data as Obj[] | null) ?? []).map((r) => ({ id: r.id as string, label: `${str(r.role) ?? "מתווך"} · ${(r.agent_id as string)?.slice(0, 8) ?? ""}` })),
    relationships: ((rels.data as Obj[] | null) ?? []).map((r) => ({ id: r.id as string, label: `${str(r.entity_type) ?? "ישות"} · ${str(r.relationship_type) ?? ""}` })),
    signals: ((signals.data as Obj[] | null) ?? []).map((r) => ({ id: r.id as string, label: (r.title as string) ?? "אות" })),
    aliases: ((aliases.data as Obj[] | null) ?? []).map((r) => ({ id: r.id as string, label: (r.alias as string) ?? "" })),
  };
}
