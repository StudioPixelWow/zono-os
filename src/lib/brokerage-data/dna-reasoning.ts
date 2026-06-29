// ============================================================================
// ✨ Brokerage DNA reasoning — OpenAI reasons OVER the deterministic DNA evidence
// (never the source of truth). Phase 26.9.6 (deferred slice). The model receives
// ONLY the sanitized DNA ContextPackage via the official AI Reasoning Gateway™;
// it never reads the DB and cannot invent entities. Ephemeral — nothing persisted.
// Gracefully returns a config message when no OpenAI key is set.
// ============================================================================
import "server-only";
import { getOfficeDna, getBrokerDna } from "./service";
import { runReasoningGateway } from "@/lib/ai-reasoning/gateway";
import { CONTEXT_ENGINE_VERSION } from "@/lib/context-engine/types";
import type { ContextPackage } from "@/lib/context-engine/types";
import type { AIReasoningResponse } from "@/lib/ai-reasoning/types";
import type { BrokerageDna } from "./dna";

export interface DnaReasonInput {
  type: "office" | "broker";
  id: string;
  orgId: string | null;
  userId: string | null;
  orgName: string | null;
  userName: string | null;
  isManager: boolean;
}

export interface DnaReasonResult { dna: BrokerageDna | null; answer: AIReasoningResponse | null }

/** Assemble a minimal, sanitized ContextPackage carrying ONLY the DNA evidence. */
function buildDnaContext(dna: BrokerageDna, idn: DnaReasonInput): ContextPackage {
  const block = {
    key: "brokerage.dna",
    label: dna.entityType === "office" ? "DNA משרד תיווך" : "DNA מתווך",
    priority: 100,
    confidence: dna.confidenceScore,
    source: "brokerage-data.dna",
    data: {
      id: dna.id,
      entityType: dna.entityType,
      name: dna.name,
      subtitle: dna.subtitle,
      status: dna.status,
      dnaScore: dna.dnaScore,
      confidenceScore: dna.confidenceScore,
      dataQualityScore: dna.dataQualityScore,
      completeness: dna.completeness,
      footprint: dna.footprint,
      strengths: dna.signals.filter((s) => s.kind === "strength").map((s) => s.label),
      gaps: dna.signals.filter((s) => s.kind === "gap").map((s) => s.label),
      facts: dna.signals.filter((s) => s.kind === "fact").map((s) => s.label),
    },
    evidence: [{ source: "brokerage-data.dna", detail: "פרופיל DNA דטרמיניסטי מתוך נתוני ZONO", confidence: dna.confidenceScore }],
  };
  const blocks = [block];
  const approxChars = JSON.stringify(blocks).length;
  return {
    request: { type: dna.entityType === "office" ? "office" : "broker", entityId: dna.id, size: "medium" },
    identity: { orgId: idn.orgId, orgName: idn.orgName, userId: idn.userId, userName: idn.userName, isManager: idn.isManager },
    screen: "brokerage-data", workflow: "dna-reasoning",
    blocks,
    permissions: { isManager: idn.isManager, removedBlocks: [], redactedFields: [] },
    explain: {
      repositoriesUsed: ["brokerage_offices", "brokerage_agents", "brokerage_external_listing_links"],
      entitiesCollected: [dna.id], confidence: dna.confidenceScore, missing: [],
      prioritySummary: [{ key: block.key, priority: block.priority }],
      size: "medium", blockCount: 1, approxChars, timestamp: new Date().toISOString(), version: CONTEXT_ENGINE_VERSION,
    },
    cacheKey: `brokerage-dna:${dna.entityType}:${dna.id}`,
  };
}

const QUESTION =
  "נתח את פרופיל ה-DNA המצורף של הגורם: מהן החוזקות המרכזיות, מהם הפערים שכדאי להשלים, ומהן ההזדמנויות. בסס כל קביעה על הנתונים בלבד.";

/**
 * Reason over an office/broker DNA. Returns the deterministic DNA plus the AI
 * narrative (or a graceful config message inside the answer when no key is set).
 */
export async function reasonBrokerageDna(input: DnaReasonInput): Promise<DnaReasonResult> {
  const dna = input.type === "office" ? await getOfficeDna(input.id) : await getBrokerDna(input.id);
  if (!dna) return { dna: null, answer: null };
  const context = buildDnaContext(dna, input);
  const answer = await runReasoningGateway({
    question: QUESTION, context, mode: "explain", language: "he",
    userId: input.userId, organizationId: input.orgId,
  });
  return { dna, answer };
}
