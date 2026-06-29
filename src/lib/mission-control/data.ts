// ============================================================================
// 🧠 AI Mission Control™ — server data composer (server-only). Phase 27.1.
// ----------------------------------------------------------------------------
// Presentation/orchestration only. Composes EXISTING reads — the session
// context (current org/agent) and the Action Center feed (existing AI Coach
// recommendations + opportunity dashboard). It computes nothing new and makes
// no AI calls; it only assembles what the system already knows.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { getActionCenter } from "@/lib/intelligence-explorer/action-center";
import type { MissionControlDTO } from "./types";

export async function getMissionControl(): Promise<MissionControlDTO> {
  const [session, actionCenter] = await Promise.all([
    getSessionContext().catch((e) => { console.error("[mission-control] session failed:", e); return null; }),
    getActionCenter(),
  ]);

  const profile = session?.profile ?? null;
  const org = session?.organization ?? null;
  const ex = actionCenter.dashboard.explorer;

  return {
    session: {
      orgName: org?.name ?? null,
      agentName: profile?.full_name ?? session?.user?.email ?? null,
      title: profile?.title ?? null,
      primaryCity: profile?.primary_city ?? profile?.operating_city ?? null,
      neighborhoods: profile?.operating_neighborhoods ?? [],
    },
    scope: {
      brokers: ex.brokers.length,
      offices: ex.offices.length,
      neighborhoods: ex.neighborhoods.length,
      listings: ex.listings.length,
      opportunities: ex.opportunitySignals.length,
    },
    actionCenter,
  };
}
