// ============================================================================
// 🗄️ Research Agent — persistence (server-only). Phase 26.4.13.
// ----------------------------------------------------------------------------
// Reuses brokerage_office_candidates + brokerage_offices. Saves candidates as
// "researching" (source=brokerage_research_agent, system_verified=false) with
// aliases/stage/evidence in the evidence JSON — NO schema change. Verification
// updates the row; a proven candidate is promoted to a real office (reused, not
// overwritten). Reuses the persistent KB for known-before accounting.
// ============================================================================
import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import { isAcceptableOfficeName } from "../office-name-guard";
import { getBrokerageKnowledgeForCity } from "../brokerage-knowledge";
import type { VerifyOutcome } from "./verifier";
import type { MergedName } from "./dedupe";
import type { ResearchStage } from "./types";

type DB = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
export function normCity(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/[׳״"'`]/g, "").replace(/[-־–—_]/g, " ")
    .replace(/קריי/g, "קרי").replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/\s+/g, " ").trim().toLowerCase();
}

export interface ExistingIndex {
  candidateKeys: Set<string>;               // `${normalizedBrand}|${normalizedName}|${cityNorm}`
  officeByNorm: Map<string, Row>;
  knownBefore: number;
}

/** Load existing candidate/office keys + KB accounting (reuse before research). */
export async function loadExisting(db: DB, orgId: string, cityRaw: string): Promise<ExistingIndex> {
  const cityNorm = normCity(cityRaw);
  const [candRes, offRes, kb] = await Promise.all([
    db.from("brokerage_office_candidates" as never).select("normalized_brand,normalized_name,city").limit(20000),
    db.from("brokerage_offices" as never).select("id,normalized_name,city,status").limit(20000),
    getBrokerageKnowledgeForCity(orgId, cityRaw).catch(() => null),
  ]);
  const candidateKeys = new Set(((candRes.data ?? []) as Row[])
    .filter((r) => normCity(s(r.city)) === cityNorm)
    .map((r) => `${s(r.normalized_brand)}|${s(r.normalized_name)}|${cityNorm}`));
  const officeByNorm = new Map(((offRes.data ?? []) as Row[])
    .filter((r) => !s(r.city) || normCity(s(r.city)) === cityNorm)
    .map((r) => [s(r.normalized_name), r] as const));
  const knownBefore = kb ? kb.verifiedOffices.length + kb.candidateOffices.length : officeByNorm.size;
  return { candidateKeys, officeByNorm, knownBefore };
}

/** Insert a candidate as "researching" (save-first). Returns the new row id. */
export async function saveResearching(
  db: DB, cityLabel: string, m: MergedName, stage: ResearchStage, aiConfidence: number, nowIso: string,
): Promise<string | null> {
  const { data, error } = await db.from("brokerage_office_candidates" as never).insert({
    office_name: m.officeName, normalized_name: m.normalizedName,
    brand_network: m.brandNetwork, normalized_brand: m.normalizedBrand,
    city: cityLabel, phone: null, domain: null, suggested_by: "brokerage_research_agent",
    confidence: Math.min(35, aiConfidence),   // low SEED confidence (AI extraction, unverified)
    status: "researching",
    evidence: [{
      source: "brokerage_research_agent", city: cityLabel, system_verified: false,
      research_stage: stage, brand: m.brandNetwork, branch: m.branch, aliases: m.aliases,
      ai_extraction_confidence: aiConfidence, seeded_at: nowIso,
    }] as never,
  } as never).select("id").maybeSingle();
  if (error) return /duplicate key/i.test(error.message) ? "" : null;
  return data ? s((data as Row).id) : "";
}

/** Update a saved candidate with verification evidence (never deletes). */
export async function updateVerification(
  db: DB, candidateId: string, cityLabel: string, m: MergedName, stage: ResearchStage,
  aiConfidence: number, systemConfidence: number, proven: boolean, v: VerifyOutcome,
): Promise<void> {
  await db.from("brokerage_office_candidates" as never).update({
    confidence: systemConfidence, phone: v.phone, domain: [...v.domains][0] ?? null,
    status: proven ? "verified" : "researching",
    evidence: [{
      source: "brokerage_research_agent", city: cityLabel, system_verified: proven,
      research_stage: stage, brand: m.brandNetwork, branch: m.branch, aliases: m.aliases,
      ai_extraction_confidence: aiConfidence,
      public_sources_checked: v.sourcesChecked, evidence_found: v.evidenceFound, public_urls: v.publicUrls,
      strong_sources: v.strong, independent_domains: v.domains.size, last_researched_at: new Date().toISOString(),
    }] as never,
  } as never).eq("id", candidateId);
}

/** Promote a proven candidate to a real office — reuse existing, never overwrite. */
export async function promoteOffice(
  db: DB, officeByNorm: Map<string, Row>, m: MergedName, cityLabel: string,
  phone: string | null, confidence: number, v: VerifyOutcome, nowIso: string,
): Promise<string | null> {
  const existing = officeByNorm.get(m.normalizedName);
  if (existing && s(existing.status) !== "rejected") {
    await db.from("brokerage_offices" as never).update({ last_seen_at: nowIso } as never).eq("id", s(existing.id));
    return s(existing.id);
  }
  if (!isAcceptableOfficeName(m.officeName)) return null;
  const officeId = globalThis.crypto.randomUUID();
  const { error } = await db.from("brokerage_offices" as never).insert({
    id: officeId, name: m.officeName, normalized_name: m.normalizedName,
    brand_network: m.brandNetwork, office_type: "unknown",
    status: "active", city: cityLabel, primary_phone: phone, confidence_score: confidence, data_quality_score: 45,
    metadata: { derived_from: "brokerage_research_agent_verified", strong_sources: v.strong, independent_domains: v.domains.size, evidence: v.evidenceFound, public_urls: v.publicUrls } as never,
    first_seen_at: nowIso, last_seen_at: nowIso, last_verified_at: nowIso,
  } as never);
  return error ? null : officeId;
}
