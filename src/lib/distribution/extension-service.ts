// ============================================================================
// ZONO — Chrome Extension handshake service (Phase 20, server-only).
// ----------------------------------------------------------------------------
// Secure pairing + instance auth + heartbeat + prepared-post delivery + result
// reporting for the browser-assisted Facebook GROUPS/MARKETPLACE publishing path.
//
// HARD SECURITY RULES:
//   - ZONO NEVER receives/stores Facebook passwords, cookies, or session tokens.
//   - Pairing codes + extension secrets are stored HASHED (sha256) — never raw.
//   - The extension only ever sends: status, version, fb-session-detected bool,
//     optional fb display name/id, heartbeat. Nothing else is persisted.
//   - No server-side browser automation, no scraping. Human approves every post.
// All writes use the service-role client AFTER the relevant auth check (ZONO
// session for pairing-start; instance secret for the rest).
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import type { ExtensionPathStatus } from "./facebook-connection-paths";
import { DIST } from "./db-types";

const PAIRINGS = "facebook_extension_pairings";
const INSTANCES = "facebook_extension_instances";
const LOG = "[fb-extension]";

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const stripSensitive = (m: Record<string, unknown>): Record<string, unknown> => {
  const banned = /(password|cookie|session_token|secret|credential)/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) if (!banned.test(k)) out[k] = v;
  return out;
};

// ── Pairing (Part B) ──────────────────────────────────────────────────────────
export interface PairingStart { code: string; expiresAt: string }

/** Create a short-lived (10 min), one-time pairing code bound to org+user. */
export async function startPairing(orgId: string, userId: string): Promise<PairingStart | null> {
  if (!isServiceRoleConfigured()) { console.error(`${LOG} startPairing: service role not configured`); return null; }
  // Human-friendly, high-entropy code (e.g. ZONO-AB12-CD34).
  const raw = `ZONO-${crypto.randomBytes(2).toString("hex").toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const db = createServiceRoleClient();
  const { error } = await db.from(PAIRINGS as never).insert({
    org_id: orgId, user_id: userId, code_hash: sha256(raw), expires_at: expiresAt,
  } as never);
  if (error) { console.error(`${LOG} startPairing insert failed: ${error.message}`); return null; }
  return { code: raw, expiresAt };
}

export interface PairingComplete { ok: boolean; instanceId?: string; secret?: string; message: string }

/**
 * Complete pairing: extension submits the code (+ a version). On success we
 * create an instance, return the instanceId + a one-time raw secret (stored
 * hashed), and mark the chrome_extension path 'installed'. No FB credentials.
 */
export async function completePairing(code: string, version?: string): Promise<PairingComplete> {
  if (!isServiceRoleConfigured()) return { ok: false, message: "service unavailable" };
  const db = createServiceRoleClient();
  const codeHash = sha256(code.trim());
  const { data } = await db.from(PAIRINGS as never)
    .select("id,org_id,user_id,expires_at,used_at").eq("code_hash", codeHash).maybeSingle();
  const row = data as { id: string; org_id: string; user_id: string; expires_at: string; used_at: string | null } | null;
  if (!row) return { ok: false, message: "invalid pairing code" };
  if (row.used_at) return { ok: false, message: "pairing code already used" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, message: "pairing code expired" };

  const instanceId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("base64url");
  const { error: insErr } = await db.from(INSTANCES as never).insert({
    org_id: row.org_id, user_id: row.user_id, instance_id: instanceId, secret_hash: sha256(secret),
    status: "installed", version: version ?? null, last_seen_at: new Date().toISOString(), metadata: {},
  } as never);
  if (insErr) { console.error(`${LOG} completePairing instance insert failed: ${insErr.message}`); return { ok: false, message: "could not create instance" }; }

  // One-time use: stamp the pairing as consumed.
  await db.from(PAIRINGS as never).update({ used_at: new Date().toISOString() } as never).eq("id", row.id);
  // Reflect install on the chrome_extension connection path (service-role; explicit org).
  await setExtensionPath(row.org_id, row.user_id, "installed", { version: version ?? null });

  console.log(`${LOG} paired org_id=${row.org_id} instance created [secret hashed, not logged]`);
  return { ok: true, instanceId, secret, message: "paired" };
}

// ── Instance auth (Part C) ──────────────────────────────────────────────────
export interface AuthedInstance { id: string; orgId: string; userId: string; status: string }

/** Authenticate an extension request by instance_id + raw secret (hash compare). */
export async function authInstance(instanceId: string | null, secret: string | null): Promise<AuthedInstance | null> {
  if (!instanceId || !secret || !isServiceRoleConfigured()) return null;
  const db = createServiceRoleClient();
  const { data } = await db.from(INSTANCES as never)
    .select("id,org_id,user_id,status,secret_hash").eq("instance_id", instanceId).maybeSingle();
  const row = data as { id: string; org_id: string; user_id: string; status: string; secret_hash: string } | null;
  if (!row || row.status === "revoked") return null;
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(row.secret_hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { id: row.id, orgId: row.org_id, userId: row.user_id, status: row.status };
}

// ── Heartbeat (Part B) ────────────────────────────────────────────────────────
export interface HeartbeatInput {
  version?: string;
  facebookSessionDetected?: boolean;
  facebookProfileName?: string | null;
  facebookProfileId?: string | null;
}

/** Update instance + connection-path status from a heartbeat. No credentials. */
export async function recordHeartbeat(inst: AuthedInstance, input: HeartbeatInput): Promise<ExtensionPathStatus> {
  const db = createServiceRoleClient();
  const sessionDetected = input.facebookSessionDetected === true;
  // ready only when installed AND a Facebook session is present in the user's browser.
  const status: ExtensionPathStatus = sessionDetected ? "ready" : "installed";
  const meta = stripSensitive({
    version: input.version ?? null,
    facebook_session_detected: sessionDetected,
    facebook_profile_name: input.facebookProfileName ?? null,
    facebook_profile_id: input.facebookProfileId ?? null,
  });
  await db.from(INSTANCES as never).update({
    status, version: input.version ?? null, last_seen_at: new Date().toISOString(), metadata: meta,
  } as never).eq("id", inst.id);
  await setExtensionPath(inst.orgId, inst.userId, status, meta);
  return status;
}

/** Revoke an instance (called from ZONO UI). */
export async function revokeInstance(instanceId: string, orgId: string): Promise<boolean> {
  if (!isServiceRoleConfigured()) return false;
  const db = createServiceRoleClient();
  const { error } = await db.from(INSTANCES as never)
    .update({ status: "revoked" } as never).eq("instance_id", instanceId).eq("org_id", orgId);
  return !error;
}

/** Disable the extension for an org: revoke all instances + reset the path. */
export async function revokeAllInstances(orgId: string, userId: string | null): Promise<boolean> {
  if (!isServiceRoleConfigured()) return false;
  const db = createServiceRoleClient();
  const { error } = await db.from(INSTANCES as never)
    .update({ status: "revoked" } as never).eq("org_id", orgId);
  await setExtensionPath(orgId, userId, "not_installed", {});
  return !error;
}

// ── Prepared-post delivery (Part D) ───────────────────────────────────────────
export interface NextPostPayload {
  postId: string;
  destinationName: string | null;
  destinationUrl: string | null;
  text: string;
  imageUrls: string[];
  hashtags: string[];
  complianceWarnings: string[];
  requiresHumanConfirm: true;
}

const GROUP_COMPLIANCE = [
  "פרסם רק בקבוצות שבהן אתה חבר/מנהל ומורשה לפרסם.",
  "כבד את חוקי הקבוצה. אל תפרסם תוכן זהה בהרבה קבוצות בו-זמנית.",
  "הפרסום מתבצע ידנית על ידך בדפדפן שלך — ZONO לא מפרסם עבורך.",
];

/** The next prepared GROUP/MARKETPLACE post for this org (no tokens, no PII). */
export async function getNextPost(inst: AuthedInstance): Promise<NextPostPayload | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from(DIST.posts as never)
    .select("id,post_text,hashtags,image_url,external_destination_url,group_id,status,metadata,scheduled_at")
    .eq("org_id", inst.orgId)
    .in("status", ["scheduled", "queued", "draft"] as never)
    .order("scheduled_at", { ascending: true })
    .limit(20);
  const rows = (data ?? []) as unknown as Array<{
    id: string; post_text: string | null; hashtags: string[] | null; image_url: string | null;
    external_destination_url: string | null; group_id: string | null; metadata: Record<string, unknown> | null;
  }>;
  // Prefer browser-assisted destinations (groups/marketplace).
  const pick = rows.find((r) => {
    const kind = (r.metadata?.channel_kind as string) ?? (r.group_id ? "facebook_group" : "");
    return kind === "facebook_group" || kind === "facebook_marketplace";
  }) ?? rows.find((r) => !!r.group_id);
  if (!pick) return null;

  let destinationName: string | null = null;
  let destinationUrl: string | null = pick.external_destination_url ?? null;
  if (pick.group_id) {
    const { data: g } = await db.from(DIST.groups as never)
      .select("name,group_url").eq("id", pick.group_id).maybeSingle();
    const grp = g as { name?: string; group_url?: string } | null;
    destinationName = grp?.name ?? null;
    destinationUrl = destinationUrl ?? grp?.group_url ?? null;
  }
  return {
    postId: pick.id,
    destinationName,
    destinationUrl,
    text: pick.post_text ?? "",
    imageUrls: pick.image_url ? [pick.image_url] : [],
    hashtags: Array.isArray(pick.hashtags) ? pick.hashtags : [],
    complianceWarnings: GROUP_COMPLIANCE,
    requiresHumanConfirm: true,
  };
}

// ── Publish result reporting (Part E) ─────────────────────────────────────────
export type PublishResultKind = "user_confirmed_published" | "user_cancelled" | "failed" | "needs_manual_action";
export interface PublishReport {
  postId: string;
  result: PublishResultKind;
  externalPostUrl?: string | null;
  errorMessage?: string | null;
}

/** Apply the extension's human-confirmed result to the distribution post. No fake success. */
export async function recordPublishResult(inst: AuthedInstance, report: PublishReport): Promise<boolean> {
  const db = createServiceRoleClient();
  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  switch (report.result) {
    case "user_confirmed_published":
      patch = { status: "published", published_at: now, published_manually_at: now,
        external_post_url: report.externalPostUrl ?? null, failure_reason: null };
      break;
    case "user_cancelled":
      patch = { status: "cancelled", skipped_reason: "user_cancelled" };
      break;
    case "failed":
      patch = { status: "failed", failure_reason: (report.errorMessage ?? "extension reported failure").slice(0, 500) };
      break;
    case "needs_manual_action":
      patch = { status: "queued", failure_reason: "needs_manual_action" };
      break;
    default:
      return false;
  }
  const { error } = await db.from(DIST.posts as never)
    .update(patch as never).eq("id", report.postId).eq("org_id", inst.orgId);
  if (error) { console.error(`${LOG} recordPublishResult failed: ${error.message}`); return false; }
  console.log(`${LOG} org_id=${inst.orgId} post=${report.postId} result=${report.result}`);
  return true;
}

// ── helper: set chrome_extension path via service-role (explicit org) ─────────
async function setExtensionPath(orgId: string, userId: string | null, status: ExtensionPathStatus, metadata: Record<string, unknown>): Promise<void> {
  // facebookConnectionPathRepository.setStatusServiceRole accepts an explicit org.
  const { facebookConnectionPathRepository } = await import("./facebook-connection-paths");
  await facebookConnectionPathRepository.setStatusServiceRole(orgId, userId, "chrome_extension", status, metadata).catch(() => {});
}
