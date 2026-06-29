// ============================================================================
// 🧩 Context Priority™ — deterministic priority scores per block key (pure).
// Future prompt builders use these to decide what to keep first. No AI.
// ============================================================================

export const BLOCK_PRIORITY: Record<string, number> = {
  // Current-entity context (the thing on screen) ranks highest.
  currentEntity: 100,
  currentLead: 95,
  currentDeal: 90,
  currentBroker: 85,
  currentOffice: 80,
  currentNeighborhood: 70,
  // Intelligence layers.
  propertyIntelligence: 88,
  aiCoach: 82,
  valuation: 78,
  brokerIntelligence: 75,
  officeIntelligence: 72,
  neighborhoodIntelligence: 70,
  propertyRadar: 66,
  nearbyOpportunities: 66,
  marketAcceptance: 64,
  nearbyListings: 60,
  heatmap: 62,
  market: 60,
  competition: 58,
  // Supporting context.
  tasks: 55,
  recentActivity: 52,
  timeline: 50,
  relatedEntities: 48,
  identity: 40,
  organization: 40,
  historical: 30,
};

export const DEFAULT_PRIORITY = 40;

export function priorityFor(key: string): number {
  return BLOCK_PRIORITY[key] ?? DEFAULT_PRIORITY;
}
