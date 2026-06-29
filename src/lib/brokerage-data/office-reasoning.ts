// ============================================================================
// 🏢🤖 Broker→Office evidence gathering + evidence-only OpenAI reasoning.
// Phase 26.9.7 Part 3 (server-only). Builds the OfficeEvidenceContext for a
// broker from real ZONO data, runs the deterministic providers, then OPTIONALLY
// asks the AI Reasoning Gateway™ to reason over ONLY that structured evidence.
// OpenAI never reads the DB and cannot invent an office; evidence-free output is
// rejected. On-demand (not in the bulk scan) — graceful when no key configured.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { brokerageRepository } from "./repository";
import { normalizeHebrewName, normalizePhoneNumber } from "./normalize";
import { gatherDeterministicOfficeEvidence, hasUsableOfficeEvidence, type OfficeEvidence, type OfficeEvidenceContext } from "./office-evidence";
import { runReasoningGateway } from "@/lib/ai-reasoning/gateway";
import { CONTEXT_ENGINE_VERSION } from "@/lib/context-engine/types";
import type { ContextPackage } from "@/lib/context-engine/types";
import type { AIReasoningResponse } from "@/lib/ai-reasoning/types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");

export interface BrokerOfficeEvidenceResult {
  brokerId: string;
  brokerName: string;
  evidence: OfficeEvidence[];
  hasEvidence: boolean;
}

/** Assemble the evidence context for one broker and run deterministic providers. */
export async function gatherBrokerOfficeEvidence(agentId: string): Promise<BrokerOfficeEvidenceResult | null> {
  const db = createServiceRoleClient();
  const { data: agent } = await db.from("brokerage_agents" as never)
    .select("id,full_name,normalized_name,primary_phone,whatsapp_phone,city").eq("id", agentId).maybeSingle();
  if (!agent) return null;
  const a = agent as Row;
  const phone = s(a.primary_phone) || s(a.whatsapp_phone) || null;

  // Linked listings (evidence: cities, sources, names) via this broker's links.
  const { data: links } = await db.from("brokerage_external_listing_links" as never)
    .select("external_listing_id").eq("agent_id", agentId).limit(500);
  const listingIds = ((links ?? []) as Row[]).map((r) => s(r.external_listing_id)).filter(Boolean);
  const linkedListings: OfficeEvidenceContext["linkedListings"] = [];
  for (let i = 0; i < listingIds.length; i += 300) {
    const chunk = listingIds.slice(i, i + 300);
    const { data } = await db.from("external_listings" as never)
      .select("id,contact_name,contact_phone,city,source,detected_broker_name").in("id", chunk);
    for (const r of (data ?? []) as Row[]) {
      linkedListings.push({ id: s(r.id), contactName: s(r.contact_name) || null, contactPhone: s(r.contact_phone) || null, city: s(r.city) || null, source: s(r.source) || null, detectedBrokerName: s(r.detected_broker_name) || null });
    }
  }

  // Other DISTINCT broker names on the same phone line (office signal).
  let sharedPhoneBrokerNames: string[] = [];
  if (phone) {
    const np = normalizePhoneNumber(phone);
    const { data: peers } = await db.from("brokerage_agents" as never)
      .select("id,full_name,primary_phone").eq("primary_phone", phone).limit(50);
    const selfNorm = s(a.normalized_name) || normalizeHebrewName(s(a.full_name));
    sharedPhoneBrokerNames = Array.from(new Set(((peers ?? []) as Row[])
      .filter((p) => s(p.id) !== agentId && normalizePhoneNumber(s(p.primary_phone)) === np)
      .map((p) => normalizeHebrewName(s(p.full_name)))
      .filter((n) => n && n !== selfNorm)));
  }

  const existingOffices = (await brokerageRepository.candidateOfficesByCities([])).map((o) => ({
    id: o.id, name: o.name, normalizedName: o.normalizedName, primaryPhone: o.primaryPhone, city: o.city,
  }));

  const ctx: OfficeEvidenceContext = {
    broker: { id: agentId, fullName: s(a.full_name), normalizedName: s(a.normalized_name) || null, primaryPhone: phone, city: s(a.city) || null },
    linkedListings, sharedPhoneBrokerNames, existingOffices,
  };
  const evidence = gatherDeterministicOfficeEvidence(ctx);
  return { brokerId: agentId, brokerName: s(a.full_name), evidence, hasEvidence: hasUsableOfficeEvidence(evidence) };
}

const QUESTION =
  "בהתבסס אך ורק על הראיות המצורפות, מהו המשרד הסביר ביותר של המתווך? ציין ביטחון, נמק, וציין מגבלות. אל תמציא שם משרד שאינו מופיע בראיות.";

export interface BrokerOfficeReasonResult { evidence: OfficeEvidence[]; answer: AIReasoningResponse | null; hasEvidence: boolean }

/** Build a sanitized ContextPackage from the gathered evidence and ask the AI
 *  gateway to reason over it (evidence-only). Returns null answer when there is
 *  no usable evidence (the AI is not even called). */
export async function reasonBrokerOffice(
  agentId: string, idn: { orgId: string | null; userId: string | null; orgName: string | null; userName: string | null; isManager: boolean },
): Promise<BrokerOfficeReasonResult | null> {
  const gathered = await gatherBrokerOfficeEvidence(agentId);
  if (!gathered) return null;
  if (!gathered.hasEvidence) return { evidence: gathered.evidence, answer: null, hasEvidence: false };

  const block = {
    key: "brokerage.office-evidence", label: "ראיות לשיוך משרד", priority: 100, confidence: 0,
    source: "brokerage-data.office-evidence",
    data: { brokerId: agentId, brokerName: gathered.brokerName, evidence: gathered.evidence },
    evidence: [{ source: "brokerage-data.office-evidence", detail: "ראיות דטרמיניסטיות שנאספו מנתוני ZONO", confidence: 0 }],
  };
  const blocks = [block];
  const context: ContextPackage = {
    request: { type: "broker", entityId: agentId, size: "medium" },
    identity: { orgId: idn.orgId, orgName: idn.orgName, userId: idn.userId, userName: idn.userName, isManager: idn.isManager },
    screen: "brokerage-data", workflow: "office-resolution",
    blocks,
    permissions: { isManager: idn.isManager, removedBlocks: [], redactedFields: [] },
    explain: {
      repositoriesUsed: ["brokerage_agents", "brokerage_external_listing_links", "external_listings", "brokerage_offices"],
      entitiesCollected: [agentId], confidence: null, missing: [],
      prioritySummary: [{ key: block.key, priority: 100 }],
      size: "medium", blockCount: 1, approxChars: JSON.stringify(blocks).length, timestamp: new Date().toISOString(), version: CONTEXT_ENGINE_VERSION,
    },
    cacheKey: `broker-office:${agentId}`,
  };
  const answer = await runReasoningGateway({ question: QUESTION, context, mode: "answer", language: "he", userId: idn.userId, organizationId: idn.orgId });
  return { evidence: gathered.evidence, answer, hasEvidence: true };
}
