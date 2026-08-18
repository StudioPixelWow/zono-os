/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Facebook campaign: Creative Studio PUBLISH-READINESS (server-only).
// A studio asset can be SELECTABLE in the campaign wizard but only PUBLISHABLE
// once an approved `facebook_groups` derivative exists (the extension resolves
// exactly that at publish time; without it the post silently falls back to
// queued). This module answers, canonically and BEFORE activation:
//   • ready            — an active facebook_groups derivative exists
//   • needs_promotion  — approved master exists but no derivative yet
//   • invalid          — missing/deleted/not-a-studio-asset
// and, when the caller is a manager, prepares it by REUSING the existing
// promotion flow (promoteForChannel) — no new media, no Studio changes.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { promoteForChannel, resolveJobDerivative } from "@/lib/creative-studio/promotion/creative-promotion-service";
import type { Channel } from "@/lib/creative-studio/promotion/creative-promotion-core";

const FB_CHANNEL = "facebook_groups" as Channel;
const FB_PURPOSE = "facebook_campaign";

export type FbReadinessStatus = "ready" | "needs_promotion" | "invalid";
export interface FbReadiness { status: FbReadinessStatus; canAutoPromote: boolean; reason: string }
export interface EnsureResult { ready: boolean; promoted?: boolean; reason: string }

interface OutputLite { id: string; org_id: string; status: string | null; is_approved: boolean | null; private_master_path: string | null; creative_version: number | null }

async function isManagerNow(): Promise<boolean> {
  try { const sb = await createClient(); const { data } = await sb.rpc("has_min_role", { p_min: "manager" }); return data === true; } catch { return false; }
}

async function loadOutput(db: any, orgId: string, outputId: string): Promise<OutputLite | null> {
  const { data } = await db.from("zono_quick_creative_outputs")
    .select("id,org_id,status,is_approved,private_master_path,creative_version")
    .eq("id", outputId).eq("org_id", orgId).neq("status", "deleted").maybeSingle();
  return (data as OutputLite | null) ?? null;
}

/** Mirrors the publish path exactly: is there an active facebook_groups derivative
 *  for this output+version that a job could actually receive? */
async function hasFbDerivative(orgId: string, outputId: string, version: number, db: any): Promise<boolean> {
  try {
    const res = await resolveJobDerivative({ orgId, outputId, targetChannel: FB_CHANNEL, creativeVersion: version, emergencyActive: false, db });
    return !!res.ok && !!res.derivative;
  } catch { return false; }
}

/** Read-only readiness of a selected Creative Studio output for Facebook groups. */
export async function getCreativeFacebookReadiness(outputId: string): Promise<FbReadiness> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId || !outputId) return { status: "invalid", canAutoPromote: false, reason: "no_org" };
  const db: any = createServiceRoleClient();
  const out = await loadOutput(db, orgId, outputId);
  if (!out) return { status: "invalid", canAutoPromote: false, reason: "not_found" };
  const version = out.creative_version ?? 1;
  if (await hasFbDerivative(orgId, outputId, version, db)) return { status: "ready", canAutoPromote: false, reason: "ok" };
  const approved = out.status === "approved" || out.is_approved === true;
  const manager = await isManagerNow();
  const canAutoPromote = manager && approved && !!out.private_master_path;
  const reason = !approved ? "not_approved" : !out.private_master_path ? "no_master" : !manager ? "needs_manager" : "ready_to_prepare";
  return { status: "needs_promotion", canAutoPromote, reason };
}

/** Ensure the output is publish-ready: no-op if a derivative exists; else promote
 *  it (managers only) via the EXISTING promotion flow. Never silently succeeds. */
export async function ensureCreativeFacebookReady(outputId: string): Promise<EnsureResult> {
  const { user, profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId || !outputId) return { ready: false, reason: "no_org" };
  const db: any = createServiceRoleClient();
  const out = await loadOutput(db, orgId, outputId);
  if (!out) return { ready: false, reason: "invalid" };
  const version = out.creative_version ?? 1;
  if (await hasFbDerivative(orgId, outputId, version, db)) return { ready: true, reason: "already" };

  const approved = out.status === "approved" || out.is_approved === true;
  if (!approved) return { ready: false, reason: "not_approved" };
  if (!out.private_master_path) return { ready: false, reason: "no_master" };
  if (!(await isManagerNow())) return { ready: false, reason: "needs_manager" };

  const promo = await promoteForChannel({ orgId, outputId, targetChannel: FB_CHANNEL, purpose: FB_PURPOSE, actorId: user?.id ?? null, isManager: true, db });
  if (promo.ok) return { ready: true, promoted: true, reason: promo.reused ? "already" : "promoted" };
  return { ready: false, reason: promo.error ?? "promote_failed" };
}
