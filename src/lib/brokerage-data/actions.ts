"use server";
// ============================================================================
// ZONO Core Data — Brokerage Data server actions. Reads are RLS-scoped; owner-
// only management actions are gated via requireOwner().
// ============================================================================
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { requireOwner } from "./permissions";
import {
  getBrokerageCommandCenter, resolveBrokerageLinksForOrg, reviewIdentityMatch,
  resolveDataConflict, decideListingLink, recordRefreshRequest,
  startBrokerageDataRefresh, getRefreshRunStatus, getOfficeDna, getBrokerDna,
  type BrokerageCommandCenter, type ResolveStats,
} from "./service";
import type { BrokerageDna } from "./dna";
import { reasonBrokerageDna, type DnaReasonResult } from "./dna-reasoning";
import { getBrokerageAccess } from "./permissions";
import { discoverBrokeragePublishers, type DiscoveryResult } from "./discovery";
import { gatherBrokerOfficeEvidence, reasonBrokerOffice, type BrokerOfficeReasonResult } from "./office-reasoning";
import { getProfileExtras, type ProfileExtras } from "./profile-data";
import { getBrokerageDataOverview, getBrokerDirectory, EMPTY_BROKERAGE_OVERVIEW, type BrokerageDataOverview, type BrokerDirectory } from "./overview";

export async function getBrokerageCommandCenterAction(opts: { city?: string | null; search?: string | null } = {}): Promise<BrokerageCommandCenter | null> {
  try { return await getBrokerageCommandCenter(opts); }
  catch (e) { console.error("[brokerage-data] command center failed:", e); return null; }
}

/** CANONICAL brokerage counters — the single source of truth (RLS-independent,
 *  matches the manual verification SQL). Gated by an authenticated org user with
 *  brokerage access. Returns an empty (all-zero) overview when not visible. */
export async function getBrokerageDataOverviewAction(): Promise<BrokerageDataOverview> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return EMPTY_BROKERAGE_OVERVIEW;
    const access = await getBrokerageAccess();
    if (!access) return EMPTY_BROKERAGE_OVERVIEW;
    return await getBrokerageDataOverview(profile.org_id);
  } catch (e) { console.error("[brokerage-data] overview failed:", e); return EMPTY_BROKERAGE_OVERVIEW; }
}

/** Real Broker Directory rows (canonical: brokerage_agents + links). Gated by an
 *  authenticated org user with brokerage access. Null when not visible. */
export async function getBrokerDirectoryAction(): Promise<BrokerDirectory | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    const access = await getBrokerageAccess();
    if (!access) return null;
    return await getBrokerDirectory();
  } catch (e) { console.error("[brokerage-data] directory failed:", e); return null; }
}

/** Deterministic DNA profile for an office (RLS-scoped; null if not visible). */
export async function getOfficeDnaAction(officeId: string): Promise<BrokerageDna | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await getOfficeDna(officeId);
  } catch (e) { console.error("[brokerage-data] office DNA failed:", e); return null; }
}

/** Deterministic DNA profile for a broker (RLS-scoped; null if not visible). */
export async function getBrokerDnaAction(agentId: string): Promise<BrokerageDna | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await getBrokerDna(agentId);
  } catch (e) { console.error("[brokerage-data] broker DNA failed:", e); return null; }
}

/**
 * AI reasoning over an office/broker DNA. OpenAI reasons over the deterministic
 * DNA evidence only (never the source of truth) via the official gateway, and
 * gracefully returns a config message when no OpenAI key is configured. Nothing
 * is persisted. RLS-scoped (null DNA when the entity isn't visible).
 */
export async function reasonBrokerageDnaAction(target: { type: "office" | "broker"; id: string }): Promise<DnaReasonResult> {
  try {
    const { profile, organization } = await getSessionContext();
    if (!profile?.org_id) return { dna: null, answer: null };
    const access = await getBrokerageAccess();
    const p = profile as { id?: string | null; full_name?: string | null };
    return await reasonBrokerageDna({
      type: target.type, id: target.id,
      orgId: profile.org_id, userId: p.id ?? null,
      orgName: organization?.name ?? null, userName: p.full_name ?? null,
      isManager: access?.isOwner ?? false,
    });
  } catch (e) {
    console.error("[brokerage-data] DNA reasoning failed:", e);
    return { dna: null, answer: null };
  }
}

export interface BrokerageActionState { error?: string; message?: string; stats?: ResolveStats }

/** Run Broker Identity Resolution across the org's external listings now.
 *  TODO before launch: restrict this action to owner/admin only. During QA /
 *  pre-launch testing it is intentionally open to any authenticated org user. */
export async function resolveBrokerageNowAction(): Promise<BrokerageActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { error: "יש להתחבר כדי להפעיל סריקה." };
    // Audit: record who started the scan (no service-role on the client).
    console.info(`[brokerage-data] identity scan started by user=${profile.id ?? "?"} org=${profile.org_id}`);
    const stats = await resolveBrokerageLinksForOrg(profile.org_id);
    revalidatePath("/brokerage-data");
    return {
      stats,
      message: `זוהו ${stats.linked} קישורים אוטומטיים · ${stats.review} לבדיקה · ${stats.candidates} מועמדים (מתוך ${stats.scanned} מודעות).`,
    };
  } catch (e) {
    console.error("[brokerage-data] resolve scan failed:", e);
    return { error: "הסריקה לא התחילה. נסה שוב בעוד רגע." };
  }
}

/** Queue a brokerage intelligence refresh / initial scan.
 *  TODO before launch: restrict this action to owner/admin only. During QA /
 *  pre-launch testing it is intentionally open to any authenticated org user. */
export async function requestBrokerageRefreshAction(params: Record<string, unknown>): Promise<BrokerageActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { error: "יש להתחבר כדי להפעיל סריקה." };
    // Audit: recordRefreshRequest persists the request row (who/when) already.
    console.info(`[brokerage-data] refresh requested by user=${profile.id ?? "?"} org=${profile.org_id}`);
    await recordRefreshRequest(params);
    revalidatePath("/brokerage-data");
    return { message: "בקשת הסריקה נרשמה ✓ — המודיעין יתעדכן ברקע." };
  } catch (e) {
    console.error("[brokerage-data] refresh request failed:", e);
    return { error: "הסריקה לא התחילה. נסה שוב בעוד רגע." };
  }
}

export interface StartRefreshActionState { ok: boolean; runId: string | null; status: string; message?: string; error?: string }

/**
 * Start the brokerage data scan / initial intelligence scan. Wires the button to
 * the REAL synchronous identity-resolution flow (no new engine), persists a
 * brokerage_refresh_runs row (running → completed/failed) and returns a typed
 * result the UI can render. Idempotent per org (a running scan is reused).
 *
 * TODO before launch: restrict this action to owner/admin only. During QA /
 * pre-launch testing it is intentionally open to any authenticated org user.
 */
export async function startBrokerageDataRefreshAction(params: Record<string, unknown> = {}): Promise<StartRefreshActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, runId: null, status: "failed", error: "יש להתחבר כדי להפעיל סריקה." };
    console.info(`[brokerage-data] scan button pressed user=${profile.id ?? "?"} org=${profile.org_id}`);
    const r = await startBrokerageDataRefresh(profile.org_id, profile.id ?? null, params);
    revalidatePath("/brokerage-data");
    // Surface the REAL reason (e.g. a stalled/partial pipeline) instead of a generic error.
    if (!r.ok) return { ok: false, runId: r.runId, status: r.status, error: r.message ?? "הסריקה לא התחילה. בדוק חיבור או נסה שוב." };
    return { ok: true, runId: r.runId, status: r.status, message: r.message };
  } catch (e) {
    console.error("[brokerage-data] start refresh failed:", e);
    return { ok: false, runId: null, status: "failed", error: "הסריקה לא התחילה. בדוק חיבור או נסה שוב." };
  }
}

export interface DiscoveryActionState { ok: boolean; result?: DiscoveryResult; error?: string }

/**
 * Discover broker/agent publishers from the org's already-ingested external
 * listings (lawful `listing_publishers` provider — no web scraping). New brokers
 * are persisted as candidates and deduped. Owner/admin only (writes national
 * candidate data). Friendly Hebrew errors.
 */
export async function discoverBrokeragePublishersAction(): Promise<DiscoveryActionState> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, error: "יש להתחבר כדי להפעיל גילוי." };
    const access = await getBrokerageAccess();
    if (!access?.isOwner) return { ok: false, error: "גילוי מפרסמים זמין למנהל הסוכנות בלבד." };
    const p = profile as { id?: string | null };
    console.info(`[brokerage-data] publisher discovery by user=${p.id ?? "?"} org=${profile.org_id}`);
    const result = await discoverBrokeragePublishers(profile.org_id, p.id ?? null);
    revalidatePath("/brokerage-data");
    return result.ran ? { ok: true, result } : { ok: false, error: result.message };
  } catch (e) {
    console.error("[brokerage-data] discovery action failed:", e);
    return { ok: false, error: "הגילוי לא התחיל. נסה שוב בעוד רגע." };
  }
}

/**
 * On-demand Broker→Office evidence + (optional) evidence-only OpenAI reasoning.
 * Deterministic evidence always returned; AI reasons over it only when usable
 * evidence exists and a key is configured (graceful otherwise). RLS-scoped.
 */
export async function reasonBrokerOfficeAction(agentId: string): Promise<BrokerOfficeReasonResult | null> {
  try {
    const { profile, organization } = await getSessionContext();
    if (!profile?.org_id) return null;
    const access = await getBrokerageAccess();
    const p = profile as { id?: string | null; full_name?: string | null };
    return await reasonBrokerOffice(agentId, {
      orgId: profile.org_id, userId: p.id ?? null, orgName: organization?.name ?? null,
      userName: p.full_name ?? null, isManager: access?.isOwner ?? false,
    });
  } catch (e) { console.error("[brokerage-data] office reasoning failed:", e); return null; }
}

/** Profile extras for the broker/office drawer (linked listings, office brokers). */
export async function getProfileExtrasAction(kind: "broker" | "office", id: string): Promise<ProfileExtras | null> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await getProfileExtras(kind, id);
  } catch (e) { console.error("[brokerage-data] profile extras failed:", e); return null; }
}

/** Deterministic office evidence only (no AI) — RLS-scoped. */
export async function getBrokerOfficeEvidenceAction(agentId: string) {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    return await gatherBrokerOfficeEvidence(agentId);
  } catch (e) { console.error("[brokerage-data] office evidence failed:", e); return null; }
}

/** Poll a refresh run's status (client never sees service-role). */
export async function getBrokerageRefreshStatusAction(runId: string): Promise<{ status: string; updatedRecords: number } | null> {
  try { return await getRefreshRunStatus(runId); }
  catch (e) { console.error("[brokerage-data] refresh status failed:", e); return null; }
}

export async function reviewMatchAction(matchId: string, decision: "approve" | "reject"): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    await reviewIdentityMatch(matchId, decision);
    revalidatePath("/brokerage-data");
    return { message: decision === "approve" ? "ההתאמה אושרה ✓" : "ההתאמה נדחתה" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}

export async function resolveConflictAction(conflictId: string, resolution: "resolved" | "ignored"): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    await resolveDataConflict(conflictId, resolution);
    revalidatePath("/brokerage-data");
    return { message: resolution === "resolved" ? "הקונפליקט נפתר ✓" : "הקונפליקט הוסתר" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}

export async function decideLinkAction(linkId: string, decision: "confirmed" | "rejected"): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    await decideListingLink(linkId, decision);
    revalidatePath("/brokerage-data");
    return { message: decision === "confirmed" ? "הקישור אושר ✓" : "הקישור נדחה" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}
