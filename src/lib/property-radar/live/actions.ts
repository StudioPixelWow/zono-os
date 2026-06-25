"use server";
// ============================================================================
// ZONO Property Radar™ — Live Command Center server actions (org-scoped).
// Refresh the whole screen (polling fallback for realtime) + lazy-load a
// property side panel. Org scope comes from the session inside the service.
// ============================================================================
import { getPropertyRadarLiveData, getPropertySidePanel } from "./service";
import type { PropertyRadarLiveData, PropertySidePanelData } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." };
}

export async function getPropertyRadarLiveDataAction(): Promise<Result<PropertyRadarLiveData>> {
  try { return { ok: true, data: await getPropertyRadarLiveData() }; }
  catch (e) { return fail(e); }
}

export async function getPropertySidePanelAction(marketPropertySourceId: string): Promise<Result<PropertySidePanelData>> {
  try {
    if (!marketPropertySourceId) throw new Error("מזהה נכס חסר.");
    return { ok: true, data: await getPropertySidePanel(marketPropertySourceId) };
  } catch (e) { return fail(e); }
}
