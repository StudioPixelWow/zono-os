"use server";

import { revalidatePath } from "next/cache";
import { generateKnowledgeGraph } from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface GraphActionState { error?: string; ok?: boolean; message?: string }

export async function generateGraphAction(): Promise<GraphActionState> {
  try {
    const s = await generateKnowledgeGraph();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[graph] decision recalc failed:", e); }
    revalidatePath("/graph");
    revalidatePath("/command");
    return { ok: true, message: `${s.nodes} צמתים · ${s.edges} קשרים · ${s.signals} סיגנלים` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "בניית הגרף נכשלה" };
  }
}
