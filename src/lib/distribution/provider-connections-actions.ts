"use server";
// ============================================================================
// ZONO — Distribution provider-connections server actions (Phase 10.3).
// Connection management only. Validation runs the existing Facebook provider
// STUB and returns manual_publish_required / not_connected — never a fake
// "connected". No publishing, no scraping.
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  providerConnectionService, type ConnectionProvider, type ProviderConnectionView,
} from "./provider-connections";

export interface ConnActionResult<T = undefined> { ok: boolean; message?: string; data?: T }
const revalidate = () => { try { revalidatePath("/settings/distribution-connections"); } catch { /* noop */ } };

/** All providers + their persisted connection + honest stub validation status. */
export async function getDistributionConnectionsAction(): Promise<ProviderConnectionView[]> {
  return providerConnectionService.listConnections();
}

/** Turn on MANUAL Facebook mode (official API still requires Meta approval). */
export async function initializeManualFacebookConnectionAction(): Promise<ConnActionResult> {
  const res = await providerConnectionService.initializeManualFacebook();
  revalidate();
  return res;
}

/** Validate a provider via the stub — returns manual_publish_required / not_connected. */
export async function validateProviderConnectionAction(provider: ConnectionProvider): Promise<ConnActionResult<{ status: string }>> {
  const res = await providerConnectionService.validate(provider);
  revalidate();
  return { ok: true, message: res.message, data: { status: res.status } };
}

export async function disconnectProviderAction(provider: ConnectionProvider): Promise<ConnActionResult> {
  const res = await providerConnectionService.disconnect(provider);
  revalidate();
  return res;
}
