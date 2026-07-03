// ============================================================================
// 🏠 ZONO — default landing = the Unified AI Workspace™ (AI Home). 30.2.
// UX orchestration over the existing engines (read-only). The previous agent
// dashboard is preserved verbatim at /classic. A best-effort background refresh
// keeps intelligence fresh without blocking render.
// ============================================================================
import { after } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { runOrchestratorForSession } from "@/lib/orchestrator";
import UnifiedWorkspace from "@/components/ai-home/UnifiedWorkspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile } = await getSessionContext();
  if (profile) {
    after(async () => {
      try { await runOrchestratorForSession("dashboard_load", { skipRevalidation: true, source: "dashboard_load" }); }
      catch { /* best-effort background refresh */ }
    });
  }
  return <UnifiedWorkspace />;
}
