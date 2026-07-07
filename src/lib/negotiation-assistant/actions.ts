"use server";
// ============================================================================
// 🤝 ZONO — AI Negotiation Assistant — server actions. PHASE 59.0. Read-only.
// Drafts are returned as text only — nothing is sent. Approval + editing happen
// in the existing Communication Studio before any message goes out.
// ============================================================================
import { buildNegotiationPlan, listNegotiationProperties, type BuildPlanInput, type NegotiationPropertyLite } from "./service";
import type { NegotiationPlan } from "./types";

export async function listNegotiationPropertiesAction(): Promise<{ properties: NegotiationPropertyLite[] }> {
  return { properties: await listNegotiationProperties().catch(() => []) };
}

export async function buildNegotiationPlanAction(input: BuildPlanInput): Promise<{ plan?: NegotiationPlan; error?: string }> {
  if (!input.propertyId) return { error: "בחר נכס" };
  try {
    const plan = await buildNegotiationPlan(input);
    return plan ? { plan } : { error: "הנכס לא נמצא" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "בניית התוכנית נכשלה" };
  }
}
