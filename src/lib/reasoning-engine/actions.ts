"use server";
// ============================================================================
// Server actions for the ZONO Reasoning Engine™ (Phase 27.3). Thin wrappers —
// scope is resolved from the session; the engine does the rest.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { runReasoningEngine } from "./service";
import { runSelfCheck, type ReasoningSelfCheck } from "./qa";
import type { ReasoningRequest, ReasoningResponse } from "./types";

/** Ask ZONO a question through the official reasoning pipeline. */
export async function askZonoReasoningAction(
  input: Pick<ReasoningRequest, "question" | "language" | "mode" | "depth" | "contextType" | "entityId" | "city">,
): Promise<{ ok: boolean; result?: ReasoningResponse; error?: string }> {
  try {
    const { profile, user } = await getSessionContext();
    if (!profile?.org_id || !user) return { ok: false, error: "אין הרשאה." };
    if (!input.question?.trim()) return { ok: false, error: "יש להזין שאלה." };
    const result = await runReasoningEngine({
      ...input, organizationId: profile.org_id, userId: user.id,
    });
    return { ok: true, result };
  } catch (e) { console.error("[reasoning-engine] ask failed:", e); return { ok: false, error: "ההסקה נכשלה." }; }
}

/** Run the offline reasoning self-tests (Part 12). */
export async function runReasoningSelfCheckAction(): Promise<ReasoningSelfCheck> {
  return runSelfCheck();
}
