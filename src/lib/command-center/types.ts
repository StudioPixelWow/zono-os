// ============================================================================
// ⌘ ZONO OS 2.0 — STAGE 6 · Batch 6.4 · COMMAND CENTER — canonical model.
//
// The universal command surface. NOT a dashboard, NOT Copilot, NOT an AI
// engine. It is a COMPOSITION over existing providers: the canonical omnisearch
// (search_documents projection, via globalSearchAction) for entities, and the
// existing command registry for navigation + quick actions. This file defines
// the canonical command model only — no business logic, no AI, no scoring.
// ============================================================================

/** What a command does. */
export type CommandKind = "search" | "navigate" | "open" | "jump" | "recent" | "quick_action";

/** What a command points at — an entity, a page/workspace, or an existing action. */
export type CommandTargetKind =
  | "workspace" | "page"
  | "buyer" | "seller" | "lead" | "deal" | "property" | "journey"
  | "conversation" | "person" | "meeting" | "task" | "document" | "agent"
  | "action";

/** Where a command goes. Exactly one of href (navigation) or event (an EXISTING
 *  window-event action) is set — the Command Center never invents an action. */
export interface CommandTarget {
  kind: CommandTargetKind;
  id: string | null;
  href: string | null;
  event: string | null;
}

/** How a command executes — derived from its target. */
export type CommandRun = "navigate" | "event";

/** One canonical command. Everything is inherited from an existing source: the
 *  label/subtitle/href come verbatim from the omnisearch hit or the registry. */
export interface CanonicalCommand {
  id: string;
  kind: CommandKind;
  groupKey: string;
  label: string;
  subtitle: string | null;
  icon: string;                 // Icon-registry key
  target: CommandTarget;
  keywords: string[];
}

/** A titled group of commands (entities of one type, navigation, quick actions…). */
export interface CommandGroup {
  key: string;
  label: string;
  icon: string;
  commands: CanonicalCommand[];
}

/** How a command should be run, derived from its target (navigate vs event). */
export function commandRun(cmd: CanonicalCommand): CommandRun {
  return cmd.target.event ? "event" : "navigate";
}
