// ============================================================================
// 📘 ZONO — Facebook Growth Platform page (/facebook). 37.0.
// Unifying cockpit composing the EXISTING Facebook stack (distribution, groups
// intelligence, comments, market domination, connection). Assisted/manual +
// approval-gated; deep-links into the existing surfaces. No publishing here.
// ============================================================================
import { getFacebookHome } from "@/lib/facebook-home/service";
import { FacebookHome } from "@/components/facebook-home/FacebookHome";

export const dynamic = "force-dynamic";

export default async function FacebookPage() {
  const data = await getFacebookHome();
  return <FacebookHome data={data} />;
}
