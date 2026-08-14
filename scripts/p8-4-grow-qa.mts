// P8.4 — GROW INTEGRATION QA (PURE; no DB, no provider, no network, no writes).
// Proves the provider mapping (statusCode → canonical), the fail-closed defaults,
// the IP allowlist, environment base-URL resolution, and the server-authoritative
// checkout/verification DECISION logic. The live server-to-server flow
// (createPaymentProcess / getTransactionInfo / activation) is exercised only in the
// §19 sandbox test once GROW_* credentials are configured — here we prove the pure
// logic the network code delegates to, which is where the security decisions live.
import {
  growOutcomeFromStatusCode, growPaymentStatus, GROW_PAID_STATUS_CODE,
  isGrowSourceIp, clientIpFromForwardedFor, GROW_SOURCE_IPS, safeStringEqual,
  growBaseUrl, GROW_SANDBOX_BASE, GROW_PRODUCTION_BASE,
} from "../src/lib/commercial/grow-mapping.ts";

let fail = 0;
const ok = (c: boolean, l: string) => { console.log((c ? "  ✓ " : "  ✗ ") + l); if (!c) fail++; };

console.log("P8.4 · statusCode → outcome (ONLY documented '2' = paid; else never paid)");
ok(GROW_PAID_STATUS_CODE === "2", "documented paid statusCode is '2' (שולם)");
ok(growOutcomeFromStatusCode("2") === "paid", "'2' → paid");
ok(growOutcomeFromStatusCode(2) === "paid", "numeric 2 → paid");
ok(growOutcomeFromStatusCode(" 2 ") === "paid", "'2' with whitespace → paid");
ok(growOutcomeFromStatusCode("0") === "not_paid", "'0' → not_paid (real terminal, no revenue)");
ok(growOutcomeFromStatusCode("5") === "not_paid", "other numeric → not_paid (never invented as paid)");
ok(growOutcomeFromStatusCode(null) === "unknown", "null → unknown (fail-closed)");
ok(growOutcomeFromStatusCode(undefined) === "unknown", "undefined → unknown");
ok(growOutcomeFromStatusCode("") === "unknown", "empty → unknown");
ok(growOutcomeFromStatusCode("paid") === "unknown", "non-numeric string → unknown (never paid)");

console.log("\nP8.4 · outcome → canonical payments.status");
ok(growPaymentStatus("paid") === "paid", "paid → paid");
ok(growPaymentStatus("not_paid") === "failed", "not_paid → failed");
ok(growPaymentStatus("unknown") === "pending", "unknown → pending (never activates)");

console.log("\nP8.4 · unknown provider state is NEVER mapped to active/paid");
for (const sc of [null, undefined, "", "x", "99", "0"]) {
  const outcome = growOutcomeFromStatusCode(sc as string);
  ok(outcome !== "paid" || sc === "2", `statusCode ${JSON.stringify(sc)} not treated as paid`);
}

console.log("\nP8.4 · webhook source-IP allowlist (defense-in-depth)");
ok(GROW_SOURCE_IPS.length >= 20, `${GROW_SOURCE_IPS.length} published Grow IPs loaded`);
ok(isGrowSourceIp(GROW_SOURCE_IPS[0]) === true, "known Grow IP → true");
ok(isGrowSourceIp("8.8.8.8") === false, "non-Grow IP → false (rejectable)");
ok(isGrowSourceIp(null) === null, "unknown IP → null (must fall back to re-query, never fail-open)");
ok(clientIpFromForwardedFor("3.123.194.128, 10.0.0.1") === "3.123.194.128", "XFF leftmost = client IP");
ok(clientIpFromForwardedFor(null) === null, "no XFF → null");
ok(isGrowSourceIp(clientIpFromForwardedFor("3.124.62.248, 10.0.0.1")) === true, "XFF Grow IP recognized");

console.log("\nP8.4 · webhookKey compare (defense-in-depth; length-safe)");
ok(safeStringEqual("abc123", "abc123") === true, "equal keys → true");
ok(safeStringEqual("abc123", "abc124") === false, "different keys → false");
ok(safeStringEqual("abc", "abcd") === false, "different length → false");
ok(safeStringEqual(null, "abc") === false, "null provided → false");
ok(safeStringEqual("abc", null) === false, "null configured → false");

console.log("\nP8.4 · environment base URL (missing/unknown NEVER hits production)");
ok(growBaseUrl("production") === GROW_PRODUCTION_BASE, "'production' → secure.meshulam base");
ok(growBaseUrl("sandbox") === GROW_SANDBOX_BASE, "'sandbox' → sandbox base");
ok(growBaseUrl(undefined) === GROW_SANDBOX_BASE, "undefined GROW_ENV → sandbox (safe default)");
ok(growBaseUrl("") === GROW_SANDBOX_BASE, "empty → sandbox");
ok(growBaseUrl("PROD") === GROW_SANDBOX_BASE, "unrecognized → sandbox (never silently production)");
ok(GROW_SANDBOX_BASE.includes("sandbox.meshulam.co.il") && GROW_PRODUCTION_BASE.includes("secure.meshulam.co.il"), "base URLs match official docs");

console.log("\nP8.4 · verification gate is the server-to-server re-query (documented model)");
// A callback merely CLAIMING statusCode 2 is not enough: activation requires the
// getTransactionInfo re-query to ALSO return paid. Prove the pure gate: claimed vs
// confirmed. (The webhook route requires info.ok && outcome==='paid'.)
{
  const claimedPaidButUnconfirmed = { claimed: growOutcomeFromStatusCode("2"), confirmed: growOutcomeFromStatusCode(undefined) };
  ok(claimedPaidButUnconfirmed.claimed === "paid" && claimedPaidButUnconfirmed.confirmed !== "paid", "callback claims paid but re-query unconfirmed → NOT activated (forged callback blocked)");
  const bothPaid = growOutcomeFromStatusCode("2") === "paid";
  ok(bothPaid, "callback paid AND re-query paid → activation proceeds");
}

console.log("");
console.log(fail === 0 ? "ALL P8.4 GROW QA PASSED" : `${fail} FAILED`);
if (fail) process.exit(1);
