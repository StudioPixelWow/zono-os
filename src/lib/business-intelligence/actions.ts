"use server";
// ============================================================================
// ZONO — Executive BI server actions (managers / owners / enterprise only).
// Dashboard fetch, daily snapshot, report generation + export, and AI executive
// briefs (Phase 15 Copilot) over SANITIZED analytics — AI summarizes only.
// ============================================================================
import { revalidatePath } from "next/cache";
import { getExecAccess } from "./permissions";
import { createBiRepository } from "./repository";
import { composeExecutiveDashboard, buildExecutiveContext, runBiSnapshotJob } from "./engine";
import { buildReportPayload, toJson, toCsv, toMarkdown, type ReportType } from "./exports";
import { runCopilot } from "@/lib/ai-copilot/context";
import { buildMessages, buildCacheKey, computeDataHash } from "@/lib/ai-copilot/prompts";
import type { ExecutiveDashboard } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } { return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." }; }

export async function getExecutiveDashboardAction(): Promise<Result<ExecutiveDashboard>> {
  try { return { ok: true, data: await composeExecutiveDashboard() }; } catch (e) { return fail(e); }
}

export async function runBiSnapshotAction(): Promise<Result<{ ok: boolean }>> {
  try { const d = await runBiSnapshotJob(); revalidatePath("/executive-intelligence"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}

export async function generateBiReportAction(reportType: ReportType, format: "json" | "csv" | "markdown" = "json"): Promise<Result<{ reportId: string | null; content: string; format: string }>> {
  try {
    const a = await getExecAccess();
    const d = await composeExecutiveDashboard();
    const payload = buildReportPayload(d, reportType);
    const content = format === "csv" ? toCsv(payload) : format === "markdown" ? toMarkdown(payload) : toJson(payload);
    const reportId = await createBiRepository(a.db).createReport(a.orgId, a.userId, {
      reportType, title: payload.title, format, periodFrom: null, periodTo: null, payload,
    });
    revalidatePath("/executive-intelligence");
    return { ok: true, data: { reportId, content, format } };
  } catch (e) { return fail(e); }
}

// ── AI executive briefs (Copilot augmentation; sanitized analytics only) ─────
type AiOut = { content: string; source: "ai" | "fallback" | "cache"; model: string | null };

const BRIEFS: Record<string, { instruction: string }> = {
  explain_business: { instruction: "הסבר למנהל המשרד לאן העסק הולך, מה חזק ומה דורש תשומת לב — על בסיס המספרים בהקשר בלבד. עברית, תכליתי." },
  weekly_brief: { instruction: "כתוב תדריך מנהלים שבועי: מגמות, הכנסה צפויה, סיכונים והמלצות. התבסס על ההקשר בלבד." },
  revenue_summary: { instruction: "סכם את מצב ההכנסות: צפוי, עמלות, בסיכון ואבוד. עברית, קצר." },
  risk_summary: { instruction: "סכם את הסיכונים המרכזיים והמלצות פעולה. עברית." },
  growth_opportunities: { instruction: "זהה והסבר את הזדמנויות הצמיחה המרכזיות על בסיס הנתונים. עברית." },
};

export async function aiExecutiveBriefAction(kind: "explain_business" | "weekly_brief" | "revenue_summary" | "risk_summary" | "growth_opportunities"): Promise<Result<AiOut>> {
  try {
    const context = await buildExecutiveContext();
    const spec = BRIEFS[kind]!;
    const dataHash = computeDataHash(context);
    const res = await runCopilot({
      kind: "office_brief", entityId: null, dataHash, cacheKey: buildCacheKey("office_brief", null, dataHash, `exec_${kind}`),
      messages: buildMessages("office_brief", context, spec.instruction),
      fallback: `תקציר מנהלים\n\n${JSON.stringify((context.kpis as Record<string, number>) ?? {})}`,
    });
    return { ok: true, data: { content: res.content, source: res.source, model: res.model } };
  } catch (e) { return fail(e); }
}
