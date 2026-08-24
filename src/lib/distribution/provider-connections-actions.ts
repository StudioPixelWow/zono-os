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
import {
  startPairing, revokeAllInstances,
  addGroupDestination, listGroupDestinations, createGroupPublishTasks, listGroupTaskStatuses,
  listApprovedCreativesForOrg,
  type GroupDestination, type GroupTaskStatus, type GroupCreativeOption,
} from "./extension-service";
import { getSessionContext } from "@/lib/auth/session";
import { assertProviderSpendAllowed } from "@/lib/commercial/billing-access";
import { resolveRoleKey } from "@/lib/auth/role";
import { canManageConnections } from "@/lib/auth/connection-roles";

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
  // Disconnecting a shared org integration is owner/manager-only.
  const { profile } = await getSessionContext();
  if (!canManageConnections(await resolveRoleKey(profile))) return { ok: false, message: "רק מנהל משרד יכול לנתק חיבור." };
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

// ── Phase 21: manual Facebook group destinations + group publish tasks ─────────

export async function listFacebookGroupsAction(): Promise<GroupDestination[]> {
  return listGroupDestinations();
}

export async function addFacebookGroupAction(input: {
  destinationType: "facebook_group" | "facebook_marketplace"; name: string; url: string; notes?: string;
}): Promise<ConnActionResult<GroupDestination>> {
  if (!input.name?.trim() || !input.url?.trim()) return { ok: false, message: "יש להזין שם וקישור." };
  const row = await addGroupDestination(input);
  revalidate();
  return row ? { ok: true, data: row, message: "הקבוצה נוספה." } : { ok: false, message: "הוספת הקבוצה נכשלה." };
}

/** Create one prepared publish task per selected group (assigned to the extension). No server publish.
 *  When `outputId` is given, the extension is handed the APPROVED facebook_groups
 *  derivative of that creative (secure signed URL) — never a raw/master URL. */
export async function sendGroupPublishTasksAction(input: {
  destinationIds: string[]; text: string; imageUrl?: string | null; outputId?: string | null; creativeVersion?: number | null;
}): Promise<ConnActionResult<{ created: number; blocked?: string }>> {
  if (!input.destinationIds?.length) return { ok: false, message: "בחר לפחות קבוצה אחת." };
  if (!input.text?.trim()) return { ok: false, message: "כתוב טקסט לפוסט." };
  const res = await createGroupPublishTasks(input);
  // 8.3 — billing restriction surfaces the canonical recovery message.
  if (res.created === 0 && res.blocked === "billing_restricted") return { ok: false, message: "המנוי ממתין להסדרת תשלום" };
  // Honest block: an unapproved/absent creative derivative must not silently drop
  // the image — surface it so the user can approve the creative or post text-only.
  if (res.created === 0 && res.blocked) return { ok: false, message: `התמונה לא מוכנה לפרסום (${res.blocked}). אפשר לאשר את הקריאייטיב או לשלוח טקסט בלבד.` };
  revalidate();
  return res.created > 0
    ? { ok: true, data: res, message: `נשלחו ${res.created} משימות פרסום לתוסף.` }
    : { ok: false, message: "יצירת משימות הפרסום נכשלה." };
}

export async function listGroupTaskStatusesAction(): Promise<GroupTaskStatus[]> {
  return listGroupTaskStatuses();
}

/** Approved creatives the group composer can attach as an image (P9.7B image hand-off). */
export async function listGroupCreativesAction(): Promise<GroupCreativeOption[]> {
  return listApprovedCreativesForOrg();
}

/**
 * Publish a prepared post to a connected Facebook PAGE (official Graph API).
 * Pages only — never groups. Publishes ONLY on confirmed API success.
 */
export async function publishToFacebookPageAction(input: {
  destinationExternalId: string; text: string; imageUrl?: string | null; postId?: string | null;
}): Promise<PublishResult> {
  // 8.3 — external Graph publish is paid distribution activity → gated (fail-closed).
  try { const { profile } = await getSessionContext(); if (profile?.org_id) await assertProviderSpendAllowed(profile.org_id); }
  catch { return { ok: false, reason: "billing_restricted", message: "המנוי ממתין להסדרת תשלום" }; }
  const res = await metaPublishService.publishToFacebookPage(input);
  revalidate();
  return res;
}
