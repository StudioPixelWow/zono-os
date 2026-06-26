/**
 * DEV-ONLY seed: insert 3 example agencies (+ a branch, profile and timeline
 * event each) for one org. NOT a production seed. Idempotent by (org, slug).
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ORG_ID.
 * Run: SEED_ORG_ID=<org-uuid> npx tsx scripts/seed-agencies.ts
 */
import { createClient } from "@supabase/supabase-js";
import { normalizeAgencyName, agencySlug } from "../src/lib/agencies/normalize";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const org = process.env.SEED_ORG_ID;

const AGENCIES = [
  { name: "אנגלו סכסון חיפה", website: "anglo.co.il", phone: "04-8000000", city: "חיפה", luxury: true },
  { name: "רי/מקס נכסים", website: "remax.co.il", phone: "03-7000000", city: "קריית ביאליק", luxury: false },
  { name: "סנצ'ורי 21 הצפון", website: "century21.co.il", phone: "04-9000000", city: "קריית מוצקין", luxury: false },
];

async function main(): Promise<void> {
  if (!url || !key || !org) {
    console.error("✗ Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ORG_ID.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  for (const a of AGENCIES) {
    const slug = agencySlug(a.name);
    const { data: existing } = await db.from("agencies").select("id").eq("organization_id", org).eq("slug", slug).maybeSingle();
    let agencyId = existing?.id as string | undefined;

    if (!agencyId) {
      const { data, error } = await db.from("agencies").insert({
        organization_id: org, name: a.name, normalized_name: normalizeAgencyName(a.name), slug,
        website: a.website, phone: a.phone, headquarters_city: a.city, active: true,
      }).select("id").single();
      if (error) { console.error(`✗ ${a.name}:`, error.message); continue; }
      agencyId = data.id as string;

      await db.from("agency_branches").insert({ organization_id: org, agency_id: agencyId, city: a.city });
      await db.from("agency_profiles").insert({ organization_id: org, agency_id: agencyId, luxury: a.luxury, service_areas: [a.city] });
      await db.from("agency_timeline").insert({ organization_id: org, agency_id: agencyId, event_type: "created", title: "הסוכנות נוצרה (seed)", description: a.name });
      console.log(`✅ created ${a.name}`);
    } else {
      console.log(`• exists ${a.name}`);
    }
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
