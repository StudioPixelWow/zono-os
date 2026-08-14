// ============================================================================
// ZONO — P6.2 Historical Metrics & Trends QA (deterministic, pure-model).
// Proves day/window math without the DB:
//   · Israel (Asia/Jerusalem, DST-aware) day boundaries vs UTC
//   · 7/30/90 windows · daily count + distinct (DAU) series
//   · no fake pre-coverage history · insufficient-history state
//   · current-vs-historical adoption separation
// Run: npx tsx scripts/platform-trends-qa.ts
// ============================================================================
import {
  israelDayKey, dayKeyRange, buildDailyCountSeries, buildDailyDistinctSeries,
  ADOPTION_KIND_LABEL, MIN_HISTORY_DAYS, TREND_WINDOWS, DAY_MS,
} from "../src/lib/trends/model";

let failed = 0;
const ok = (c: boolean, l: string) => { if (c) console.log("  ✓ " + l); else { console.log("  ✗ " + l); failed++; } };
const NOW = Date.parse("2026-08-12T12:00:00.000Z");

console.log("P6.2 · Israel day boundary (DST-aware)");
ok(israelDayKey("2026-08-11T20:59:00Z") === "2026-08-11", "Aug 20:59Z → Israel 2026-08-11 (IDT UTC+3)");
ok(israelDayKey("2026-08-11T21:01:00Z") === "2026-08-12", "Aug 21:01Z → Israel 2026-08-12 (crosses midnight IDT)");
ok(israelDayKey("2026-01-11T22:01:00Z") === "2026-01-12", "Jan 22:01Z → Israel 2026-01-12 (IST UTC+2, DST off)");
ok(israelDayKey("not-a-date") === "", "invalid instant → empty key");

console.log("\nP6.2 · day-key range + windows");
ok(dayKeyRange(NOW, 7).length === 7, "7-day range has 7 keys");
ok(dayKeyRange(NOW, 90).length === 90, "90-day range has 90 keys");
const r = dayKeyRange(NOW, 3);
ok(r[0] < r[2] && r[2] === israelDayKey(NOW), "range is ascending, ends today");
ok(TREND_WINDOWS.join(",") === "7,30,90", "canonical windows are 7/30/90");

console.log("\nP6.2 · daily count series (no fake pre-coverage history)");
const ts = [
  NOW - 1 * DAY_MS, NOW - 1 * DAY_MS, // 2 today-ish
  NOW - 2 * DAY_MS,                   // 1 two days ago
  NOW - 4 * DAY_MS,                   // 1 four days ago (coverage start)
];
const s = buildDailyCountSeries(ts.map((t) => new Date(t).toISOString()), NOW, 30);
ok(s.coverageStart === israelDayKey(NOW - 4 * DAY_MS), "coverageStart = earliest data day");
ok(s.points[0].date === s.coverageStart, "series begins at coverage start, not window start (no fake zeros before data)");
ok(s.total === 4, `total counts all in-window events (4) [got ${s.total}]`);
ok(s.points.some((p) => p.value === 0), "gap days AFTER coverage are zero-filled");
ok(s.distinctDaysWithData === 3, `3 distinct days with data [got ${s.distinctDaysWithData}]`);
ok(!s.insufficientHistory, "3 days ≥ MIN_HISTORY_DAYS → sufficient");

console.log("\nP6.2 · insufficient history");
const s2 = buildDailyCountSeries([new Date(NOW - DAY_MS).toISOString(), new Date(NOW - DAY_MS).toISOString()], NOW, 30);
ok(s2.distinctDaysWithData === 1 && s2.insufficientHistory, `1 day < ${MIN_HISTORY_DAYS} → insufficientHistory`);
const s0 = buildDailyCountSeries([], NOW, 30);
ok(s0.points.length === 0 && s0.coverageStart === null && s0.insufficientHistory, "no data → empty series, null coverage, insufficient");

console.log("\nP6.2 · daily distinct (DAU) series");
const evs = [
  { key: "u1", occurredAt: new Date(NOW - DAY_MS).toISOString() },
  { key: "u1", occurredAt: new Date(NOW - DAY_MS).toISOString() }, // same user same day → 1
  { key: "u2", occurredAt: new Date(NOW - DAY_MS).toISOString() }, // distinct → 2
  { key: null, occurredAt: new Date(NOW - DAY_MS).toISOString() }, // null actor ignored
  { key: "u3", occurredAt: new Date(NOW - 3 * DAY_MS).toISOString() },
];
const d = buildDailyDistinctSeries(evs, NOW, 30);
const yday = d.points.find((p) => p.date === israelDayKey(NOW - DAY_MS));
ok(yday?.value === 2, `distinct actors yesterday = 2 (u1,u2; dup+null excluded) [got ${yday?.value}]`);
ok(d.total === 2, "distinct-series total = peak daily distinct (2)");

console.log("\nP6.2 · adoption separation");
ok(ADOPTION_KIND_LABEL.current_presence !== ADOPTION_KIND_LABEL.historical_event, "current-presence and historical-event adoption are distinct labels");

console.log("");
if (failed === 0) console.log("ALL CHECKS PASSED");
else { console.log(`${failed} CHECK(S) FAILED`); process.exit(1); }
