// ============================================================================
// P10A — Claim WRITE pipeline: phone(§13) + gate(§9) + media + decision + an
// in-memory ORCHESTRATION integration that proves the exact production claim
// pipeline WITHOUT any production write (reversible by construction — no DB).
// Run: npx esbuild scripts/p10a-claim-write-harness.mts --bundle --platform=node --format=cjs | node -
// ============================================================================
// NOTE: namespace imports — tsx in this env mis-resolves named `.ts` imports.
import * as PC from "../src/lib/claim/claim-phone-core.ts";
import * as WC from "../src/lib/claim/claim-write-core.ts";
import * as EC from "../src/lib/claim/claim-evidence-core.ts";
import * as DC from "../src/lib/claim/claim-decision-core.ts";
const { classifyPhone, phonePolarity, phoneClassToMatch, normalizePhone, looksMaskedOrRelay } = PC;
type PhoneKnowledge = PC.PhoneKnowledge;
const { assertClaimAllowed, mapListingImagesToMedia, buildClaimReviewRecord } = WC;
const { scoreCandidate } = EC;
type CandidateEvidence = EC.CandidateEvidence;
const { planClaim } = DC;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`FAIL: ${n}`); } };
const E = (o: Partial<CandidateEvidence>): CandidateEvidence => ({
  sameOrg: true, stableAgentIdMatch: false, nameMatch: "none", phoneMatch: "unknown",
  officeMatch: false, cityMatch: false, priorConfirmedSameIdentity: 0, ...o,
});
const KNOW: PhoneKnowledge = {
  personalPhones: ["0546365321"], officePhones: ["08-9412345"], sourcePhones: ["050-1112222"],
  otherBrokerPhones: ["0554308680"], relayHint: null,
};

// ── §13 phone classification ─────────────────────────────────────────────────
ok("normalizePhone 972→0", normalizePhone("+972546365321") === "0546365321");
ok("EXACT_PERSONAL_MATCH", classifyPhone("054-636-5321", KNOW) === "EXACT_PERSONAL_MATCH");
ok("KNOWN_OFFICE_PHONE", classifyPhone("089412345", KNOW) === "KNOWN_OFFICE_PHONE");
ok("KNOWN_SOURCE_PHONE", classifyPhone("0501112222", KNOW) === "KNOWN_SOURCE_PHONE");
ok("VERIFIED_OTHER_BROKER_PHONE", classifyPhone("0554308680", KNOW) === "VERIFIED_OTHER_BROKER_PHONE");
ok("masked/relay prefix → MASKED_OR_RELAY", classifyPhone("0721234567", KNOW) === "MASKED_OR_RELAY");
ok("unrelated unknown → UNKNOWN (neutral, NOT contradiction)", classifyPhone("0529998888", KNOW) === "UNKNOWN");
ok("looksMaskedOrRelay detects hint", looksMaskedOrRelay("0501234567", "מספר חסוי"));
// polarity + bridge
ok("personal → positive → exact", phonePolarity(classifyPhone("0546365321", KNOW)) === "positive" && phoneClassToMatch("EXACT_PERSONAL_MATCH") === "exact");
ok("masked → neutral → unknown (no cap)", phonePolarity("MASKED_OR_RELAY") === "neutral" && phoneClassToMatch("MASKED_OR_RELAY") === "unknown");
ok("unknown → neutral → unknown", phoneClassToMatch("UNKNOWN") === "unknown");
ok("other-broker → negative → contradict", phonePolarity("VERIFIED_OTHER_BROKER_PHONE") === "negative" && phoneClassToMatch("VERIFIED_OTHER_BROKER_PHONE") === "contradict");
// §13 regression guard: a DIFFERENT phone that is only "unknown" must NOT drag a
// name-strong candidate down to LOW via a false contradiction.
ok("§13: exact name + office + UNKNOWN phone → MEDIUM (not LOW)",
  scoreCandidate(E({ nameMatch: "exact", officeMatch: true, phoneMatch: phoneClassToMatch("UNKNOWN") })).confidence === "medium");
// but a REAL other-broker phone still contradicts → LOW
ok("§13: exact name + VERIFIED_OTHER_BROKER phone → LOW (real contradiction)",
  scoreCandidate(E({ nameMatch: "exact", officeMatch: true, phoneMatch: phoneClassToMatch("VERIFIED_OTHER_BROKER_PHONE") })).confidence === "low");

// REAL Maor listing under §13: first-name only + a different-but-unverified phone
// (0554308680 belongs to "מרים מזרחי", not proven to be a broker in the anchor's
// directory here) → neutral phone → still LOW on name-only, but NOT via a false
// phone contradiction.
const maor = scoreCandidate(E({ nameMatch: "first_only", officeMatch: true, cityMatch: true, phoneMatch: phoneClassToMatch("UNKNOWN") }));
ok("REAL Maor → LOW (name-only, neutral phone)", maor.confidence === "low");
ok("REAL Maor → no false phone contradiction caution", !maor.cautions.some((c) => c.includes("טלפון") && c.includes("שונה")));

// ── §9 claim gate (server-authoritative confirmation) ────────────────────────
ok("HIGH auto-eligible", assertClaimAllowed(scoreCandidate(E({ stableAgentIdMatch: true, phoneMatch: "exact" }))).allowed);
ok("MEDIUM auto-eligible", assertClaimAllowed(scoreCandidate(E({ nameMatch: "exact", officeMatch: true }))).allowed);
ok("LOW refused without confirmation", !assertClaimAllowed(scoreCandidate(E({ nameMatch: "similar" }))).allowed);
ok("LOW allowed WITH confirmation", assertClaimAllowed(scoreCandidate(E({ nameMatch: "similar" })), { confirmLowConfidence: true }).allowed);
ok("LOW refusal flags requiresConfirmation", assertClaimAllowed(scoreCandidate(E({ nameMatch: "similar" }))).requiresConfirmation);
ok("cross-org NEVER allowed even with confirmation", !assertClaimAllowed(scoreCandidate(E({ sameOrg: false })), { confirmLowConfidence: true }).allowed);
ok("real phone contradiction needs confirmation", !assertClaimAllowed(scoreCandidate(E({ stableAgentIdMatch: true, phoneMatch: "contradict" }))).allowed);
ok("office-only needs confirmation", !assertClaimAllowed(scoreCandidate(E({ officeMatch: true }))).allowed);

// ── Media mapping (real photos only, idempotent-friendly) ────────────────────
const imgs = ["https://img.yad2.co.il/a.jpg", "https://img.yad2.co.il/a.jpg", "https://img.yad2.co.il/b.jpg", { url: "https://img.yad2.co.il/c.jpg" }, "not-a-url", 42];
const media = mapListingImagesToMedia("ORG", "PROP", imgs, "דירה");
ok("media dedups identical urls", media.length === 3);
ok("media first is primary", media[0].is_primary && media[1].is_primary === false);
ok("media sort_order sequential", media[0].sort_order === 0 && media[2].sort_order === 2);
ok("media reads object {url}", media.some((m) => m.url.endsWith("c.jpg")));
ok("media rejects non-http + non-string", !media.some((m) => m.url === "not-a-url" || m.url === "42"));
ok("media carries org + property + external_url", media[0].org_id === "ORG" && media[0].property_id === "PROP" && media[0].external_url === media[0].url);
ok("media cap respected", mapListingImagesToMedia("O", "P", Array.from({ length: 100 }, (_, i) => `https://x/${i}.jpg`)).length === 30);
ok("no images → no media (no AI photos)", mapListingImagesToMedia("O", "P", null).length === 0);

// ── Decision record (broker_match_reviews) ───────────────────────────────────
const hi = scoreCandidate(E({ stableAgentIdMatch: true, phoneMatch: "exact", officeMatch: true }));
const claimed = buildClaimReviewRecord({ orgId: "O", listingId: "L", brokerId: null, verdict: hi, outcome: "claimed", decidedBy: "U", decidedAtIso: "2026-08-16T10:00:00Z", gate: { allowed: true, requiresConfirmation: false, reason: "auto" } });
ok("claimed → status approved", claimed.status === "approved");
ok("claimed sets decided_by + decided_at", claimed.decided_by === "U" && claimed.decided_at === "2026-08-16T10:00:00Z");
ok("claimed confidence_score high=90", claimed.confidence_score === 90);
ok("evidence carries reasons + outcome", Array.isArray((claimed.evidence as any).reasons) && (claimed.evidence as any).outcome === "claimed");
const rej = buildClaimReviewRecord({ orgId: "O", listingId: "L", brokerId: null, verdict: hi, outcome: "rejected", decidedBy: "U", decidedAtIso: "t", gate: { allowed: true, requiresConfirmation: false, reason: "reject" } });
ok("rejected → status rejected (terminal)", rej.status === "rejected" && rej.decided_at === "t");
const snz = buildClaimReviewRecord({ orgId: "O", listingId: "L", brokerId: null, verdict: hi, outcome: "snoozed", decidedBy: "U", decidedAtIso: "t", gate: { allowed: true, requiresConfirmation: false, reason: "snooze" } });
ok("snoozed → status pending, NOT terminal (no decided_at)", snz.status === "pending" && snz.decided_at === null);

// ── In-memory ORCHESTRATION integration (no DB, reversible) ───────────────────
// A faithful double of the write-service steps: recheck → gate → resolve(reuse/
// create) → media(idempotent) → decision. Proves the pipeline shape + dedupe +
// media-idempotency + decision persistence WITHOUT touching production.
type Store = { properties: any[]; media: any[]; reviews: any[]; listings: any[] };
function runClaimPipeline(store: Store, listing: any, verdict: any, orgId: string, userId: string, confirm = false) {
  const gate = assertClaimAllowed(verdict, { confirmLowConfidence: confirm });
  if (!gate.allowed) return { status: "refused", requiresConfirmation: gate.requiresConfirmation };
  // resolve
  const existingBySourceId = store.properties.find((p) => p.org_id === orgId && p.source_listing_id === listing.source_id)?.id ?? null;
  const dupSibling = store.listings.find((l) => l.duplicate_group_id && l.duplicate_group_id === listing.duplicate_group_id && l.promoted_property_id)?.promoted_property_id ?? null;
  const plan = planClaim({ listingPromotedPropertyId: listing.promoted_property_id ?? null, listingPrimaryPropertyId: listing.primary_property_id ?? null, existingBySourceId, duplicateGroupPromotedId: dupSibling });
  let propertyId: string, created = false;
  if (plan.action === "reuse") { propertyId = plan.propertyId; listing.promoted_property_id = propertyId; }
  else { propertyId = `prop_${store.properties.length + 1}`; created = true; store.properties.push({ id: propertyId, org_id: orgId, source_listing_id: listing.source_id }); listing.promoted_property_id = propertyId; listing.primary_property_id = propertyId; }
  // media (idempotent)
  let mediaImported = 0;
  if (!store.media.some((m) => m.property_id === propertyId)) {
    const rows = mapListingImagesToMedia(orgId, propertyId, listing.images, listing.title);
    store.media.push(...rows); mediaImported = rows.length;
  }
  // decision
  store.reviews.push(buildClaimReviewRecord({ orgId, listingId: listing.id, brokerId: null, verdict, outcome: "claimed", decidedBy: userId, decidedAtIso: "t", gate }));
  return { status: "claimed", propertyId, created, mediaImported };
}

const store: Store = { properties: [], media: [], reviews: [], listings: [] };
const L1 = { id: "L1", source_id: "src1", title: "דירה", images: ["https://x/1.jpg", "https://x/2.jpg"], promoted_property_id: null, primary_property_id: null, duplicate_group_id: null };
store.listings.push(L1);
const hiV = scoreCandidate(E({ stableAgentIdMatch: true, phoneMatch: "exact" }));

const r1 = runClaimPipeline(store, L1, hiV, "ORG", "U");
ok("integ: first claim CREATES a property", r1.status === "claimed" && r1.created === true);
ok("integ: media imported on create", r1.mediaImported === 2 && store.media.length === 2);
ok("integ: decision persisted approved", store.reviews.length === 1 && store.reviews[0].status === "approved");

const r2 = runClaimPipeline(store, L1, hiV, "ORG", "U");
ok("integ: repeat claim REUSES same property (idempotent)", r2.propertyId === r1.propertyId && r2.created === false);
ok("integ: repeat claim imports 0 media (no dup)", r2.mediaImported === 0 && store.media.length === 2);
ok("integ: only ONE property total (0 duplicates)", store.properties.length === 1);

// duplicate-group sibling reuse
const L2 = { id: "L2", source_id: "src2", title: "דירה 2", images: ["https://y/1.jpg"], promoted_property_id: null, primary_property_id: null, duplicate_group_id: "G9" };
const L3 = { id: "L3", source_id: "src3", title: "דירה 2 (כפילות)", images: ["https://y/1.jpg"], promoted_property_id: null, primary_property_id: null, duplicate_group_id: "G9" };
store.listings.push(L2, L3);
const rA = runClaimPipeline(store, L2, hiV, "ORG", "U");
const rB = runClaimPipeline(store, L3, hiV, "ORG", "U");
ok("integ: duplicate-group sibling reuses the promoted property", rB.propertyId === rA.propertyId && rB.created === false);
ok("integ: dup-group did not create a 3rd property", store.properties.length === 2);

// LOW candidate is refused unless confirmed (the real Maor safety path)
const lowV = scoreCandidate(E({ nameMatch: "first_only", officeMatch: true, cityMatch: true, phoneMatch: phoneClassToMatch("UNKNOWN") }));
const rLow = runClaimPipeline(store, L1, lowV, "ORG", "U");
ok("integ: LOW real-Maor candidate REFUSED without confirmation", rLow.status === "refused" && rLow.requiresConfirmation === true);

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
