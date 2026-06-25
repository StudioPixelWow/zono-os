/**
 * ZONO — intelligence load simulation (Phase 19.5). A deterministic, in-memory
 * synthetic benchmark of the deterministic engines at scale. NO production DB.
 * Seeded PRNG → reproducible. Measures matching / seller-scoring / BI-aggregation
 * / journey-execution throughput and a heap memory estimate.
 *
 * Headline scale (representative; inner loops sized to stay within memory):
 *   10 offices · 500 agents · 50,000 buyers · 100,000 properties · 1,000,000 events
 *
 * Run: npx tsx scripts/zono-intelligence-load-sim.ts
 */
import { executeWorkflow } from "../src/lib/journey-automation/execution";
import { DEFAULT_JOURNEYS } from "../src/lib/journey-automation/templates";
import { computeHealthScore } from "../src/lib/business-intelligence/health";
import { computeRevenue, type RevenueShareInput } from "../src/lib/business-intelligence/commissions";
import type { TriggerEvent } from "../src/lib/journey-automation/types";

// Deterministic, seed-free: all synthetic inputs derive from the loop index, so
// every run is byte-identical and reproducible.
const SCALE = { offices: 10, agents: 500, buyers: 50_000, properties: 100_000, events: 1_000_000 };

function bench(label: string, iters: number, fn: (i: number) => void): { label: string; iters: number; ms: number; perSec: number } {
  // warm-up
  for (let i = 0; i < Math.min(1000, iters); i++) fn(i);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn(i);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { label, iters, ms, perSec: Math.round(iters / (ms / 1000)) };
}

// Deterministic buyer↔property compatibility (representative of the matching math).
function compatibility(buyerBudget: number, price: number, roomsWant: number, rooms: number, cityMatch: boolean): number {
  let s = 0;
  if (price <= buyerBudget) s += 45; else s += Math.max(0, 45 - ((price - buyerBudget) / buyerBudget) * 90);
  s += Math.max(0, 25 - Math.abs(roomsWant - rooms) * 8);
  if (cityMatch) s += 30;
  return Math.round(Math.max(0, Math.min(100, s)));
}

function sellerScore(daysOnMarket: number, priceDrops: number, isPrivate: boolean, buyerDemand: number): number {
  let s = 30;
  s += Math.min(25, daysOnMarket / 4);
  s += priceDrops * 6;
  if (isPrivate) s += 20;
  s += Math.min(20, buyerDemand * 2);
  return Math.round(Math.max(0, Math.min(100, s)));
}

function main(): void {
  console.log("ZONO — intelligence load simulation (deterministic, in-memory)\n" + "=".repeat(60));
  console.log(`Scale: ${SCALE.offices} offices · ${SCALE.agents} agents · ${SCALE.buyers.toLocaleString()} buyers · ${SCALE.properties.toLocaleString()} properties · ${SCALE.events.toLocaleString()} events\n`);

  const heap0 = process.memoryUsage().heapUsed;

  // 1) Matching throughput — score candidate buyer×property pairs (1M pairs).
  const pairCount = 1_000_000;
  let matchAccum = 0;
  const matching = bench("Buyer matching (1M pairs)", pairCount, (i) => {
    const budget = 1_500_000 + (i % 50) * 100_000;
    const price = 1_200_000 + ((i * 37) % 6_000_000);
    matchAccum += compatibility(budget, price, 3 + (i % 3), 2 + (i % 4), (i & 7) === 0);
  });

  // 2) Seller scoring throughput (100k properties).
  let sellerAccum = 0;
  const seller = bench("Seller scoring (100k)", SCALE.properties, (i) => {
    sellerAccum += sellerScore((i * 13) % 200, i % 4, (i & 3) === 0, i % 6);
  });

  // 3) Journey execution throughput — run a real template graph repeatedly.
  const graph = DEFAULT_JOURNEYS[0]!.graph;
  const ev: TriggerEvent = { triggerType: "property_created", entityType: "property", entityId: "p", entityLabel: "x", context: { is_private: true, opportunity_score: 88, task_status: "todo" } };
  let stepAccum = 0;
  const journeys = bench("Journey executions", 50_000, () => { stepAccum += executeWorkflow(graph, ev, { mode: "simulation" }).stepsDone; });

  // 4) BI aggregation — build per-agent revenue shares + health, aggregate.
  const t0 = process.hrtime.bigint();
  const byAgent: RevenueShareInput[] = [];
  for (let i = 0; i < SCALE.agents; i++) byAgent.push({ key: `a${i}`, label: `agent ${i}`, pipelineValue: 500_000 + (i % 100) * 25_000 });
  const revenue = computeRevenue({ expectedRevenue: 8_000_000, lostOpportunityValue: 400_000, atRiskValue: 900_000, byAgent, byArea: [], byPropertyType: [], bySource: [] });
  const health = computeHealthScore({ pipeline_health: 70, task_discipline: 80, response_time: 65, buyer_activity: 60, seller_activity: 72, exclusive_growth: 58, opportunity_handling: 85, automation_usage: 55, provider_quality: 88 });
  const biMs = Number(process.hrtime.bigint() - t0) / 1e6;

  const heapMb = (process.memoryUsage().heapUsed - heap0) / 1048576;

  // ── Report ─────────────────────────────────────────────────────────────────
  const rows = [matching, seller, journeys];
  console.log("Throughput:");
  for (const r of rows) console.log(`  • ${r.label.padEnd(28)} ${r.iters.toLocaleString().padStart(10)} ops · ${r.ms.toFixed(0).padStart(6)}ms · ${r.perSec.toLocaleString().padStart(12)} ops/sec`);
  console.log(`  • ${"BI aggregation".padEnd(28)} ${`${SCALE.agents} agents`.padStart(10)} · ${biMs.toFixed(1).padStart(6)}ms · health ${health.total} · commission ₪${revenue.expectedCommission.toLocaleString()}`);
  console.log(`\nMemory (heap delta): ~${heapMb.toFixed(1)} MB`);

  // Extrapolated full-scale estimates (linear, deterministic).
  const matchAll = Math.round((SCALE.buyers * 4) / matching.perSec * 1000); // ~4 candidate properties/buyer
  console.log("\nExtrapolation (single core, linear):");
  console.log(`  • ${(SCALE.buyers * 4).toLocaleString()} buyer×property candidate scores ≈ ${matchAll.toLocaleString()}ms`);
  console.log(`  • ${SCALE.events.toLocaleString()} event diffs ≈ ${Math.round(SCALE.events / matching.perSec * 1000).toLocaleString()}ms (queue-parallelizable)`);

  // Keep accumulators referenced so the optimizer can't elide the work.
  if (matchAccum < 0 || sellerAccum < 0 || stepAccum < 0) console.log("");
  console.log("\nRESULT: ✅ LOAD SIMULATION COMPLETED");
}

main();
