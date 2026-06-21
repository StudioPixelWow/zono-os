"use server";

import { revalidatePath } from "next/cache";
import {
  createOrGetAgentWebsite, updateAgentWebsite, publishAgentWebsite, unpublishAgentWebsite,
  toggleAgentSection, submitAgentLead,
} from "./service";

export interface AgentSiteActionState { ok?: boolean; error?: string; message?: string; slug?: string }

function revalidate() { revalidatePath("/agent-website"); revalidatePath("/"); }

// ── Agent actions (auth; agent edits own via RLS) ────────────────────────────
export async function createAgentWebsiteAction(): Promise<AgentSiteActionState> {
  try { const site = await createOrGetAgentWebsite() as { slug: string | null }; revalidate(); return { ok: true, slug: site.slug ?? undefined, message: "האתר האישי נוצר — ערוך, אשר ופרסם" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת האתר נכשלה" }; }
}
export async function updateAgentWebsiteAction(patch: Record<string, unknown>): Promise<AgentSiteActionState> {
  try { await updateAgentWebsite(patch); revalidate(); return { ok: true, message: "נשמר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שמירה נכשלה" }; }
}
export async function publishAgentWebsiteAction(): Promise<AgentSiteActionState> {
  try { await publishAgentWebsite(); revalidate(); return { ok: true, message: "האתר פורסם" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "פרסום נכשל" }; }
}
export async function unpublishAgentWebsiteAction(): Promise<AgentSiteActionState> {
  try { await unpublishAgentWebsite(); revalidate(); return { ok: true, message: "האתר הושבת" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "השבתה נכשלה" }; }
}
export async function toggleAgentSectionAction(section: string, enabled: boolean): Promise<AgentSiteActionState> {
  try { await toggleAgentSection(section, enabled); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון נכשל" }; }
}

// ── Public action (NO auth — service-role; called from the public agent site) ─
export async function submitAgentLeadAction(slug: string, input: { sourceSection: string; fullName?: string; phone?: string; email?: string; city?: string; propertyType?: string; rooms?: string; budget?: string; timeline?: string; message?: string }): Promise<AgentSiteActionState> {
  try {
    const r = await submitAgentLead(slug, input);
    if (!r.ok) return { error: r.error ?? "השליחה נכשלה" };
    return { ok: true, message: "תודה! ניצור איתך קשר בהקדם." };
  } catch { return { error: "השליחה נכשלה — נסה שוב" }; }
}
