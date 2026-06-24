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
import { metaPagesService, type MetaPageDestinationView, type MetaIntegrationView, type SyncMetaPagesResult } from "./meta-pages";
import { metaPublishService, type PublishResult } from "./meta-publish";
import { startPairing, revokeAllInstances } from "./extension-service";
import { getSessionContext } from "@/lib/auth/session";

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
 * Discover + store Pages + linked Instagram + Lead Ads forms for the connected
 * Facebook account. Never publishes. Honest not_connected/expired/permission.
 */
export async function syncMetaPagesAction(): Promise<SyncMetaPagesResult> {
  const res = await metaPagesService.syncPages();
  revalidate();
  return res;
}

/** Full Meta integration snapshot: pages + instagram + lead forms + permissions readiness. */
export async function getMetaIntegrationAction(): Promise<MetaIntegrationView> {
  return metaPagesService.getIntegration();
}

// ── Phase 20: Chrome extension pairing (Facebook Groups assistant) ─────────────

/** Start a pairing session — returns a short-lived one-time code to show the user. */
export async function startExtensionPairingAction(): Promise<ConnActionResult<{ code: string; expiresAt: string }>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id || !profile.id) return { ok: false, message: "אין הרשאה." };
  const res = await startPairing(profile.org_id, profile.id);
  if (!res) return { ok: false, message: "יצירת קוד החיבור נכשלה." };
  return { ok: true, data: { code: res.code, expiresAt: res.expiresAt }, message: "קוד חיבור נוצר." };
}

/** Disable the Chrome extension for this org (revoke all instances). */
export async function revokeExtensionAction(): Promise<ConnActionResult> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, message: "אין הרשאה." };
  const ok = await revokeAllInstances(profile.org_id, profile.id ?? null);
  revalidate();
  return { ok, message: ok ? "התוסף נותק." : "ניתוק התוסף נכשל." };
}

/**
 * Publish a prepared post to a connected Facebook PAGE (official Graph API).
 * Pages only — never groups. Publishes ONLY on confirmed API success.
 */
export async function publishToFacebookPageAction(input: {
  destinationExternalId: string; text: string; imageUrl?: string | null; postId?: string | null;
}): Promise<PublishResult> {
  const res = await metaPublishService.publishToFacebookPage(input);
  revalidate();
  return res;
}
