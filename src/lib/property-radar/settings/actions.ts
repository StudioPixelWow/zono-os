"use server";
// ============================================================================
// ZONO Property Radar™ — settings page server actions (org-scoped via session).
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  getPropertyRadarSettingsPageData,
  runManualPropertyRadarSync,
  updatePropertyRadarSettings,
  type ManualSyncInput,
} from "./service";
import type {
  ManualSyncResultDTO,
  PropertyRadarPageData,
  PropertyRadarSettingsForm,
} from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב." };
}

export async function getPropertyRadarSettingsPageDataAction(): Promise<Result<PropertyRadarPageData>> {
  try {
    return { ok: true, data: await getPropertyRadarSettingsPageData() };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePropertyRadarSettingsAction(
  input: Partial<PropertyRadarSettingsForm>,
): Promise<Result<PropertyRadarSettingsForm>> {
  try {
    const data = await updatePropertyRadarSettings(input);
    revalidatePath("/settings/property-radar");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function runManualPropertyRadarSyncAction(
  input: ManualSyncInput,
): Promise<Result<ManualSyncResultDTO>> {
  try {
    const data = await runManualPropertyRadarSync(input);
    revalidatePath("/settings/property-radar");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}
