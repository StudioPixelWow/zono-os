// ============================================================================
// ZONO — Property Contact CTA static guarantees (source-level QA).
// Asserts the non-unit-testable requirements against the real source:
// cross-org safety (org-scoped RLS only), honest disabled state (no fake number),
// no message-body storage, and mobile sticky-bar clearance / RTL / safe-area.
// Run: npx tsx scripts/property-contact-tests/property-contact-guarantees.qa.ts
// ============================================================================
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};
const read = (p: string) => readFileSync(p, "utf8");

const core = read("src/lib/properties/contact/property-contact-core.ts");
const service = read("src/lib/properties/contact/property-contact-service.ts");
const actions = read("src/lib/properties/contact/actions.ts");
const cta = read("src/app/(app)/properties/[id]/PropertyContactCTA.tsx");
const zi = read("src/components/zi-expert/ZIWidget.tsx");

console.log("Property Contact CTA guarantees:");

// Cross-org: the service reads ONLY through the authed org-scoped client (RLS);
// never the service-role client that would bypass org isolation.
check("service uses org-scoped createClient (RLS)", /from\("sellers"\)|from\("external_listings"\)/.test(service) && /createClient/.test(service));
check("service never uses the service-role client", !/createServiceRoleClient/.test(service));

// Honest disabled state — no fabricated numbers.
check("core disables when the phone can't be normalized", /disabled = !normalized/.test(core));
check("core emits the honest empty label", /אין מספר טלפון זמין/.test(core));
check("broker-represented never falls back to the owner phone", /rawPhone = isBroker \? input\.brokerPhone : input\.ownerPhone/.test(core));

// Analytics: the CTA tracks clicks but does NOT persist the WhatsApp message body.
check("action records the required event fields", /contact_type/.test(actions) && /channel: input\.action/.test(actions) && /entityId: input\.propertyId/.test(actions));
check("action does not store the message body", !/message:/.test(actions) && !/\bbody\b/.test(actions));

// Mobile sticky bar: clears the app bottom nav + safe area, reserves room for the
// ZI launcher, is RTL, and hidden on desktop (where the panel shows instead).
check("CTA mobile bar clears the bottom nav (4.75rem + safe-area)", /bottom-\[calc\(4\.75rem\+env\(safe-area-inset-bottom,0px\)\)\]/.test(cta));
check("CTA mobile bar reserves inline-end room for the ZI launcher", /pe-20/.test(cta));
check("CTA mobile bar is RTL + mobile-only", /dir="rtl"/.test(cta) && /lg:hidden/.test(cta));
check("CTA desktop panel is desktop-only", /hidden flex-col[^"]*lg:flex/.test(cta));
check("CTA WhatsApp is the primary (flex-[2]) action", /flex-\[2\]/.test(cta));

// Smart chat (ZI) is now mobile-responsive: edge-to-edge sheet on mobile, corner
// panel on desktop, still clearing the bottom nav.
check("ZI chat window is an edge-to-edge sheet on mobile", /inset-x-2 bottom-\[calc\(4\.75rem/.test(zi));
check("ZI chat window restores the desktop corner panel", /lg:inset-x-auto lg:right-5 lg:bottom-5/.test(zi));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
