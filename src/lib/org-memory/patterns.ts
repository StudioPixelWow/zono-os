// ============================================================================
// 🧠 Organizational Memory — success & failure pattern detection (pure). 27.8.
// Parts 3 + 4. Detects REPEATED outcomes (occurrences ≥ 2) by category (mission
// type / event) and by entity (recurring office/broker behaviour). Only real
// repetition in the events produces a pattern — nothing is invented.
// ============================================================================
import type { MemoryEvent, Pattern, PatternKind, Impact } from "./types";
import { eventLabel } from "./events";

let _p = 0;
const pid = () => `pat-${++_p}`;
const MIN_OCCURRENCES = 2;

function majorityImpact(events: MemoryEvent[]): Impact {
  const c: Record<Impact, number> = { high: 0, medium: 0, low: 0 };
  for (const e of events) c[e.impact] += 1;
  return c.high >= c.medium && c.high >= c.low ? "high" : c.medium >= c.low ? "medium" : "low";
}

function toPattern(kind: PatternKind, key: string, title: string, events: MemoryEvent[]): Pattern {
  const ats = events.map((e) => e.at).sort();
  const entities = [...new Set(events.map((e) => e.entityName ?? e.entityType).filter(Boolean))] as string[];
  return {
    id: pid(), kind, key, title, occurrences: events.length,
    entities: entities.slice(0, 8), category: events[0]?.category ?? key,
    evidence: [...new Set(events.flatMap((e) => e.evidence))].slice(0, 6),
    firstAt: ats[0] ?? null, lastAt: ats[ats.length - 1] ?? null,
    impact: majorityImpact(events),
    cases: events.slice(0, 6).map((e) => ({ at: e.at, entity: e.entityName ?? e.entityType, outcomeText: e.outcomeText })),
  };
}

function groupBy(events: MemoryEvent[], keyFn: (e: MemoryEvent) => string): Map<string, MemoryEvent[]> {
  const m = new Map<string, MemoryEvent[]>();
  for (const e of events) { const k = keyFn(e); if (!k) continue; (m.get(k) ?? m.set(k, []).get(k)!).push(e); }
  return m;
}

function detect(events: MemoryEvent[], kind: PatternKind): Pattern[] {
  _p = kind === "success" ? 0 : 1000;
  const out: Pattern[] = [];

  // By category (mission/event type) — "this kind of work repeatedly succeeds/fails".
  for (const [cat, evs] of groupBy(events, (e) => e.category)) {
    if (evs.length < MIN_OCCURRENCES) continue;
    const verb = kind === "success" ? "מצליח באופן חוזר" : "נכשל באופן חוזר";
    out.push(toPattern(kind, `cat:${cat}`, `${eventLabel(evs[0].type)} — ${verb} (${evs.length})`, evs));
  }
  // By entity — "this office/broker repeats the same outcome".
  for (const [ent, evs] of groupBy(events, (e) => e.entityName ?? "")) {
    if (evs.length < MIN_OCCURRENCES) continue;
    const verb = kind === "success" ? "חוזר על הצלחות" : "חוזר על אותה טעות";
    out.push(toPattern(kind, `ent:${ent}`, `${ent} ${verb} (${evs.length})`, evs));
  }

  return out.sort((a, b) => b.occurrences - a.occurrences);
}

export function detectSuccessPatterns(events: MemoryEvent[]): Pattern[] {
  return detect(events.filter((e) => e.outcome === "success"), "success");
}
export function detectFailurePatterns(events: MemoryEvent[]): Pattern[] {
  return detect(events.filter((e) => e.outcome === "failure"), "failure");
}
