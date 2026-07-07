"use server";
// ============================================================================
// 🛒 ZONO — Marketplace Intelligence — server actions. PHASE 58.0. Read-only.
// Broker alerts reuse the EXISTING approval-gated draft actions in external-listings.
// ============================================================================
import { getMarketplaceIntel } from "./service";
import type { MarketplaceReport } from "./types";

export async function getMarketplaceIntelAction(): Promise<{ report?: MarketplaceReport; error?: string }> {
  try {
    return { report: await getMarketplaceIntel() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "טעינת מודיעין השוק נכשלה" };
  }
}

// Re-export the EXISTING approval-gated broker-alert draft actions (no new alert system).
export { createAcquisitionAlertDraftAction, createBuyerMatchAlertDraftAction } from "@/lib/external-listings/alert-actions";
