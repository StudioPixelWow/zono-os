"use server";
// ============================================================================
// ZONO — PLATFORM ADMIN server actions (P5.1). "use server": this module may
// export ONLY async functions (enforced by scripts/check-use-server-exports.mjs).
// Every action delegates to the audited platform DAL — NEVER a service-role
// client directly — and fails closed (returns an empty, non-throwing result) so
// a non-operator learns nothing about the platform surface.
// ============================================================================
import { searchOrganizationsForPlatform } from "./dal";
import type { PlatformOrgSummary } from "./dal";

/**
 * Platform-wide organization search for the command palette / directory filter.
 * Authorization + auditing happen inside the DAL. On any authorization or query
 * error this resolves to `{ ok:false, orgs:[] }` rather than throwing.
 * NOTE: this module is "use server" — it may export ONLY async functions, so the
 * result SHAPE is declared inline (no exported interface).
 */
export async function searchOrganizationsAction(query: string): Promise<{ ok: boolean; orgs: PlatformOrgSummary[] }> {
  try {
    const orgs = await searchOrganizationsForPlatform(query, 12);
    return { ok: true, orgs };
  } catch {
    return { ok: false, orgs: [] };
  }
}
