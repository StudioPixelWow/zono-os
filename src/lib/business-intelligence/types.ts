// ============================================================================
// ZONO — Executive Business Intelligence™ types (Phase 19, client-safe, no I/O).
// The executive business brain. It CONSUMES the deterministic engines' outputs
// and aggregates them into KPIs, pipeline, forecasts, ROI, health, risk and
// benchmarks. All calculations are deterministic; AI summarizes analytics only.
// ============================================================================

export type Period = "today" | "week" | "month" | "quarter" | "year";
export type ExecRole = "manager" | "office_owner" | "enterprise_admin";

// ── KPIs ──────────────────────────────────────────────────────────────────--
export type KpiFormat = "currency" | "percent" | "int";
export interface ExecKpi {
  key: string;
  label: string;
  value: number;
  format: KpiFormat;
  changePercent: number | null;     // vs comparison period
  direction: "up" | "down" | "flat";
}

// ── Pipeline ───────────────────────────────────────────────────────────────
export type PipelineStageKey =
  | "opportunity" | "contact" | "meeting" | "negotiation" | "exclusive"
  | "marketing" | "buyer_match" | "showing" | "offer" | "deal" | "closed";

export interface PipelineStage {
  key: PipelineStageKey;
  label: string;
  count: number;
  value: number;             // ₪ estimated
  conversionPct: number;     // → next stage (0..100)
  avgDays: number | null;
  lossPct: number;
}
export interface PipelineSummary {
  stages: PipelineStage[];
  totalValue: number;
  overallConversionPct: number;
  note: string;              // honest "derived from current aggregates"
}

// ── Forecast ───────────────────────────────────────────────────────────────
export interface ExecForecast {
  listings: number;
  meetings: number;
  exclusives: number;
  deals: number;
  revenue: number;
  commission: number;
  buyerDemand: number;
  sellerActivity: number;
  marketActivity: number;
  confidencePct: number;
  assumptions: string[];
}

// ── Revenue ────────────────────────────────────────────────────────────────
export interface RevenueBreakdownRow { key: string; label: string; revenue: number; commission: number; sharePercent: number }
export interface RevenueSummary {
  expectedRevenue: number;
  expectedCommission: number;
  lostRevenue: number;
  revenueAtRisk: number;
  byAgent: RevenueBreakdownRow[];
  byArea: RevenueBreakdownRow[];
  byPropertyType: RevenueBreakdownRow[];
  bySource: RevenueBreakdownRow[];
  note: string;
}

// ── ROI ────────────────────────────────────────────────────────────────────
export interface RoiRow {
  key: string;
  label: string;
  hoursSaved: number;
  moneySaved: number;
  roiPercent: number;
}
export interface RoiSummary { rows: RoiRow[]; totalHoursSaved: number; totalMoneySaved: number; note: string }

// ── Productivity (per agent) ────────────────────────────────────────────────
export interface AgentProductivity {
  agentId: string;
  name: string;
  hoursSaved: number;
  tasksAutomated: number;
  meetingsCreated: number;
  callsMade: number;
  dealsAccelerated: number;
  automationUsagePct: number;
  aiUsagePct: number;
}

// ── Office health (0..100) ──────────────────────────────────────────────────
export interface HealthComponent { key: string; label: string; score: number; weight: number }
export interface HealthScore {
  total: number;             // 0..100
  band: "excellent" | "good" | "fair" | "at_risk";
  components: HealthComponent[];
}

// ── Risk forecast (deterministic) ───────────────────────────────────────────
export type RiskKey =
  | "revenue_risk" | "pipeline_risk" | "agent_burnout" | "opportunity_loss"
  | "seller_churn" | "buyer_churn" | "provider_risk" | "budget_risk";
export interface RiskItem {
  key: RiskKey;
  label: string;
  severity: "low" | "medium" | "high" | "urgent";
  scorePercent: number;      // 0..100 likelihood/severity
  reason: string;
  recommendedAction: string;
}

// ── Timeline + benchmarks ───────────────────────────────────────────────────
export interface TimelineEvent { kind: string; title: string; direction: "up" | "down" | "flat"; detail: string; at: string }
export interface Benchmark { metric: string; label: string; current: number; baseline: number; deltaPct: number | null; direction: "up" | "down" | "flat" }

// ── Map analytics ───────────────────────────────────────────────────────────
export type MapLayer = "revenue" | "opportunity" | "buyer" | "seller" | "market_share" | "forecast_growth";
export interface ExecMapPoint { id: string; lat: number; lng: number; title: string; details: string[]; tone: "brand" | "success" | "warning" | "danger"; weightByLayer: Partial<Record<MapLayer, number>> }

// ── Composed dashboard ──────────────────────────────────────────────────────
export interface ExecutiveDashboard {
  role: ExecRole;
  generatedAt: string;
  /** KPI value per period (today/week/month/quarter/year). */
  kpis: Record<Period, ExecKpi[]>;
  pipeline: PipelineSummary;
  forecast: ExecForecast;
  revenue: RevenueSummary;
  roi: RoiSummary;
  productivity: AgentProductivity[];
  health: HealthScore;
  risks: RiskItem[];
  timeline: TimelineEvent[];
  benchmarks: Benchmark[];
  mapPoints: ExecMapPoint[];
  summary: string[];
}

// ── Snapshot payload ─────────────────────────────────────────────────────────
export interface BiSnapshotPayload {
  kpis: ExecKpi[];
  forecast: ExecForecast;
  pipeline: PipelineSummary;
  health: HealthScore;
  roi: RoiSummary;
  revenue: RevenueSummary;
  risk: RiskItem[];
  benchmarks: Benchmark[];
}
