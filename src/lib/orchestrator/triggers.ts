// ============================================================================
// ZONO Orchestrator — session-context trigger helpers. Resolve the current
// user's org and run the orchestrator. Used by the manual-sync action and the
// dashboard-load trigger. Never throws.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { runZonoOrchestrator } from "./service";
import type { OrchestratorResult, ZonoOrchestratorTrigger } from "./types";

export async function runOrchestratorForSession(
  trigger: ZonoOrchestratorTrigger,
  opts: { skipExternalSync?: boolean; skipRevalidation?: boolean; force?: boolean; source?: string } = {},
): Promise<OrchestratorResult | { status: "skipped"; skippedReason: string }> {
  try {
    const { user, profile } = await getSessionContext();
    if (!profile) return { status: "skipped", skippedReason: "no session" };
    return await runZonoOrchestrator({
      organizationId: profile.org_id,
      userId: user?.id ?? null,
      trigger,
      skipExternalSync: opts.skipExternalSync,
      skipRevalidation: opts.skipRevalidation,
      force: opts.force,
      source: opts.source ?? null,
    });
  } catch (e) {
    return { status: "skipped", skippedReason: e instanceof Error ? e.message : "trigger failed" };
  }
}
