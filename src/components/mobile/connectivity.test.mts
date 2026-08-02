// ============================================================================
// 📶 Connectivity logic — offline determinism test (P0-2 acceptance cases).
// Run: npx tsx src/components/mobile/connectivity.test.mts   (exit 0 = all pass)
// ============================================================================
import { nextOnlineState, bannerState, type ConnEvent } from "./connectivity.ts";

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
};

// Replay a sequence of [event, navigator.onLine] pairs from an initial state.
function replay(initial: boolean, steps: Array<[ConnEvent, boolean]>): boolean {
  return steps.reduce((state, [ev, nav]) => nextOnlineState(state, ev, nav), initial);
}

console.log("\n— P0-2 acceptance cases —");

// 1) A single transient request/server failure must NOT mark the app offline.
//    There is no ConnEvent a failed fetch can emit → state cannot flip to false.
check("transient request failure does not flip offline (no conn event exists)",
  replay(true, []) === true);

// 2) A real native offline event → offline.
check("native offline event → offline", replay(true, [["offline", false]]) === false);

// 3) Successful recovery: native online event → online (banner clears).
check("native online event after offline → online", replay(false, [["online", true]]) === true);

// 4) THE FIX — a latched-offline state recovers on mount/visibility/focus re-sync
//    once navigator.onLine reads true again.
check("stale offline recovers on mount re-sync (nav online=true)",
  replay(false, [["mount", true]]) === true);
check("stale offline recovers on visibility regain",
  replay(false, [["visible", true]]) === true);
check("stale offline recovers on focus regain",
  replay(false, [["focus", true]]) === true);

// 5) Server error while internet is up must not show offline: online stays true
//    across re-syncs when navigator.onLine is true.
check("server error while online → stays online across re-sync",
  replay(true, [["visible", true], ["focus", true]]) === true);

// 6) Route transition after recovery keeps online (re-sync is idempotent).
check("route transition (focus) after recovery stays online",
  replay(true, [["focus", true]]) === true);

// Genuine offline must persist through re-syncs while nav is still offline.
check("genuinely offline stays offline while nav.onLine=false",
  replay(false, [["visible", false], ["focus", false]]) === false);

console.log("\n— banner copy/visibility —");
check("online + 0 pending → no banner", bannerState(true, 0) === null);
check("online + pending → sync banner", bannerState(true, 3)?.tone === "sync");
check("offline + 0 pending → offline copy", bannerState(false, 0)?.text.includes("צפייה במצב לא-מקוון") === true);
check("offline + pending → queued copy", bannerState(false, 2)?.text.includes("ממתינות לסנכרון") === true);

console.log(`\n${failed === 0 ? "🟢" : "🔴"} connectivity: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
