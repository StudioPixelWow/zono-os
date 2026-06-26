// ============================================================================
// ZONO — PHASE 26.14: Governance service (SERVER-ONLY). The high-level API for
// attaching provenance, recording audits, reading policies, and resolving the
// VISIBLE sources for an entity (visibility guard applied with effective policy).
// Helper functions so future writes can attach sources without rewriting prior
// phases. No external scraping, no mock data.
// ============================================================================
import "server-only";
import { attachSource, listSourcesForEntity, type AttachSourceInput } from "./sourceRepository";
import { logAudit, listAudit, type LogAuditInput } from "./auditRepository";
import { getEffectivePolicies } from "./policyRepository";
import { filterVisibleSources, canShowAgencyIntelligence, sanitizeWording, retentionUntil } from "./agencyVisibilityGuard";
import type { IntelligenceSource, GovernancePolicies } from "./agencyGovernanceTypes";
import type { VisibilityDecision } from "./agencyVisibilityGuard";

export { sanitizeWording };
export type GovernanceVisibility = VisibilityDecision;

/** Attach a provenance source; auto-computes retention from policy when absent. */
export async function attachIntelligenceSource(input: AttachSourceInput): Promise<IntelligenceSource> {
  let retention = input.retentionUntil;
  if (retention == null) {
    const policies = await getEffectivePolicies();
    retention = retentionUntil(input.collectedAt ?? null, policies.default_retention_days);
  }
  return attachSource({ ...input, retentionUntil: retention });
}

export async function recordAudit(input: LogAuditInput): Promise<void> { return logAudit(input); }
export async function getAuditTrail(opts?: Parameters<typeof listAudit>[0]) { return listAudit(opts); }
export async function getPolicies(): Promise<GovernancePolicies> { return getEffectivePolicies(); }

export interface EntitySourcesResult {
  sources: IntelligenceSource[];                 // visible + limited (hidden/expired excluded)
  decisions: { id: string; decision: VisibilityDecision }[];
  hasHidden: boolean;
}

/** Visible sources for an entity, with the visibility guard applied per effective policy. */
export async function getVisibleEntitySources(entityType: string, entityId: string): Promise<EntitySourcesResult> {
  const [all, policies] = await Promise.all([listSourcesForEntity(entityType, entityId), getEffectivePolicies()]);
  const ctx = { policies };
  const decisions = all.map((s) => ({ id: s.id, decision: canShowAgencyIntelligence(s, ctx) }));
  const visible = filterVisibleSources(all, ctx);
  return { sources: visible, decisions, hasHidden: all.length !== visible.length };
}
