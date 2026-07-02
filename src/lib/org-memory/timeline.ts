// ============================================================================
// 🧠 Organizational Memory — chronological timeline (pure). 27.8. Part 2.
// Every entry: date · entity · reason · impact · outcome · linked evidence.
// ============================================================================
import type { MemoryEvent, TimelineEntry } from "./types";

export function buildTimeline(events: MemoryEvent[]): TimelineEntry[] {
  return [...events]
    .sort((a, b) => b.at.localeCompare(a.at))     // newest first
    .map((e) => ({
      at: e.at, type: e.type, outcome: e.outcome,
      entity: e.entityName ?? (e.entityId ? `${e.entityType}:${e.entityId}` : e.entityType),
      reason: e.reason, impact: e.impact, outcomeText: e.outcomeText, evidence: e.evidence,
    }));
}
