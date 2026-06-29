// ============================================================================
// 🔌 Context Repository — the ONLY data door (server-only). Phase 27.2.
// ----------------------------------------------------------------------------
// Implements ContextSources by REUSING existing reads — the session context,
// the Action Center composition (recommendations + dashboard), and the entity
// location context (territory + nearby listings). No new queries, no DB changes,
// no recalculation: it only maps existing DTOs into the engine's light shapes.
// Every adapter is defensive (returns null on failure). AI never imports this —
// it goes through the engine.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getActionCenter } from "@/lib/intelligence-explorer/action-center";
import { getEntityContextAction } from "@/lib/intelligence-explorer/context-actions";
import type {
  ContextIdentity, ContextRequest, ContextSources,
  SourceActionCenter, SourceLocation, SourceListing,
} from "./types";

async function resolveIsManager(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("has_min_role", { p_min: "manager" });
    return data === true;
  } catch { return false; }
}

async function identity(req: ContextRequest): Promise<ContextIdentity | null> {
  try {
    const [session, isManager] = await Promise.all([
      getSessionContext().catch(() => null),
      resolveIsManager(),
    ]);
    return {
      orgId: req.orgId ?? session?.organization?.id ?? session?.profile?.org_id ?? null,
      orgName: session?.organization?.name ?? null,
      userId: req.userId ?? session?.user?.id ?? null,
      userName: session?.profile?.full_name ?? session?.user?.email ?? null,
      isManager,
    };
  } catch (e) { console.error("[context-engine] identity failed:", e); return null; }
}

async function actionCenter(): Promise<SourceActionCenter | null> {
  try {
    const ac = await getActionCenter();
    const ex = ac.dashboard.explorer;
    const rc = ac.recommendations;
    const recent = [...ex.listings]
      .filter((l) => l.firstSeenAt)
      .sort((a, b) => new Date(b.firstSeenAt!).getTime() - new Date(a.firstSeenAt!).getTime());
    const toListing = (l: typeof ex.listings[number]): SourceListing => ({
      id: l.id, title: l.title, city: l.city, neighborhood: l.neighborhood,
      price: l.price, opportunityScore: l.opportunityScore, hasAgent: l.hasAgent,
    });
    return {
      recommendations: (rc?.top ?? []).map((r) => ({ id: r.id, title: r.title_hebrew, reason: r.reason_hebrew, urgency: r.urgency_score })),
      opportunities: [...ex.listings].filter((l) => l.opportunityScore >= 70).sort((a, b) => b.opportunityScore - a.opportunityScore).map(toListing),
      newListings: recent.map(toListing),
      brokers: ex.brokers.map((b) => ({ id: b.id, name: b.name, office: b.office, city: b.city, confidence: b.confidence, listingsCount: b.listingsCount })),
      offices: ex.offices.map((o) => ({ id: o.id, name: o.name, city: o.city, overall: o.overall, growth: o.growth, momentum: o.momentum, threat: o.threat })),
      priceDrops: ac.dashboard.marketStats.priceDrops,
      totalListings: ex.listings.length,
    };
  } catch (e) { console.error("[context-engine] actionCenter failed:", e); return null; }
}

async function location(city: string | null, neighborhood: string | null): Promise<SourceLocation | null> {
  try {
    const dto = await getEntityContextAction(city, neighborhood);
    const t = dto.territory;
    const leader = t ? (t.agencies.find((a) => a.agencyId === t.leaderAgencyId) ?? t.agencies[0] ?? null) : null;
    const map = (l: { id: string; title: string | null; city: string | null; neighborhood: string | null; price: number | null; opportunityScore: number; hasAgent: boolean | null }): SourceListing => ({
      id: l.id, title: l.title, city: l.city, neighborhood: l.neighborhood,
      price: l.price, opportunityScore: l.opportunityScore, hasAgent: l.hasAgent,
    });
    return {
      territory: t ? {
        city: t.territory?.city ?? city, neighborhood: t.territory?.neighborhood ?? neighborhood,
        leaderOfficeId: leader?.agencyId ?? null, leaderOfficeName: leader?.agencyName ?? null,
        dominance: leader?.dominance ?? null, competitionLevel: t.competitionLevel ?? null,
        confidence: t.sourceSummary?.confidence ?? null, missing: t.sourceSummary?.missingData ?? [],
      } : null,
      opportunities: dto.opportunities.map(map),
      newListings: dto.newListings.map(map),
      counts: dto.counts,
    };
  } catch (e) { console.error("[context-engine] location failed:", e); return null; }
}

/** The production data door. Future AI consumes context through the engine only. */
export const defaultSources: ContextSources = { identity, actionCenter, location };
