// ============================================================================
// 🧠 ZONO — BROKER INTELLIGENCE · Learning service (server-only).
// Loads the real lifecycle outcome log and builds the pure learning model.
// Never throws — no history (or a read hiccup) → a neutral model that nudges
// nothing, so the queue simply falls back to pure evidence-based priority.
// ============================================================================
import "server-only";
import { loadOutcomeRows } from "./recommendation-events-repository";
import { summarizeOutcomes, type LearningModel, type OutcomeSample } from "./learning";

const NEUTRAL: LearningModel = { byArea: {}, byActionClass: {}, totalEvents: 0 };

/** The broker's learned behavior model from real historical outcomes. */
export async function getLearningModel(): Promise<LearningModel> {
  try {
    const rows = await loadOutcomeRows();
    const samples: OutcomeSample[] = rows.map((r) => ({
      area: r.area,
      actionClass: r.action_class,
      action: r.action,
    }));
    return summarizeOutcomes(samples);
  } catch {
    return NEUTRAL;
  }
}
