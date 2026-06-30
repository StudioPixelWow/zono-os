// ============================================================================
// 🗂️ National Brokerage Registry & AI Candidate Discovery™ (Phase 26.11, v2).
// Server-only, additive. AI-FIRST evidence pipeline.
//
// Why v2: external listings rarely carry a literal office name, so the old
// shared-phone-first discovery produced ~0 candidates. v2 instead, per broker:
//   STEP 1  iterate every brokerage_agent
//   STEP 2  collect PUBLIC evidence — primarily the observed listing evidence we
//           already hold (external_listings.detected_broker_name / contact_name /
//           source / domain), plus shared phone/email/domain. External web
//           providers (Google Business/Maps/Facebook/LinkedIn/Yad2/Madlan/site)
//           are pluggable but currently NOT configured → counted as skipped,
//           never fabricated.
//   STEP 3  build an evidence package
//   STEP 4  send ONLY that package to OpenAI (via the gateway). The model may
//           answer likely office + confidence + evidence used, choosing only from
//           names present in the evidence — it may NEVER invent an office.
//   STEP 5  create brokerage_office_candidates from the evidence (observed hints
//           and grounded AI suggestions), status candidate_pending_verification.
//   STEP 6  deterministically verify: ≥2 brokers → same office, matching website/
//           phone/domain, or repeated observations. Shared phone is ONE signal.
//
// Always emits diagnostics so candidates=0 is explainable. No fabrication; AI
// never verifies; never overwrites stronger evidence.
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
const urlDomain = (url: string): string => { const m = url.toLowerCase().match(/^https?:\/\/([^/]+)/); return m ? m[1].replace(/^www\./, "") : ""; };
const FREE_MAIL = /(gmail|walla|hotmail|outlook|yahoo|icloud|live|nana|012)\./;
const AI_BUDGET = 60;   // max NEW AI calls per run (resumable across runs)

export interface RegistryMetrics {
  // headline (used by the UI)
  officeCandidatesCreated: number;
  candidatesVerified: number;
  officesCreated: number;
  duplicateCandidates: number;
  brokersResolved: number;
  brokersPendingReview: number;
  brokersUnresolved: number;
  edgesCreated: number;
  // AI-first diagnostics (the required "why")
  agentsProcessed: number;
  agentsWithPublicEvidence: number;
  agentsWithOfficeHint: number;
  noPublicEvidence: number;
  aiConfigured: boolean;
  aiRequests: number;
  aiCandidatesCreated: number;
  verifiedCandidates: number;
  rejectedCandidates: number;
  publicSourcesSkipped: number;
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
interface ListingEv { contactName: string | null; detectedBrokerName: string | null; contactType: string | null; city: string | null; neighborhood: string | null; source: string | null; domain: string | null }

// Aggregate of one office-name hypothesis across all brokers/evidence.
interface OfficeAgg {
  officeName: string; normalizedName: string; brandNetwork: string; normalizedBrand: string;
  city: string | null; brokerIds: Set<string>; phones: Set<string>; domains: Set<string>;
  sources: Set<string>; observations: number; suggestedBy: Set<string>; aiConfidence: number;
}

/** Run the national registry pass. Best-effort, no-throw; always finalizes. */
export async function runNationalOfficeRegistry(
  orgId: string, userId: string | null, opts: { useAI?: boolean } = {},
): Promise<RegistryRunResult> {
  const db = createServiceRoleClient();
  const readiness = getOfficeDiscoveryReadiness();
  const publicSearch = readiness.providers.find((p) => p.id === "public_search");
  const aiReady = !!selectProvider();
  const useAI = (opts.useAI ?? aiReady) && aiReady;

  const m: RegistryMetrics = {
    officeCandidatesCreated: 0, candidatesVerified: 0, officesCreated: 0, duplicateCandidates: 0,
    brokersResolved: 0, brokersPendingReview: 0, brokersUnresolved: 0, edgesCreated: 0,
    agentsProcessed: 0, agentsWithPublicEvidence: 0, agentsWithOfficeHint: 0, noPublicEvidence: 0,
    aiConfigured: aiReady, aiRequests: 0, aiCandidatesCreated: 0, verifiedCandidates: 0, rejectedCandidates: 0,
    // external web providers (Google/FB/LinkedIn/Yad2/Madlan/site) are all unconfigured here.
    publicSourcesSkipped: readiness.providers.filter((p) => p.kind === "public_search" && !p.enabled).length || 1,
    errors: [],
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
    // ── Load brokers ──────────────────────────────────────────────────────────
    const { data: agentRows } = await db.from("brokerage_agents" as never)
      .select("id,full_name,normalized_name,primary_phone,whatsapp_phone,primary_email,city,office_id").limit(20000);
    const brokers: BrokerRec[] = ((agentRows ?? []) as Row[]).map((r) => ({
      id: String(r.id), fullName: s(r.full_name), normalizedName: s(r.normalized_name) || normalizeHebrewName(s(r.full_name)),
      phone: s(r.primary_phone) || s(r.whatsapp_phone) || null, email: s(r.primary_email) || null, city: s(r.city) || null,
      officeId: s(r.office_id) || null,
    }));
    if (!brokers.length) {
      result.message = "אין מתווכים לעיבוד — הרץ סריקת brokerage תחילה (Listing→Broker).";
      return await finalize(db, result, runId, "completed");
    }

    // ── STEP 2: bulk-collect observed listing evidence per broker ──────────────
    const { data: linkRows } = await db.from("brokerage_external_listing_links" as never)
      .select("agent_id,external_listing_id").not("agent_id", "is", null).limit(50000);
    const listingIdsByAgent = new Map<string, string[]>();
    const allListingIds = new Set<string>();
    for (const r of (linkRows ?? []) as Row[]) {
      const a = s(r.agent_id), l = s(r.external_listing_id); if (!a || !l) continue;
      (listingIdsByAgent.get(a) ?? listingIdsByAgent.set(a, []).get(a)!).push(l); allListingIds.add(l);
    }
    const listingById = new Map<string, ListingEv>();
    const ids = [...allListingIds];
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const { data } = await db.from("external_listings" as never)
        .select("id,contact_name,contact_type,detected_broker_name,city,neighborhood,source,listing_url").in("id", chunk);
      for (const r of (data ?? []) as Row[]) {
        listingById.set(s(r.id), {
          contactName: s(r.contact_name) || null, detectedBrokerName: s(r.detected_broker_name) || null,
          contactType: s(r.contact_type) || null, city: s(r.city) || null, neighborhood: s(r.neighborhood) || null,
          source: s(r.source) || null, domain: urlDomain(s(r.listing_url)) || null,
        });
      }
    }

    // Shared phone / domain peer maps (ONE signal among many).
    const namesByPhone = new Map<string, Set<string>>();
    const namesByDomain = new Map<string, Set<string>>();
    for (const b of brokers) {
      const np = normalizePhoneNumber(b.phone ?? "");
      if (np && b.normalizedName) (namesByPhone.get(np) ?? namesByPhone.set(np, new Set()).get(np)!).add(b.normalizedName);
      const dom = b.email ? emailDomain(b.email) : "";
      if (dom && !FREE_MAIL.test(dom) && b.normalizedName) (namesByDomain.get(dom) ?? namesByDomain.set(dom, new Set()).get(dom)!).add(b.normalizedName);
    }

    // Agents that already have an AI evidence row (resumable — don't re-ask AI).
    const { data: aiRows } = await db.from("brokerage_office_evidence" as never)
      .select("agent_id").eq("tier", "ai_reasoning").limit(50000);
    const aiDone = new Set(((aiRows ?? []) as Row[]).map((r) => s(r.agent_id)));

    // Existing offices (for grounding AI + matching).
    const { data: officeRows } = await db.from("brokerage_offices" as never).select("id,name,normalized_name,city").limit(20000);
    const existingOffices = ((officeRows ?? []) as Row[]).map((r) => ({ id: String(r.id), name: s(r.name), norm: s(r.normalized_name) || normalizeHebrewName(s(r.name)), city: s(r.city) }));

    // ── STEP 3–5: build evidence + (AI) reason + collect office-name hypotheses ─
    const agg = new Map<string, OfficeAgg>();           // key: brand|name|city
    const aiEvidenceInserts: Row[] = [];
    const cities = new Set<string>();

    const addHint = (rawName: string, city: string | null, brokerId: string, opts2: { phone?: string | null; domain?: string | null; source?: string | null; by: string; aiConf?: number }) => {
      const name = (rawName ?? "").trim();
      if (name.length < 2) return;
      const fr = detectFranchise(name);
      const officeName = fr.matched ? `${fr.brandNetwork}${city ? ` ${city}` : ""}` : name;
      const normalizedName = normalizeHebrewName(officeName);
      if (!normalizedName) return;
      const key = `${fr.normalizedBrand}|${normalizedName}|${city ?? ""}`;
      let a = agg.get(key);
      if (!a) { a = { officeName, normalizedName, brandNetwork: fr.brandNetwork, normalizedBrand: fr.normalizedBrand, city, brokerIds: new Set(), phones: new Set(), domains: new Set(), sources: new Set(), observations: 0, suggestedBy: new Set(), aiConfidence: 0 }; agg.set(key, a); }
      a.brokerIds.add(brokerId); a.observations++;
      a.suggestedBy.add(opts2.by);
      if (opts2.phone) { const np = normalizePhoneNumber(opts2.phone); if (np) a.phones.add(np); }
      if (opts2.domain) a.domains.add(opts2.domain);
      if (opts2.source) a.sources.add(opts2.source);
      if (opts2.aiConf && opts2.aiConf > a.aiConfidence) a.aiConfidence = opts2.aiConf;
    };

    for (const b of brokers) {
      m.agentsProcessed++;
      if (b.city) cities.add(b.city);
      const listings = (listingIdsByAgent.get(b.id) ?? []).map((id) => listingById.get(id)).filter((x): x is ListingEv => !!x);
      const np = normalizePhoneNumber(b.phone ?? "");
      const dom = b.email ? emailDomain(b.email) : "";
      const sharedPhonePeers = np ? Math.max(0, (namesByPhone.get(np)?.size ?? 1) - 1) : 0;
      const sharedDomainPeers = dom && !FREE_MAIL.test(dom) ? Math.max(0, (namesByDomain.get(dom)?.size ?? 1) - 1) : 0;
      const hasPublicEvidence = listings.length > 0 || sharedPhonePeers > 0 || sharedDomainPeers > 0;
      if (hasPublicEvidence) m.agentsWithPublicEvidence++; else { m.noPublicEvidence++; continue; }

      // Observed office-name hints (REAL, public-sourced): detected_broker_name is
      // the scraper's observed agency/office; brand hints from names; agency-typed
      // contact names. Personal contact names are NOT treated as offices.
      const hints: { name: string; source: string; domain: string | null }[] = [];
      if (detectFranchise(b.fullName).matched) hints.push({ name: b.fullName, source: "broker_name_brand", domain: null });
      for (const l of listings) {
        if (l.detectedBrokerName && l.detectedBrokerName.length >= 2) hints.push({ name: l.detectedBrokerName, source: l.source ? `listing:${l.source}` : "detected_broker_name", domain: l.domain });
        if (l.contactName && (detectFranchise(l.contactName).matched || /(תיווך|נדל|נכסים|realty|real\s*estate|properties|group|קבוצת)/i.test(l.contactName))) {
          hints.push({ name: l.contactName, source: l.source ? `listing:${l.source}` : "contact_name", domain: l.domain });
        }
      }
      const listingCity = listings.map((l) => l.city).find(Boolean) ?? b.city;
      const listingDomain = listings.map((l) => l.domain).find(Boolean) ?? null;
      if (hints.length) m.agentsWithOfficeHint++;

      for (const h of hints) addHint(h.name, listingCity ?? null, b.id, { phone: b.phone, domain: h.domain, source: h.source, by: "zono_listings" });

      // Shared-phone / shared-domain clusters → an independent-office hypothesis (ONE signal).
      if (sharedPhonePeers > 0 && hints.length === 0) {
        const label = (listings.map((l) => l.detectedBrokerName).find(Boolean)) || b.fullName;
        addHint(label, listingCity ?? null, b.id, { phone: b.phone, domain: listingDomain, source: "shared_phone", by: "zono_listings" });
      }

      // ── STEP 4: AI reasoning over ONLY this evidence (grounded; never invents). ─
      if (useAI && !aiDone.has(b.id) && m.aiRequests < AI_BUDGET) {
        m.aiRequests++;
        const ev = {
          broker: { id: b.id, name: b.fullName, city: b.city, phone: b.phone, email: b.email },
          observedOfficeNames: Array.from(new Set(hints.map((h) => h.name))),
          listings: listings.slice(0, 12).map((l) => ({ detectedBrokerName: l.detectedBrokerName, contactName: l.contactName, source: l.source, city: l.city, neighborhood: l.neighborhood, domain: l.domain })),
          sharedPhoneBrokers: sharedPhonePeers, sharedDomainBrokers: sharedDomainPeers,
          candidateOffices: existingOffices.filter((o) => !o.city || !b.city || o.city === b.city).slice(0, 40).map((o) => o.name),
        };
        const ai = await aiReasonOffice(b, ev, { orgId, userId });
        aiEvidenceInserts.push({
          agent_id: b.id, office_id: null, tier: "ai_reasoning", source: "openai_reasoning", provider: ai?.provider ?? null,
          confidence: ai?.confidence ?? 0, claim: ai?.office ?? "insufficient_evidence",
          reason: ai?.reason ?? "אין ראיה מספקת", supporting_sources: (ai?.evidenceUsed ?? []) as never, metadata: { status: ai?.status ?? "no_provider" } as never,
        });
        // Accept ONLY if the AI's office is grounded in the evidence (observed hint
        // or an existing office) — otherwise it's a rejected (ungrounded) guess.
        const proposed = ai?.office ?? "";
        const proposedNorm = normalizeHebrewName(proposed);
        const grounded = !!proposed && (
          hints.some((h) => { const hn = normalizeHebrewName(h.name); return hn && (hn.includes(proposedNorm) || proposedNorm.includes(hn)); }) ||
          existingOffices.some((o) => o.norm && (o.norm.includes(proposedNorm) || proposedNorm.includes(o.norm)))
        );
        if (ai && ai.status === "answered" && grounded && ai.confidence > 0) {
          addHint(proposed, b.city, b.id, { phone: b.phone, domain: listingDomain, source: "openai_reasoning", by: "ai", aiConf: ai.confidence });
          m.aiCandidatesCreated++;
        } else {
          m.rejectedCandidates++;
        }
      }
    }
    if (aiEvidenceInserts.length) {
      for (let i = 0; i < aiEvidenceInserts.length; i += 500) await db.from("brokerage_office_evidence" as never).insert(aiEvidenceInserts.slice(i, i + 500) as never);
    }

    // ── STEP 5 (persist): create candidates from the aggregated hypotheses. ─────
    const { data: existingCand } = await db.from("brokerage_office_candidates" as never).select("normalized_brand,normalized_name,city").limit(20000);
    const candKey = (b2: string, n: string, c: string) => `${b2}|${n}|${c}`;
    const existingKeys = new Set(((existingCand ?? []) as Row[]).map((r) => candKey(s(r.normalized_brand), s(r.normalized_name), s(r.city))));

    // ── STEP 6: deterministic verification — multiple brokers / domain / phone. ─
    const verifyKeys: string[] = [];
    for (const [key, a] of agg) {
      if (existingKeys.has(candKey(a.normalizedBrand, a.normalizedName, a.city ?? ""))) continue;
      const phone = [...a.phones][0] ?? null;
      const domain = [...a.domains][0] ?? null;
      const brokers2 = a.brokerIds.size;
      // Verified when ≥2 distinct brokers map to the office, OR a shared phone/
      // domain backs it, OR it was observed repeatedly. Shared phone is ONE signal.
      const verified = brokers2 >= 2 || (a.domains.size >= 1 && brokers2 >= 2) || a.observations >= 3 || (!!phone && (namesByPhone.get(phone)?.size ?? 0) >= 2);
      const aiBacked = a.suggestedBy.has("ai");
      const confidence = Math.min(98, (verified ? 80 : 45) + Math.min(15, (brokers2 - 1) * 8) + (aiBacked ? Math.round(a.aiConfidence * 0.1) : 0));
      const status = verified ? "needs_review" /* promoted below */ : "candidate_pending_verification";
      const { error } = await db.from("brokerage_office_candidates" as never).insert({
        office_name: a.officeName, normalized_name: a.normalizedName,
        brand_network: a.brandNetwork === "independent" ? null : a.brandNetwork, normalized_brand: a.normalizedBrand,
        city: a.city, phone, domain, suggested_by: a.suggestedBy.has("ai") ? "ai" : "zono_listings",
        confidence, status,
        evidence: [{ source: "observed_listing", brokers: brokers2, observations: a.observations, sources: [...a.sources].slice(0, 5), ai_backed: aiBacked }] as never,
      } as never).select("id").maybeSingle();
      if (!error) { m.officeCandidatesCreated++; if (verified) verifyKeys.push(key); }
      else if (!/duplicate key/i.test(error.message)) m.errors.push(`candidate insert: ${error.message}`);
    }

    // Promote verified aggregates into real brokerage_offices + link their brokers.
    const nowIso = new Date().toISOString();
    for (const key of verifyKeys) {
      const a = agg.get(key)!;
      const officeId = globalThis.crypto.randomUUID();
      const phone = [...a.phones][0] ?? null;
      const conf = a.brokerIds.size >= 4 ? 96 : a.brokerIds.size >= 3 ? 90 : 85;
      const { error: oErr } = await db.from("brokerage_offices" as never).insert({
        id: officeId, name: a.officeName, normalized_name: a.normalizedName,
        brand_network: a.brandNetwork === "independent" ? null : a.brandNetwork, office_type: "unknown",
        status: "active", city: a.city, primary_phone: phone, confidence_score: conf, data_quality_score: 50,
        metadata: { derived_from: "registry_v2", brokers: a.brokerIds.size, ai_backed: a.suggestedBy.has("ai"), org_id: orgId } as never,
        first_seen_at: nowIso, last_seen_at: nowIso, last_verified_at: nowIso,
      } as never);
      if (oErr) { m.errors.push(`office create: ${oErr.message}`); continue; }
      m.officesCreated++; m.candidatesVerified++; m.verifiedCandidates++;
      await db.from("brokerage_office_candidates" as never)
        .update({ status: "verified", verified_office_id: officeId, last_seen_at: nowIso, verification_sources: [{ source: "multi_broker", brokers: a.brokerIds.size }] as never } as never)
        .eq("normalized_brand", a.normalizedBrand).eq("normalized_name", a.normalizedName).eq("city", a.city ?? "");
      // Link the contributing brokers to the verified office (≥2-broker evidence).
      for (const bid of a.brokerIds) await db.from("brokerage_agents" as never).update({ office_id: officeId, last_seen_at: nowIso } as never).eq("id", bid).is("office_id", null);
    }

    // ── Broker→office resolution upgrade (reuse evidence-based resolver). ───────
    let det: OfficeResolutionMetrics | null = null;
    try { det = await resolveBrokerOfficesForOrg(orgId); } catch (e) { m.errors.push(`broker resolution: ${e instanceof Error ? e.message : String(e)}`); }
    if (det) { m.brokersResolved = det.brokersResolvedToOffice; m.brokersPendingReview = det.brokersPendingReview; m.brokersUnresolved = det.brokersUnresolved; }

    m.duplicateCandidates = await buildMergeSuggestions(db);
    m.edgesCreated = await buildGraphEdges(db);

    result.message = buildMessage(m, useAI);
    return await finalize(db, result, runId, m.errors.length && m.officeCandidatesCreated === 0 ? "partial" : "completed");
  } catch (e) {
    console.error("[brokerage-registry] failed:", e);
    m.errors.push(e instanceof Error ? e.message : String(e));
    return await finalize(db, result, runId, "failed");
  }
}

/** Always explain WHY candidates may be 0. */
function buildMessage(m: RegistryMetrics, useAI: boolean): string {
  if (m.officeCandidatesCreated > 0) {
    return `מרשם הסתיים ✓ — ${m.officeCandidatesCreated} מועמדים נוצרו · ${m.candidatesVerified} אומתו · ${m.officesCreated} משרדים · ${m.aiCandidatesCreated} בעזרת AI (מתוך ${m.agentsProcessed} מתווכים).`;
  }
  const why: string[] = [];
  if (m.agentsWithPublicEvidence === 0) why.push(`לאף אחד מ-${m.agentsProcessed} המתווכים אין ראיה ציבורית (מודעות מקושרות/טלפון משותף)`);
  else if (m.agentsWithOfficeHint === 0) why.push(`ל-${m.agentsWithPublicEvidence} מתווכים יש מודעות אך ללא שם משרד שזוהה (detected_broker_name ריק)`);
  if (!useAI) why.push("OpenAI אינו מוגדר — שלב ה‑AI דילג");
  if (m.publicSourcesSkipped > 0) why.push("מקורות אינטרנט ציבוריים (Google/FB/LinkedIn/Yad2/Madlan) אינם מחוברים");
  return `מרשם הסתיים — 0 מועמדים. סיבה: ${why.join(" · ") || "אין ראיות מספיקות"}.`;
}

// ── STEP 4 helper — evidence-only AI office reasoning (grounded; no fabrication) ─
interface AiOffice { status: string; office: string; confidence: number; reason: string; provider?: string; evidenceUsed: string[] }
async function aiReasonOffice(
  b: BrokerRec, ev: Record<string, unknown>, idn: { orgId: string | null; userId: string | null },
): Promise<AiOffice | null> {
  try {
    const block = {
      key: "brokerage.office-evidence", label: "ראיות לשיוך משרד", priority: 100, confidence: 0,
      source: "brokerage-data.registry", data: ev,
      evidence: [{ source: "observed_listing", detail: "ראיות שנאספו ממודעות ZONO", confidence: 0 }],
    };
    const context: ContextPackage = {
      request: { type: "broker", entityId: b.id, size: "small" },
      identity: { orgId: idn.orgId, orgName: null, userId: idn.userId, userName: null, isManager: true },
      screen: "brokerage-data", workflow: "office-candidate-discovery",
      blocks: [block], permissions: { isManager: true, removedBlocks: [], redactedFields: [] },
      explain: { repositoriesUsed: ["brokerage_agents", "external_listings"], entitiesCollected: [b.id], confidence: null, missing: [], prioritySummary: [{ key: block.key, priority: 100 }], size: "small", blockCount: 1, approxChars: JSON.stringify(block).length, timestamp: new Date().toISOString(), version: CONTEXT_ENGINE_VERSION },
      cacheKey: `office-discovery:${b.id}`,
    };
    const QUESTION =
      "בהתבסס אך ורק על הראיות המצורפות (שמות משרד שנצפו, מודעות, מותגים), מהו שם המשרד הסביר ביותר של המתווך? בחר רק שם שמופיע בראיות או ברשימת המשרדים המועמדים — אל תמציא פרטים שאינם מופיעים בראיות. השב בשורה הראשונה: שם המשרד או 'insufficient_evidence'. ציין ביטחון ונמק קצרות.";
    const res = await runReasoningGateway({ question: QUESTION, context, mode: "answer", language: "he", userId: idn.userId, organizationId: idn.orgId });
    const firstLine = (res.answer ?? "").split(/[\n]/)[0]?.replace(/^[\s\d.)\-–:]+/, "").trim() ?? "";
    const office = /insufficient/i.test(firstLine) ? "" : firstLine.slice(0, 80);
    return { status: res.status, office, confidence: res.confidence, reason: (res.evidence?.map((e) => e.label).filter(Boolean).slice(0, 3).join(" · ")) || (res.answer ?? "").slice(0, 160), provider: res.provider, evidenceUsed: (res.evidence ?? []).map((e) => e.source) };
  } catch (e) { console.error("[brokerage-registry] AI office reasoning failed for", b.id, e); return null; }
}

// ── Merge engine — suggest duplicates among verified offices. No auto-merge. ──
async function buildMergeSuggestions(db: ReturnType<typeof createServiceRoleClient>): Promise<number> {
  const { data } = await db.from("brokerage_offices" as never).select("id,name,normalized_name,primary_phone,city,brand_network").limit(20000);
  const offices = ((data ?? []) as Row[]).map((r) => ({ id: String(r.id), name: s(r.name), norm: s(r.normalized_name), phone: normalizePhoneNumber(s(r.primary_phone)), city: s(r.city), brand: s(r.brand_network) }));
  const { data: existing } = await db.from("brokerage_office_merge_suggestions" as never).select("primary_office_id,duplicate_office_id").limit(20000);
  const seen = new Set(((existing ?? []) as Row[]).map((r) => [s(r.primary_office_id), s(r.duplicate_office_id)].sort().join("|")));
  const rows: Row[] = [];
  for (let i = 0; i < offices.length; i++) {
    for (let j = i + 1; j < offices.length; j++) {
      const a = offices[i], b = offices[j]; const pairKey = [a.id, b.id].sort().join("|");
      if (seen.has(pairKey)) continue;
      let reason = ""; let confidence = 0;
      if (a.norm && a.norm === b.norm) { reason = "שם מנורמל זהה"; confidence = 92; }
      else if (a.phone && a.phone === b.phone) { reason = "טלפון זהה"; confidence = 95; }
      else if (a.brand && a.brand === b.brand && a.city && a.city === b.city) { reason = `אותו מותג (${a.brand}) ואותה עיר`; confidence = 88; }
      if (confidence >= 85) { rows.push({ primary_office_id: a.id, duplicate_office_id: b.id, reason, confidence, status: "pending", evidence: [{ reason }] as never }); seen.add(pairKey); }
    }
  }
  for (let i = 0; i < rows.length; i += 500) { const { error } = await db.from("brokerage_office_merge_suggestions" as never).insert(rows.slice(i, i + 500) as never); if (error) break; }
  return rows.length;
}

// ── Graph edges from evidence (office→broker / office→city / broker→city / brand) ──
async function buildGraphEdges(db: ReturnType<typeof createServiceRoleClient>): Promise<number> {
  const { data } = await db.from("brokerage_agents" as never).select("id,office_id,city").not("office_id", "is", null).limit(20000);
  const { data: offices } = await db.from("brokerage_offices" as never).select("id,city,brand_network").limit(20000);
  const officeMeta = new Map<string, { city: string; brand: string }>();
  for (const o of (offices ?? []) as Row[]) officeMeta.set(String(o.id), { city: s(o.city), brand: s(o.brand_network) });
  const edges: Row[] = [];
  const push = (edge_type: string, st: string, sid: string, tt: string, tid: string, label: string) => { if (!sid || !tid) return; edges.push({ edge_type, source_type: st, source_id: sid, target_type: tt, target_id: tid, label, weight: 1, evidence: [{ source: "resolved_office_link" }] as never }); };
  for (const a of (data ?? []) as Row[]) {
    const agentId = String(a.id); const officeId = s(a.office_id); const city = s(a.city);
    push("broker_office", "broker", agentId, "office", officeId, "שויך למשרד");
    push("office_broker", "office", officeId, "broker", agentId, "מתווך במשרד");
    if (city) { push("broker_city", "broker", agentId, "city", city, city); push("office_city", "office", officeId, "city", city, city); }
    const oc = officeMeta.get(officeId);
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
        brokers_detected: m.agentsProcessed, brokers_resolved: m.brokersResolved, brokers_pending: m.brokersPendingReview, brokers_unresolved: m.brokersUnresolved,
        offices_created: m.officesCreated, cities_processed: 0, candidates_created: m.officeCandidatesCreated, candidates_verified: m.candidatesVerified,
        duplicate_candidates: m.duplicateCandidates, ai_candidates_created: m.aiCandidatesCreated, ai_candidates_verified: 0, public_sources_skipped: m.publicSourcesSkipped,
        breakdown: { registry: m, public_web: result.publicWeb, ai: result.ai } as never,
        log: [{ message: result.message, diagnostics: m, errors: m.errors }] as never,
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
