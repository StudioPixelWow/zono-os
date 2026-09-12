// ============================================================================
// ZONO — My Office vs Market (/brokerage-data/my-office). Resolves the signed-in
// user's own office (identity-first, never name-only), then shows their share of
// ZONO's OBSERVED inventory, their top-5 direct competitors and opportunity
// insights. If the office isn't resolved, an honest claim experience takes over.
// ============================================================================
import { getMyOfficeReport } from "@/lib/office-intel/my-office";
import { MyOfficeView } from "./MyOfficeView";

export const dynamic = "force-dynamic";

export default async function MyOfficePage() {
  const report = await getMyOfficeReport();
  return <MyOfficeView report={report} />;
}
