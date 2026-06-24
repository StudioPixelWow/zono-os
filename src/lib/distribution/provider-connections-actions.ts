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
import {
  facebookConnectionPathService, type ExtensionPathStatus, type FacebookPathView,
} from "./facebook-connection-paths";
import { metaPagesService, type MetaPageDestinationView, type SyncMetaPagesResult } from "./meta-pages";

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

// ── Phase 17: two parallel Facebook connection PATHS (Meta OAuth + Chrome ext) ──

/** Both connection paths with honest defaults — never a fabricated connected/ready. */
export async function getFacebookConnectionPathsAction(): Promise<{ meta: FacebookPathView; extension: FacebookPathView }> {
  return facebookConnectionPathService.getPaths();
}

/**
 * "חבר Meta" — start the official Meta OAuth path. OAuth + App Review are not yet
 * wired, so this returns an honest "in progress" message and does NOT set
 * connected. (Real OAuth handshake lands in a later integration phase.)
 */
export async function startMetaOAuthAction(): Promise<ConnActionResult> {
  const res = await facebookConnectionPathService.startMetaOAuth();
  revalidate();
  return res;
}

/**
 * Read the real Chrome-extension path state (never fabricates installed/ready).
 * The status only becomes installed/ready when the real extension heartbeats.
 */
export async function refreshExtensionStatusAction(): Promise<ConnActionResult<{ status: ExtensionPathStatus }>> {
  const status = await facebookConnectionPathService.refreshExtensionStatus();
  return { ok: true, data: { status } };
}

/**
 * Heartbeat endpoint for the real Chrome extension to report its NON-sensitive
 * status (never a password/cookie/session). Validates the status value.
 */
export async function recordExtensionHeartbeatAction(status: ExtensionPathStatus, version?: string): Promise<ConnActionResult> {
  const res = await facebookConnectionPathService.recordExtensionHeartbeat(status, version);
  revalidate();
  return res;
}

// ── Phase 19: Facebook Page discovery (GET /me/accounts) — DISCOVERY ONLY ──────

/** Read the stored Facebook Page destinations for the current org (no tokens). */
export async function getMetaPagesAction(): Promise<MetaPageDestinationView[]> {
  return metaPagesService.listPages();
}

/**
 * Discover + store the Pages the connected Facebook account manages. Never
 * publishes. Returns honest not_connected / expired / permission states.
 */
export async function syncMetaPagesAction(): Promise<SyncMetaPagesResult> {
  const res = await metaPagesService.syncPages();
  revalidate();
  return res;
}
