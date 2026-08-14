// ============================================================================
// P9.1B — Property Radar DIGEST QA (PURE; no DB/network).
// Drives the digest state machine (src/components/property-radar/digest-logic.ts)
// directly to prove the production notification contract for every batch size:
//   • at most ONE banner (single boolean, never stacks)
//   • correct unseen count (0/1/5/30/100/250)
//   • acknowledge drains → not visible
//   • refresh/poll does NOT replay an acknowledged batch (no timer/replay loop)
//   • a genuinely-new arrival re-shows the digest
//   • quiet mode suppresses everything
//   • RTL/plural copy contract
// Run: npx tsx scripts/p9-1b-radar-digest-qa.mts
// ============================================================================
import {
  INITIAL_DIGEST_STATE,
  deriveCity,
  digestCountLabel,
  digestReducer,
  isDigestVisible,
  type DigestState,
} from "../src/components/property-radar/digest-logic";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };

const BATCHES = [0, 1, 5, 30, 100, 250];

console.log("P9.1B · copy contract (RTL / singular / plural)");
ok(digestCountLabel(0) === "", "0 → empty label");
ok(digestCountLabel(1) === "הזדמנות חדשה אחת", "1 → singular");
ok(digestCountLabel(2) === "2 הזדמנויות חדשות", "2 → plural");
ok(/250|הזדמנויות/.test(digestCountLabel(250)), "250 → plural with count");
ok(!/undefined|NaN/.test(digestCountLabel(100)), "100 → clean label");

console.log("\nP9.1B · deriveCity picks the modal city");
ok(deriveCity([{ metadata: { city: "Rehovot" } }, { metadata: { city: "Rehovot" } }, { metadata: { city: "תל אביב" } }]) === "Rehovot", "most common city wins");
ok(deriveCity([{ metadata: {} }, { metadata: { city: "" } }]) === null, "no city → null (generic copy)");

console.log("\nP9.1B · batch arrival: one banner max + correct count");
for (const n of BATCHES) {
  const top = n > 0 ? "a1" : null;
  const s = digestReducer(INITIAL_DIGEST_STATE, { type: "fetch", count: n, topId: top });
  const vis = isDigestVisible(s, false);
  ok(typeof vis === "boolean", `batch ${n}: visibility is a single boolean (never stacks)`);
  ok(vis === (n > 0), `batch ${n}: visible === (count>0)`);
  ok(s.count === n, `batch ${n}: count exact = ${n}`);
}

console.log("\nP9.1B · acknowledge drains, and poll does NOT replay the batch");
for (const n of BATCHES.filter((x) => x > 0)) {
  let s: DigestState = digestReducer(INITIAL_DIGEST_STATE, { type: "fetch", count: n, topId: "a1" });
  ok(isDigestVisible(s, false), `batch ${n}: visible before ack`);
  s = digestReducer(s, { type: "acknowledge" });
  ok(!isDigestVisible(s, false) && s.count === 0, `batch ${n}: hidden + drained after ack`);
  // Simulate 10 consecutive 30s polls returning the SAME (pre-commit) batch.
  let replayed = false;
  for (let i = 0; i < 10; i++) {
    s = digestReducer(s, { type: "fetch", count: n, topId: "a1" });
    if (isDigestVisible(s, false)) replayed = true;
  }
  ok(!replayed, `batch ${n}: 10 polls of the same batch NEVER replay (no timer loop)`);
  // After the server drain commits, the poll returns 0.
  s = digestReducer(s, { type: "fetch", count: 0, topId: null });
  ok(!isDigestVisible(s, false), `batch ${n}: empty after server drain`);
}

console.log("\nP9.1B · a genuinely-new arrival re-shows the digest");
{
  let s: DigestState = digestReducer(INITIAL_DIGEST_STATE, { type: "fetch", count: 30, topId: "a1" });
  s = digestReducer(s, { type: "acknowledge" });
  ok(!isDigestVisible(s, false), "hidden after ack");
  s = digestReducer(s, { type: "fetch", count: 1, topId: "a2" });
  ok(isDigestVisible(s, false) && s.count === 1, "new top id (a2) re-shows with fresh count");
}

console.log("\nP9.1B · realtime insert bumps count, still ONE banner");
{
  let s = digestReducer(INITIAL_DIGEST_STATE, { type: "insert", id: "b1" });
  ok(isDigestVisible(s, false) && s.count === 1, "first insert → visible, count 1");
  s = digestReducer(s, { type: "insert", id: "b2" });
  ok(isDigestVisible(s, false) && s.count === 2, "second insert → still one banner, count 2");
}

console.log("\nP9.1B · quiet mode suppresses the digest entirely");
for (const n of [1, 30, 250]) {
  const s = digestReducer(INITIAL_DIGEST_STATE, { type: "fetch", count: n, topId: "a1" });
  ok(!isDigestVisible(s, true), `batch ${n}: quiet → not visible`);
}

console.log(`\n${fail === 0 ? "✅ P9.1B RADAR DIGEST QA PASSED" : `❌ P9.1B QA FAILED (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
