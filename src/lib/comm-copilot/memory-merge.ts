// ============================================================================
// 🧠 ZONO — Copilot MEMORY merge (pure). Phase 4. Deterministic, no LLM.
// ----------------------------------------------------------------------------
// Deterministic merge rules:
//   · NEVER overwrite a stronger memory with a weaker one.
//   · explicit > inferred (e.g. explicit budget beats an inferred one).
//   · latest explicit statement wins (e.g. family status).
//   · list preferences ACCUMULATE (never removed).
//   · contradictions are TRACKED, and confidence is upgraded on reinforcement /
//     downgraded when a conflicting weaker signal appears (value kept).
// Every change is explained (why / from→to / confidence / supporting messages).
// ============================================================================
import type { CopilotMemory, PartialMemory, MemoryChange } from "./memory-types";

const CONF_FLOOR = 30;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const uniqMerge = (a: string[], b: string[]) => [...new Set([...a, ...b])];

export interface MergeResult { memory: CopilotMemory; changes: MemoryChange[] }

export function mergeMemory(prev: CopilotMemory, extracted: PartialMemory, nowIso: string): MergeResult {
  const memory: CopilotMemory = {
    scalars: { ...prev.scalars }, lists: { ...prev.lists },
    budgetEvolution: [...prev.budgetEvolution], contradictions: [...prev.contradictions],
    firstSeen: prev.version === 0 ? nowIso : prev.firstSeen, lastUpdated: nowIso, version: prev.version,
  };
  const changes: MemoryChange[] = [];
  let touched = false;

  // ── Scalars ────────────────────────────────────────────────────────────────
  for (const [field, ex] of Object.entries(extracted.scalars)) {
    const cur = memory.scalars[field];
    if (!cur) {
      memory.scalars[field] = { value: ex.value, confidence: clamp(ex.confidence), source: ex.source, firstSeen: nowIso, lastUpdated: nowIso, evidenceMessageIds: ex.evidenceMessageIds, version: 1 };
      changes.push({ field, why: "new", from: null, to: ex.value, confidence: clamp(ex.confidence), evidenceMessageIds: ex.evidenceMessageIds });
      touched = true; continue;
    }
    if (ex.value === cur.value) {
      // Reinforcement → confidence upgrade (never downgrade on agreement).
      const boost = ex.source === "explicit" ? 5 : 2;
      const next = clamp(Math.max(cur.confidence, cur.confidence + boost));
      const upgraded = next > cur.confidence;
      memory.scalars[field] = { ...cur, confidence: next, source: cur.source === "explicit" ? "explicit" : ex.source, lastUpdated: nowIso, evidenceMessageIds: uniqMerge(cur.evidenceMessageIds, ex.evidenceMessageIds) };
      if (upgraded) { changes.push({ field, why: "upgrade", from: cur.value, to: cur.value, confidence: next, evidenceMessageIds: ex.evidenceMessageIds }); touched = true; }
      continue;
    }
    // Different value — apply strength rules.
    const stronger =
      (ex.source === "explicit" && cur.source === "inferred") ||   // explicit_over_inferred
      (ex.source === cur.source && ex.source === "explicit") ||     // latest_explicit
      (ex.source === cur.source && ex.confidence > cur.confidence); // higher-confidence same source
    if (stronger) {
      const why: MemoryChange["why"] = ex.source === "explicit" && cur.source === "inferred" ? "explicit_over_inferred" : "latest_explicit";
      memory.contradictions.push({ field, from: cur.value, to: ex.value, at: nowIso, evidenceMessageIds: ex.evidenceMessageIds });
      memory.scalars[field] = { value: ex.value, confidence: clamp(ex.confidence), source: ex.source, firstSeen: cur.firstSeen, lastUpdated: nowIso, evidenceMessageIds: ex.evidenceMessageIds, version: cur.version + 1 };
      changes.push({ field, why, from: cur.value, to: ex.value, confidence: clamp(ex.confidence), evidenceMessageIds: ex.evidenceMessageIds });
      touched = true;
    } else {
      // New is weaker → KEEP the stronger value, but a conflicting signal lowers
      // confidence and is tracked (never overwrite stronger with weaker).
      const next = clamp(Math.max(CONF_FLOOR, cur.confidence - 5));
      memory.contradictions.push({ field, from: cur.value, to: ex.value, at: nowIso, evidenceMessageIds: ex.evidenceMessageIds });
      memory.scalars[field] = { ...cur, confidence: next, lastUpdated: nowIso };
      changes.push({ field, why: "downgrade", from: cur.value, to: cur.value, confidence: next, evidenceMessageIds: ex.evidenceMessageIds });
      touched = true;
    }
  }

  // ── Lists (accumulate; explicit upgrades an inferred item) ──────────────────
  for (const [field, items] of Object.entries(extracted.lists)) {
    const cur = [...(memory.lists[field] ?? [])];
    for (const ex of items) {
      const idx = cur.findIndex((i) => i.value === ex.value);
      if (idx === -1) {
        cur.push({ value: ex.value, confidence: clamp(ex.confidence), source: ex.source, firstSeen: nowIso, evidenceMessageIds: ex.evidenceMessageIds });
        changes.push({ field, why: "accumulate", from: null, to: ex.value, confidence: clamp(ex.confidence), evidenceMessageIds: ex.evidenceMessageIds });
        touched = true;
      } else {
        const it = cur[idx];
        const next = clamp(Math.max(it.confidence, it.confidence + 5));
        const promote = ex.source === "explicit" && it.source === "inferred";
        cur[idx] = { ...it, confidence: next, source: promote ? "explicit" : it.source, evidenceMessageIds: uniqMerge(it.evidenceMessageIds, ex.evidenceMessageIds) };
        if (next > it.confidence || promote) { changes.push({ field, why: promote ? "explicit_over_inferred" : "upgrade", from: ex.value, to: ex.value, confidence: next, evidenceMessageIds: ex.evidenceMessageIds }); touched = true; }
      }
    }
    memory.lists[field] = cur;
  }

  // ── Budget evolution (push on change of explicit amount) ────────────────────
  if (extracted.budget != null) {
    const last = memory.budgetEvolution[memory.budgetEvolution.length - 1]?.amount ?? null;
    if (last !== extracted.budget) { memory.budgetEvolution.push({ amount: extracted.budget, at: nowIso }); touched = true; }
  }

  if (touched) memory.version = prev.version + 1;
  else memory.lastUpdated = prev.lastUpdated;   // nothing changed → keep prior stamp (freshness no-op)
  return { memory, changes };
}
