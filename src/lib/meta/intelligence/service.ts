// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · ENGAGEMENT INTELLIGENCE SERVICE (server). Phase 4.
// ----------------------------------------------------------------------------
// Wires the pure intelligence engine to production adapters: the Supabase store,
// the Reasoning Gateway adapter (delegates to the shipped AI boundary), the
// Copilot draft adapter (delegates to the existing Communication Copilot), a
// narrow read-only Phase-2 insights hint, and the SAME capability evaluator the
// inbox uses (comments.read via resolveRuntime — never a parallel permissions
// system). AI output is a SUGGESTION: accepting routes the user into an EXISTING
// approval-gated workflow / reviewable draft / local inbox control — it NEVER
// executes a provider write. Dispatcher/recover are protected internal routes.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { resolveRuntime } from "../publish/service";
import { getObjectInsights } from "../insights/service";
import { createSupabaseIntelligenceStore } from "./store";
import { createReasoningGateway } from "./reasoning";
import { createCopilotGateway, renderDraftBody } from "./copilot";
import type { IntelligencePorts, CapabilityResolver, InsightsContext } from "./ports";
import * as engine from "./engine";
import { toConversationIntelligence, type ConversationIntelligenceDTO } from "./read";
import { ROUTE_BY_ACTION, type RouteTarget } from "./state";
import { canRescore, canAcceptSuggestion, canDismissSuggestion } from "./roles";
export { canViewIntelligence, canRescore, canAcceptSuggestion, canDismissSuggestion } from "./roles";
import { boundedContext, CONTEXT_MAX_ITEMS } from "./fingerprint";
import type { MetaPlatform } from "../types";

const readCap = (p: MetaPlatform) => (p === "instagram" ? "instagram.comments.read" : "facebook.comments.read");

async function activeAssetId(orgId: string, platform: MetaPlatform): Promise<string | null> {
  const table = platform === "instagram" ? "meta_instagram_account" : "meta_page";
  const r = await createServiceRoleClient().from(table as never).select("id").eq("org_id", orgId).eq("status", "active").limit(1).maybeSingle();
  return r.data ? String((r.data as { id: string }).id) : null;
}
function capabilityResolver(): CapabilityResolver {
  return {
    async intelligenceAllowed(orgId, platform) {
      const assetId = await activeAssetId(orgId, platform);
      if (!assetId) return false;
      const rt = await resolveRuntime(orgId, assetId, readCap(platform));
      return rt.capability.allowed;
    },
  };
}
function insightsContext(): InsightsContext {
  return {
    async objectHint(orgId, providerObjectId) {
      if (!providerObjectId) return null;
      try {
        const s = await getObjectInsights(orgId, providerObjectId);
        const latest = (s as unknown as { latest?: Record<string, number> }).latest ?? {};
        const parts = Object.entries(latest).slice(0, 3).map(([k, v]) => `${k}:${v}`);
        return parts.length ? parts.join(", ") : null;
      } catch { return null; }
    },
  };
}

export function buildIntelligencePorts(): IntelligencePorts {
  return {
    store: createSupabaseIntelligenceStore(),
    reasoning: createReasoningGateway(),
    copilot: createCopilotGateway(),
    insights: insightsContext(),
    capability: capabilityResolver(),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
    audit: { log: (i) => logAudit({ action: i.action, category: "configuration", entityType: "meta_engagement_signal", entityId: i.entityId, summary: i.summary, metadata: i.metadata }) },
    random: { fraction: () => Math.random() },
  };
}

// ── Reads (safe DTOs; org-scoped) ─────────────────────────────────────────────
export async function getConversationIntelligence(orgId: string, conversationId: string): Promise<ConversationIntelligenceDTO> {
  const store = createSupabaseIntelligenceStore();
  const candidate = await store.getCandidate(orgId, conversationId);
  const current = candidate ? await store.getCurrentSignal(orgId, candidate.subjectKind, candidate.subjectRef) : null;
  const [suggestions, history] = await Promise.all([store.listActiveSuggestions(orgId, conversationId), store.listSignalsForConversation(orgId, conversationId)]);
  return toConversationIntelligence(conversationId, current, suggestions, history);
}

// ── Manual rescore (role + capability gated) ───────────────────────────────────
export async function requestRescore(orgId: string, role: string, conversationId: string): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  if (!canRescore(role)) return { ok: false, error: "forbidden" };
  const ports = buildIntelligencePorts();
  const candidate = await ports.store.getCandidate(orgId, conversationId);
  if (!candidate) return { ok: false, error: "not_found" };
  if (!(await ports.capability.intelligenceAllowed(orgId, candidate.platform))) return { ok: false, error: "capability_denied" };
  const r = await engine.scheduleManualRescore(ports, orgId, candidate, crypto.randomUUID());
  await logAudit({ action: "meta.intelligence.manual_rescore_requested", category: "configuration", entityType: "meta_engagement_signal", entityId: conversationId, summary: "manual rescore requested", metadata: {} });
  return { ok: true, jobId: r.job.id };
}

// ── Accept / dismiss (route into existing workflows; never execute Meta) ───────
export interface AcceptOutcome { ok: boolean; error?: string; route?: RouteTarget; draft?: { tone: string; body: string }[]; navigate?: { kind: string; conversationId: string; providerObjectId: string | null } }
export async function acceptSuggestion(orgId: string, userId: string, role: string, suggestionId: string): Promise<AcceptOutcome> {
  if (!canAcceptSuggestion(role)) return { ok: false, error: "forbidden" };
  const ports = buildIntelligencePorts();
  const suggestion = await ports.store.getSuggestion(orgId, suggestionId);
  if (!suggestion) return { ok: false, error: "not_found" };
  const route = ROUTE_BY_ACTION[suggestion.actionKind];
  const candidate = await ports.store.getCandidate(orgId, suggestion.inboxConversationId);

  // reply_draft → produce a REVIEWABLE draft via the existing Copilot (no send).
  let draft: { tone: string; body: string }[] | undefined;
  let routedRef: string | null = suggestion.suggestedDraftRef;
  if (route === "reply_draft" && candidate) {
    const ctx = boundedContext(await ports.store.loadContext(orgId, candidate.subjectRef, candidate.platform, CONTEXT_MAX_ITEMS));
    const insightHint = await ports.insights.objectHint(orgId, candidate.providerObjectId);
    const rendered = renderDraftBody({ language: "he", platform: candidate.platform, subjectRef: candidate.subjectRef, participantDisplay: null, context: ctx, insightHint });
    draft = rendered.map((d) => ({ tone: d.tone, body: d.body }));
    routedRef = routedRef ?? suggestion.suggestedDraftRef;
  }

  const plan = await engine.acceptSuggestion(ports, orgId, userId, suggestionId, routedRef);
  if (!plan.ok) return { ok: false, error: plan.error ?? "accept_failed" };
  // The user is routed into the EXISTING workflow (moderation approval / inbox
  // controls / draft) — acceptance itself performs no provider action.
  return { ok: true, route, draft, navigate: candidate ? { kind: route, conversationId: suggestion.inboxConversationId, providerObjectId: candidate.providerObjectId } : undefined };
}
export async function dismissSuggestion(orgId: string, userId: string, role: string, suggestionId: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  if (!canDismissSuggestion(role)) return { ok: false, error: "forbidden" };
  const r = await engine.dismissSuggestion(buildIntelligencePorts(), orgId, userId, suggestionId, reason ?? null);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "dismiss_failed" };
}

// ── Internal worker entrypoints (protected routes only) ────────────────────────
export interface IntelTickResult { scanned: number; enqueued: number; claimed: number; scored: number; failed: number; retries: number }
export async function runIntelligenceDispatchTick(opts?: { limit?: number; perOrgMax?: number }): Promise<IntelTickResult> {
  const ports = buildIntelligencePorts();
  const trig = await engine.enqueueDueScoring(ports, { limit: 50, correlationId: crypto.randomUUID() });
  const leaseOwner = `intel:${crypto.randomUUID()}`;
  const claimed = await engine.dispatchDue(ports, { leaseOwner, limit: opts?.limit, perOrgMax: opts?.perOrgMax });
  const res: IntelTickResult = { scanned: trig.scanned, enqueued: trig.enqueued, claimed: claimed.length, scored: 0, failed: 0, retries: 0 };
  for (const job of claimed) {
    const out = await engine.workJob(ports, job);
    if (out.job.status === "succeeded") res.scored++;
    else if (out.job.status === "failed" || out.job.status === "dead_letter") res.failed++;
    else if (out.job.status === "retry_wait") res.retries++;
  }
  return res;
}
export async function runIntelligenceRecoveryTick(opts?: { limit?: number }): Promise<{ recovered: number; requeued: number; deadLettered: number; expired: number }> {
  const ports = buildIntelligencePorts();
  const rec = await engine.recoverAbandoned(ports, { limit: opts?.limit });
  const exp = await engine.expireDueSuggestions(ports, {});
  return { ...rec, expired: exp.expired };
}
export async function getIntelligenceQueueHealth(orgId: string | null): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }> {
  return createSupabaseIntelligenceStore().queueHealth(orgId, Date.now());
}
