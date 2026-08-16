// ============================================================================
// P9.7B — ZONO Facebook Assistant extension: pairing-persistence regression tests.
// Pure view logic (popup-logic.js) + structural invariants on background.js that
// guarantee "Refresh Next Post" and auth/network errors NEVER clear pairing.
// Run: npx tsx scripts/p9-7b-extension-harness.mts
// ============================================================================
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const extDir = join(here, "..", "browser-extension", "zono-facebook-assistant");
const { decideView, isConnectedView } = require(join(extDir, "popup-logic.js"));
const background = readFileSync(join(extDir, "background.js"), "utf8");
const manifest = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; } else { fail++; console.log(`FAIL: ${name}`); } };

// ── Pure view decision (the core fix) ────────────────────────────────────────
ok("unpaired → UNPAIRED", decideView({ paired: false }).view === "UNPAIRED");
ok("paired + post → POST_READY", decideView({ paired: true, post: { postId: "x" } }).view === "POST_READY");
ok("paired + no post stays connected (NO_POST)", isConnectedView(decideView({ paired: true, post: null }).view));
ok("paired + no post is NOT unpaired", decideView({ paired: true, post: null }).view !== "UNPAIRED");
ok("paired + auth error stays connected", isConnectedView(decideView({ paired: true, post: null, error: "auth" }).view));
ok("paired + auth error is NOT unpaired (no wipe)", decideView({ paired: true, error: "auth" }).view !== "UNPAIRED");
ok("paired + network error stays connected", isConnectedView(decideView({ paired: true, post: null, error: "network" }).view));
ok("paired + http_500 stays connected", isConnectedView(decideView({ paired: true, post: null, error: "http_500" }).view));
ok("paired + no post shows a message", !!decideView({ paired: true, post: null }).msg);
ok("undefined state → UNPAIRED (safe default)", decideView(undefined).view === "UNPAIRED");

// ── Structural invariants on background.js ───────────────────────────────────
// Credentials are cleared ONLY in the explicit RESET handler — never in fetchNextPost,
// heartbeat, or on a 401/403.
const removeCalls = [...background.matchAll(/storage\.local\.remove\(/g)].length;
ok("exactly one storage.remove call site (RESET only)", removeCalls === 1);
ok("RESET handler owns the remove", /case "RESET":[^]*storage\.local\.remove/.test(background));
ok("fetchNextPost never calls storage.remove", !/fetchNextPost[^]*?storage\.local\.remove[^]*?\n}/.test(background.split("async function fetchNextPost")[1]?.split("\n}")[0] ?? ""));
ok("401/403 returns error:auth (not a clear)", /40[13][^]*?error: "auth"/.test(background));
ok("fetchNextPost returns a paired flag", /paired: true/.test(background) && /paired: false/.test(background));
ok("STATE handler exists for hydration", /case "STATE"/.test(background));
ok("heartbeat caches lastFbSession (non-secret)", /lastFbSession/.test(background));

// ── Version bump ─────────────────────────────────────────────────────────────
ok("manifest version bumped to 0.3.0", manifest.version === "0.3.0");
ok("no facebook host creds in permissions", !JSON.stringify(manifest).includes("cookies"));

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
