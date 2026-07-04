// ============================================================================
// 🗺️ ZONO Territory Intelligence OS™ — server actions. 39.0.
// Read + Ask delegators. No mutations; all CTAs route to existing approval-gated
// flows (campaign wizard, distribution, acquisition, facebook, landing).
// ============================================================================
"use server";
import { getTerritoryOS, answerTerritoryQuestion, type TerritoryAnswer } from "./service";
import type { TerritoryOS } from "./types";

export async function getTerritoryOSAction(city?: string): Promise<{ ok: boolean; result?: TerritoryOS; error?: string }> {
  try { return { ok: true, result: await getTerritoryOS(city) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

export async function askTerritoryAction(question: string): Promise<{ ok: boolean; result?: TerritoryAnswer; error?: string }> {
  const q = (question ?? "").trim();
  if (!q) return { ok: false, error: "empty" };
  try { return { ok: true, result: await answerTerritoryQuestion(q) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}
