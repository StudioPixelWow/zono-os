// ============================================================================
// 📘 ZONO Facebook Growth Platform™ — server actions. 37.0.
// Read + Ask delegators. Lead conversion from comments REUSES the existing
// approval-gated createLeadFromCommentAction (no new create path). No publish.
// ============================================================================
"use server";
import { getFacebookHome, answerFacebookQuestion, type FbAnswer } from "./service";
import type { FacebookHome } from "./types";

export async function getFacebookHomeAction(): Promise<{ ok: boolean; result?: FacebookHome; error?: string }> {
  try { return { ok: true, result: await getFacebookHome() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

export async function askFacebookAction(question: string): Promise<{ ok: boolean; result?: FbAnswer; error?: string }> {
  const q = (question ?? "").trim();
  if (!q) return { ok: false, error: "empty" };
  try { return { ok: true, result: await answerFacebookQuestion(q) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

// NOTE: `export type { BrokerFacebook }` used to live here and it CRASHED /facebook
// with `ReferenceError: BrokerFacebook is not defined` at module evaluation:
// Next's "use server" transform emits a RUNTIME re-export for the binding, but a
// type-only import has no runtime value. A "use server" module must export only
// async functions — types included. Import BrokerFacebook from "./service".
