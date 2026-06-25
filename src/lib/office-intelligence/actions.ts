"use server";
// ============================================================================
// ZONO — Office Intelligence server actions (manager+ only, org-scoped).
// Dashboard fetch, goals CRUD, report generation, snapshot job, and AI office
// summaries (Phase 15 Copilot) over SANITIZED office analytics only.
// ============================================================================
import { revalidatePath } from "next/cache";
import { composeOfficeDashboard, buildOfficeAnalyticsContext, runOfficeIntelligenceSnapshotJob } from "./engine";
import { assertOfficeIntelligenceAccess } from "./permissions";
import { createOfficeRepository } from "./repository";
import { runCopilot } from "@/lib/ai-copilot/context";
import { buildMessages, buildCacheKey, computeDataHash } from "@/lib/ai-copilot/prompts";
import type { GoalType, OfficeDashboard } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } { return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." }; }

export async function getOfficeDashboardAction(): Promise<Result<OfficeDashboard>> {
  try { return { ok: true, data: await composeOfficeDashboard() }; } catch (e) { return fail(e); }
}

export async function runOfficeSnapshotAction(): Promise<Result<{ ok: boolean; agents: number; risks: number }>> {
  try { const d = await runOfficeIntelligenceSnapshotJob(); revalidatePath("/office-intelligence"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}

export async function upsertOfficeGoalAction(input: { id?: string; goalType: GoalType; period: string; target: number; startsAt: string | null; endsAt: string | null }): Promise<Result<{ ok: true }>> {
  try {
    const a = await assertOfficeIntelligenceAccess();
    await createOfficeRepository(a.db).upsertGoal(a.orgId, input);
    revalidatePath("/office-intelligence");
    return { ok: true, data: { ok: true } };
  } catch (e) { return fail(e); }
}

export async function archiveOfficeGoalAction(id: string): Promise<Result<{ ok: true }>> {
  try {
    const a = await assertOfficeIntelligenceAccess();
    await createOfficeRepository(a.db).archiveGoal(a.orgId, id);
    revalidatePath("/office-intelligence");
    return { ok: true, data: { ok: true } };
  } catch (e) { return fail(e); }
}

export async function generateOfficeReportAction(reportType: "daily" | "weekly" | "monthly" | "custom", dateFrom: string | null, dateTo: string | null): Promise<Result<{ reportId: string; payload: Record<string, unknown> }>> {
  try {
    const a = await assertOfficeIntelligenceAccess();
    const d = await composeOfficeDashboard();
    const payload = {
      executiveSummary: d.pulse, kpis: d.kpis,
      agentPerformance: d.leaderboard.ranked.map((m) => ({ name: m.name, score: m.leaderboardScore, meetings: m.meetings, conversion: m.conversionRate, overdue: m.overdueTasks })),
      opportunities: d.opportunities.slice(0, 20), risks: d.risks, goals: d.goals, forecast: d.forecast, benchmarks: d.benchmarks,
    };
    const reportId = await createOfficeRepository(a.db).createReport(a.orgId, a.userId, {
      reportType, title: `דוח ${reportType} — ${new Date().toLocaleDateString("he-IL")}`, dateFrom, dateTo, payload,
    });
    revalidatePath("/office-intelligence");
    return { ok: true, data: { reportId, payload } };
  } catch (e) { return fail(e); }
}

// ── AI office summaries (Copilot augmentation; sanitized analytics only) ─────
type AiOut = { content: string; source: "ai" | "fallback" | "cache"; model: string | null };

const OFFICE_AI: Record<string, { instruction: string; fallback: (ctx: Record<string, unknown>) => string }> = {
  morning: {
    instruction: "כתוב תדריך בוקר תמציתי למנהל המשרד: מצב כללי, הזדמנויות חמות, סוכנים מצטיינים, מי דורש תשומת לב וצפי. התבסס על המספרים שבהקשר בלבד.",
    fallback: (c) => `תדריך בוקר משרד\n\n${JSON.stringify((c.kpis as Record<string, number>) ?? {})}`,
  },
  team: {
    instruction: "סכם את ביצועי הצוות: מי מוביל, מי עולה, מי דורש תשומת לב. עברית, תכליתי.",
    fallback: (c) => `סיכום צוות\n\nמובילים: ${JSON.stringify(c.topAgents ?? [])}\nדורשים תשומת לב: ${JSON.stringify(c.needingAttention ?? [])}`,
  },
  coaching: {
    instruction: "סכם את פריטי האימון המרכזיים והמלצות פעולה למנהל. עברית.",
    fallback: (c) => `סיכום אימון\n\n${(c.coaching as { title: string }[] ?? []).map((x) => `• ${x.title}`).join("\n")}`,
  },
  weekly: {
    instruction: "כתוב סיכום שבועי מנהלי: מגמות, הישגים, סיכונים והמלצות. התבסס על ההקשר בלבד.",
    fallback: (c) => `סיכום שבועי\n\nצפי: ${JSON.stringify(c.forecast ?? {})}\nמדדים: ${JSON.stringify(c.benchmarks ?? [])}`,
  },
};

export async function officeAiSummaryAction(kind: "morning" | "team" | "coaching" | "weekly"): Promise<Result<AiOut>> {
  try {
    const context = await buildOfficeAnalyticsContext();
    const spec = OFFICE_AI[kind]!;
    const dataHash = computeDataHash(context);
    const res = await runCopilot({
      kind: "office_brief", entityId: null, dataHash, cacheKey: buildCacheKey("office_brief", null, dataHash, kind),
      messages: buildMessages("office_brief", context, spec.instruction), fallback: spec.fallback(context),
    });
    return { ok: true, data: { content: res.content, source: res.source, model: res.model } };
  } catch (e) { return fail(e); }
}

export async function officeAgentFeedbackAction(agentName: string, coachingTitle: string, recommendedAction: string): Promise<Result<AiOut>> {
  try {
    const context = { agentName, coachingTitle, recommendedAction };
    const dataHash = computeDataHash(context);
    const fallback = `משוב ל${agentName}:\n${coachingTitle}\nהמלצה: ${recommendedAction}`;
    const res = await runCopilot({
      kind: "office_brief", entityId: null, dataHash, cacheKey: buildCacheKey("office_brief", null, dataHash, "agent_feedback"),
      messages: buildMessages("office_brief", context, "נסח משוב מקצועי, מכבד ובונה לסוכן, על בסיס פריט האימון. עברית, קצר."), fallback,
    }, { cache: false });
    return { ok: true, data: { content: res.content, source: res.source, model: res.model } };
  } catch (e) { return fail(e); }
}
