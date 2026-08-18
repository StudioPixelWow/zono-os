// ============================================================================
// 📘 ZONO — Facebook Groups Campaign Wizard page. 33.2.
// Guided property→groups campaign flow that reuses the existing distribution
// engine (groups library, Facebook connection, publish assistant, comments).
// Adds no tables and no publishing logic; nothing auto-executes.
// ============================================================================
import { getWizardBootstrap } from "@/lib/facebook-groups";
import { CampaignWizard } from "@/components/facebook-groups/CampaignWizard";

export const dynamic = "force-dynamic";

export default async function CampaignWizardPage({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
  const sp = await searchParams;
  const boot = await getWizardBootstrap().catch(() => ({ properties: [], folders: [], connection: { provider: "facebook", label: "Facebook", status: "not_connected", connected: false, message: "פייסבוק לא מחובר", requiresMembership: true }, notes: ["טעינת הנתונים נכשלה כעת."] }));
  // Preselect only a property that is in THIS org's bootstrap list (org-scoped validation).
  const initialPropertyId = sp?.property && boot.properties.some((p) => p.id === sp.property) ? sp.property : null;
  return <CampaignWizard properties={boot.properties} folders={boot.folders} connection={boot.connection} notes={boot.notes} initialPropertyId={initialPropertyId} />;
}
