// ============================================================================
// ZONO — Executive Business Intelligence™ public surface (pure layers only).
// The server-only engine/repository/actions import directly where needed.
// CONSUMES the deterministic engines; AI summarizes analytics only.
// ============================================================================
export * from "./types";
export { clamp, round, pctChange, direction, sharePercent, PERIOD_DAYS } from "./analytics";
export { forecastExecutive, type ExecForecastInput } from "./forecasting";
export { buildPipeline, PIPELINE_STAGE_LABELS, PIPELINE_ORDER, type PipelineInput } from "./pipeline";
export { computeRoi, ROI_HOURLY_COST, type RoiInput } from "./roi";
export { computeAgentProductivity, type AgentProductivityInput } from "./productivity";
export { computeRevenue, DEFAULT_COMMISSION_RATE, type RevenueInput, type RevenueShareInput } from "./commissions";
export { computeHealthScore, HEALTH_COMPONENTS, type HealthInput } from "./health";
export { forecastRisks, type RiskInput } from "./predictions";
export { buildSnapshotPayload } from "./snapshots";
export { buildReportPayload, toJson, toCsv, toMarkdown, reportLabel, type ReportType, type ReportPayload } from "./exports";
