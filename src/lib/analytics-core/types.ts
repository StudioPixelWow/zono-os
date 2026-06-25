// ============================================================================
// ZONO — Analytics Core shared DTOs (Phase 19.5, client-safe, no I/O).
// Canonical domain types reused across intelligence modules. ADDITIVE: new code
// adopts these; existing module-local types remain valid until they converge.
// ============================================================================

export type TrendDirection = "up" | "down" | "flat";
export type KpiFormat = "currency" | "percent" | "int";
export type Severity = "low" | "medium" | "high" | "urgent";
export type Confidence = "low" | "medium" | "high";

/** Canonical KPI card DTO (IntelligenceKpiCard renders this). */
export interface KpiCardDTO {
  key: string;
  label: string;
  value: number;
  format: KpiFormat;
  changePercent: number | null;
  direction: TrendDirection;
  sub?: string;
}

/** Canonical trend value. */
export interface TrendValue {
  metric: string;
  label: string;
  current: number;
  previous: number;
  deltaPercent: number | null;
  direction: TrendDirection;
}

/** Canonical timeline event (LiveTimeline renders this). */
export interface TimelineEventDTO {
  id?: string;
  kind: string;
  title: string;
  detail?: string;
  direction?: TrendDirection;
  at: string;
}

/** Canonical alert summary. */
export interface AlertSummaryDTO {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  message?: string;
  at?: string;
}

/** Canonical map marker. */
export interface MapMarkerDTO {
  id: string;
  lat: number;
  lng: number;
  title: string;
  details: string[];
  tone: "brand" | "success" | "warning" | "danger";
}

/** Canonical report payload envelope. */
export interface ReportEnvelope<T = Record<string, unknown>> {
  reportType: string;
  title: string;
  generatedAt: string;
  data: T;
}
