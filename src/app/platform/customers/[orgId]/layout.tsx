// ZONO — Customer 360 layout (P5.2). Renders the org header + tab nav around
// every Customer 360 tab. Base-gated by platform.customers.read (each tab page
// additionally re-guards its own capability). Header fetch is authorized but not
// audited (chrome); per-tab access events are audited by the tab DAL functions.
import type { ReactNode } from "react";
import Link from "next/link";
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgHeaderForPlatform } from "@/lib/platform-admin/server/dal";
import { capabilitiesForRole } from "@/lib/platform-admin/capabilities";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { Customer360Header } from "@/components/platform-admin/Customer360Header";
import { Customer360Tabs } from "@/components/platform-admin/Customer360Tabs";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function Customer360Layout({ children, params }: { children: ReactNode; params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.customers.read");
  if (!operator) return <PlatformDenied />;

  const { orgId } = await params;
  const header = await getOrgHeaderForPlatform(orgId);
  if (!header) {
    return (
      <div>
        <Link href="/platform/customers" className="text-muted hover:text-ink mb-4 inline-flex items-center gap-1 text-[12px] font-bold"><Icon name="ArrowLeft" size={14} />ארגונים</Link>
        <div className="border-line bg-card rounded-2xl border p-10 text-center">
          <span className="text-muted bg-surface mx-auto grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Building2" size={22} /></span>
          <p className="text-ink mt-3 font-black">הארגון לא נמצא</p>
          <p className="text-muted mt-1 text-sm">לא נמצא ארגון עם המזהה המבוקש.</p>
        </div>
      </div>
    );
  }

  const caps = capabilitiesForRole(operator.role);
  return (
    <div>
      <Customer360Header header={header} />
      <Customer360Tabs orgId={orgId} caps={caps} />
      {children}
    </div>
  );
}
