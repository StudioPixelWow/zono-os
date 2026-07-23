// ============================================================================
// 🧪 ZONO — Batch 6.7 · Phase 1.1 — Copilot performance & determinism benchmark.
// Measurement only (no feature/optimization change). Runnable:
//   npx tsx scripts/bench-comm-copilot.ts
// Generates a large mixed corpus (channels × sizes), runs the deterministic
// pipeline, and reports latency (cold/warm/avg), memory, determinism, idempotency,
// collisions, duplicate-writes, and failures. Seeded → reproducible.
// ============================================================================
import { performance } from "node:perf_hooks";
import { analyzeConversation } from "../src/lib/comm-copilot/analyze";
import { classifyConversation } from "../src/lib/comm-copilot/classify";
import { summarizeConversation } from "../src/lib/comm-copilot/summarize";
import { deterministicHash, shouldRegenerate } from "../src/lib/comm-copilot/record";
import { conversationRefToUuid } from "../src/lib/comm-copilot/ids";
import type { CopilotConversationView } from "../src/lib/comm-copilot/types";

// ── Seeded PRNG (reproducible; avoids Math.random) ──────────────────────────
let seed = 20260723;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];

const CHANNELS = ["whatsapp", "gmail"];  // personal + business WhatsApp share the 'whatsapp' canonical channel
const INBOUND = [
  "מחפש דירה לקנות", "רוצה למכור את הדירה", "מתי אפשר לבוא לראות?", "נתקדם על המחיר, יש הצעה נגדית",
  "מה עם משכנתא ומימון?", "בוא נסגור, תכין חוזה", "לא מעוניין יותר, תפסיק", "כמה עולה הנכס?",
  "שולח את החוזה והמסמכים לחתימה", "מחפש דירת 4 חדרים בתל אביב בתקציב 3 מיליון", "תודה רבה", "מעולה, מחכה",
];
const OUTBOUND = ["יש לי כמה אפשרויות", "אעדכן אותך בהמשך", "שלחתי לך פרטים", "נשמח לתאם", "אשלח הצעה"];

function makeConversation(i: number): CopilotConversationView {
  const channel = pick(CHANNELS);
  const ref = `${channel}:conv_${i}`;
  const size = 1 + Math.floor(rnd() * 60);                 // mixed sizes 1..60
  const old = rnd() < 0.15;                                // ~15% dormant
  const baseMs = Date.parse("2026-07-23T12:00:00.000Z") - (old ? 30 : 1) * 86_400_000 - size * 3_600_000;
  const transcript = Array.from({ length: size }, (_, k) => {
    const inbound = k % 2 === 0;
    return {
      seq: k, messageRef: `${ref}:m${k + 1}`,
      direction: (inbound ? "inbound" : "outbound") as "inbound" | "outbound",
      sentAt: new Date(baseMs + k * 3_600_000).toISOString(),
      text: inbound ? pick(INBOUND) : pick(OUTBOUND),
    };
  });
  const last = transcript[transcript.length - 1];
  const crmRoll = rnd();
  return {
    conversationRef: ref, agentId: "u_broker", waiting: last.direction === "inbound",
    unread: last.direction === "inbound" ? 1 : 0, messageCount: size, lastActivityAt: last.sentAt,
    transcript,
    crmLinks: {
      lead: crmRoll < 0.3 ? "lead_x" : null, buyer: crmRoll >= 0.3 && crmRoll < 0.5 ? "buyer_x" : null,
      seller: crmRoll >= 0.5 && crmRoll < 0.6 ? "seller_x" : null,
      journey: null, deal: crmRoll >= 0.9 ? "deal_x" : null, property: null,
    },
  };
}

const N = 1000;
const NOW = "2026-07-23T12:00:00.000Z";
const LABELS = new Set(["new_lead", "active_buyer", "active_seller", "negotiation", "appointment", "follow_up", "document_exchange", "inactive", "closed"]);

const corpus = Array.from({ length: N }, (_, i) => makeConversation(i));

// The freshness hash is a function of the deterministic OUTPUT (classification +
// summary sections), so a "collision" means DIFFERENT output sharing a hash
// (SHA-1 — impossible). Different INPUTS producing the SAME output → same hash is
// correct and harmless (each conversation's hash is compared only to its own row).
type Out = { classification: { classification: string; explain: { deterministicSignals: string[] } }; summary: { stage: string; intent: string; facts: string[]; objections: string[]; promises: string[]; nextAction: string } };
const outputSig = (o: Out) => JSON.stringify({ c: o.classification.classification, cs: o.classification.explain.deterministicSignals, s: o.summary.stage, i: o.summary.intent, f: o.summary.facts, o: o.summary.objections, p: o.summary.promises, n: o.summary.nextAction });
const pctl = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];

// ── Cold latency (very first calls, before any warmup) ──────────────────────
const c0 = performance.now(); const a0 = analyzeConversation(corpus[0], NOW); const cls0 = classifyConversation(a0); const coldClassifierMs = performance.now() - c0;
const s0 = performance.now(); summarizeConversation(a0, cls0.classification); const coldSummaryMs = performance.now() - s0;

// ── Warmup ───────────────────────────────────────────────────────────────────
for (let i = 0; i < 100; i++) { const a = analyzeConversation(corpus[i % N], NOW); const c = classifyConversation(a); summarizeConversation(a, c.classification); }

// ── Benchmark loop (warm) ────────────────────────────────────────────────────
const memBefore = process.memoryUsage();
const clsLat: number[] = [], sumLat: number[] = [];
const hashToSig = new Map<string, string>();
let failures = 0, duplicateWrites = 0, determinismMismatches = 0, trueCollisions = 0, identicalDupes = 0;
let largest = 0, largestMs = 0, largestRef = "";
const labelCounts: Record<string, number> = {};

for (const view of corpus) {
  let cls, summary;
  const t0 = performance.now();
  try {
    const analysis = analyzeConversation(view, NOW);
    cls = classifyConversation(analysis);
    const tMid = performance.now();
    summary = summarizeConversation(analysis, cls.classification);
    const tEnd = performance.now();
    clsLat.push(tMid - t0); sumLat.push(tEnd - tMid);
    if ((tEnd - t0) > largestMs && view.messageCount >= largest) { largest = view.messageCount; largestMs = tEnd - t0; largestRef = view.conversationRef; }
  } catch { failures++; continue; }

  const label = cls.classification;
  if (!LABELS.has(label)) failures++;
  labelCounts[label] = (labelCounts[label] ?? 0) + 1;

  // Determinism: re-run with the SAME clock → identical hash (same input → same output).
  const a2 = analyzeConversation(view, NOW); const c2 = classifyConversation(a2); const s2 = summarizeConversation(a2, c2.classification);
  const h1 = deterministicHash(cls, summary);
  const h2 = deterministicHash(c2, s2);
  if (h1 !== h2) determinismMismatches++;

  // True collision = same hash, DIFFERENT deterministic output (SHA-1 → impossible).
  // Same hash + same output = expected (different conversations, identical output).
  const sig = outputSig({ classification: cls, summary });
  const prevSig = hashToSig.get(h1);
  if (prevSig !== undefined) { if (prevSig !== sig) trueCollisions++; else identicalDupes++; }
  else hashToSig.set(h1, sig);

  // Idempotency: unchanged re-run must NOT trigger a write.
  if (shouldRegenerate(h1, h2, false)) duplicateWrites++;
}

const memAfter = process.memoryUsage();
clsLat.sort((a, b) => a - b); sumLat.sort((a, b) => a - b);
const avgOf = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const clsAvg = avgOf(clsLat), sumAvg = avgOf(sumLat);
const pipeAvg = clsAvg + sumAvg;

const fmt = (n: number) => n.toFixed(4);
console.log("── ZONO Copilot Phase 1.1 Benchmark ──────────────────────────────");
console.log(`corpus: ${N} conversations, channels=${CHANNELS.join("/")}, sizes 1..60 msgs, ~15% dormant`);
console.log(`total messages: ${corpus.reduce((a, c) => a + c.messageCount, 0)}`);
console.log("");
console.log(`CLASSIFIER latency (analyze + classify):`);
console.log(`  cold: ${fmt(coldClassifierMs)} ms | warm avg: ${fmt(clsAvg)} | p50: ${fmt(pctl(clsLat, 0.5))} | p95: ${fmt(pctl(clsLat, 0.95))} | max: ${fmt(clsLat[clsLat.length - 1])}`);
console.log(`SUMMARY latency (summarize):`);
console.log(`  cold: ${fmt(coldSummaryMs)} ms | warm avg: ${fmt(sumAvg)} | p50: ${fmt(pctl(sumLat, 0.5))} | p95: ${fmt(pctl(sumLat, 0.95))} | max: ${fmt(sumLat[sumLat.length - 1])}`);
console.log(`FULL pipeline warm avg: ${fmt(pipeAvg)} ms`);
console.log(`  largest conversation: ${largest} msgs (${largestRef}) → ${fmt(largestMs)} ms`);
console.log("");
console.log(`MEMORY:`);
console.log(`  heapUsed before: ${(memBefore.heapUsed / 1e6).toFixed(2)} MB | after: ${(memAfter.heapUsed / 1e6).toFixed(2)} MB | delta: ${((memAfter.heapUsed - memBefore.heapUsed) / 1e6).toFixed(2)} MB`);
console.log(`  rss after: ${(memAfter.rss / 1e6).toFixed(2)} MB`);
console.log("");
console.log(`DETERMINISM & IDEMPOTENCY:`);
console.log(`  determinism mismatches (same input → different hash): ${determinismMismatches}`);
console.log(`  TRUE hash collisions (different content, same hash): ${trueCollisions}`);
console.log(`  identical-content duplicates (expected, same hash+content): ${identicalDupes}`);
console.log(`  distinct content signatures hashed: ${hashToSig.size}`);
console.log(`  duplicate writes on unchanged re-run: ${duplicateWrites}`);
console.log(`  deterministic entity_id stable (uuidv5): ${conversationRefToUuid("whatsapp:conv_0") === conversationRefToUuid("whatsapp:conv_0")}`);
console.log("");
console.log(`CLASSIFICATION:`);
console.log(`  failed classifications: ${failures}`);
console.log(`  label distribution: ${JSON.stringify(labelCounts)}`);
console.log("");
console.log(`SCALABILITY (extrapolated from full warm avg ${fmt(pipeAvg)} ms, single-threaded, CPU-only):`);
for (const scale of [1000, 10000, 100000]) {
  const secs = (pipeAvg * scale) / 1000;
  console.log(`  ${scale.toLocaleString()} conversations: ~${secs.toFixed(2)} s CPU  (${(secs / 60).toFixed(2)} min)`);
}
console.log("──────────────────────────────────────────────────────────────────");
