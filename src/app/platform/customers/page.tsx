// ZONO — Platform Admin · Organizations directory (P5.1). Minimal, public-safe
// cross-org list via the audited DAL. Full Customer 360 arrives in P5.2.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { listOrganizationsForPlatform } from "@/lib/platform-admin/server/dal";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader } from "@/components/platform-admin/ui";
import { CustomersDirectory } from "@/components/platform-admin/CustomersDirectory";

export const dynamic = "force-dynamic";

export default async function PlatformCustomersPage() {
  const operator = await authorizePlatform("platform.customers.read");
  if (!operator) return <PlatformDenied />;

  const orgs = await listOrganizationsForPlatform();

  return (
    <div>
      <PageHeader eyebrow="לקוחות" title="ארגונים" icon="Building2" description="ספריית כל ארגוני הלקוחות בפלטפורמה. בחר ארגון לתצוגת סיכום. חיפוש גלובלי זמין ב-⌘K." />
      <CustomersDirectory orgs={orgs} />
    </div>
  );
}
