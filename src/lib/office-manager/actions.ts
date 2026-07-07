"use server";
// ============================================================================
// 🏢 ZONO — Office AI Manager — server actions. PHASE 55.0. Read-only, advisory.
// ============================================================================
import { getOfficeManager } from "./service";
import type { OfficeManagerReport } from "./types";

export async function getOfficeManagerAction(): Promise<{ report?: OfficeManagerReport; error?: string }> {
  try {
    return { report: await getOfficeManager() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "טעינת מרכז הניהול נכשלה" };
  }
}
