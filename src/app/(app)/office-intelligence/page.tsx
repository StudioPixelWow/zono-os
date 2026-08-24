import Link from "next/link";
import { IconSurface } from "@/components/ui/action-surfaces";
import { getOfficeDashboardAction } from "@/lib/office-intelligence/actions";
import { OfficeIntelligencePage } from "@/components/office-intelligence/OfficeIntelligencePage";
import { IntelligenceErrorBoundary } from "@/components/intelligence/IntelligenceErrorBoundary";

export const dynamic = "force-dynamic";

export default async function OfficeIntelligenceRoute() {
  const res = await getOfficeDashboardAction();
  if (!res.ok) {
    // 9.4 — distinguish a real permission failure from a data/network failure.
    // Only PERMISSION_DENIED gets the "אין הרשאה" framing; everything else is an
    // honest "couldn't load" state (no blanket permission mislabel).
    const isPermission = res.code === "PERMISSION_DENIED";
    return (
      <div role="alert" className="bg-card border-line m-4 flex flex-col items-center gap-3 rounded-[20px] border p-10 text-center">
        <IconSurface name={isPermission ? "Shield" : "AlertTriangle"} tier="m" accent="neutral" />
        <p className="text-ink font-extrabold">{isPermission ? "אין הרשאה" : "מודיעין המשרד אינו זמין כרגע"}</p>
        <p className="text-muted text-sm">{res.error}</p>
        <Link href="/" className="text-brand-strong text-sm font-bold">חזרה לדשבורד</Link>
      </div>
    );
  }
  return <IntelligenceErrorBoundary title="מודיעין המשרד נכשל בטעינה"><OfficeIntelligencePage initial={res.data} /></IntelligenceErrorBoundary>;
}
