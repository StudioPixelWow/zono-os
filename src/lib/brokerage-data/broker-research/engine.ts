// ============================================================================
// 🔬 National Brokerage Research Engine™ (Phase 26.13b, server-only).
// Research first → evidence second → AI reasoning third → resolution last.
// Per broker: generate safe queries → run REAL providers (live web search when a
// vendor is configured; Yad2/Madlan from owned listings) → send ONLY the
// collected sources to the AI gateway → create candidate office(s) from evidence
// → run the existing Broker Identity Engine (26.12) as the verification hook.
// OpenAI is never a web search; with no search vendor + no listing office name,
// the honest result is insufficient_evidence with the exact missing evidence.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeHebrewName } from "../normalize";
import { detectFranchise } from "../franchise";
import { isAcceptableOfficeName } from "../office-name-guard";
import { runReasoningGateway, selectProvider } from "@/lib/ai-reasoning/gateway";
import { CONTEXT_ENGINE_VERSION, type ContextPackage } from "@/lib/context-engine/types";
import { resolveBrokerIdentity } from "../broker-identity/engine";
import { gatherResearchEvidence, derivePossibleOffices, activeSearchVendor, type ResearchListing, type ResearchContext } from "./providers";
import { generateBrokerQueries } from "./queries";
import type { BrokerResearchDossier, ResearchEvidence, ResearchRunDiagnostics } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");

export interface ResearchReport { dossier: BrokerResearchDossier; applied: boolean; searchConfigured: boolean; note: string | null; autoLinked: boolean; linkedOfficeName: string | null }

// A broker is auto-linked to an office only when the evidence is overwhelming:
// confidence ≥ this AND a recognized/keyword office name backed by corroborating
// sources (the confidence already encodes multi-domain agreement). Never AI-only,
// never overwrites an existing link.
const AUTO_LINK_MIN_CONFIDENCE = 95;

/** Build a broker's research dossier. READ-ONLY (no writes) — safe for preview.
 *  opts.skipAI skips the AI summary (used by the batch scan for speed — auto-link
 *  depends on web/listing corroboration, not on the AI text). */
export async function buildResearchDossier(agentId: string, opts: { skipAI?: boolean } = {}): Promise<BrokerResearchDossier | null> {
  const db = createServiceRoleClient();
  const { data: agent } = await db.from("brokerage_agents" as never)
    .select("id,full_name,normalized_name,primary_phone,whatsapp_phone,city").eq("id", agentId).maybeSingle();
  if (!agent) return null;
  const a = agent as Row;
  const fullName = s(a.full_name);
  const normalizedName = s(a.normalized_name) || normalizeHebrewName(fullName);
  const phones = Array.from(new Set([s(a.primary_phone), s(a.whatsapp_phone)].filter(Boolean)));
  const city = s(a.city) || null;

  // Linked listings (owned evidence for Yad2/Madlan providers).
  const { data: links } = await db.from("brokerage_external_listing_links" as never).select("external_listing_id").eq("agent_id", agentId).limit(500);
  const ids = Array.from(new Set(((links ?? []) as Row[]).map((r) => s(r.external_listing_id)).filter(Boolean)));
  const listings: ResearchListing[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("external_listings" as never)
      .select("source,listing_url,title,contact_name,detected_broker_name,contact_phone,city,neighborhood").in("id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as Row[]) listings.push({
      source: s(r.source) || null, listingUrl: s(r.listing_url) || null, title: s(r.title) || null,
      contactName: s(r.contact_name) || null, detectedBrokerName: s(r.detected_broker_name) || null, contactPhone: s(r.contact_phone) || null,
      city: s(r.city) || null, neighborhood: s(r.neighborhood) || null,
    });
  }

  const queries = generateBrokerQueries(fullName, city, phones);
  const ctx: ResearchContext = { broker: { name: fullName, normalizedName, city, phones }, listings, queries };
  const { evidence, providers } = await gatherResearchEvidence(ctx);
  const possibleOffices = derivePossibleOffices(evidence, normalizedName);

  // Prior identity status (best-effort — table may not exist yet).
  let priorStatus: string | null = null;
  try {
    const { data: bi } = await db.from("brokerage_broker_identity" as never).select("status").eq("agent_id", agentId).maybeSingle();
    priorStatus = bi ? s((bi as Row).status) : null;
  } catch { /* 26.12 not applied */ }

  // STEP 4 — AI reasons over ONLY the collected sources (skipped in batch mode).
  let aiSummary: string | null = null;
  if (selectProvider() && evidence.length && !opts.skipAI) {
    aiSummary = await reasonOverSources(fullName, city, evidence);
  }

  const missingEvidence = computeMissing(providers, possibleOffices);
  const status: BrokerResearchDossier["status"] =
    possibleOffices.length && possibleOffices[0].confidence >= 80 ? "needs_review" : "insufficient_evidence";

  return {
    agentId, brokerName: fullName, normalizedName, city, phones,
    neighborhoods: Array.from(new Set(listings.map((l) => l.neighborhood).filter((x): x is string => !!x))),
    listingUrls: Array.from(new Set(listings.map((l) => l.listingUrl).filter((x): x is string => !!x))).slice(0, 20),
    sourceDomains: Array.from(new Set(evidence.map((e) => e.extractedWebsite).filter((x): x is string => !!x))),
    queries, evidence, providers, possibleOffices, priorStatus, aiSummary, missingEvidence,
    status,
  };
}

function computeMissing(providers: BrokerResearchDossier["providers"], offices: BrokerResearchDossier["possibleOffices"]): string[] {
  const missing: string[] = [];
  const web = providers.find((p) => p.provider === "web_search");
  if (web && !web.configured) missing.push("חיפוש ציבורי לא מוגדר (SerpAPI/Tavily/Exa/Bing/Google CSE)");
  if (!offices.length) missing.push("שם משרד שנצפה במקור ציבורי או במודעה");
  for (const p of providers.filter((x) => !x.configured && x.provider !== "web_search")) missing.push(`מקור לא מחובר: ${p.label}`);
  return missing;
}

/** Research one broker. apply=false → preview only (no writes). apply=true →
 *  persist dossier + create candidates + run the identity verification hook. */
export async function researchBroker(agentId: string, opts: { apply?: boolean; skipAI?: boolean } = {}): Promise<ResearchReport | null> {
  const dossier = await buildResearchDossier(agentId, { skipAI: opts.skipAI });
  if (!dossier) return null;
  const searchConfigured = !!activeSearchVendor() && !!process.env.ZONO_PUBLIC_SEARCH_ENABLED;
  const note = !searchConfigured ? "חיפוש ציבורי אינו מוגדר — מחקר מתווך←משרד מבוסס-אינטרנט אינו פעיל. מוגדר רק מקור המודעות (Yad2/Madlan)." : null;

  let applied = false;
  let autoLinked = false;
  let linkedOfficeName: string | null = null;
  if (opts.apply) {
    const db = createServiceRoleClient();
    const nowIso = new Date().toISOString();
    // Persist dossier.
    const payload = {
      agent_id: dossier.agentId, broker_name: dossier.brokerName, city: dossier.city, status: dossier.status,
      queries: dossier.queries as never, evidence: dossier.evidence as never, providers: dossier.providers as never,
      possible_offices: dossier.possibleOffices as never, missing_evidence: dossier.missingEvidence as never,
      ai_summary: dossier.aiSummary, public_results: dossier.evidence.length, evidence_items: dossier.evidence.length,
      last_researched_at: nowIso, updated_at: nowIso,
    };
    const { data: prior } = await db.from("brokerage_research_dossier" as never).select("id").eq("agent_id", agentId).maybeSingle();
    if (prior) await db.from("brokerage_research_dossier" as never).update(payload as never).eq("agent_id", agentId);
    else await db.from("brokerage_research_dossier" as never).insert(payload as never);

    // PART 5 — create office CANDIDATES from evidence (never verified directly).
    for (const o of dossier.possibleOffices.slice(0, 5)) {
      const fr = detectFranchise(o.officeName);
      const normalizedName = normalizeHebrewName(o.officeName);
      if (!normalizedName || normalizedName === dossier.normalizedName) continue; // STEP 7
      if (!isAcceptableOfficeName(o.officeName)) continue; // GUARD 26.13c: never a person-name office
      const { error } = await db.from("brokerage_office_candidates" as never).insert({
        office_name: o.officeName, normalized_name: normalizedName, brand_network: o.brandNetwork, normalized_brand: fr.normalizedBrand,
        city: dossier.city, suggested_by: o.sources.includes("web_search") ? "public_source" : "zono_listings",
        confidence: o.confidence, status: "candidate_pending_verification",
        evidence: [{ source: "research", sources: o.sources, confidence: o.confidence }] as never,
      } as never).select("id").maybeSingle();
      if (error && !/duplicate key/i.test(error.message)) console.error("[research] candidate insert:", error.message);
    }

    // AUTO-LINK — overwhelming, evidence-backed match links the broker directly.
    // Requires ≥95% (which already encodes multi-source corroboration) and a real
    // office name; reuses an existing office if one matches; never overwrites an
    // existing broker→office link.
    const top = dossier.possibleOffices[0];
    if (top && top.confidence >= AUTO_LINK_MIN_CONFIDENCE && isAcceptableOfficeName(top.officeName)) {
      try {
        const officeId = await findOrCreateVerifiedOffice(db, top, dossier.city, nowIso);
        if (officeId) {
          const { error, count } = await db.from("brokerage_agents" as never)
            .update({ office_id: officeId, last_seen_at: nowIso } as never, { count: "exact" })
            .eq("id", agentId).is("office_id", null);
          if (!error && (count ?? 0) > 0) { autoLinked = true; linkedOfficeName = top.officeName; }
        }
      } catch (e) { console.error("[research] auto-link failed:", e); }
    }

    // PART 6 — verification hook: the existing identity engine (thresholds intact).
    try { await resolveBrokerIdentity(agentId, { useAI: true }); } catch (e) { console.error("[research] verification hook failed:", e); }
    applied = true;
  }
  return { dossier, applied, searchConfigured, note, autoLinked, linkedOfficeName };
}

/** Find an existing active office for this name/city, else create a verified one.
 *  Returns the office id, or null. Evidence-backed only (caller gates on score). */
async function findOrCreateVerifiedOffice(
  db: ReturnType<typeof createServiceRoleClient>,
  office: { officeName: string; brandNetwork: string | null },
  city: string | null, nowIso: string,
): Promise<string | null> {
  const normalized = normalizeHebrewName(office.officeName);
  if (!normalized || !isAcceptableOfficeName(office.officeName)) return null;
  // Reuse an existing non-rejected office with the same normalized name (and a
  // compatible city) — never create a duplicate.
  const { data: existing } = await db.from("brokerage_offices" as never)
    .select("id,city,status").eq("normalized_name", normalized).limit(50);
  const match = ((existing ?? []) as Row[]).find((r) => s(r.status) !== "rejected" && (!city || !s(r.city) || s(r.city) === city));
  if (match) return String((match as Row).id);
  const fr = detectFranchise(office.officeName);
  const officeId = globalThis.crypto.randomUUID();
  const { error } = await db.from("brokerage_offices" as never).insert({
    id: officeId, name: office.officeName, normalized_name: normalized,
    brand_network: office.brandNetwork ?? (fr.matched ? fr.brandNetwork : null), office_type: "unknown",
    status: "active", city, confidence_score: 96, data_quality_score: 60,
    metadata: { derived_from: "broker_research_autolink" } as never,
    first_seen_at: nowIso, last_seen_at: nowIso, last_verified_at: nowIso,
  } as never);
  return error ? null : officeId;
}

export interface BatchResearchProgress { processedThisRun: number; remaining: number; total: number; researchedTotal: number; done: boolean }
export interface BatchResearchResult { diagnostics: ResearchRunDiagnostics; searchConfigured: boolean; note: string | null; progress: BatchResearchProgress }

/** RESUMABLE batch research (PART 9, v2). Each call processes a SMALL chunk of
 *  brokers NOT yet researched (so the client can auto-continue, chunk by chunk,
 *  until done, without ever exceeding the platform request timeout). Skips the AI
 *  text by default (auto-link relies on web/listing corroboration, not AI). */
export async function researchAllBrokers(orgId: string, opts: { cap?: number; apply?: boolean; skipAI?: boolean } = {}): Promise<BatchResearchResult> {
  const db = createServiceRoleClient();
  const cap = Math.max(1, Math.min(opts.cap ?? 5, 25));   // small per-run chunk for resumable auto-continue
  const apply = opts.apply ?? true;
  const skipAI = opts.skipAI ?? true;
  const searchConfigured = !!activeSearchVendor() && !!process.env.ZONO_PUBLIC_SEARCH_ENABLED;
  const d: ResearchRunDiagnostics = {
    brokersProcessed: 0, providersConfigured: 0, providersSkipped: 0, queriesGenerated: 0, publicResultsFound: 0,
    evidenceItemsCreated: 0, aiCalls: 0, aiResolved: 0, candidatesCreated: 0, autoLinked: 0, needsReview: 0, insufficientEvidence: 0, errors: [],
  };

  // Resumable: brokers that already have a research dossier are skipped.
  const { data: doneRows } = await db.from("brokerage_research_dossier" as never).select("agent_id").limit(50000);
  const researched = new Set(((doneRows ?? []) as Row[]).map((r) => s(r.agent_id)).filter(Boolean));
  const { data: agentRows } = await db.from("brokerage_agents" as never).select("id").order("confidence_score", { ascending: false }).limit(20000);
  const allIds = ((agentRows ?? []) as Row[]).map((r) => s(r.id)).filter(Boolean);
  const total = allIds.length;
  const queue = allIds.filter((id) => !researched.has(id)).slice(0, cap);

  for (const id of queue) {
    try {
      const r = await researchBroker(id, { apply, skipAI });
      if (!r) continue;
      d.brokersProcessed++;
      d.queriesGenerated += r.dossier.queries.length;
      d.publicResultsFound += r.dossier.evidence.length;
      d.evidenceItemsCreated += r.dossier.evidence.length;
      d.candidatesCreated += r.dossier.possibleOffices.length;
      if (r.autoLinked) d.autoLinked++;
      if (r.dossier.aiSummary) d.aiCalls++;
      if (r.dossier.status === "needs_review") d.needsReview++; else d.insufficientEvidence++;
    } catch (e) { d.errors.push(e instanceof Error ? e.message : String(e)); }
  }

  const providers = (await gatherResearchEvidence({ broker: { name: "", normalizedName: "", city: null, phones: [] }, listings: [], queries: [] })).providers;
  d.providersConfigured = providers.filter((p) => p.configured).length;
  d.providersSkipped = providers.filter((p) => !p.configured).length;
  const researchedTotal = researched.size + d.brokersProcessed;
  const remaining = Math.max(0, total - researchedTotal);
  const note = !searchConfigured
    ? "Public web search is not configured, so broker-office research cannot run. הגדר ספק חיפוש (SerpAPI / Tavily / Exa / Google CSE / Bing) + ZONO_PUBLIC_SEARCH_ENABLED."
    : null;
  return { diagnostics: d, searchConfigured, note, progress: { processedThisRun: d.brokersProcessed, remaining, total, researchedTotal, done: remaining === 0 } };
}

/** Resolve a broker reference (UUID or name) → agent id (for the test action). */
export async function resolveBrokerRef(idOrName: string): Promise<string | null> {
  const db = createServiceRoleClient();
  const ref = (idOrName ?? "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ref)) return ref;
  const { data } = await db.from("brokerage_agents" as never).select("id").ilike("full_name", `%${ref}%`).order("confidence_score", { ascending: false }).limit(1).maybeSingle();
  return data ? s((data as Row).id) : null;
}

export interface ResearchSnapshot {
  providers: { provider: string; label: string; configured: boolean }[];
  searchConfigured: boolean;
  counts: { researched: number; needsReview: number; insufficient: number; candidates: number };
  recent: { agentId: string; brokerName: string; city: string | null; status: string; evidenceItems: number; lastResearchedAt: string | null }[];
  unresearched: number;
  note: string | null;
}

/** Read model for the National Research UI tab. */
export async function getResearchSnapshot(): Promise<ResearchSnapshot> {
  const db = createServiceRoleClient();
  const providers = (await gatherResearchEvidence({ broker: { name: "", normalizedName: "", city: null, phones: [] }, listings: [], queries: [] })).providers
    .map((p) => ({ provider: p.provider, label: p.label, configured: p.configured }));
  const searchConfigured = !!activeSearchVendor() && !!process.env.ZONO_PUBLIC_SEARCH_ENABLED;

  let recentRows: Row[] = [];
  try {
    const { data } = await db.from("brokerage_research_dossier" as never)
      .select("agent_id,broker_name,city,status,evidence_items,last_researched_at").order("last_researched_at", { ascending: false }).limit(200);
    recentRows = (data ?? []) as Row[];
  } catch { /* dossier table not applied yet */ }

  const { count: agentTotal } = await db.from("brokerage_agents" as never).select("id", { count: "exact", head: true });
  const { count: candTotal } = await db.from("brokerage_office_candidates" as never).select("id", { count: "exact", head: true });

  const recent = recentRows.map((r) => ({
    agentId: s(r.agent_id), brokerName: s(r.broker_name), city: s(r.city) || null, status: s(r.status),
    evidenceItems: Number(r.evidence_items ?? 0), lastResearchedAt: s(r.last_researched_at) || null,
  }));
  return {
    providers, searchConfigured,
    counts: {
      researched: recent.length,
      needsReview: recent.filter((r) => r.status === "needs_review").length,
      insufficient: recent.filter((r) => r.status === "insufficient_evidence").length,
      candidates: candTotal ?? 0,
    },
    recent: recent.slice(0, 60),
    unresearched: Math.max(0, (agentTotal ?? 0) - recent.length),
    note: searchConfigured ? null : "Public web search is not configured, so broker-office research cannot run. הגדר ספק חיפוש (SerpAPI / Tavily / Exa / Google CSE / Bing) + ZONO_PUBLIC_SEARCH_ENABLED.",
  };
}

// ── AI over collected sources ONLY (citations required by the gateway). ──────
async function reasonOverSources(brokerName: string, city: string | null, evidence: ResearchEvidence[]): Promise<string | null> {
  try {
    const sources = evidence.slice(0, 16).map((e, i) => ({ idx: i + 1, provider: e.provider, url: e.url, title: e.title, snippet: e.snippet, office: e.extractedOfficeName }));
    const block = {
      key: "broker.research-sources", label: "מקורות מחקר", priority: 100, confidence: 0, source: "brokerage-data.research",
      data: { broker: brokerName, city, sources },
      evidence: evidence.slice(0, 16).map((e) => ({ source: e.provider, detail: e.title ?? e.snippet ?? e.url ?? "", confidence: e.confidence })),
    };
    const context: ContextPackage = {
      request: { type: "broker", entityId: brokerName, size: "small" },
      identity: { orgId: null, orgName: null, userId: null, userName: null, isManager: true },
      screen: "brokerage-data", workflow: "broker-research",
      blocks: [block], permissions: { isManager: true, removedBlocks: [], redactedFields: [] },
      explain: { repositoriesUsed: ["external_listings", "brokerage_agents"], entitiesCollected: [brokerName], confidence: null, missing: [], prioritySummary: [{ key: block.key, priority: 100 }], size: "small", blockCount: 1, approxChars: JSON.stringify(block).length, timestamp: new Date().toISOString(), version: CONTEXT_ENGINE_VERSION },
      cacheKey: `research:${brokerName}:${city ?? ""}`,
    };
    const QUESTION = "בהתבסס אך ורק על המקורות המצורפים, לאיזה משרד תיווך שייך המתווך? צטט את המקורות שעליהם הסתמכת (לפי idx). שם זהה לשם המתווך אינו משרד. אל תמציא פרטים שאינם במקורות. אם אין ראיה ברורה החזר insufficient_evidence.";
    // Bound the AI call — a hanging gateway/provider request must never freeze the
    // research action. On timeout we degrade to evidence-only (aiSummary = null).
    const res = await Promise.race([
      runReasoningGateway({ question: QUESTION, context, mode: "answer", language: "he", userId: null, organizationId: null }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000)),
    ]);
    if (!res) { console.error("[research] AI over sources timed out"); return null; }
    return res.status === "answered" ? (res.answer ?? null) : (res.answer || null);
  } catch (e) { console.error("[research] AI over sources failed:", e); return null; }
}
