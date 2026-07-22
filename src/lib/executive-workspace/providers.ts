// ============================================================================
// 🏛️ ZONO OS 2.0 — STAGE 6 · Batch 6.0 · EXECUTIVE WORKSPACE — shared providers.
//
// The workspace's ONE data-access layer. It calls the FROZEN canonical
// providers and nothing else — no SQL, no projection, no business logic. Every
// accessor is wrapped in React `cache()` so that within a single request two
// cards asking for the same provider trigger exactly ONE execution: this is
// how the composition satisfies "shared providers · no duplicate requests · no
// N+1" without touching the frozen providers themselves.
//
// Role resolution reuses the SAME canonical Postgres RPC (`has_min_role`) that
// every provider uses — a single source of truth, not a new role model. It
// fails CLOSED: any error ⇒ the least-privileged audience ("member").
// ============================================================================
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getExecutiveDecisions } from "@/lib/executive-decision/service";
import { getExecutiveMemory } from "@/lib/executive-memory/service";
import { getJourneyCoach } from "@/lib/journey-coach/service";
import { getExecutiveOS } from "@/lib/executive-os/service";
import type { WorkspaceAudience } from "./types";

/** Manager-audience decisions/memory/coach + the executive projection. Each is
 *  memoized per request: a second card asking for it pays nothing. */
export const loadDecisions = cache(() => getExecutiveDecisions());
export const loadMemory = cache(() => getExecutiveMemory());
export const loadExecutiveOS = cache(() => getExecutiveOS());
/** SHORT mode matches what the Decision Engine consumes — the Morning Brief and
 *  Journey Overview reuse the one Coach overview instead of re-deriving it. */
export const loadCoach = cache(() => getJourneyCoach("SHORT"));

/**
 * Resolve the viewer's workspace audience from the canonical role RPC.
 * manager (has_min_role manager) → full Executive Workspace.
 * agent  (has_min_role agent, not manager) → Broker Workspace only.
 * else → Member Workspace only. Fails closed to "member".
 */
export const resolveWorkspaceAudience = cache(async (): Promise<WorkspaceAudience> => {
  try {
    const db = await createClient();
    const [{ data: isManager }, { data: isAgent }] = await Promise.all([
      db.rpc("has_min_role", { p_min: "manager" }),
      db.rpc("has_min_role", { p_min: "agent" }),
    ]);
    if (isManager === true) return "manager";
    if (isAgent === true) return "broker";
    return "member";
  } catch {
    return "member";
  }
});
