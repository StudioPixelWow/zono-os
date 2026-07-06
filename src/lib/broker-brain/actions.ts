"use server";
// ============================================================================
// 🧠 ZONO — AI Broker Brain — server actions. PHASE 50.0.
// Runs the brain (read/compose) and delegates approvals to the EXISTING Approval
// Bundle Engine (44.0). No new approval system. Nothing auto-executes.
// ============================================================================
import { revalidatePath } from "next/cache";
import { getBrokerBrainPlan } from "./service";
import { approveBundle } from "@/lib/approval-bundle/service";
import type { ActionType } from "@/lib/approval-bundle/types";
import type { BrokerPlan } from "./types";

/** Compose an evidence-backed plan for a strategic goal. */
export async function runBrokerBrainAction(goalText: string): Promise<{ plan?: BrokerPlan; error?: string }> {
  const text = (goalText ?? "").trim();
  if (!text) return { error: "כתוב מטרה — למשל: ״הבא לי 10 בלעדיות החודש״ או ״יש לי שעתיים פנויות״." };
  try {
    return { plan: await getBrokerBrainPlan(text) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "בניית התוכנית נכשלה" };
  }
}

/** Approve a bundle action proposed inside a plan (reuses approveBundle). */
export async function approveBrokerBrainActionAction(input: { bundleId: string; which?: ActionType | "all" }): Promise<{ ok: boolean; error?: string; message?: string }> {
  if (!input.bundleId) return { ok: false, error: "חסר מזהה באנדל" };
  try {
    const r = await approveBundle(input.bundleId, input.which ?? "all");
    revalidatePath("/brain");
    revalidatePath("/today");
    return { ok: !!r.ok, message: r.ok ? "הפעולה אושרה ונוצרה בכפוף לתהליך הקיים." : undefined, error: r.ok ? undefined : "האישור נכשל" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "האישור נכשל" };
  }
}
