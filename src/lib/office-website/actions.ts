"use server";

import { revalidatePath } from "next/cache";
import {
  createOrGetOfficeWebsite, updateOfficeWebsite, publishOfficeWebsite, unpublishOfficeWebsite,
  toggleWebsiteSection, submitWebsiteLead,
} from "./service";

export interface OfficeSiteActionState { ok?: boolean; error?: string; message?: string; slug?: string }

function revalidate() {
  revalidatePath("/office-website");
  revalidatePath("/");
}

// ── Manager actions (auth + manager-gated via RLS) ───────────────────────────
export async function createOfficeWebsiteAction(): Promise<OfficeSiteActionState> {
  try {
    const site = await createOrGetOfficeWebsite() as { slug: string | null };
    revalidate();
    return { ok: true, slug: site.slug ?? undefined, message: "אתר המשרד נוצר — ערוך, אשר ופרסם" };
  } catch (e) { return { error: e instanceof Error ? e.message : "יצירת האתר נכשלה" }; }
}
export async function updateOfficeWebsiteAction(patch: Record<string, unknown>): Promise<OfficeSiteActionState> {
  try { await updateOfficeWebsite(patch as never); revalidate(); return { ok: true, message: "נשמר" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שמירה נכשלה" }; }
}
export async function publishOfficeWebsiteAction(): Promise<OfficeSiteActionState> {
  try { await publishOfficeWebsite(); revalidate(); return { ok: true, message: "האתר פורסם" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "פרסום נכשל" }; }
}
export async function unpublishOfficeWebsiteAction(): Promise<OfficeSiteActionState> {
  try { await unpublishOfficeWebsite(); revalidate(); return { ok: true, message: "האתר הושבת" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "השבתה נכשלה" }; }
}
export async function toggleWebsiteSectionAction(section: string, enabled: boolean): Promise<OfficeSiteActionState> {
  try { await toggleWebsiteSection(section, enabled); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון נכשל" }; }
}

// ── Public action (NO auth — service-role; called from the public site form) ──
export async function submitWebsiteLeadAction(slug: string, input: { sourceSection: string; fullName?: string; phone?: string; email?: string; city?: string; propertyType?: string; rooms?: string; message?: string; intent?: string }): Promise<OfficeSiteActionState> {
  try {
    const r = await submitWebsiteLead(slug, input);
    if (!r.ok) return { error: r.error ?? "השליחה נכשלה" };
    return { ok: true, message: "תודה! ניצור איתך קשר בהקדם." };
  } catch { return { error: "השליחה נכשלה — נסה שוב" }; }
}
