// ============================================================================
// ☀️ ZONO Daily AI Operating System™ — server actions. 40.0.
// Read + Ask + executive delegators. Approvals reuse the Agent Framework gate
// (via broker-workspace actions). No mutations here beyond delegation.
// ============================================================================
"use server";
import { getDailyOS, getExecutiveDaily, answerDailyQuestion } from "./service";
import type { DailyOS, ExecutiveDaily } from "./types";

export async function getDailyOSAction(): Promise<{ ok: boolean; result?: DailyOS; error?: string }> {
  try { return { ok: true, result: await getDailyOS() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

export async function getExecutiveDailyAction(): Promise<{ ok: boolean; result?: ExecutiveDaily; error?: string }> {
  try { return { ok: true, result: await getExecutiveDaily() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

export async function askDailyAction(question: string): Promise<{ ok: boolean; result?: Awaited<ReturnType<typeof answerDailyQuestion>>; error?: string }> {
  const q = (question ?? "").trim();
  if (!q) return { ok: false, error: "empty" };
  try { return { ok: true, result: await answerDailyQuestion(q) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}
