// ============================================================================
// ZONO — platform alerts (pure). Derives operational alerts from health + queue
// + circuit + rate-limit signals. Deterministic, severity-ranked.
// ============================================================================
import type { CircuitSnapshot, HealthComponent, PlatformAlert } from "../types";

export interface AlertInput {
  components: HealthComponent[];
  circuits: CircuitSnapshot[];
  deadLetterCount: number;
  queueDepth: number;
  errorRatePct: number;
}

export function buildPlatformAlerts(i: AlertInput): PlatformAlert[] {
  const out: PlatformAlert[] = [];

  for (const c of i.components) {
    if (c.status === "critical") out.push({ key: `health_${c.key}`, severity: "critical", title: `${c.label} במצב קריטי`, detail: c.detail ?? "רכיב לא זמין" });
    else if (c.status === "warning") out.push({ key: `health_${c.key}`, severity: "warning", title: `${c.label} במצב אזהרה`, detail: c.detail ?? "ביצועים ירודים" });
  }
  for (const cb of i.circuits) {
    if (cb.state === "open") out.push({ key: `circuit_${cb.provider}`, severity: "critical", title: `מעגל פתוח: ${cb.provider}`, detail: "הספק נחסם זמנית — fallback פעיל." });
  }
  if (i.deadLetterCount > 0) out.push({ key: "dlq", severity: i.deadLetterCount >= 25 ? "critical" : "warning", title: `${i.deadLetterCount} עבודות ב‑DLQ`, detail: "נדרשת בדיקה/השמעה חוזרת." });
  if (i.queueDepth > 3000) out.push({ key: "queue_depth", severity: i.queueDepth > 10000 ? "critical" : "warning", title: `עומק תור גבוה: ${i.queueDepth}`, detail: "ייתכן עיכוב בעיבוד." });
  if (i.errorRatePct > 10) out.push({ key: "error_rate", severity: i.errorRatePct > 25 ? "critical" : "warning", title: `שיעור שגיאות ${Math.round(i.errorRatePct)}%`, detail: "מעל הסף התקין." });

  const rank = { critical: 0, warning: 1 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
