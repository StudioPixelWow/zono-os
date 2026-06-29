// ============================================================================
// 🧠 AI Mission Control™ — DTOs (client-safe). Phase 27.1 · presentation only.
// ----------------------------------------------------------------------------
// Mission Control is the operating-system shell for AI inside ZONO — NOT a
// chatbot. This phase ships the orchestration shell only: it surfaces what the
// system already knows (session context + the existing Action Center feed). No
// AI decisions, no prompts, no new calculations. Type-only imports from server
// modules are erased at build, so this file stays safe to import from the client.
// ============================================================================
import type { ActionCenterDTO } from "@/lib/intelligence-explorer/action-center-shared";

/** What the AI currently "knows" about the working session (existing values). */
export interface MissionSessionContext {
  orgName: string | null;
  agentName: string | null;
  title: string | null;        // human-readable role/title (users.title)
  primaryCity: string | null;
  neighborhoods: string[];
}

/** The intelligence scope currently loaded (plain counts over existing rows). */
export interface MissionScope {
  brokers: number;
  offices: number;
  neighborhoods: number;
  listings: number;
  opportunities: number;
}

export interface MissionControlDTO {
  session: MissionSessionContext;
  scope: MissionScope;
  actionCenter: ActionCenterDTO;
}
