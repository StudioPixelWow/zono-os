// ============================================================================
// 🛰️ National Brokerage Discovery Engine™ (Phase 26.10, server-only).
// ----------------------------------------------------------------------------
// Builds the real brokerage-office graph from EVIDENCE across independent tiers:
//   Tier 1 — observed listing evidence (links → external_listings: publisher,
//            broker name, phone, email, source).
//   Tier 2 — shared-contact evidence (shared phone / email / domain clusters).
//   Tier 3 — public-web evidence (Google Business / websites / FB / Yad2 / Madlan)
//            — PROVIDER STUB: skipped unless configured. Never fabricated.
//   Tier 4 — AI reasoning evidence (via the existing AI Reasoning Gateway only).
//            The model receives ONLY structured evidence; it may NEVER invent an
//            office id/name/phone/website. Evidence-free / low-confidence output
//            is recorded as insufficient_evidence and ignored for linking.
//
// Deterministic office CREATION + linking is delegated to the existing
// resolveBrokerOfficesForOrg (phone clusters + existing-office match) so this
// engine never duplicates or weakens that logic. On top of it the engine:
//   • persists EVERY evidence item (brokerage_office_evidence) with provenance,
//   • writes broker resolution provenance (method / confidence / sources /
//     explanation) WITHOUT overwriting a stronger prior resolution,
//   • runs the gated AI tier over the gathered evidence for borderline brokers,
//   • records a discovery run with the full breakdown.
// No office is ever fabricated. Additive & safe.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { brokerageRepository } from "./repository";
import { resolveBrokerOfficesForOrg } from "./office-resolution";
import { normalizeHebrewName, normalizePhoneNumber } from "./normalize";
import { getOfficeDiscoveryReadiness } from "./office-evidence";
import { runReasoningGateway } from "@/lib/ai-reasoning/gateway";
import { selectProvider } from "@/lib/ai-reasoning/gateway";
import { CONTEXT_ENGINE_VERSION, type ContextPackage } from "@/lib/context-engine/types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : 0; };
const emailDomain = (email: string): string => { const m = email.toLowerCase().trim().match(/@([a-z0-9.-]+)$/); return m ? m[1] : ""; };

export interface DiscoveryEvidenceBreakdown {
  observed_listing: number;
  shared_contact: number;
  public_web: number;
  ai_reasoning: number;
}

export interface BrokerageDiscoveryResult {
  ok: boolean;
  runId: string | null;
  status: "completed" | "partial" | "failed";
  brokersDetected: number;
  officesCreated: number;
  officesMatched: number;       // brokers linked to a pre-existing office
  brokersResolved: number;      // brokers with office_id set
  brokersPending: number;       // brokers in a pending office match
  brokersUnresolved: number;
  evidencePersisted: number;
  evidenceBreakdown: DiscoveryEvidenceBreakdown;
  aiContribution: { enabled: boolean; reason: string | null; calls: number; answered: number; insufficient: number; resolvedByAI: number };
  publicWeb: { enabled: boolean; skippedReason: string | null };
  skippedReason: string | null;
  message: string;
}

interface BrokerRec {
  id: string; fullName: string; normalizedName: string | null;
  primaryPhone: string | null; primaryEmail: string | null; city: string | null;
  officeId: string | null; resolutionConfidence: number | null;
}
interface OfficeRec { id: string; name: string; normalizedName: string | null; primaryPhone: string | null; city: string | null; createdThisRun: boolean }
interface EvidenceInsert {
  agent_id: string; office_id: string | null; tier: string; source: string; provider: string | null;
  confidence: number; claim: string; reason: string | null; supporting_sources: string[]; metadata: Row;
}

const LINK_THRESHOLD = 90;   // ≥ → set office_id with provenance
const AI_THRESHOLD = 90;     // ≥ AI confidence to accept an AI office confirmation

/**
 * Run the national discovery pass. `useAI` defaults to whether an AI provider is
 * configured; `aiCap` bounds AI calls per run (cost/latency safety). Best-effort
 * and no-throw at the top level — always finalizes the run row.
 */
export async function runNationalBrokerageDiscovery(
  orgId: string, userId: string | null, opts: { useAI?: boolean; aiCap?: number } = {},
): Promise<BrokerageDiscoveryResult> {
  const db = createServiceRoleClient();
  const aiCap = Math.max(0, Math.min(opts.aiCap ?? 12, 40));
  const readiness = getOfficeDiscoveryReadiness();
  const aiReady = !!selectProvider();
  const useAI = (opts.useAI ?? aiReady) && aiReady && aiCap > 0;
  const publicSearch = readiness.providers.find((p) => p.id === "public_search");

  const out: BrokerageDiscoveryResult = {
    ok: false, runId: null, status: "failed",
    brokersDetected: 0, officesCreated: 0, officesMatched: 0,
    brokersResolved: 0, brokersPending: 0, brokersUnresolved: 0,
    evidencePersisted: 0,
    evidenceBreakdown: { observed_listing: 0, shared_contact: 0, public_web: 0, ai_reasoning: 0 },
    aiContribution: { enabled: useAI, reason: useAI ? null : (aiReady ? "ai_capped" : "openai_not_configured"), calls: 0, answered: 0, insufficient: 0, resolvedByAI: 0 },
    publicWeb: { enabled: !!publicSearch?.enabled, skippedReason: publicSearch?.skippedReason ?? null },
    skippedReason: null, message: "",
  };

  // 0) Open a run row.
  const { data: ins } = await db.from("brokerage_office_discovery_runs" as never)
    .insert({ organization_id: orgId, requested_by: userId, status: "running", started_at: new Date().toISOString() } as never)
    .select("id").maybeSingle();
  const runId = (ins as { id?: string } | null)?.id ?? null;
  out.runId = runId;

  try {
    // Offices that existed BEFORE this run (to label "matched existing" vs "created").
    const officesBefore = await brokerageRepository.candidateOfficesByCities([]);
    const beforeIds = new Set(officesBefore.map((o) => o.id));

    // 1) Deterministic office creation + linking (existing engine — reused as-is).
    const det = await resolveBrokerOfficesForOrg(orgId);

    // 2) Reload the now-current graph.
    const { data: agentRows } = await db.from("brokerage_agents" as never)
      .select("id,full_name,normalized_name,primary_phone,whatsapp_phone,primary_email,city,office_id,resolution_confidence").limit(20000);
    const brokers: BrokerRec[] = ((agentRows ?? []) as Row[]).map((r) => ({
      id: String(r.id), fullName: s(r.full_name), normalizedName: s(r.normalized_name) || null,
      primaryPhone: s(r.primary_phone) || s(r.whatsapp_phone) || null, primaryEmail: s(r.primary_email) || null,
      city: s(r.city) || null, officeId: s(r.office_id) || null,
      resolutionConfidence: r.resolution_confidence == null ? null : num(r.resolution_confidence),
    }));
    out.brokersDetected = brokers.length;
    if (!brokers.length) {
      out.skippedReason = "no brokers to discover — run a brokerage scan first";
      return await finalize(db, out, runId, "completed");
    }

    const { data: officeRows } = await db.from("brokerage_offices" as never).select("id,name,normalized_name,primary_phone,city").limit(20000);
    const offices: OfficeRec[] = ((officeRows ?? []) as Row[]).map((r) => ({
      id: String(r.id), name: s(r.name), normalizedName: s(r.normalized_name) || null,
      primaryPhone: s(r.primary_phone) || null, city: s(r.city) || null, createdThisRun: !beforeIds.has(String(r.id)),
    }));
    const officeById = new Map(offices.map((o) => [o.id, o]));
    out.officesCreated = offices.filter((o) => o.createdThisRun).length;

    // 3) Tier 1 — observed listing evidence (links → external_listings), bulk.
    const { data: linkRows } = await db.from("brokerage_external_listing_links" as never)
      .select("agent_id,external_listing_id,matched_phone,matched_source,city").not("agent_id", "is", null).limit(50000);
    const listingIdsByAgent = new Map<string, Set<string>>();
    const sourcesByAgent = new Map<string, Set<string>>();
    const citiesByAgent = new Map<string, Set<string>>();
    const allListingIds = new Set<string>();
    for (const r of (linkRows ?? []) as Row[]) {
      const aId = s(r.agent_id); if (!aId) continue;
      const lId = s(r.external_listing_id);
      if (lId) { (listingIdsByAgent.get(aId) ?? listingIdsByAgent.set(aId, new Set()).get(aId)!).add(lId); allListingIds.add(lId); }
      const src = s(r.matched_source); if (src) (sourcesByAgent.get(aId) ?? sourcesByAgent.set(aId, new Set()).get(aId)!).add(src);
      const city = s(r.city); if (city) (citiesByAgent.get(aId) ?? citiesByAgent.set(aId, new Set()).get(aId)!).add(city);
    }

    // 4) Tier 2 — shared-contact clusters (phone / email / domain) across brokers.
    const namesByPhone = new Map<string, Set<string>>();
    const namesByEmail = new Map<string, Set<string>>();
    const namesByDomain = new Map<string, Set<string>>();
    for (const b of brokers) {
      const nm = b.normalizedName || normalizeHebrewName(b.fullName);
      const np = normalizePhoneNumber(b.primaryPhone ?? "");
      if (np && nm) (namesByPhone.get(np) ?? namesByPhone.set(np, new Set()).get(np)!).add(nm);
      if (b.primaryEmail && nm) {
        const e = b.primaryEmail.toLowerCase().trim();
        (namesByEmail.get(e) ?? namesByEmail.set(e, new Set()).get(e)!).add(nm);
        const dom = emailDomain(b.primaryEmail);
        if (dom) (namesByDomain.get(dom) ?? namesByDomain.set(dom, new Set()).get(dom)!).add(nm);
      }
    }

    // 5) Build + persist evidence and provenance per broker.
    const evidenceInserts: EvidenceInsert[] = [];
    const provenanceUpdates: { id: string; method: string; confidence: number; sources: string[]; explanation: string; officeId: string | null }[] = [];
    const aiCandidates: BrokerRec[] = [];

    for (const b of brokers) {
      const listingCount = listingIdsByAgent.get(b.id)?.size ?? 0;
      const sources = Array.from(sourcesByAgent.get(b.id) ?? []);
      const sourceLabels: string[] = [];

      // Tier 1 — observed listing evidence.
      if (listingCount > 0) {
        sourceLabels.push("observed_listing");
        evidenceInserts.push({
          agent_id: b.id, office_id: b.officeId, tier: "observed_listing", source: "external_listing", provider: null,
          confidence: Math.min(60, 30 + listingCount * 3),
          claim: `מתווך מפרסם ${listingCount} מודעות${sources.length ? ` (${sources.slice(0, 3).join(", ")})` : ""}`,
          reason: "נגזר ממודעות חיצוניות שכבר נסרקו (מקור ציבורי)",
          supporting_sources: [`links:${listingCount}`, ...sources.slice(0, 3).map((x) => `source:${x}`)],
          metadata: { listing_count: listingCount },
        });
      }

      // Tier 2 — shared phone / email / domain.
      const phoneNorm = normalizePhoneNumber(b.primaryPhone ?? "");
      const phonePeers = phoneNorm ? (namesByPhone.get(phoneNorm)?.size ?? 0) : 0;
      if (phonePeers >= 2 && b.primaryPhone) {
        sourceLabels.push("shared_phone");
        evidenceInserts.push({
          agent_id: b.id, office_id: b.officeId, tier: "shared_contact", source: "shared_phone", provider: null,
          confidence: phonePeers >= 4 ? 90 : phonePeers === 3 ? 82 : 74,
          claim: `קו טלפון משותף ל-${phonePeers} מתווכים — סימן למשרד`,
          reason: "מספר מתווכים מפרסמים מאותו קו טלפון", supporting_sources: [`phone:${b.primaryPhone}`, `distinct_brokers:${phonePeers}`],
          metadata: { peers: phonePeers },
        });
      }
      const dom = b.primaryEmail ? emailDomain(b.primaryEmail) : "";
      const domainPeers = dom ? (namesByDomain.get(dom)?.size ?? 0) : 0;
      if (domainPeers >= 2 && dom && !/(gmail|walla|hotmail|outlook|yahoo|icloud|live)\./.test(dom)) {
        sourceLabels.push("shared_domain");
        evidenceInserts.push({
          agent_id: b.id, office_id: b.officeId, tier: "shared_contact", source: "shared_domain", provider: null,
          confidence: domainPeers >= 3 ? 80 : 70,
          claim: `דומיין אימייל משותף (${dom}) ל-${domainPeers} מתווכים`,
          reason: "מתווכים חולקים דומיין עסקי — סימן למשרד", supporting_sources: [`domain:${dom}`, `distinct_brokers:${domainPeers}`],
          metadata: { peers: domainPeers },
        });
      }

      // Provenance — only when an office was assigned (by the deterministic pass).
      if (b.officeId) {
        const office = officeById.get(b.officeId);
        const fromCluster = office?.createdThisRun === true;
        const method = fromCluster ? (phonePeers >= 2 ? "shared_phone_cluster" : "shared_contact") : "existing_office_match";
        const confidence = fromCluster ? (phonePeers >= 4 ? 96 : phonePeers === 3 ? 88 : 80) : 95;
        const usedSources = Array.from(new Set(sourceLabels.length ? sourceLabels : ["observed_listing"]));
        const explanation = fromCluster
          ? `שויך למשרד "${office?.name ?? ""}" על בסיס ${phonePeers >= 2 ? `קו טלפון משותף ל-${phonePeers} מתווכים` : "ראיות קשר משותפות"}.`
          : `הותאם למשרד קיים "${office?.name ?? ""}" לפי טלפון/שם/עיר.`;
        provenanceUpdates.push({ id: b.id, method, confidence, sources: usedSources, explanation, officeId: b.officeId });
      } else if (sourceLabels.length && useAI) {
        // Unresolved but has evidence → candidate for the AI tier.
        aiCandidates.push(b);
      }
    }

    // 6) Tier 4 — AI reasoning (gated, evidence-only, capped). Never invents an office.
    if (useAI && aiCandidates.length) {
      const candidateOffices = offices.map((o) => ({ id: o.id, name: o.name, normalizedName: o.normalizedName }));
      for (const b of aiCandidates.slice(0, aiCap)) {
        out.aiContribution.calls++;
        const ev = evidenceInserts.filter((e) => e.agent_id === b.id);
        const answer = await askAiForOffice(b, ev, candidateOffices, { orgId, userId });
        if (!answer || answer.status !== "answered") {
          out.aiContribution.insufficient++;
          evidenceInserts.push({
            agent_id: b.id, office_id: null, tier: "ai_reasoning", source: "openai_reasoning", provider: answer?.provider ?? null,
            confidence: answer?.confidence ?? 0, claim: "insufficient_evidence",
            reason: answer?.limitations?.[0] ?? "אין ראיות מספיקות לשיוך משרד", supporting_sources: ev.map((e) => e.source),
            metadata: { ai_status: answer?.status ?? "no_provider" },
          });
          continue;
        }
        out.aiContribution.answered++;
        // Match the AI's conclusion to an EXISTING candidate office (never invent).
        const norm = normalizeHebrewName(answer.answer);
        const matched = candidateOffices.find((o) => o.normalizedName && norm.includes(o.normalizedName)) ||
          candidateOffices.find((o) => o.name && answer.answer.includes(o.name));
        const accepts = matched && answer.confidence >= AI_THRESHOLD;
        evidenceInserts.push({
          agent_id: b.id, office_id: accepts ? matched!.id : null, tier: "ai_reasoning", source: "openai_reasoning", provider: answer.provider ?? null,
          confidence: answer.confidence,
          claim: accepts ? `המתווך משויך למשרד "${matched!.name}"` : answer.answer.slice(0, 240),
          reason: (answer.evidence?.map((e) => e.label).filter(Boolean).slice(0, 3).join(" · ")) || "הסקה על בסיס הראיות שנמסרו",
          supporting_sources: ev.map((e) => e.source),
          metadata: { ai_confidence: answer.confidence, matched_office: accepts ? matched!.id : null },
        });
        if (accepts) {
          out.aiContribution.resolvedByAI++;
          provenanceUpdates.push({
            id: b.id, method: "ai_reasoning", confidence: answer.confidence,
            sources: Array.from(new Set([...ev.map((e) => e.source), "openai_reasoning"])),
            explanation: `הסקת AI (${answer.provider ?? "model"}, ${answer.confidence}%): ${answer.answer.slice(0, 200)}`,
            officeId: matched!.id,
          });
        }
      }
    }

    // 7) Persist evidence (batched).
    for (let i = 0; i < evidenceInserts.length; i += 500) {
      const chunk = evidenceInserts.slice(i, i + 500).map((e) => ({
        agent_id: e.agent_id, office_id: e.office_id, tier: e.tier, source: e.source, provider: e.provider,
        confidence: e.confidence, claim: e.claim, reason: e.reason, supporting_sources: e.supporting_sources as never, metadata: e.metadata as never,
      }));
      const { error } = await db.from("brokerage_office_evidence" as never).insert(chunk as never);
      if (!error) {
        out.evidencePersisted += chunk.length;
        for (const e of evidenceInserts.slice(i, i + 500)) {
          const t = e.tier as keyof DiscoveryEvidenceBreakdown;
          if (t in out.evidenceBreakdown) out.evidenceBreakdown[t]++;
        }
      } else if (!out.skippedReason) {
        out.skippedReason = `evidence insert failed: ${error.message}`;
      }
    }

    // 8) Write provenance — NEVER overwrite a stronger prior resolution.
    for (const p of provenanceUpdates) {
      const broker = brokers.find((x) => x.id === p.id);
      if (broker?.resolutionConfidence != null && broker.resolutionConfidence > p.confidence) continue;
      // Only set office_id when above the link threshold AND an office is present
      // (AI may resolve a previously-unlinked broker to an EXISTING office).
      const patch: Row = {
        resolution_method: p.method, resolution_confidence: p.confidence,
        resolution_sources: p.sources as never, resolution_explanation: p.explanation,
        resolved_at: new Date().toISOString(),
      };
      if (p.officeId && p.confidence >= LINK_THRESHOLD) patch.office_id = p.officeId;
      await db.from("brokerage_agents" as never).update(patch as never).eq("id", p.id);
    }

    // 9) Final counts (live truth).
    const headCount = async (build?: (q: ReturnType<typeof db.from>) => unknown): Promise<number> => {
      let q = db.from("brokerage_agents" as never).select("id", { count: "exact", head: true });
      if (build) q = build(q as never) as never;
      const { count } = await q; return count ?? 0;
    };
    out.brokersResolved = await headCount((q) => (q as never as { not: (c: string, op: string, v: null) => unknown }).not("office_id", "is", null));
    out.officesMatched = provenanceUpdates.filter((p) => p.method === "existing_office_match").length;
    const { count: pendingCount } = await db.from("brokerage_identity_matches" as never)
      .select("source_entity_id", { count: "exact", head: true }).eq("match_type", "agent_to_office").eq("status", "pending_review");
    out.brokersPending = pendingCount ?? det.brokersPendingReview;
    out.brokersUnresolved = Math.max(0, out.brokersDetected - out.brokersResolved - out.brokersPending);

    out.message = out.brokersResolved > 0
      ? `גילוי הסתיים ✓ — ${out.officesCreated} משרדים נוצרו · ${out.brokersResolved} מתווכים שויכו · ${out.evidencePersisted} פריטי ראיה נשמרו${out.aiContribution.resolvedByAI ? ` · ${out.aiContribution.resolvedByAI} שויכו בעזרת AI` : ""}.`
      : `גילוי הסתיים — אין עדיין ראיות מספיקות ליצירת משרדים. ${out.evidencePersisted} פריטי ראיה נשמרו. ${det.skippedReason ?? ""}`.trim();
    if (!out.skippedReason && det.skippedReason) out.skippedReason = det.skippedReason;
    return await finalize(db, out, runId, out.skippedReason && out.brokersResolved === 0 && out.evidencePersisted === 0 ? "partial" : "completed");
  } catch (e) {
    console.error("[brokerage-discovery] failed:", e);
    out.skippedReason = e instanceof Error ? e.message : String(e);
    return await finalize(db, out, runId, "failed");
  }
}

async function finalize(
  db: ReturnType<typeof createServiceRoleClient>, out: BrokerageDiscoveryResult, runId: string | null,
  status: "completed" | "partial" | "failed",
): Promise<BrokerageDiscoveryResult> {
  out.status = status;
  out.ok = status !== "failed";
  if (runId) {
    try {
      await db.from("brokerage_office_discovery_runs" as never).update({
        status, finished_at: new Date().toISOString(),
        brokers_detected: out.brokersDetected, offices_created: out.officesCreated, offices_matched: out.officesMatched,
        brokers_resolved: out.brokersResolved, brokers_pending: out.brokersPending, brokers_unresolved: out.brokersUnresolved,
        evidence_persisted: out.evidencePersisted, ai_calls: out.aiContribution.calls, ai_resolved: out.aiContribution.resolvedByAI,
        breakdown: {
          evidence: out.evidenceBreakdown, ai: out.aiContribution, public_web: out.publicWeb,
          offices_created: out.officesCreated, offices_matched: out.officesMatched,
          brokers_resolved: out.brokersResolved, brokers_pending: out.brokersPending, brokers_unresolved: out.brokersUnresolved,
        } as never,
        log: [{ skipped_reason: out.skippedReason, message: out.message }] as never,
      } as never).eq("id", runId);
    } catch { /* run log best-effort */ }
  }
  return out;
}

// ── AI tier helper — evidence-only ContextPackage → gateway. ─────────────────
interface AiOfficeAnswer { status: string; answer: string; confidence: number; provider?: string; evidence?: { label: string }[]; limitations?: string[] }

async function askAiForOffice(
  b: BrokerRec, ev: EvidenceInsert[], candidateOffices: { id: string; name: string; normalizedName: string | null }[],
  idn: { orgId: string | null; userId: string | null },
): Promise<AiOfficeAnswer | null> {
  try {
    const block = {
      key: "brokerage.discovery-evidence", label: "ראיות לשיוך משרד", priority: 100, confidence: 0,
      source: "brokerage-data.discovery",
      data: {
        broker: { id: b.id, name: b.fullName, city: b.city, phone: b.primaryPhone, email: b.primaryEmail },
        evidence: ev.map((e) => ({ tier: e.tier, source: e.source, confidence: e.confidence, claim: e.claim, reason: e.reason })),
        candidateOffices: candidateOffices.map((o) => ({ id: o.id, name: o.name })),
      },
      evidence: ev.map((e) => ({ source: e.source, detail: e.claim, confidence: e.confidence })),
    };
    const context: ContextPackage = {
      request: { type: "broker", entityId: b.id, size: "medium" },
      identity: { orgId: idn.orgId, orgName: null, userId: idn.userId, userName: null, isManager: true },
      screen: "brokerage-data", workflow: "national-office-discovery",
      blocks: [block],
      permissions: { isManager: true, removedBlocks: [], redactedFields: [] },
      explain: {
        repositoriesUsed: ["brokerage_agents", "brokerage_external_listing_links", "external_listings", "brokerage_offices"],
        entitiesCollected: [b.id], confidence: null, missing: [],
        prioritySummary: [{ key: block.key, priority: 100 }],
        size: "medium", blockCount: 1, approxChars: JSON.stringify(block).length, timestamp: new Date().toISOString(), version: CONTEXT_ENGINE_VERSION,
      },
      cacheKey: `discovery-office:${b.id}`,
    };
    const QUESTION =
      "בהתבסס אך ורק על הראיות והמשרדים המועמדים המצורפים, לאיזה משרד שייך המתווך? בחר רק מתוך רשימת המשרדים המועמדים — אל תמציא שם או מזהה שאינם מופיעים בראיות. ציין רמת ביטחון ונמק. אם אין ראיה מספקת החזר insufficient_evidence.";
    const res = await runReasoningGateway({ question: QUESTION, context, mode: "answer", language: "he", userId: idn.userId, organizationId: idn.orgId });
    return { status: res.status, answer: res.answer, confidence: res.confidence, provider: res.provider, evidence: res.evidence, limitations: res.limitations };
  } catch (e) {
    console.error("[brokerage-discovery] AI tier failed for broker", b.id, e);
    return null;
  }
}
