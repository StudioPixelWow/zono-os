// ============================================================================
// ☀️ ZONO Daily AI Operating System™ — server service (server-only). 40.0.
// The new default workspace. RE-FRAMES the existing broker workspace into one
// daily OS (cached via the 34.2 compute-cache), maps the Chief-of-Staff into an
// executive daily view, and reuses the broker-scoped Ask ZONO. NO new engine,
// NO schema. Read-only; every action routes to an existing approval-gated flow.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { getBrokerWorkspace, askBrokerZono } from "@/lib/broker-workspace/service";
import { getChiefOfStaff } from "@/lib/chief-of-staff/service";
import { getCache, setCache } from "@/lib/platform-persistence";
import type { Json } from "@/lib/supabase/types";
import { assembleDailyOS, buildExecutiveDaily } from "./assemble";
import type { DailyOS, ExecutiveDaily, ExecInput } from "./types";

async function ctx(): Promise<{ orgId: string | null; userId: string | null }> {
  const s = await getSessionContext();
  return { orgId: s.profile?.org_id ?? s.organization?.id ?? null, userId: s.user?.id ?? null };
}
const today = () => new Date().toISOString().slice(0, 10);

/** The unified Daily Operating System for the signed-in broker (cached per day). */
export async function getDailyOS(): Promise<DailyOS> {
  const { orgId, userId } = await ctx();
  const key = [userId ?? "me", today()];
  if (orgId) {
    const hit = await getCache<DailyOS>(orgId, "daily_os", key);
    if (hit) return hit.value;
  }
  const workspace = await getBrokerWorkspace();
  const os = assembleDailyOS(workspace);
  if (orgId) await setCache(orgId, "daily_os", key, os as unknown as Json, { ttlSeconds: 300, version: os.version });
  return os;
}

/** Executive daily view for office managers — mapped from the Chief-of-Staff. */
export async function getExecutiveDaily(): Promise<ExecutiveDaily> {
  const { orgId } = await ctx();
  const rep = await getChiefOfStaff(orgId).catch(() => null);
  if (!rep) return buildExecutiveDaily({ orgScore: { overall: 0, growth: 0, execution: 0, coverage: 0, competitivePosition: 0, confidence: 0 }, priorities: [], risks: [], opportunities: [], insights: [], notes: ["דוח מנהל לא נטען."] });
  const o = rep.organizationScore;
  const mapRec = (r: { title: string; why: string; evidence: string[]; businessImpact: "high" | "medium" | "low"; urgency: number }) => ({ title: r.title, why: r.why, evidence: r.evidence, impact: r.businessImpact, urgency: r.urgency });
  const input: ExecInput = {
    orgScore: { overall: o.overall, growth: o.growth, execution: o.execution, coverage: o.coverage, competitivePosition: o.competitivePosition, confidence: o.confidence },
    priorities: rep.recommendations.topPriorities.map(mapRec),
    risks: rep.recommendations.topRisks.map(mapRec),
    opportunities: rep.recommendations.topOpportunities.map(mapRec),
    insights: rep.crossModuleInsights.map((i) => ({ title: i.title, recommendation: i.recommendation, modules: i.modules, impact: i.businessImpact })),
    notes: rep.notes,
  };
  return buildExecutiveDaily(input);
}

/** Ask ZONO, context-aware for today — reuses the broker-scoped Ask engine. */
export async function answerDailyQuestion(question: string): Promise<{ answer: string; confidence: number | null; limitations: string | null }> {
  const r = await askBrokerZono(question);
  return { answer: r.answer, confidence: r.confidence, limitations: r.limitations };
}
