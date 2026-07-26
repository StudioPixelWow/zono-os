// ============================================================================
// ZONO — P4.6: social-ingestion operational health (server-only, read-only).
// AGGREGATE counts + feature state for operators/monitoring. No per-tenant data,
// no message text, no profile urls, no identifiers, no secrets. Never mutates.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SOCIAL_INTERACTION_INGEST_ENABLED } from "./ingest";

export interface SocialIngestionHealth {
  featureEnabled: boolean;
  dbReachable: boolean;
  interactions: number;            // total social_interactions
  socialLeads: number;             // total social_leads
  newInteractions: number;         // status='new' — awaiting recompute (backlog)
  unattributedInteractions: number; // distribution_queue_id IS NULL — attribution gap proxy
}

/** Aggregate, non-sensitive health snapshot for the social-ingestion pipeline. */
export async function getSocialIngestionHealth(): Promise<SocialIngestionHealth> {
  const db = createServiceRoleClient();
  const base: SocialIngestionHealth = {
    featureEnabled: SOCIAL_INTERACTION_INGEST_ENABLED,
    dbReachable: false, interactions: 0, socialLeads: 0, newInteractions: 0, unattributedInteractions: 0,
  };
  try {
    const [ints, leads, news, unattr] = await Promise.all([
      db.from("social_interactions").select("*", { count: "exact", head: true }),
      db.from("social_leads").select("*", { count: "exact", head: true }),
      db.from("social_interactions").select("*", { count: "exact", head: true }).eq("status", "new"),
      db.from("social_interactions").select("*", { count: "exact", head: true }).is("distribution_queue_id", null),
    ]);
    return {
      featureEnabled: SOCIAL_INTERACTION_INGEST_ENABLED,
      dbReachable: !ints.error,
      interactions: ints.count ?? 0,
      socialLeads: leads.count ?? 0,
      newInteractions: news.count ?? 0,
      unattributedInteractions: unattr.count ?? 0,
    };
  } catch {
    return base;
  }
}
