// ============================================================================
// 🕸️ Multi-Agent Orchestrator — dashboard composer (pure). 29.8. Part 9.
// Composes the event bus, cross-agent reactions, opportunity chains, priority
// queue, conflicts and merged execution plans into ONE Multi-Agent Dashboard.
// Pure + evidence-only; everything downstream is approval-gated.
// ============================================================================
import { deriveEvents, routeEvents } from "./events";
import { buildOpportunityChains } from "./chains";
import { buildPriorityQueue, detectConflicts } from "./priority-conflicts";
import { buildExecutionPlans } from "./playbooks";
import { AGENT_ORCHESTRATOR_VERSION, type OrchestratorInput, type OrchestratorDashboard } from "./types";

export function buildOrchestratorDashboard(input: OrchestratorInput): OrchestratorDashboard {
  const events = deriveEvents(input);
  const reactions = routeEvents(events);
  const opportunities = buildOpportunityChains(input);
  const priorityQueue = buildPriorityQueue(opportunities, input);
  const conflicts = detectConflicts(input);
  const executionPlans = buildExecutionPlans(opportunities);

  const notes: string[] = [];
  const empty = !input.buyers.length && !input.sellers.length && !input.listings.length && !input.leads.length && !input.office;
  if (empty) notes.push("אין נתוני סוכנים עדיין — הפעל את הסוכנים כדי לייצר אירועים והזדמנויות. אין המצאות.");
  else if (!events.length) notes.push("אין אירועים פעילים — כל הסוכנים יציבים כרגע.");
  if (conflicts.length) notes.push(`${conflicts.length} קונפליקטים הוכרעו לפי משקל (השפעה·ביטחון·אמון·סמכות).`);

  return {
    version: AGENT_ORCHESTRATOR_VERSION, generatedAt: new Date().toISOString(),
    events, reactions, opportunities, priorityQueue, conflicts, executionPlans,
    totals: {
      events: events.length, opportunities: opportunities.length,
      potentialDeals: opportunities.filter((o) => o.type === "potential_deal").length,
      conflicts: conflicts.length, plans: executionPlans.length,
      highPriority: priorityQueue.filter((p) => p.priorityScore >= 70).length,
    },
    notes,
  };
}
