// ============================================================================
// ZONO — Office Intelligence™ types (Phase 16, client-safe, no I/O).
// A deterministic executive operating system for brokerage managers. It READS
// the existing deterministic engines (Property Radar, Buyer Matching, Seller
// Intelligence, Exclusive Acquisition, Provider QA, Market Events) and composes;
// it never recomputes their scores. AI may summarize these analytics only.
// ============================================================================

export type OfficeRole = "agent" | "team_leader" | "manager" | "office_owner" | "enterprise_admin";

export type GoalType = "listings" | "exclusives" | "calls" | "meetings" | "buyer_matches" | "revenue" | "commission" | "tasks_completed";
export type GoalPeriod = "daily" | "weekly" | "monthly" | "quarterly";
export type CoachingItemType = "overdue_tasks" | "low_activity" | "missed_opportunity" | "slow_followup" | "weak_conversion" | "high_potential";
export type Severity = "low" | "medium" | "high" | "urgent";

// ── KPIs ────────────────────────────────────────────────────────────────────
export interface OfficeKpis {
  activeListings: number;
  externalListingsMonitored: number;
  privateListings: number;
  exclusiveListings: number;
  newListingsToday: number;
  priceDropsToday: number;
  hotDeals: number;
  backOnMarket: number;
  buyerMatchesToday: number;
  perfectMatches: number;
  sellerOpportunities: number;
  highExclusiveProbability: number;
  callsToday: number;
  whatsappsToday: number;
  meetingsToday: number;
  tasksDue: number;
  overdueTasks: number;
  dealsInProgress: number;
  estimatedPipeline: number;
  estimatedCommission: number;
  creditsUsed: number;
  creditsSaved: number;
  duplicateScansAvoided: number;
  providerQualityScore: number;
}
export type OfficeKpiKey = keyof OfficeKpis;

export interface KpiCard {
  key: OfficeKpiKey;
  label: string;
  value: number;
  changeVsYesterday: number | null;
  changeVsLastWeek: number | null;
  spark: number[];
  format: "int" | "currency" | "percent";
}

// ── Agent performance + leaderboard ──────────────────────────────────────────
export interface AgentMetrics {
  agentId: string;
  name: string;
  activeListings: number;
  listingsContacted: number;
  privateListingsContacted: number;
  exclusiveOpportunitiesHandled: number;
  exclusivesSigned: number;
  buyerMatchesCreated: number;
  perfectMatchesHandled: number;
  calls: number;
  whatsapps: number;
  meetings: number;
  tasksCompleted: number;
  overdueTasks: number;
  avgResponseHours: number | null;
  conversionRate: number;        // 0..1
  followUpDiscipline: number;    // 0..1
  avgOpportunityScore: number;
  avgExclusiveProbability: number;
  estimatedPipeline: number;
  estimatedCommission: number;
  trendVsLastWeek: number;       // -1..1
  ignoredHotOpportunities: number;
  leaderboardScore: number;
}

export interface LeaderboardBuckets {
  ranked: AgentMetrics[];
  topPerformers: AgentMetrics[];
  risingAgents: AgentMetrics[];
  needingAttention: AgentMetrics[];
  mostImproved: AgentMetrics[];
}

// ── Opportunities / risks / coaching ─────────────────────────────────────────
export type OpportunityTab = "exclusive" | "hot_deals" | "buyer_matches" | "price_drops" | "back_on_market" | "no_contact" | "follow_up";

export interface OpportunityCard {
  id: string;
  marketPropertySourceId: string | null;
  tab: OpportunityTab;
  addressText: string | null;
  city: string | null;
  agentOwner: string | null;
  opportunityScore: number | null;
  exclusiveProbability: number | null;
  buyerCount: number;
  reason: string;
  recommendedAction: string;
  urgency: Severity;
}

export interface RiskItem {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  reason: string;
  businessImpact: string;
  owner: string | null;
  recommendedAction: string;
  status: "open" | "seen" | "resolved";
}

export interface CoachingItem {
  id: string;
  agentId: string | null;
  agentName: string | null;
  itemType: CoachingItemType;
  severity: Severity;
  title: string;
  message: string;
  recommendedAction: string;
}

// ── Forecast / benchmarks / goals / market share ─────────────────────────────
export interface ForecastResult {
  likelyExclusives: number;
  likelyDeals: number;
  likelyMeetings: number;
  pipelineValue: number;
  estimatedCommission: number;
  confidencePct: number;
  assumptions: string[];
}

export interface Benchmark {
  metric: string;
  label: string;
  current: number;
  previous: number;
  deltaPct: number | null;
  direction: "up" | "down" | "flat";
}

export interface GoalProgress {
  id: string;
  goalType: GoalType;
  period: GoalPeriod;
  target: number;
  current: number;
  percent: number;
  pacePercent: number | null;
  status: "ahead" | "on_track" | "behind" | "no_target";
  ownerName: string | null;
}

export interface MarketShareEstimate {
  city: string;
  officeListings: number;
  monitoredListings: number;
  sharePercent: number;
  confidence: "low" | "medium" | "high";
  dataCompleteness: number; // 0..100
}

export interface OfficeMapPoint {
  id: string; lat: number; lng: number; title: string; details: string[];
  tone: "brand" | "success" | "warning" | "danger";
}

export interface ActivityItem { id: string; eventType: string; title: string; channel: string | null; at: string; actor: string | null }

// ── Composed dashboard + snapshot payload ────────────────────────────────────
export interface OfficeDashboard {
  managerName: string;
  role: OfficeRole;
  pulse: string[];
  kpis: OfficeKpis;
  kpiCards: KpiCard[];
  leaderboard: LeaderboardBuckets;
  opportunities: OpportunityCard[];
  risks: RiskItem[];
  coaching: CoachingItem[];
  forecast: ForecastResult;
  benchmarks: Benchmark[];
  goals: GoalProgress[];
  marketShare: MarketShareEstimate[];
  mapPoints: OfficeMapPoint[];
  activity: ActivityItem[];
  generatedAt: string;
}

export interface OfficeSnapshotPayload {
  kpis: OfficeKpis;
  agentMetrics: AgentMetrics[];
  riskItems: RiskItem[];
  opportunities: OpportunityCard[];
  forecasts: ForecastResult;
  benchmarks: Benchmark[];
}
