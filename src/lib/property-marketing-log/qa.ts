// ============================================================================
// ✅ Property Marketing Log — self-tests (pure, offline). 33.1.x.
// merge/sort / summary counts / grouping / empty / reach+leads / perf.
// ============================================================================
import { buildMarketingLog, groupByDay, type MarketingEvent } from "./timeline";

export interface PMLCheck { name: string; pass: boolean; detail: string }
export interface PMLSelfCheck { ok: boolean; total: number; passed: number; checks: PMLCheck[] }

const ev = (kind: MarketingEvent["kind"], at: string, o: Partial<MarketingEvent> = {}): MarketingEvent => ({ at, kind, title: kind, detail: "", status: null, channel: null, url: null, source: kind === "creative" || kind === "creative_approved" ? "creative-studio" : "distribution", ...o });

export function runSelfCheck(): PMLSelfCheck {
  const checks: PMLCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const events: MarketingEvent[] = [
    ev("campaign", "2026-07-01T09:00:00Z"),
    ev("creative", "2026-07-01T10:00:00Z"),
    ev("post_scheduled", "2026-07-02T09:00:00Z", { channel: "קבוצת חיפה" }),
    ev("post_published", "2026-07-03T09:00:00Z", { channel: "קבוצת חיפה", url: "https://fb/x" }),
    ev("comment", "2026-07-03T11:00:00Z"),
    ev("lead", "2026-07-03T12:00:00Z"),
    ev("post_failed", "2026-07-04T09:00:00Z"),
  ];
  const log = buildMarketingLog(events, { totalReach: 1200, totalLeads: 3 });

  add("sorted newest-first", log.events[0].kind === "post_failed" && log.events[log.events.length - 1].kind === "campaign");
  add("summary counts correct", log.summary.campaigns === 1 && log.summary.scheduled === 1 && log.summary.published === 1 && log.summary.failed === 1 && log.summary.comments === 1 && log.summary.leads === 1 && log.summary.creatives === 1);
  add("reach + leads carried through", log.summary.totalReach === 1200 && log.summary.totalLeads === 3);
  add("first/last timestamps", log.summary.firstAt === "2026-07-01T09:00:00Z" && log.summary.lastAt === "2026-07-04T09:00:00Z");
  add("not empty", !log.isEmpty);

  const grouped = groupByDay(log);
  add("grouped by day, newest first", grouped.length === 4 && grouped[0].day === "2026-07-04" && grouped[grouped.length - 1].day === "2026-07-01");
  add("day groups hold their events", grouped.find((g) => g.day === "2026-07-03")?.events.length === 3);

  const empty = buildMarketingLog([]);
  add("empty log safe", empty.isEmpty && empty.events.length === 0 && empty.summary.campaigns === 0 && empty.summary.firstAt === null);

  add("events without timestamp filtered", buildMarketingLog([ev("campaign", ""), ev("campaign", "2026-07-01T09:00:00Z")]).events.length === 1);

  const t0 = Date.now();
  const big: MarketingEvent[] = Array.from({ length: 5000 }, (_, i) => ev(i % 2 ? "post_published" : "comment", new Date(1_750_000_000_000 + i * 60000).toISOString()));
  const bl = buildMarketingLog(big); groupByDay(bl);
  add("large log (5000 events) < 200ms", Date.now() - t0 < 200, `${Date.now() - t0}ms`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
