// ============================================================================
// ZONO — PHASE 26.14: Retention service (SERVER-ONLY). Ages out stale sources by
// MARKING them (expired → hidden) — never deletes. Also refreshes verification.
// ============================================================================
import "server-only";
import { listRetentionDue, setVisibility, touchVerification, listSourcesForEntity } from "./sourceRepository";
import type { IntelligenceSource } from "./agencyGovernanceTypes";

/** Mark sources past their retention window as 'expired' (non-destructive). */
export async function markExpiredSources(): Promise<{ marked: number }> {
  const due = await listRetentionDue(new Date().toISOString());
  let marked = 0;
  for (const s of due) { await setVisibility(s.id, "expired").then(() => { marked++; }).catch(() => {}); }
  return { marked };
}

/** Sources whose retention window has passed (still readable for review). */
export async function getExpiredAgencyIntelligence(): Promise<IntelligenceSource[]> {
  return listRetentionDue(new Date().toISOString());
}

/** Hide already-expired sources from output (expired → hidden). Non-destructive. */
export async function hideExpiredIntelligence(): Promise<{ hidden: number }> {
  const due = await listRetentionDue(new Date().toISOString());
  let hidden = 0;
  for (const s of due) { await setVisibility(s.id, "hidden").then(() => { hidden++; }).catch(() => {}); }
  return { hidden };
}

/** Refresh the verification timestamp for an entity's sources. */
export async function refreshSourceVerification(entityType: string, entityId: string): Promise<{ refreshed: number }> {
  const sources = await listSourcesForEntity(entityType, entityId);
  let refreshed = 0;
  for (const s of sources) { await touchVerification(s.id).then(() => { refreshed++; }).catch(() => {}); }
  return { refreshed };
}
