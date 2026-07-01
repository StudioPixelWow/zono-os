// ============================================================================
// 🏢 Office Intelligence Builder™ — builder (server-only). 26.4.18.
// ----------------------------------------------------------------------------
// Enriches ONE candidate (or a city's candidates) into a real, evidence-backed
// office profile using the EXISTING public search, then re-runs the EXISTING
// verification rule to decide promotion. Reuses research-agent promoteOffice.
// AI is not used to verify. No new discovery engine / seeding prompt / rule.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { activeSearchVendor } from "../broker-research/providers";
import { selectProvider } from "@/lib/ai-reasoning/gateway";
import { makeCityMatch, normCityKb } from "../brokerage-knowledge";
import { loadExisting, promoteOffice } from "../research-agent/repository";
import type { VerifyOutcome } from "../research-agent/verifier";
import { buildProfileDraft, type Hit } from "./extract";
import {
  OFFICE_INTELLIGENCE_VERSION,
  type EnrichmentResult, type CityEnrichmentResult, type ProfileSignals,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** The per-candidate search plan (Part 2). */
function searchPlan(name: string, brand: string | null, branch: string | null, city: string): string[] {
  const q = [
    `${name} ${city}`, `${name} תיווך`, `${name} נדל"ן`, `${name} משרד תיווך`,
    `${name} טלפון`, `${name} כתובת`, `${name} אתר`, `${name} Facebook`,
    `${name} Instagram`, `${name} LinkedIn`, `${name} יד2`, `${name} מדלן`, `${name} B144`, `${name} Easy`,
  ];
  if (brand) { q.push(`${brand} ${city}`); if (branch) q.push(`${brand} ${branch}`); q.push(`${brand} סניף ${city}`); }
  return q;
}

function systemConfidenceFromSignals(sig: ProfileSignals): number {
  return Math.max(0, Math.min(92, (sig.strongSources > 0 ? 30 : 0) + Math.min(2, sig.strongSources) * 18 + Math.min(3, sig.independentDomains) * 8 + (sig.phone ? 6 : 0)));
}

/** Enrich one candidate: search → profile → update evidence → promote if proven. */
export async function buildOfficeIntelligenceForCandidate(orgId: string | null, candidateId: string, opts: { maxQueries?: number } = {}): Promise<EnrichmentResult> {
  const db = createServiceRoleClient();
  const vendor = activeSearchVendor();
  const provider = selectProvider();
  const { data } = await db.from("brokerage_office_candidates" as never).select("*").eq("id", candidateId).maybeSingle();
  const c = (data ?? null) as Row | null;
  if (!c) return { candidateId, officeName: "", city: "", searchConfigured: !!vendor, aiConfigured: !!provider, searchesRun: 0, profile: null, signals: null, proven: false, promotedOfficeId: null, status: "skipped", missing: [], note: "המועמד לא נמצא." };

  const officeName = s(c.office_name), city = s(c.city);
  const brand = s(c.brand_network) || null;
  const prevEv = (Array.isArray(c.evidence) ? (c.evidence[0] as Row | undefined) : undefined) ?? {};
  const branch = s(prevEv.branch) || null;

  if (!vendor) {
    return { candidateId, officeName, city, searchConfigured: false, aiConfigured: !!provider, searchesRun: 0, profile: null, signals: null, proven: false, promotedOfficeId: null, status: "researching", missing: ["ספק חיפוש ציבורי"], note: "אין ספק חיפוש ציבורי — לא ניתן להעשיר פרופיל." };
  }

  // Run the search plan (bounded).
  const queries = searchPlan(officeName, brand, branch, city).slice(0, opts.maxQueries ?? 12);
  const hits: Hit[] = [];
  let searchesRun = 0;
  const runs = await Promise.all(queries.map(async (q) => { try { return await vendor.run(q); } catch { return [] as Hit[]; } }));
  for (const r of runs) { searchesRun++; hits.push(...r.slice(0, 5)); }

  const { profile, signals } = buildProfileDraft(officeName, brand, branch, city, hits);

  // Update the candidate's evidence JSON (preserve AI provenance; never delete).
  const nowIso = new Date().toISOString();
  const confidence = systemConfidenceFromSignals(signals);
  await db.from("brokerage_office_candidates" as never).update({
    confidence, phone: signals.phone, domain: profile.website,
    status: signals.proven ? "verified" : "researching",
    evidence: [{
      source: s(c.suggested_by) || "office_intelligence", city, system_verified: signals.proven,
      ai_confidence: n(prevEv.ai_confidence), ai_reason: s(prevEv.ai_reason) || null,
      brand, branch, aliases: Array.isArray(prevEv.aliases) ? prevEv.aliases : [officeName],
      public_sources_checked: queries, evidence_found: signals.evidenceFound, public_urls: signals.publicUrls,
      strong_sources: signals.strongSources, independent_domains: signals.independentDomains,
      profile, profile_completeness: profile.completeness, last_enriched_at: nowIso, last_researched_at: nowIso,
    }] as never,
  } as never).eq("id", candidateId);

  // Promotion (existing rule): only when proven.
  let promotedOfficeId: string | null = null;
  if (signals.proven) {
    const ex = await loadExisting(db, orgId ?? "", city);
    const m = { key: `${s(c.normalized_brand)}|${s(c.normalized_name)}`, officeName, normalizedName: s(c.normalized_name), normalizedBrand: s(c.normalized_brand) || "independent", brandNetwork: brand, branch, aliases: [officeName] };
    const v: VerifyOutcome = { strong: signals.strongSources, domains: new Set(profile.domains), evidenceFound: signals.evidenceFound, sourcesChecked: queries, phone: signals.phone, publicUrls: signals.publicUrls, proven: true };
    promotedOfficeId = await promoteOffice(db, ex.officeByNorm, m, city, signals.phone, confidence, v, nowIso);
    if (promotedOfficeId && profile.website) {
      await db.from("brokerage_offices" as never).update({ website: `https://${profile.website}`, metadata: { office_intelligence: { website: profile.website, social: profile.socialLinks, completeness: profile.completeness, enriched_at: nowIso } } as never } as never).eq("id", promotedOfficeId);
    }
  }

  return {
    candidateId, officeName, city, searchConfigured: true, aiConfigured: !!provider, searchesRun,
    profile, signals, proven: signals.proven, promotedOfficeId,
    status: signals.proven ? "verified" : "researching",
    missing: profile.missingFields,
    note: signals.proven ? "אומת וקודם למשרד — ראיה ציבורית מספקת." : `נשמר במחקר — חסר: ${profile.missingFields.slice(0, 3).join(", ") || "ראיה מספקת"}`,
  };
}

/** Batch enrichment for a city, by priority + budget. Best-effort, resumable via reruns. */
export async function buildOfficeIntelligenceForCity(orgId: string | null, city: string, options: { cap?: number; budgetMs?: number } = {}): Promise<CityEnrichmentResult> {
  const t0 = Date.now();
  const db = createServiceRoleClient();
  const vendor = activeSearchVendor();
  const match = makeCityMatch(city);
  const cap = options.cap ?? 8;
  const budgetMs = options.budgetMs ?? 40000;
  const notes: string[] = [];

  const { data } = await db.from("brokerage_office_candidates" as never).select("id,office_name,city,status,suggested_by,confidence,evidence").limit(20000);
  const AI = new Set(["ai_candidate_seed", "brokerage_research_agent", "office_intelligence"]);
  const cands = ((data ?? []) as Row[]).filter((r) => AI.has(s(r.suggested_by)) && match(r.city) && s(r.status) !== "verified" && s(r.status) !== "rejected");

  // Priority (Part 5): researched-but-unverified → waiting → high AI confidence → has a public source → rest.
  const prio = (r: Row): number => {
    const ev = (Array.isArray(r.evidence) ? (r.evidence[0] as Row | undefined) : undefined) ?? {};
    const researched = Array.isArray(ev.public_sources_checked) && (ev.public_sources_checked as unknown[]).length > 0;
    const strong = n(ev.strong_sources), domains = n(ev.independent_domains);
    const hasSource = strong > 0 || domains > 0;
    if (researched && !hasSource) return 0;             // looks blocked/close
    if (!researched) return 1;                          // waiting
    if (n(ev.ai_confidence) >= 60) return 2;            // high AI confidence
    if (hasSource) return 3;                            // has a public source
    return 4;
  };
  cands.sort((a, b) => prio(a) - prio(b) || n(b.confidence) - n(a.confidence));

  const results: EnrichmentResult[] = [];
  let processed = 0, timedOut = false;
  if (!vendor) { notes.push("אין ספק חיפוש ציבורי — לא בוצעה העשרה."); }
  else {
    for (const c of cands) {
      if (processed >= cap) break;
      if (Date.now() - t0 > budgetMs - 6000) { timedOut = true; break; }
      const r = await buildOfficeIntelligenceForCandidate(orgId, s(c.id), { maxQueries: 8 }).catch(() => null);
      if (r) { results.push(r); processed++; }
    }
  }

  const verified = results.filter((r) => r.status === "verified").length;
  const researching = results.filter((r) => r.status === "researching").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  if (timedOut) notes.push("ההעשרה נעצרה עקב תקציב זמן — ניתן להריץ שוב כדי להמשיך את שאר המועמדים.");

  return {
    city: city.trim(), cityNormalized: normCityKb(city), searchConfigured: !!vendor,
    totalCandidates: cands.length, processed, remaining: Math.max(0, cands.length - processed),
    verified, researching, skipped, timedOut, elapsedMs: Date.now() - t0, results, notes, version: OFFICE_INTELLIGENCE_VERSION,
  };
}
