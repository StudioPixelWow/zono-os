// ============================================================================
// ZONO — Creative-generation storage GUARANTEES (static QA).
// Asserts, across the real source, that EVERY AI-generated creative draft write
// path uses the PRIVATE master bucket + signed previews and NEVER a public URL.
// Mirrors the meta/publish/qa.ts static-check pattern. Run:
//   npx tsx src/lib/creative-studio/storage/creative-write-paths.qa.ts
// ============================================================================
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const read = (p: string) => readFileSync(p, "utf8");

// The three generation write-path modules.
const qcs = read("src/lib/creative-studio/quick-creative-service.ts");
const vis = read("src/lib/creative-studio/visual-service.ts");
const qa = read("src/lib/creative-studio/creative-qa-engine.ts");

console.log("Creative-generation storage guarantees:");

// 1. NO generation path calls getPublicUrl anymore.
check("quick-creative-service: no getPublicUrl", !/getPublicUrl/.test(qcs));
check("visual-service: no getPublicUrl", !/getPublicUrl/.test(vis));
check("creative-qa-engine: no getPublicUrl", !/getPublicUrl/.test(qa));

// 2. Every write path uploads to the PRIVATE bucket via the service role.
check("quick-creative-service: writes creative-private", /CREATIVE_PRIVATE_BUCKET/.test(qcs) && /createServiceRoleClient\(\)/.test(qcs) && /\.from\(CREATIVE_PRIVATE_BUCKET\)\.upload/.test(qcs));
check("visual-service: writes creative-private", /CREATIVE_PRIVATE_BUCKET/.test(vis) && /createServiceRoleClient\(\)/.test(vis) && /\.from\(CREATIVE_PRIVATE_BUCKET\)\.upload/.test(vis));
check("creative-qa-engine: writes creative-private", /CREATIVE_PRIVATE_BUCKET/.test(qa) && /createServiceRoleClient\(\)/.test(qa) && /\.from\(CREATIVE_PRIVATE_BUCKET\)\.upload/.test(qa));

// 3. Previews are short-lived signed URLs (bounded TTL), never persisted public.
check("quick-creative-service: signed previews (300s)", /createSignedUrl\(path, CREATIVE_SIGNED_TTL_SEC\)/.test(qcs) && /CREATIVE_SIGNED_TTL_SEC = 300/.test(qcs));
check("visual-service: signed previews (300s)", /createSignedUrl\(path, CREATIVE_SIGNED_TTL_SEC\)/.test(vis) && /CREATIVE_SIGNED_TTL_SEC = 300/.test(vis));
check("creative-qa-engine: signed previews (300s)", /createSignedUrl\(path, CREATIVE_SIGNED_TTL_SEC\)/.test(qa) && /CREATIVE_SIGNED_TTL_SEC = 300/.test(qa));

// 4. The durable persisted reference is the private path, not a public URL.
check("quick-creative-service: persists private_master_path", /private_master_path: path/.test(qcs) && /image_url: null/.test(qcs));
check("creative-qa-engine: returns durable masterPath", /masterPath: string \| null/.test(qa) && /masterPath: path/.test(qa));
check("quick-creative-service: batch persists outcome.masterPath", /private_master_path: outcome\.masterPath/.test(qcs));

// 5. No generated-zono-visuals UPLOAD remains in any generation path (legacy
//    bucket is read-compat only; brand-asset upload in assets.ts is out of scope).
check("no generation path uploads to a public bucket", !/VISUAL_BUCKET\)\.upload/.test(qcs) && !/from\(BUCKET\)\.upload/.test(vis) && /from\(CREATIVE_PRIVATE_BUCKET\)\.upload/.test(vis));

// 6. Meta/Instagram private signed-media path is preserved (regression guard).
const metaDelivery = read("src/lib/meta/publish/media-delivery.ts");
check("meta publishing still private signed (no getPublicUrl)", /createSignedUrl/.test(metaDelivery) && !/getPublicUrl/.test(metaDelivery));

// 7. Distribution hand-offs resolve the APPROVED DERIVATIVE for linked outputs and
//    never leak a private master. Extension (Groups) + manual-publish (Groups/WhatsApp).
const ext = read("src/lib/distribution/extension-service.ts");
const manual = read("src/lib/distribution/manual-publish-service.ts");
check("extension getNextPost resolves derivative for linked posts",
  /resolveJobDerivative/.test(ext) && /creative_output_id/.test(ext) && !/getPublicUrl/.test(ext));
check("manual-publish resolves derivative for linked posts (Groups/WhatsApp)",
  /resolveJobDerivative/.test(manual) && /p\.creative_output_id/.test(manual) && !/getPublicUrl/.test(manual));
check("manual-publish honest no-leak fallback (null, never private master)",
  /signedUrl \? handoff\.signedUrl : null/.test(manual));
check("manual-publish maps only Groups\\/WhatsApp to promotion channels (Meta excluded)",
  /promotionChannelFor/.test(manual) && /return "facebook_groups"/.test(manual) && /return "whatsapp"/.test(manual) && /return null; \/\/ facebook_page \/ instagram/.test(manual));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
