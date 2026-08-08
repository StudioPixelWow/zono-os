"use server";
// ============================================================================
// ZONO — Facebook Groups connection/import: server actions for the ZONO UI.
// Thin "use server" wrappers over group-import-service. Org-scoped; the underlying
// service resolves the signed-in user's org/instance. Disconnect reuses the
// extension revoke path. No publishing here — imports feed the canonical registry.
// ============================================================================
import "server-only";
import { revalidatePath } from "next/cache";
import {
  requestGroupScan, getGroupConnectionOverview, listGroupSyncEvents,
  type GroupConnectionOverview, type SyncEventView, type ActionResult,
} from "./group-import-service";
import { revokeAllInstances } from "./extension-service";
import { getSessionContext } from "@/lib/auth/session";

const PATH = "/settings/distribution-connections";

/** Ask the connected extension to scan + import the user's Facebook groups. */
export async function requestGroupScanAction(): Promise<ActionResult> {
  const res = await requestGroupScan();
  revalidatePath(PATH);
  return res;
}

/** Connection + import snapshot for the panel. */
export async function getGroupConnectionOverviewAction(): Promise<GroupConnectionOverview> {
  return getGroupConnectionOverview();
}

/** Recent append-only import/sync audit trail. */
export async function listGroupSyncEventsAction(limit = 30): Promise<SyncEventView[]> {
  return listGroupSyncEvents(limit);
}

/** Disconnect the extension for this org (revoke all instances). Manager+ only. */
export async function disconnectExtensionAction(): Promise<ActionResult> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return { ok: false, error: "unauthorized" };
  const ok = await revokeAllInstances(profile.org_id, profile.id ?? null);
  revalidatePath(PATH);
  return ok ? { ok: true } : { ok: false, error: "disconnect failed" };
}
