// ============================================================================
// 🧬 Broker Identity Resolution Engine™ (Phase 26.12, server-only).
// For every broker: build the identity package (STEP 1), gather public evidence
// (STEP 2 — providers, currently skipped), reason with AI over the evidence only
// (STEP 3), score deterministically (STEP 4), and persist a fully explainable
// resolution (STEP 5). STEP 7: a detected_broker_name that EQUALS the broker's
// own name is NEVER office evidence. Never invents an office; never overwrites a
// stronger prior resolution; resolves only to EXISTING offices (creation stays in
// the registry, also self-name-guarded).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeHebrewName, normalizePhoneNumber } from "../normalize";
import { runReasoningGateway, selectProvider } from "@/lib/ai-reasoning/gateway";
import { CONTEXT_ENGINE_VERSION, type ContextPackage } from "@/lib/context-engine/types";
import { SOURCE_WEIGHTS, scoreCandidates, resolveFromCandidates } from "./scoring";
import { gatherPublicBrokerEvidence } from "./providers";
import type { BrokerIdentityPackage, IdentityEvidence, IdentityListing, BrokerResolution } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const emailDomain = (e: string): string => { const m = e.toLowerCase().trim().match(/@([a-z0-9.-]+)$/); return m ? m[1] : ""; };
const urlDomain = (u: string): string => { const m = u.toLowerCase().match(/^https?:\/\/([^/]+)/); return m ? m[1].replace(/^www\./, "") : ""; };
const FREE_MAIL = /(gmail|walla|hotmail|outlook|yahoo|icloud|live|nana|012)\./;
const mostCommon = (xs: string[]): string | null => { const f = new Map<string, number>(); for (const x of xs) if (x) f.set(x, (f.get(x) ?? 0) + 1); return [...f.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };

export interface IdentityRunResult { processed: number; resolved: number; needsReview: number; conflicting: number; insufficient: number; aiRequests: number; errors: string[] }

/** Build the observed Broker Identity Package for one broker (STEP 1 + STEP 7). */
export async function buildBrokerIdentityPackage(agentId: string): Promise<BrokerIdentityPackage | null> {
  const db = createServiceRoleClient();
  const { data: agent } = await db.from("brokerage_agents" as never)
    .select("id,full_name,normalized_name,primary_phone,whatsapp_phone,primary_email,city").eq("id", agentId).maybeSingle();
  if (!agent) return null;
  const a = agent as Row;
  const fullName = s(a.full_name);
  const normalizedName = s(a.normalized_name) || normalizeHebrewName(fullName);
  const phones = Array.from(new Set([s(a.primary_phone), s(a.whatsapp_phone)].filter(Boolean)));
  const emails = Array.from(new Set([s(a.primary_email)].filter(Boolean)));

  // Linked listings.
  const { data: links } = await db.from("brokerage_external_listing_links" as never).select("external_listing_id").eq("agent_id", agentId).limit(500);
  const ids = Array.from(new Set(((links ?? []) as Row[]).map((r) => s(r.external_listing_id)).filter(Boolean)));
  const listings: IdentityListing[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("external_listings" as never)
      .select("id,contact_name,contact_type,detected_broker_name,city,neighborhood,source,listing_url").in("id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as Row[]) listings.push({
      id: s(r.id), contactName: s(r.contact_name) || null, detectedBrokerName: s(r.detected_broker_name) || null,
      contactType: s(r.contact_type) || null, city: s(r.city) || null, neighborhood: s(r.neighborhood) || null,
      source: s(r.source) || null, domain: urlDomain(s(r.listing_url)) || null,
    });
  }

  // STEP 7 — detected_broker_name that equals the broker's OWN name is not office evidence.
  const selfNameHits = Array.from(new Set(listings
    .map((l) => l.detectedBrokerName).filter((n): n is string => !!n)
    .filter((n) => normalizeHebrewName(n) === normalizedName)));

  // Shared-contact peers.
  const np = phones.map((p) => normalizePhoneNumber(p)).find(Boolean) || "";
  let sharedPhoneBrokerNames: string[] = [];
  if (np) {
    const { data: peers } = await db.from("brokerage_agents" as never).select("id,full_name,primary_phone").eq("primary_phone", phones[0]).limit(50);
    sharedPhoneBrokerNames = Array.from(new Set(((peers ?? []) as Row[])
      .filter((p) => s(p.id) !== agentId && normalizePhoneNumber(s(p.primary_phone)) === np)
      .map((p) => normalizeHebrewName(s(p.full_name))).filter((n) => n && n !== normalizedName)));
  }
  const dom = emails.map((e) => emailDomain(e)).find((d) => d && !FREE_MAIL.test(d)) || "";
  let sharedDomainBrokerNames: string[] = [];
  if (dom) {
    const { data: peers } = await db.from("brokerage_agents" as never).select("id,full_name,primary_email").ilike("primary_email", `%@${dom}`).limit(50);
    sharedDomainBrokerNames = Array.from(new Set(((peers ?? []) as Row[]).filter((p) => s(p.id) !== agentId).map((p) => normalizeHebrewName(s(p.full_name))).filter(Boolean)));
  }

  return {
    agentId, fullName, normalizedName, phones, emails, city: s(a.city) || null,
    neighborhoods: Array.from(new Set(listings.map((l) => l.neighborhood).filter((x): x is string => !!x))),
    domains: Array.from(new Set([...listings.map((l) => l.domain).filter((x): x is string => !!x), ...(dom ? [dom] : [])])),
    listings, sharedPhoneBrokerNames, sharedDomainBrokerNames, selfNameHits,
  };
}

/** Observed evidence from the package (STEP 1 → scored items), STEP 7 applied. */
function observedEvidence(pkg: BrokerIdentityPackage): IdentityEvidence[] {
  const out: IdentityEvidence[] = [];
  // Observed office name from listings — EXCLUDING self-name hits.
  const officeNames = pkg.listings.map((l) => l.detectedBrokerName).filter((n): n is string => !!n)
    .filter((n) => normalizeHebrewName(n) !== pkg.normalizedName);
  const topName = mostCommon(officeNames);
  if (topName) {
    const count = officeNames.filter((n) => normalizeHebrewName(n) === normalizeHebrewName(topName)).length;
    out.push({ source: "observed_listing", officeName: topName, url: null, confidence: Math.min(85, 60 + count * 5), weight: SOURCE_WEIGHTS.observed_listing,
      reason: `שם משרד שנצפה ב-${count} מודעות (אינו שם המתווך)`, observedText: topName });
  }
  // Shared-phone cluster — an office signal; name only if a non-self name exists.
  if (pkg.sharedPhoneBrokerNames.length >= 1) {
    const name = topName ?? null;
    out.push({ source: "shared_phone", officeName: name, url: null, confidence: pkg.sharedPhoneBrokerNames.length >= 3 ? 80 : 70, weight: SOURCE_WEIGHTS.shared_phone,
      reason: `קו טלפון משותף ל-${pkg.sharedPhoneBrokerNames.length + 1} מתווכים`, observedText: pkg.phones[0] ?? null });
  }
  if (pkg.sharedDomainBrokerNames.length >= 1 && pkg.domains.length) {
    out.push({ source: "shared_domain", officeName: topName ?? null, url: null, confidence: 70, weight: SOURCE_WEIGHTS.shared_domain,
      reason: `דומיין משותף ל-${pkg.sharedDomainBrokerNames.length + 1} מתווכים`, observedText: pkg.domains[0] ?? null });
  }
  return out;
}

/** Resolve ONE broker. Persists the explainable result. Best-effort, no-throw. */
export async function resolveBrokerIdentity(agentId: string, opts: { useAI?: boolean } = {}): Promise<BrokerResolution | null> {
  const db = createServiceRoleClient();
  const pkg = await buildBrokerIdentityPackage(agentId);
  if (!pkg) return null;

  // STEP 2 — public providers (structured; currently all skipped, never fabricated).
  const pub = await gatherPublicBrokerEvidence(pkg);
  // STEP 1 observed.
  const evidence: IdentityEvidence[] = [...observedEvidence(pkg), ...pub.evidence];

  // Existing offices (resolve to EXISTING only; never create here).
  const { data: officeRows } = await db.from("brokerage_offices" as never).select("id,name,normalized_name").limit(20000);
  const officeByNorm = new Map<string, string>();
  for (const o of (officeRows ?? []) as Row[]) officeByNorm.set(s(o.normalized_name) || normalizeHebrewName(s(o.name)), s(o.id));

  // STEP 3 — AI reasoning over the evidence only (grounded; never invents).
  const aiReady = !!selectProvider();
  const useAI = (opts.useAI ?? aiReady) && aiReady;
  let aiReasoning: string | null = null;
  if (useAI && (evidence.some((e) => e.officeName) || pkg.listings.length)) {
    const ai = await reasonIdentity(pkg, evidence, [...officeByNorm.keys()].slice(0, 40));
    aiReasoning = ai?.reasoning ?? null;
    if (ai?.officeName) {
      const n = normalizeHebrewName(ai.officeName);
      const grounded = evidence.some((e) => e.officeName && normalizeHebrewName(e.officeName).includes(n)) || officeByNorm.has(n);
      if (grounded) evidence.push({ source: "ai_reasoning", officeName: ai.officeName, url: null, confidence: ai.confidence, weight: SOURCE_WEIGHTS.ai_reasoning, reason: aiReasoning ?? "הסקת AI על הראיות", observedText: null });
    }
  }

  // STEP 4 — score + select + status.
  const candidates = scoreCandidates(evidence);
  const resolution = resolveFromCandidates(pkg.agentId, pkg.fullName, candidates, evidence, aiReasoning, (nn) => officeByNorm.get(nn) ?? null);
  resolution.providers = pub.providers.map((p) => ({ provider: p.provider, enabled: p.enabled, skippedReason: p.skippedReason }));

  // STEP 5 — persist explainability (upsert one row per broker) + per-source rows.
  await persistResolution(db, resolution);
  return resolution;
}

async function persistResolution(db: ReturnType<typeof createServiceRoleClient>, r: BrokerResolution): Promise<void> {
  const nowIso = new Date().toISOString();
  try {
    const { data: prior } = await db.from("brokerage_broker_identity" as never).select("id,confidence").eq("agent_id", r.agentId).maybeSingle();
    const priorConf = prior ? Number((prior as Row).confidence ?? 0) : -1;
    // Never overwrite a stronger prior resolution.
    if (prior && priorConf > r.confidence) return;
    const payload = {
      agent_id: r.agentId, resolved_office_id: r.resolvedOfficeId, resolved_office_name: r.resolvedOfficeName,
      status: r.status, confidence: r.confidence, why: r.why, ai_reasoning: r.aiReasoning,
      evidence: r.evidence as never, providers: r.providers as never, alternatives: r.alternatives as never, missing_evidence: r.missingEvidence as never,
      resolved_at: r.status === "resolved" ? nowIso : null, updated_at: nowIso,
    };
    if (prior) await db.from("brokerage_broker_identity" as never).update(payload as never).eq("agent_id", r.agentId);
    else await db.from("brokerage_broker_identity" as never).insert(payload as never);

    // Per-source evidence rows (provenance ledger).
    if (r.evidence.length) {
      const rows = r.evidence.map((e) => ({ agent_id: r.agentId, office_id: r.resolvedOfficeId, tier: e.source === "ai_reasoning" ? "ai_reasoning" : "identity", source: e.source, provider: null, confidence: e.confidence, claim: e.officeName ?? "signal", reason: e.reason, supporting_sources: [e.source] as never, metadata: { weight: e.weight, observed: e.observedText } as never }));
      await db.from("brokerage_office_evidence" as never).insert(rows as never);
    }

    // Only when RESOLVED to an EXISTING office do we link the broker (never overwrite stronger).
    if (r.status === "resolved" && r.resolvedOfficeId) {
      const { data: ag } = await db.from("brokerage_agents" as never).select("resolution_confidence,office_id").eq("id", r.agentId).maybeSingle();
      const agConf = ag ? Number((ag as Row).resolution_confidence ?? 0) : 0;
      if (!(ag && agConf > r.confidence)) {
        await db.from("brokerage_agents" as never).update({
          office_id: r.resolvedOfficeId, resolution_method: "broker_identity_engine", resolution_confidence: r.confidence,
          resolution_sources: r.evidence.map((e) => e.source) as never, resolution_explanation: r.why, resolved_at: nowIso,
        } as never).eq("id", r.agentId);
      }
    }
  } catch (e) { console.error("[broker-identity] persist failed", r.agentId, e); }
}

/** Resolve a batch of brokers (capped, resumable — newest unresolved first). */
export async function resolveAllBrokerIdentities(orgId: string, opts: { cap?: number; useAI?: boolean } = {}): Promise<IdentityRunResult> {
  const db = createServiceRoleClient();
  const cap = Math.max(1, Math.min(opts.cap ?? 80, 300));
  const out: IdentityRunResult = { processed: 0, resolved: 0, needsReview: 0, conflicting: 0, insufficient: 0, aiRequests: 0, errors: [] };
  const { data: agents } = await db.from("brokerage_agents" as never).select("id").order("confidence_score", { ascending: false }).limit(cap);
  for (const a of (agents ?? []) as Row[]) {
    try {
      const r = await resolveBrokerIdentity(s(a.id), { useAI: opts.useAI });
      if (!r) continue;
      out.processed++;
      if (r.status === "resolved") out.resolved++;
      else if (r.status === "needs_review") out.needsReview++;
      else if (r.status === "conflicting_evidence") out.conflicting++;
      else out.insufficient++;
    } catch (e) { out.errors.push(e instanceof Error ? e.message : String(e)); }
  }
  return out;
}

/** Read the package + the last persisted resolution for the broker profile UI. */
export async function getBrokerIdentity(agentId: string): Promise<{ pkg: BrokerIdentityPackage | null; stored: BrokerResolution | null }> {
  const db = createServiceRoleClient();
  const pkg = await buildBrokerIdentityPackage(agentId);
  const { data } = await db.from("brokerage_broker_identity" as never)
    .select("resolved_office_id,resolved_office_name,status,confidence,why,ai_reasoning,evidence,providers,alternatives,missing_evidence").eq("agent_id", agentId).maybeSingle();
  let stored: BrokerResolution | null = null;
  if (data) {
    const d = data as Row;
    const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? (v as T[]) : [];
    stored = {
      agentId, fullName: pkg?.fullName ?? "", status: s(d.status) as BrokerResolution["status"],
      resolvedOfficeId: s(d.resolved_office_id) || null, resolvedOfficeName: s(d.resolved_office_name) || null,
      confidence: Number(d.confidence ?? 0), why: s(d.why), aiReasoning: s(d.ai_reasoning) || null,
      evidence: arr<IdentityEvidence>(d.evidence),
      providers: arr<{ provider: IdentityEvidence["source"]; enabled: boolean; skippedReason: string | null }>(d.providers),
      alternatives: arr<{ officeName: string; score: number; rejectedReason: string }>(d.alternatives),
      missingEvidence: arr<string>(d.missing_evidence),
    };
  }
  return { pkg, stored };
}

// ── STEP 3 helper — evidence-only AI (PRIVATE_INTENT-safe prompt). ───────────
interface AiId { officeName: string | null; confidence: number; reasoning: string }
async function reasonIdentity(pkg: BrokerIdentityPackage, evidence: IdentityEvidence[], candidateOfficeNames: string[]): Promise<AiId | null> {
  try {
    const block = {
      key: "broker.identity-evidence", label: "ראיות זהות מתווך", priority: 100, confidence: 0, source: "brokerage-data.broker-identity",
      data: {
        broker: { id: pkg.agentId, name: pkg.fullName, city: pkg.city },
        observedOfficeNames: Array.from(new Set(evidence.map((e) => e.officeName).filter(Boolean))),
        listings: pkg.listings.slice(0, 12).map((l) => ({ detectedBrokerName: l.detectedBrokerName, contactName: l.contactName, source: l.source, city: l.city })),
        sharedColleagues: pkg.sharedPhoneBrokerNames.length + pkg.sharedDomainBrokerNames.length,
        selfNameIgnored: pkg.selfNameHits, candidateOffices: candidateOfficeNames,
      },
      evidence: evidence.map((e) => ({ source: e.source, detail: e.reason, confidence: e.confidence })),
    };
    const context: ContextPackage = {
      request: { type: "broker", entityId: pkg.agentId, size: "small" },
      identity: { orgId: null, orgName: null, userId: null, userName: null, isManager: true },
      screen: "brokerage-data", workflow: "broker-identity-resolution",
      blocks: [block], permissions: { isManager: true, removedBlocks: [], redactedFields: [] },
      explain: { repositoriesUsed: ["brokerage_agents", "external_listings", "brokerage_offices"], entitiesCollected: [pkg.agentId], confidence: null, missing: [], prioritySummary: [{ key: block.key, priority: 100 }], size: "small", blockCount: 1, approxChars: JSON.stringify(block).length, timestamp: new Date().toISOString(), version: CONTEXT_ENGINE_VERSION },
      cacheKey: `broker-identity:${pkg.agentId}`,
    };
    const QUESTION = "בהתבסס אך ורק על הראיות והמשרדים המועמדים המצורפים, לאיזה משרד תיווך שייך המתווך? בחר רק שם שמופיע בראיות או ברשימת המשרדים. שים לב: שם זהה לשם המתווך אינו שם משרד. אל תמציא פרטים שאינם בראיות. השב בשורה הראשונה: שם המשרד או 'insufficient_evidence'.";
    const res = await runReasoningGateway({ question: QUESTION, context, mode: "answer", language: "he", userId: null, organizationId: null });
    const first = (res.answer ?? "").split(/\n/)[0]?.replace(/^[\s\d.)\-–:]+/, "").trim() ?? "";
    const officeName = res.status === "answered" && first && !/insufficient/i.test(first) ? first.slice(0, 80) : null;
    return { officeName, confidence: res.confidence, reasoning: (res.answer ?? "").slice(0, 240) };
  } catch (e) { console.error("[broker-identity] AI reason failed", pkg.agentId, e); return null; }
}
