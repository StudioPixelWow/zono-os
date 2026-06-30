// ============================================================================
// 🏙️ City-First Discovery on the Persistent Brokerage Knowledge Base™ (26.4.6 +
// 26.4.8). Server-only. Brokerage intelligence is SYSTEM data: before any
// expensive research, the engine loads everything the org already KNOWS about the
// city and reuses it. It matches brokers and relinks listings against ALL known
// offices (not just the current run), researches only the gaps, and writes back
// improved knowledge that every future user benefits from. Never overwrites
// stronger evidence with weaker; never fabricates phone/website/logo.
// Does NOT touch BIE / MAI / valuation / confidence formulas / schema.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { detectFranchise } from "./franchise";
import { isAcceptableOfficeName } from "./office-name-guard";
import { normalizeHebrewName, normalizePhoneNumber } from "./normalize";
import { activeSearchVendor } from "./broker-research/providers";
import { getBrokerageKnowledgeForCity, officeKey, type CityKnowledge } from "./brokerage-knowledge";
import { runReasoningGateway, selectProvider } from "@/lib/ai-reasoning/gateway";
import { CONTEXT_ENGINE_VERSION, type ContextPackage } from "@/lib/context-engine/types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
function normCity(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/[׳״"'`]/g, "").replace(/[-־–—_]/g, " ")
    .replace(/קריי/g, "קרי").replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/\s+/g, " ").trim().toLowerCase();
}
const urlDomain = (url: string): string => { const m = url.toLowerCase().match(/^https?:\/\/([^/]+)/); return m ? m[1].replace(/^www\./, "") : ""; };

export interface CityDiscoveryOptions {
  depth?: "quick" | "deep";
  includePublicResearch?: boolean;
  includeBrokerRematch?: boolean;
  includeListingRelink?: boolean;
}

export interface DiscoveredOffice {
  name: string; brandNetwork: string | null; status: string; confidence: number;
  brokerCount: number; phone: string | null; domain: string | null; evidence: string[]; sources: string[];
  matchedFrom: "knowledge_base" | "current_scan";   // explainability (Part 6)
}
export interface CityDiscoveryResult {
  city: string; cityNormalized: string; cityVariants: string[];
  officesDiscovered: number; officeCandidatesCreated: number;
  verifiedOffices: number; researchingOffices: number;
  brokersInCity: number; brokersMatched: number; brokersResearching: number;
  listingsLinked: number; conflicts: number;
  sourcesUsed: string[];
  discoveredOffices: DiscoveredOffice[];
  publicResearch: { enabled: boolean; queriesRun: number; resultsFound: number; reason: string | null };
  aiAnalysis: string | null;
  // ── Persistent knowledge-base accounting (Part 7) ──
  knownBefore: { offices: number; brokers: number; brokersLinked: number; candidates: number; listingsLinked: number };
  newlyLearned: { offices: number; brokers: number; listings: number; candidates: number };
  researchAvoided: { officesReused: number; brokersFromKnowledge: number; listingsFromKnowledge: number };
  notes: string[];
}

interface OfficeAgg {
  officeName: string; normalizedName: string; brandNetwork: string; normalizedBrand: string;
  brokerIds: Set<string>; phones: Set<string>; domains: Set<string>; sources: Set<string>;
  observations: number; brandMatched: boolean; evidence: string[];
}
interface OfficeTarget {
  officeId: string; officeName: string; key: string; normalizedBrand: string;
  brandNetwork: string | null; phones: Set<string>; domains: Set<string>; fromKnowledgeBase: boolean;
}

/** City-first discovery on the persistent KB. Best-effort, resumable, no-throw. */
export async function discoverBrokerageOfficesForCity(
  orgId: string, cityRaw: string, opts: CityDiscoveryOptions = {},
): Promise<CityDiscoveryResult> {
  const db = createServiceRoleClient();
  const cityNorm = normCity(cityRaw);
  const stem = cityRaw.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? cityRaw.trim();
  const inCity = (c: unknown) => normCity(s(c)) === cityNorm;
  const cityLabel = cityRaw.trim();
  const sourcesUsed = new Set<string>();
  const notes: string[] = [];
  const depth = opts.depth ?? "quick";

  // ── 0) REUSE BEFORE RESEARCH — load the persistent knowledge base first ─────
  const knowledge: CityKnowledge = await getBrokerageKnowledgeForCity(orgId, cityRaw);
  const knownBefore = {
    offices: knowledge.verifiedOffices.length, brokers: knowledge.brokers.length,
    brokersLinked: knowledge.brokersWithOffice, candidates: knowledge.candidateOffices.length,
    listingsLinked: knowledge.listingsLinked,
  };
  // Unified set of office targets = KNOWN offices (reused) + any created this run.
  const cityOffices = new Map<string, OfficeTarget>();
  for (const o of knowledge.verifiedOffices) {
    cityOffices.set(o.key, {
      officeId: o.id, officeName: o.name, key: o.key, normalizedBrand: detectFranchise(o.name).normalizedBrand,
      brandNetwork: o.brandNetwork, phones: new Set(o.phones), domains: new Set(o.domains), fromKnowledgeBase: true,
    });
  }
  const officesReusedKeys = new Set<string>(cityOffices.keys());

  // ── 1) Load city-scoped raw data (agents + listings + candidate keys) ───────
  const [agentRes, candRes, listingRes] = await Promise.all([
    db.from("brokerage_agents" as never).select("id,full_name,normalized_name,primary_phone,whatsapp_phone,primary_email,city,office_id").limit(20000),
    db.from("brokerage_office_candidates" as never).select("normalized_brand,normalized_name,city").limit(20000),
    db.from("external_listings" as never).select("id,detected_broker_name,contact_name,contact_phone,source,listing_url,city").ilike("city", `%${stem}%`).limit(20000),
  ]);
  const agents = ((agentRes.data ?? []) as Row[]).filter((r) => inCity(r.city));
  const existingCandKeys = new Set(((candRes.data ?? []) as Row[]).filter((r) => inCity(r.city))
    .map((r) => `${s(r.normalized_brand)}|${s(r.normalized_name)}|${cityNorm}`));
  const listings = ((listingRes.data ?? []) as Row[]).filter((r) => inCity(r.city));

  // ── 2) Build office-name evidence map (only the GAPS get researched) ────────
  const agg = new Map<string, OfficeAgg>();
  const add = (rawName: string, opt: { brokerId?: string; phone?: string | null; domain?: string | null; source: string }) => {
    const name = (rawName ?? "").trim();
    if (name.length < 2 || !isAcceptableOfficeName(name)) return;
    const fr = detectFranchise(name);
    const officeName = fr.matched ? `${fr.brandNetwork} ${cityLabel}` : name;
    const normalizedName = normalizeHebrewName(officeName);
    if (!normalizedName) return;
    const key = `${fr.normalizedBrand}|${normalizedName}`;
    let a = agg.get(key);
    if (!a) { a = { officeName, normalizedName, brandNetwork: fr.matched ? fr.brandNetwork : "independent", normalizedBrand: fr.normalizedBrand, brokerIds: new Set(), phones: new Set(), domains: new Set(), sources: new Set(), observations: 0, brandMatched: fr.matched, evidence: [] }; agg.set(key, a); }
    a.observations++;
    a.sources.add(opt.source); sourcesUsed.add(opt.source);
    if (opt.brokerId) a.brokerIds.add(opt.brokerId);
    if (opt.phone) { const np = normalizePhoneNumber(opt.phone); if (np) a.phones.add(np); }
    if (opt.domain) a.domains.add(opt.domain);
  };
  for (const b of agents) {
    if (detectFranchise(s(b.full_name)).matched) add(s(b.full_name), { brokerId: s(b.id), phone: s(b.primary_phone) || s(b.whatsapp_phone), source: "broker_name" });
  }
  for (const l of listings) {
    const src = s(l.source) ? `listing:${s(l.source)}` : "listing";
    const dom = s(l.listing_url) ? urlDomain(s(l.listing_url)) : null;
    for (const cand of [s(l.detected_broker_name), s(l.contact_name)]) {
      if (cand.trim().length >= 2) add(cand, { phone: s(l.contact_phone), domain: dom, source: src });
    }
  }

  // ── 3) Public web research only for gaps (offices not already known) ────────
  const vendor = opts.includePublicResearch !== false ? activeSearchVendor() : null;
  const research = { enabled: !!vendor, queriesRun: 0, resultsFound: 0, reason: null as string | null };
  if (opts.includePublicResearch !== false && !vendor) research.reason = "ספק חיפוש ציבורי אינו מוגדר";
  if (vendor) {
    const queries = [
      `משרד תיווך ${cityLabel}`, `מתווכים ${cityLabel}`, `RE/MAX ${cityLabel}`,
      `אנגלו סכסון ${cityLabel}`, `נדל"ן ${cityLabel}`,
    ].slice(0, depth === "deep" ? 5 : 3);
    for (const q of queries) {
      try {
        const hits = await vendor.run(q);
        research.queriesRun++; research.resultsFound += hits.length;
        for (const h of hits.slice(0, 5)) {
          const text = `${h.title ?? ""} ${h.snippet ?? ""}`.trim();
          const fr = detectFranchise(text);
          if (fr.matched) add(`${fr.brandNetwork}`, { domain: h.url ? urlDomain(h.url) : null, source: "public_web" });
        }
      } catch (e) { notes.push(`חיפוש ציבורי נכשל לשאילתה "${q}": ${e instanceof Error ? e.message : "שגיאה"}`); }
    }
  }

  // ── 4) Reuse-or-create offices + candidates (append/improve, never overwrite) ─
  let officeCandidatesCreated = 0, verifiedOffices = 0, researchingOffices = 0;
  let newOfficesCreated = 0;
  const conflicts = 0;
  const discoveredOffices: DiscoveredOffice[] = [];
  const nowIso = new Date().toISOString();

  for (const [aggKey, a] of agg) {
    const strongBusiness = a.sources.has("public_web") || a.domains.size > 0;
    const knownAlready = cityOffices.has(aggKey);
    const verified = knownAlready || a.brokerIds.size >= 2 || strongBusiness || a.observations >= 3 || (a.brandMatched && (a.phones.size >= 1 || a.brokerIds.size >= 1));
    const status = verified ? "verified" : "candidate_pending_verification";
    const confidence = Math.min(95,
      45 + Math.min(30, a.brokerIds.size * 12) + (a.brandMatched ? 10 : 0)
      + Math.min(20, (a.sources.size - 1) * 8) + (a.phones.size ? 8 : 0) + (strongBusiness ? 10 : 0));
    const phone = [...a.phones][0] ?? null;
    const domain = [...a.domains][0] ?? null;

    a.evidence = [
      knownAlready ? "ידע קיים: המשרד כבר היה מוכר בעיר" : null,
      a.brandMatched ? `מותג מזוהה: ${a.brandNetwork}` : null,
      a.brokerIds.size ? `${a.brokerIds.size} מתווכים מקושרים` : null,
      a.observations ? `${a.observations} צפיות בראיות` : null,
      a.phones.size ? `טלפון נצפה: ${phone}` : null,
      domain ? `דומיין: ${domain}` : null,
      `מקורות: ${[...a.sources].join(", ")}`,
    ].filter(Boolean) as string[];

    // Candidate (dedupe by brand|name|city) — never overwrite an existing one.
    const candKey = `${a.normalizedBrand}|${a.normalizedName}|${cityNorm}`;
    if (!existingCandKeys.has(candKey)) {
      const { error } = await db.from("brokerage_office_candidates" as never).insert({
        office_name: a.officeName, normalized_name: a.normalizedName,
        brand_network: a.brandMatched ? a.brandNetwork : null, normalized_brand: a.normalizedBrand,
        city: cityLabel, phone, domain, suggested_by: a.sources.has("public_web") ? "public_source" : "zono_listings",
        confidence, status,
        evidence: [{ source: "city_discovery", city: cityLabel, sources: [...a.sources], brokers: a.brokerIds.size, observations: a.observations, notes: a.evidence }] as never,
      } as never).select("id").maybeSingle();
      if (!error) { officeCandidatesCreated++; existingCandKeys.add(candKey); }
      else if (!/duplicate key/i.test(error.message)) notes.push(`יצירת מועמד נכשלה: ${error.message}`);
    }
    if (verified) verifiedOffices++; else researchingOffices++;

    // Reuse-or-create the office entity; merge new contact points into the target.
    if (verified) {
      const found = await findOrCreateOffice(db, a, cityLabel, phone, confidence, nowIso);
      if (found) {
        if (found.created) newOfficesCreated++;
        const existing = cityOffices.get(aggKey);
        if (existing) { for (const p of a.phones) existing.phones.add(p); for (const d of a.domains) existing.domains.add(d); }
        else cityOffices.set(aggKey, { officeId: found.officeId, officeName: a.officeName, key: aggKey, normalizedBrand: a.normalizedBrand, brandNetwork: a.brandMatched ? a.brandNetwork : null, phones: new Set(a.phones), domains: new Set(a.domains), fromKnowledgeBase: !found.created });
        if (!found.created) await db.from("brokerage_offices" as never).update({ last_seen_at: nowIso } as never).eq("id", found.officeId); // continuous learning
      }
    }
    discoveredOffices.push({
      name: a.officeName, brandNetwork: a.brandMatched ? a.brandNetwork : null, status, confidence,
      brokerCount: a.brokerIds.size, phone, domain, evidence: a.evidence, sources: [...a.sources],
      matchedFrom: knownAlready ? "knowledge_base" : "current_scan",
    });
  }

  // ── 5) Broker matching against ALL known offices (KB + new) ─────────────────
  let brokersMatched = 0, brokersFromKnowledge = 0;
  if (opts.includeBrokerRematch !== false) {
    for (const b of agents) {
      if (s(b.office_id)) continue;
      const phone = normalizePhoneNumber(s(b.primary_phone) || s(b.whatsapp_phone));
      const brand = detectFranchise(s(b.full_name)).normalizedBrand;
      let target: OfficeTarget | null = null;
      for (const o of cityOffices.values()) {
        if ((phone && o.phones.has(phone)) || (o.normalizedBrand !== "independent" && o.normalizedBrand === brand)) { target = o; break; }
      }
      if (!target) continue;
      const { error } = await db.from("brokerage_agents" as never)
        .update({ office_id: target.officeId, last_seen_at: nowIso } as never).eq("id", s(b.id)).is("office_id", null);
      if (!error) { (b as Row).office_id = target.officeId; brokersMatched++; if (target.fromKnowledgeBase) brokersFromKnowledge++; }
    }
  }
  // Backfill broker counts on the discovered offices.
  for (const o of discoveredOffices) { const t = [...cityOffices.values()].find((x) => x.officeName === o.name); if (t) o.brokerCount = agents.filter((b) => s(b.office_id) === t.officeId).length; }

  // ── 6) Listing relink against ALL known offices in the city (Part 3) ────────
  let listingsLinked = 0, listingsFromKnowledge = 0;
  if (opts.includeListingRelink !== false && cityOffices.size > 0) {
    const targetByKey = new Map<string, OfficeTarget>(); for (const o of cityOffices.values()) targetByKey.set(o.key, o);
    const keyOf = (rawName: string): string | null => {
      const name = (rawName ?? "").trim();
      if (name.length < 2 || !isAcceptableOfficeName(name)) return null;
      const k = officeKey(detectFranchise(name).matched ? `${detectFranchise(name).brandNetwork} ${cityLabel}` : name);
      return targetByKey.has(k) ? k : null;
    };
    const listingIds = listings.map((l) => s(l.id)).filter(Boolean);
    const { data: existingLinks } = await db.from("brokerage_external_listing_links" as never)
      .select("external_listing_id,office_id").in("external_listing_id", listingIds).limit(50000);
    const linkedPair = new Set(((existingLinks ?? []) as Row[]).map((r) => `${s(r.external_listing_id)}|${s(r.office_id)}`));
    const newLinks: { row: Row; fromKb: boolean }[] = [];
    for (const l of listings) {
      const lid = s(l.id); if (!lid) continue;
      let key = keyOf(s(l.detected_broker_name)) ?? keyOf(s(l.contact_name));
      if (!key) { const lp = normalizePhoneNumber(s(l.contact_phone)); if (lp) for (const o of cityOffices.values()) if (o.phones.has(lp)) { key = o.key; break; } }
      if (!key) continue;
      const office = targetByKey.get(key)!;
      const pair = `${lid}|${office.officeId}`;
      if (linkedPair.has(pair)) continue;
      linkedPair.add(pair);
      newLinks.push({ fromKb: office.fromKnowledgeBase, row: {
        external_listing_id: lid, organization_id: orgId, agent_id: null, office_id: office.officeId,
        city: cityLabel, matched_phone: normalizePhoneNumber(s(l.contact_phone)) || null,
        matched_name: office.officeName, matched_source: s(l.source) || null,
        confidence_score: 80, status: "auto_linked",
        match_reasons: ["city_discovery_relink", office.fromKnowledgeBase ? "from_knowledge_base" : "current_scan", `office:${office.officeName}`, s(l.source) ? `source:${s(l.source)}` : "listing"] as never,
      } });
    }
    for (let i = 0; i < newLinks.length; i += 500) {
      const chunk = newLinks.slice(i, i + 500);
      const { error } = await db.from("brokerage_external_listing_links" as never).insert(chunk.map((x) => x.row) as never);
      if (!error) { listingsLinked += chunk.length; listingsFromKnowledge += chunk.filter((x) => x.fromKb).length; }
      else if (!/duplicate key/i.test(error.message)) notes.push(`קישור מודעות נכשל: ${error.message}`);
    }
  }

  discoveredOffices.sort((x, y) => y.confidence - x.confidence);
  const brokersInCity = agents.length;
  const brokersResearching = Math.max(0, brokersInCity - agents.filter((b) => s(b.office_id)).length);
  const officesDiscovered = discoveredOffices.length;
  if (officesDiscovered === 0 && knownBefore.offices === 0) notes.push("לא נמצאו ראיות לשמות משרד בעיר זו — נדרש מחקר ציבורי (Tavily) או ייבוא מודעות עם detected_broker_name.");

  // ── 7) OpenAI evidence ANALYSIS (never assignment) — best-effort, bounded ────
  let aiAnalysis: string | null = null;
  if ((depth === "deep") && selectProvider() && discoveredOffices.length > 0) {
    aiAnalysis = await analyzeEvidence(cityLabel, discoveredOffices, orgId).catch(() => null);
  }

  return {
    city: cityLabel, cityNormalized: cityNorm, cityVariants: knowledge.cityVariants,
    officesDiscovered, officeCandidatesCreated, verifiedOffices, researchingOffices,
    brokersInCity, brokersMatched, brokersResearching,
    listingsLinked, conflicts,
    sourcesUsed: [...sourcesUsed], discoveredOffices,
    publicResearch: research, aiAnalysis,
    knownBefore,
    newlyLearned: { offices: newOfficesCreated, brokers: brokersMatched, listings: listingsLinked, candidates: officeCandidatesCreated },
    researchAvoided: { officesReused: officesReusedKeys.size, brokersFromKnowledge, listingsFromKnowledge },
    notes,
  };
}

/** AI analysis of the COLLECTED evidence (explanatory only — never assigns offices). */
async function analyzeEvidence(city: string, offices: DiscoveredOffice[], orgId: string): Promise<string | null> {
  try {
    const summary = offices.slice(0, 20).map((o, i) => ({ idx: i + 1, office: o.name, brand: o.brandNetwork, status: o.status, confidence: o.confidence, brokers: o.brokerCount, sources: o.sources, evidence: o.evidence }));
    const block = {
      key: "brokerage.city-office-evidence", label: "ראיות גילוי משרדים בעיר", priority: 100, confidence: 0,
      source: "brokerage-data.city-discovery", data: { city, offices: summary },
      evidence: summary.map((o) => ({ source: "city_discovery", detail: `${o.office} (${o.status})`, confidence: o.confidence })),
    };
    const context: ContextPackage = {
      request: { type: "office", entityId: city, size: "small" },
      identity: { orgId, orgName: null, userId: null, userName: null, isManager: true },
      screen: "brokerage-data", workflow: "city-office-discovery",
      blocks: [block], permissions: { isManager: true, removedBlocks: [], redactedFields: [] },
      explain: { repositoriesUsed: ["brokerage_offices", "external_listings"], entitiesCollected: [city], confidence: null, missing: [], prioritySummary: [{ key: block.key, priority: 100 }], size: "small", blockCount: 1, approxChars: JSON.stringify(block).length, timestamp: new Date().toISOString(), version: CONTEXT_ENGINE_VERSION },
      cacheKey: `city-discovery:${city}`,
    };
    const QUESTION = "בהתבסס אך ורק על הראיות המצורפות, סכם בקצרה אילו משרדי תיווך סבירים בעיר זו ומה חוזק הראיות לכל אחד. אל תמציא משרדים שאינם בראיות. זהו ניתוח בלבד — אינו קובע שיוך.";
    const res = await Promise.race([
      runReasoningGateway({ question: QUESTION, context, mode: "answer", language: "he", userId: null, organizationId: orgId }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000)),
    ]);
    if (!res) return null;
    return res.status === "answered" ? (res.answer ?? null) : (res.answer || null);
  } catch { return null; }
}

/** Find an existing active office for this name/city, else create one. No fakes. */
async function findOrCreateOffice(
  db: ReturnType<typeof createServiceRoleClient>, a: OfficeAgg, city: string,
  phone: string | null, confidence: number, nowIso: string,
): Promise<{ officeId: string; created: boolean } | null> {
  if (!isAcceptableOfficeName(a.officeName)) return null;
  const { data: existing } = await db.from("brokerage_offices" as never)
    .select("id,city,status").eq("normalized_name", a.normalizedName).limit(50);
  const match = ((existing ?? []) as Row[]).find((r) => s(r.status) !== "rejected" && (!city || !s(r.city) || normCity(s(r.city)) === normCity(city)));
  if (match) return { officeId: s((match as Row).id), created: false };
  const officeId = globalThis.crypto.randomUUID();
  const { error } = await db.from("brokerage_offices" as never).insert({
    id: officeId, name: a.officeName, normalized_name: a.normalizedName,
    brand_network: a.brandMatched ? a.brandNetwork : null, office_type: "unknown",
    status: "active", city, primary_phone: phone, confidence_score: confidence, data_quality_score: 50,
    metadata: { derived_from: "city_discovery", sources: [...a.sources] } as never,
    first_seen_at: nowIso, last_seen_at: nowIso, last_verified_at: nowIso,
  } as never);
  return error ? null : { officeId, created: true };
}
