// ============================================================================
// 🗂️ National Brokerage Registry & AI Candidate Discovery™ (Phase 26.11).
// Server-only, additive. Extends Phase 26.10's discovery with a CANDIDATE
// registry that is verified into brokerage_offices ONLY with evidence.
//
// Pipeline (runNationalOfficeRegistry):
//   1) Candidate discovery — per city, from observed listings/brokers (brand via
//      the franchise resolver), shared-phone clusters, and (gated) AI suggestions.
//      Everything is stored as candidate_pending_verification. AI never verifies.
//   2) Verification — deterministic evidence (≥2 brokers of a brand in a city,
//      shared phone, listing volume). Only verified candidates create/update a
//      brokerage_offices row (status active) and flip to status='verified'.
//   3) Merge suggestions — duplicate verified offices (name/phone/domain/brand
//      variant) → pending suggestions. No auto-merge below 98% + strong evidence.
//   4) Broker→office resolution upgrade — reuses resolveBrokerOfficesForOrg so
//      brokers link to the newly-verified offices by phone/name/city evidence.
//   5) Knowledge edges — office↔broker / office↔city / broker↔city / office↔brand
//      persisted from evidence only.
// No fabricated offices/phones/sites; never overwrites stronger evidence.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveBrokerOfficesForOrg, type OfficeResolutionMetrics } from "./office-resolution";
import { normalizeHebrewName, normalizePhoneNumber } from "./normalize";
import { detectFranchise } from "./franchise";
import { getOfficeDiscoveryReadiness } from "./office-evidence";
import { runReasoningGateway, selectProvider } from "@/lib/ai-reasoning/gateway";
import { CONTEXT_ENGINE_VERSION, type ContextPackage } from "@/lib/context-engine/types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const emailDomain = (email: string): string => { const m = email.toLowerCase().trim().match(/@([a-z0-9.-]+)$/); return m ? m[1] : ""; };
const FREE_MAIL = /(gmail|walla|hotmail|outlook|yahoo|icloud|live|nana|012)\./;

export interface RegistryMetrics {
  citiesProcessed: number;
  officeCandidatesCreated: number;
  candidatesVerified: number;
  officesCreated: number;
  duplicateCandidates: number;
  brokersResolved: number;
  brokersPendingReview: number;
  brokersUnresolved: number;
  aiCandidatesCreated: number;
  aiCandidatesVerified: number;   // AI alone never verifies → always 0 (kept for the contract)
  publicSourcesSkipped: number;
  edgesCreated: number;
  errors: string[];
}

export interface RegistryRunResult {
  ok: boolean;
  runId: string | null;
  status: "completed" | "partial" | "failed";
  metrics: RegistryMetrics;
  publicWeb: { enabled: boolean; skippedReason: string | null };
  ai: { enabled: boolean; reason: string | null };
  message: string;
}

interface BrokerRec { id: string; fullName: string; normalizedName: string; phone: string | null; email: string | null; city: string | null; officeId: string | null }
interface CandidateDraft {
  officeName: string; normalizedName: string; brandNetwork: string; normalizedBrand: string; officeBranchName: string | null;
  city: string | null; area: string | null; phone: string | null; domain: string | null;
  suggestedBy: string; confidence: number; status: string; evidence: { source: string; detail: string; confidence: number }[];
}

const CITY_CAP = 60;
const AI_CITY_CAP = 8;

/** Run the national registry pass. Best-effort, no-throw; always finalizes. */
export async function runNationalOfficeRegistry(
  orgId: string, userId: string | null, opts: { useAI?: boolean; aiCityCap?: number } = {},
): Promise<RegistryRunResult> {
  const db = createServiceRoleClient();
  const readiness = getOfficeDiscoveryReadiness();
  const publicSearch = readiness.providers.find((p) => p.id === "public_search");
  const aiReady = !!selectProvider();
  const useAI = (opts.useAI ?? aiReady) && aiReady;
  const aiCityCap = Math.max(0, Math.min(opts.aiCityCap ?? AI_CITY_CAP, 20));

  const m: RegistryMetrics = {
    citiesProcessed: 0, officeCandidatesCreated: 0, candidatesVerified: 0, officesCreated: 0,
    duplicateCandidates: 0, brokersResolved: 0, brokersPendingReview: 0, brokersUnresolved: 0,
    aiCandidatesCreated: 0, aiCandidatesVerified: 0, publicSourcesSkipped: publicSearch?.enabled ? 0 : 1, edgesCreated: 0, errors: [],
  };
  const result: RegistryRunResult = {
    ok: false, runId: null, status: "failed", metrics: m,
    publicWeb: { enabled: !!publicSearch?.enabled, skippedReason: publicSearch?.skippedReason ?? null },
    ai: { enabled: useAI, reason: useAI ? null : "openai_not_configured" }, message: "",
  };

  const { data: ins } = await db.from("brokerage_office_discovery_runs" as never)
    .insert({ organization_id: orgId, requested_by: userId, status: "running", started_at: new Date().toISOString() } as never)
    .select("id").maybeSingle();
  const runId = (ins as { id?: string } | null)?.id ?? null;
  result.runId = runId;

  try {
    // Load brokers (national).
    const { data: agentRows } = await db.from("brokerage_agents" as never)
      .select("id,full_name,normalized_name,primary_phone,whatsapp_phone,primary_email,city,office_id").limit(20000);
    const brokers: BrokerRec[] = ((agentRows ?? []) as Row[]).map((r) => ({
      id: String(r.id), fullName: s(r.full_name), normalizedName: s(r.normalized_name) || normalizeHebrewName(s(r.full_name)),
      phone: s(r.primary_phone) || s(r.whatsapp_phone) || null, email: s(r.primary_email) || null, city: s(r.city) || null,
      officeId: s(r.office_id) || null,
    }));

    // Cities present in our data (evidence-grounded — never a fabricated city list).
    const cities = Array.from(new Set(brokers.map((b) => b.city).filter((c): c is string => !!c))).slice(0, CITY_CAP);
    m.citiesProcessed = cities.length;

    // Existing candidates (dedupe target).
    const { data: existingCand } = await db.from("brokerage_office_candidates" as never).select("id,normalized_brand,normalized_name,city,status").limit(20000);
    const candKey = (b: string, n: string, c: string) => `${b}|${n}|${c}`.toLowerCase();
    const existingKeys = new Set(((existingCand ?? []) as Row[]).map((r) => candKey(s(r.normalized_brand), s(r.normalized_name), s(r.city))));

    // ── 1) Candidate discovery ────────────────────────────────────────────────
    const drafts: CandidateDraft[] = [];

    // 1a) Brand clusters from observed broker names, per city.
    const brandCityBrokers = new Map<string, BrokerRec[]>(); // `${brand}|${city}` → brokers
    for (const b of brokers) {
      const fr = detectFranchise(b.fullName);
      if (!fr.matched || !b.city) continue;
      const key = `${fr.normalizedBrand}|${b.city}`;
      (brandCityBrokers.get(key) ?? brandCityBrokers.set(key, []).get(key)!).push(b);
    }
    for (const [key, group] of brandCityBrokers) {
      const [, city] = key.split("|");
      const fr = detectFranchise(group[0].fullName);
      const officeName = fr.officeBranchName ? `${fr.brandNetwork} ${city}` : `${fr.brandNetwork} ${city}`;
      const normalizedName = normalizeHebrewName(officeName);
      if (existingKeys.has(candKey(fr.normalizedBrand, normalizedName, city))) continue;
      const phone = group.map((g) => g.phone).find(Boolean) ?? null;
      const dom = group.map((g) => (g.email ? emailDomain(g.email) : "")).find((d) => d && !FREE_MAIL.test(d)) ?? null;
      drafts.push({
        officeName, normalizedName, brandNetwork: fr.brandNetwork, normalizedBrand: fr.normalizedBrand, officeBranchName: city,
        city, area: null, phone, domain: dom, suggestedBy: "zono_listings",
        confidence: group.length >= 3 ? 70 : 55, status: "candidate_pending_verification",
        evidence: [{ source: "observed_listing", detail: `${group.length} מתווכי ${fr.brandNetwork} ב${city}`, confidence: group.length >= 3 ? 70 : 55 }],
      });
    }

    // 1b) Shared-phone clusters (independent offices) per phone with ≥2 distinct names.
    const byPhone = new Map<string, BrokerRec[]>();
    for (const b of brokers) { const np = normalizePhoneNumber(b.phone ?? ""); if (np) (byPhone.get(np) ?? byPhone.set(np, []).get(np)!).push(b); }
    for (const [np, group] of byPhone) {
      const distinct = new Set(group.map((g) => g.normalizedName).filter(Boolean));
      if (distinct.size < 2) continue;
      // Skip if this group is already a branded cluster handled above.
      if (group.some((g) => detectFranchise(g.fullName).matched)) continue;
      const city = group.map((g) => g.city).find(Boolean) ?? null;
      const officeName = group.map((g) => g.fullName).find(Boolean) ?? np;
      const normalizedName = normalizeHebrewName(officeName);
      const k = candKey("independent", normalizedName, city ?? "");
      if (existingKeys.has(k)) continue;
      existingKeys.add(k);
      drafts.push({
        officeName, normalizedName, brandNetwork: "independent", normalizedBrand: "independent", officeBranchName: null,
        city, area: null, phone: np, domain: null, suggestedBy: "zono_listings",
        confidence: distinct.size >= 4 ? 80 : distinct.size === 3 ? 70 : 60, status: "candidate_pending_verification",
        evidence: [{ source: "shared_phone", detail: `קו טלפון משותף ל-${distinct.size} מתווכים`, confidence: distinct.size >= 4 ? 80 : 60 }],
      });
    }

    // 1c) AI candidate discovery (gated, candidate-only, bounded by city).
    if (useAI) {
      for (const city of cities.slice(0, aiCityCap)) {
        const observedBrands = Array.from(new Set(brokers.filter((b) => b.city === city).map((b) => detectFranchise(b.fullName)).filter((f) => f.matched).map((f) => f.brandNetwork)));
        const ai = await aiSuggestOffices(city, observedBrands, { orgId, userId });
        for (const name of ai) {
          const fr = detectFranchise(name);
          const normalizedName = normalizeHebrewName(name);
          const k = candKey(fr.normalizedBrand, normalizedName, city);
          if (existingKeys.has(k)) continue;
          existingKeys.add(k);
          drafts.push({
            officeName: name, normalizedName, brandNetwork: fr.brandNetwork, normalizedBrand: fr.normalizedBrand, officeBranchName: fr.officeBranchName,
            city, area: null, phone: null, domain: null, suggestedBy: "ai", confidence: 35, status: "candidate_pending_verification",
            evidence: [{ source: "ai_candidate", detail: `הצעת AI לבדיקה ב${city} — דורש אימות ראיות`, confidence: 35 }],
          });
          m.aiCandidatesCreated++;
        }
      }
    }

    // Persist candidates (insert; unique index drops dupes — ignore conflicts per row).
    for (const d of drafts) {
      const { error } = await db.from("brokerage_office_candidates" as never).insert({
        office_name: d.officeName, normalized_name: d.normalizedName, brand_network: d.brandNetwork, normalized_brand: d.normalizedBrand,
        office_branch_name: d.officeBranchName, city: d.city, area: d.area, phone: d.phone, domain: d.domain,
        suggested_by: d.suggestedBy, confidence: d.confidence, status: d.status, evidence: d.evidence as never,
      } as never);
      if (!error) m.officeCandidatesCreated++;
      else if (!/duplicate key/i.test(error.message)) m.errors.push(`candidate insert: ${error.message}`);
    }

    // ── 2) Verification — evidence-based only. ─────────────────────────────────
    const { data: pendRows } = await db.from("brokerage_office_candidates" as never)
      .select("id,office_name,normalized_name,brand_network,normalized_brand,city,phone,domain,suggested_by,confidence")
      .eq("status", "candidate_pending_verification").limit(5000);
    const nowIso = new Date().toISOString();
    for (const c of (pendRows ?? []) as Row[]) {
      const city = s(c.city); const nbrand = s(c.normalized_brand);
      // Evidence: brokers of this brand in this city / shared phone / listing volume.
      const cohort = brokers.filter((b) => b.city === city && (nbrand === "independent"
        ? normalizePhoneNumber(b.phone ?? "") === normalizePhoneNumber(s(c.phone))
        : detectFranchise(b.fullName).normalizedBrand === nbrand));
      const distinctNames = new Set(cohort.map((b) => b.normalizedName).filter(Boolean));
      const verified = distinctNames.size >= 2; // ≥2 distinct brokers = real office evidence
      if (!verified) {
        // Some evidence but not enough → needs_review (AI-only stays pending).
        if (cohort.length === 1 && s(c.suggested_by) !== "ai") {
          await db.from("brokerage_office_candidates" as never).update({ status: "needs_review", last_seen_at: nowIso } as never).eq("id", s(c.id));
        }
        continue;
      }
      // Create/update a VERIFIED brokerage_offices row.
      const officeId = globalThis.crypto.randomUUID();
      const phone = s(c.phone) || cohort.map((b) => b.phone).find(Boolean) || null;
      const confidence = distinctNames.size >= 4 ? 96 : distinctNames.size === 3 ? 90 : 85;
      const { error: oErr } = await db.from("brokerage_offices" as never).insert({
        id: officeId, name: s(c.office_name), normalized_name: s(c.normalized_name),
        brand_network: s(c.brand_network) === "independent" ? null : s(c.brand_network),
        office_type: "unknown", status: "active", city, primary_phone: phone,
        confidence_score: confidence, data_quality_score: 50,
        metadata: { derived_from: "registry_verification", candidate_id: s(c.id), brokers: distinctNames.size, org_id: orgId } as never,
        first_seen_at: nowIso, last_seen_at: nowIso, last_verified_at: nowIso,
      } as never);
      if (oErr) { m.errors.push(`office create: ${oErr.message}`); continue; }
      m.officesCreated++; m.candidatesVerified++;
      await db.from("brokerage_office_candidates" as never)
        .update({ status: "verified", verified_office_id: officeId, last_seen_at: nowIso,
          verification_sources: [{ source: "observed_listing", brokers: distinctNames.size }] as never } as never)
        .eq("id", s(c.id));
    }

    // ── 4) Broker→office resolution upgrade (reuse the evidence-based resolver). ─
    let det: OfficeResolutionMetrics | null = null;
    try { det = await resolveBrokerOfficesForOrg(orgId); } catch (e) { m.errors.push(`broker resolution: ${e instanceof Error ? e.message : String(e)}`); }
    if (det) {
      m.brokersResolved = det.brokersResolvedToOffice;
      m.brokersPendingReview = det.brokersPendingReview;
      m.brokersUnresolved = det.brokersUnresolved;
    }

    // ── 3) Merge suggestions among VERIFIED offices (no auto-merge). ────────────
    m.duplicateCandidates = await buildMergeSuggestions(db);

    // ── 5) Knowledge edges from evidence (office↔broker / city / brand). ───────
    m.edgesCreated = await buildGraphEdges(db);

    result.message = m.officesCreated > 0
      ? `מרשם הסתיים ✓ — ${m.officeCandidatesCreated} מועמדים · ${m.candidatesVerified} אומתו · ${m.officesCreated} משרדים נוצרו · ${m.brokersResolved} מתווכים שויכו.`
      : `מרשם הסתיים — ${m.officeCandidatesCreated} מועמדים נוצרו, אך אין עדיין ראיות מספיקות לאימות משרד. ${m.aiCandidatesCreated} הצעות AI ממתינות לאימות.`;
    return await finalize(db, result, runId, m.errors.length && m.officesCreated === 0 ? "partial" : "completed");
  } catch (e) {
    console.error("[brokerage-registry] failed:", e);
    m.errors.push(e instanceof Error ? e.message : String(e));
    return await finalize(db, result, runId, "failed");
  }
}

// ── Merge engine — suggest duplicates among verified offices. No auto-merge. ──
async function buildMergeSuggestions(db: ReturnType<typeof createServiceRoleClient>): Promise<number> {
  const { data } = await db.from("brokerage_offices" as never).select("id,name,normalized_name,primary_phone,city,brand_network").limit(20000);
  const offices = ((data ?? []) as Row[]).map((r) => ({ id: String(r.id), name: s(r.name), norm: s(r.normalized_name), phone: normalizePhoneNumber(s(r.primary_phone)), city: s(r.city), brand: s(r.brand_network) }));
  const { data: existing } = await db.from("brokerage_office_merge_suggestions" as never).select("primary_office_id,duplicate_office_id,status").limit(20000);
  const seen = new Set(((existing ?? []) as Row[]).map((r) => [s(r.primary_office_id), s(r.duplicate_office_id)].sort().join("|")));
  const rows: Row[] = [];
  for (let i = 0; i < offices.length; i++) {
    for (let j = i + 1; j < offices.length; j++) {
      const a = offices[i], b = offices[j];
      const pairKey = [a.id, b.id].sort().join("|");
      if (seen.has(pairKey)) continue;
      let reason = ""; let confidence = 0;
      if (a.norm && a.norm === b.norm) { reason = "שם מנורמל זהה"; confidence = 92; }
      else if (a.phone && a.phone === b.phone) { reason = "טלפון זהה"; confidence = 95; }
      else if (a.brand && a.brand === b.brand && a.city && a.city === b.city) { reason = `אותו מותג (${a.brand}) ואותה עיר`; confidence = 88; }
      if (confidence >= 85) {
        rows.push({ primary_office_id: a.id, duplicate_office_id: b.id, reason, confidence, status: "pending", evidence: [{ reason }] as never });
        seen.add(pairKey);
      }
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("brokerage_office_merge_suggestions" as never).insert(rows.slice(i, i + 500) as never);
    if (error) break;
  }
  return rows.length;
}

// ── Graph edges from evidence (office→broker / office→city / broker→city / brand) ──
async function buildGraphEdges(db: ReturnType<typeof createServiceRoleClient>): Promise<number> {
  const { data } = await db.from("brokerage_agents" as never).select("id,office_id,city").not("office_id", "is", null).limit(20000);
  const { data: offices } = await db.from("brokerage_offices" as never).select("id,city,brand_network").limit(20000);
  const officeCity = new Map<string, { city: string; brand: string }>();
  for (const o of (offices ?? []) as Row[]) officeCity.set(String(o.id), { city: s(o.city), brand: s(o.brand_network) });
  const edges: Row[] = [];
  const push = (edge_type: string, st: string, sid: string, tt: string, tid: string, label: string) => {
    if (!sid || !tid) return;
    edges.push({ edge_type, source_type: st, source_id: sid, target_type: tt, target_id: tid, label, weight: 1, evidence: [{ source: "resolved_office_link" }] as never });
  };
  for (const a of (data ?? []) as Row[]) {
    const agentId = String(a.id); const officeId = s(a.office_id); const city = s(a.city);
    push("broker_office", "broker", agentId, "office", officeId, "שויך למשרד");
    push("office_broker", "office", officeId, "broker", agentId, "מתווך במשרד");
    if (city) { push("broker_city", "broker", agentId, "city", city, city); push("office_city", "office", officeId, "city", city, city); }
    const oc = officeCity.get(officeId);
    if (oc?.brand) push("office_brand", "office", officeId, "brand", oc.brand, oc.brand);
  }
  let created = 0;
  for (let i = 0; i < edges.length; i += 500) {
    const chunk = edges.slice(i, i + 500);
    const { error } = await db.from("brokerage_office_graph_edges" as never).upsert(chunk as never, { onConflict: "edge_type,source_id,target_id" } as never);
    if (!error) created += chunk.length;
  }
  return created;
}

async function finalize(
  db: ReturnType<typeof createServiceRoleClient>, result: RegistryRunResult, runId: string | null,
  status: "completed" | "partial" | "failed",
): Promise<RegistryRunResult> {
  result.status = status; result.ok = status !== "failed";
  const m = result.metrics;
  if (runId) {
    try {
      await db.from("brokerage_office_discovery_runs" as never).update({
        status, finished_at: new Date().toISOString(),
        brokers_resolved: m.brokersResolved, brokers_pending: m.brokersPendingReview, brokers_unresolved: m.brokersUnresolved,
        offices_created: m.officesCreated,
        cities_processed: m.citiesProcessed, candidates_created: m.officeCandidatesCreated, candidates_verified: m.candidatesVerified,
        duplicate_candidates: m.duplicateCandidates, ai_candidates_created: m.aiCandidatesCreated, ai_candidates_verified: m.aiCandidatesVerified,
        public_sources_skipped: m.publicSourcesSkipped,
        breakdown: { registry: m, public_web: result.publicWeb, ai: result.ai } as never,
        log: [{ message: result.message, errors: m.errors }] as never,
      } as never).eq("id", runId);
    } catch { /* best-effort */ }
  }
  return result;
}

// ── Read model for the Registry UI tab (service-role; owner-gated at the action). ──
export interface RegistryCandidate {
  id: string; officeName: string; brandNetwork: string | null; city: string | null; area: string | null;
  suggestedBy: string; confidence: number; status: string; phone: string | null;
}
export interface RegistryOffice { id: string; name: string; brandNetwork: string | null; city: string | null; confidence: number; status: string; brokerCount: number }
export interface RegistryMerge { id: string; primaryName: string; duplicateName: string; reason: string; confidence: number }
export interface RegistryUnresolvedBroker { id: string; fullName: string; city: string | null }
export interface RegistryBrokerMatch { id: string; brokerName: string; officeName: string; confidence: number; reasons: string[] }
export interface OfficeRegistrySnapshot {
  candidates: RegistryCandidate[];
  offices: RegistryOffice[];
  mergeSuggestions: RegistryMerge[];
  unresolvedBrokers: RegistryUnresolvedBroker[];
  brokerOfficeMatches: RegistryBrokerMatch[];
  cities: string[];
  brands: string[];
  counts: { candidatesPending: number; needsReview: number; verified: number; offices: number; duplicates: number; unresolved: number; aiCandidates: number };
  lastRun: { status: string; finishedAt: string | null; candidatesCreated: number; candidatesVerified: number; officesCreated: number } | null;
}

export async function getOfficeRegistrySnapshot(): Promise<OfficeRegistrySnapshot> {
  const db = createServiceRoleClient();
  const [candRes, offRes, mergeRes, agentRes, matchRes, runRes] = await Promise.all([
    db.from("brokerage_office_candidates" as never).select("id,office_name,brand_network,city,area,suggested_by,confidence,status,phone").order("confidence", { ascending: false }).limit(2000),
    db.from("brokerage_offices" as never).select("id,name,brand_network,city,confidence_score,status").order("confidence_score", { ascending: false }).limit(2000),
    db.from("brokerage_office_merge_suggestions" as never).select("id,primary_office_id,duplicate_office_id,reason,confidence,status").eq("status", "pending").order("confidence", { ascending: false }).limit(500),
    db.from("brokerage_agents" as never).select("id,full_name,city,office_id").order("confidence_score", { ascending: false }).limit(5000),
    db.from("brokerage_identity_matches" as never).select("id,source_entity_id,target_entity_id,confidence_score,match_reasons,status").eq("match_type", "agent_to_office").eq("status", "pending_review").order("confidence_score", { ascending: false }).limit(1000),
    db.from("brokerage_office_discovery_runs" as never).select("status,finished_at,candidates_created,candidates_verified,offices_created").order("created_at", { ascending: false }).limit(1),
  ]);

  const agents = (agentRes.data ?? []) as Row[];
  const officeNameById = new Map<string, string>();
  const brokerCount = new Map<string, number>();
  for (const a of agents) { const oid = s(a.office_id); if (oid) brokerCount.set(oid, (brokerCount.get(oid) ?? 0) + 1); }

  const offices: RegistryOffice[] = ((offRes.data ?? []) as Row[]).map((r) => {
    officeNameById.set(String(r.id), s(r.name));
    return { id: String(r.id), name: s(r.name), brandNetwork: s(r.brand_network) || null, city: s(r.city) || null, confidence: Number(r.confidence_score ?? 0), status: s(r.status) || "active", brokerCount: brokerCount.get(String(r.id)) ?? 0 };
  });
  const brokerNameById = new Map<string, string>(agents.map((a) => [String(a.id), s(a.full_name)]));

  const candidates: RegistryCandidate[] = ((candRes.data ?? []) as Row[]).map((r) => ({
    id: String(r.id), officeName: s(r.office_name), brandNetwork: s(r.brand_network) || null, city: s(r.city) || null, area: s(r.area) || null,
    suggestedBy: s(r.suggested_by) || "zono_listings", confidence: Number(r.confidence ?? 0), status: s(r.status) || "candidate_pending_verification", phone: s(r.phone) || null,
  }));
  const mergeSuggestions: RegistryMerge[] = ((mergeRes.data ?? []) as Row[]).map((r) => ({
    id: String(r.id), primaryName: officeNameById.get(s(r.primary_office_id)) ?? "משרד", duplicateName: officeNameById.get(s(r.duplicate_office_id)) ?? "משרד", reason: s(r.reason), confidence: Number(r.confidence ?? 0),
  }));
  const unresolvedBrokers: RegistryUnresolvedBroker[] = agents.filter((a) => !s(a.office_id)).slice(0, 500).map((a) => ({ id: String(a.id), fullName: s(a.full_name), city: s(a.city) || null }));
  const brokerOfficeMatches: RegistryBrokerMatch[] = ((matchRes.data ?? []) as Row[]).map((r) => ({
    id: String(r.id), brokerName: brokerNameById.get(s(r.source_entity_id)) ?? "מתווך", officeName: officeNameById.get(s(r.target_entity_id)) ?? "משרד",
    confidence: Number(r.confidence_score ?? 0), reasons: Array.isArray(r.match_reasons) ? (r.match_reasons as string[]) : [],
  }));

  const cities = Array.from(new Set([...candidates.map((c) => c.city), ...offices.map((o) => o.city)].filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "he"));
  const brands = Array.from(new Set([...candidates.map((c) => c.brandNetwork), ...offices.map((o) => o.brandNetwork)].filter((x): x is string => !!x))).sort();
  const run = (runRes.data ?? [])[0] as Row | undefined;

  return {
    candidates, offices, mergeSuggestions, unresolvedBrokers, brokerOfficeMatches, cities, brands,
    counts: {
      candidatesPending: candidates.filter((c) => c.status === "candidate_pending_verification").length,
      needsReview: candidates.filter((c) => c.status === "needs_review").length,
      verified: candidates.filter((c) => c.status === "verified").length,
      offices: offices.length, duplicates: mergeSuggestions.length, unresolved: unresolvedBrokers.length,
      aiCandidates: candidates.filter((c) => c.suggestedBy === "ai").length,
    },
    lastRun: run ? { status: s(run.status), finishedAt: s(run.finished_at) || null, candidatesCreated: Number(run.candidates_created ?? 0), candidatesVerified: Number(run.candidates_verified ?? 0), officesCreated: Number(run.offices_created ?? 0) } : null,
  };
}

// ── AI candidate discovery — suggestions only (never verified, never invents). ──
async function aiSuggestOffices(
  city: string, observedBrands: string[], idn: { orgId: string | null; userId: string | null },
): Promise<string[]> {
  try {
    const block = {
      key: "brokerage.city-context", label: `הקשר ${city}`, priority: 100, confidence: 0, source: "brokerage-data.registry",
      data: { city, observedBrands },
      evidence: observedBrands.length ? observedBrands.map((b) => ({ source: "observed_listing", detail: `מותג ${b} נצפה ב${city}`, confidence: 50 })) : [{ source: "city", detail: city, confidence: 0 }],
    };
    const context: ContextPackage = {
      request: { type: "market", entityId: city, size: "small" },
      identity: { orgId: idn.orgId, orgName: null, userId: idn.userId, userName: null, isManager: true },
      screen: "brokerage-data", workflow: "office-candidate-discovery",
      blocks: [block], permissions: { isManager: true, removedBlocks: [], redactedFields: [] },
      explain: { repositoriesUsed: ["brokerage_agents"], entitiesCollected: [city], confidence: null, missing: [], prioritySummary: [{ key: block.key, priority: 100 }], size: "small", blockCount: 1, approxChars: JSON.stringify(block).length, timestamp: new Date().toISOString(), version: CONTEXT_ENGINE_VERSION },
      cacheKey: `office-candidates:${city}`,
    };
    const QUESTION = `הצע שמות אפשריים של משרדי תיווך הפעילים ב${city} (שם משרד אחד בכל שורה). אל תמציא טלפונים/אתרים/כתובות. אלה הצעות לבדיקה בלבד.`;
    const res = await runReasoningGateway({ question: QUESTION, context, mode: "answer", language: "he", userId: idn.userId, organizationId: idn.orgId });
    if (res.status !== "answered" || !res.answer) return [];
    return res.answer.split(/[\n•·,]/).map((x) => x.replace(/^[\s\d.)\-–]+/, "").trim())
      .filter((x) => x.length >= 2 && x.length <= 60).slice(0, 12);
  } catch { return []; }
}
