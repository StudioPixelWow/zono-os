// Customer 360 organization header (P5.2). PURE / server-renderable. Safe
// authoritative identity only — no secrets, no unnecessary PII.
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { PlanBadge, MetricValue, formatPlatformDate, formatPlatformDateTime } from "./ui";
import { CopyIdButton } from "./CopyIdButton";
import type { OrgHeader } from "@/lib/platform-admin/server/dal";

export function Customer360Header({ header }: { header: OrgHeader }) {
  return (
    <div className="mb-4">
      <Link href="/platform/customers" className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-[12px] font-bold">
        <Icon name="ArrowLeft" size={14} />ארגונים
      </Link>
      <div className="border-line bg-card rounded-2xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="zono-gradient grid h-12 w-12 place-items-center rounded-2xl text-lg font-black text-white"><Icon name="Building2" size={22} /></span>
            <div>
              <h1 className="text-ink text-xl font-black leading-tight sm:text-2xl">{header.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <PlanBadge plan={header.plan} />
                <span className={"inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold " + (header.onboardingCompleted ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
                  {header.onboardingCompleted ? "אונבורדינג הושלם" : "אונבורדינג בתהליך"}
                </span>
                <CopyIdButton id={header.id} />
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <div>
              <dt className="text-muted text-[11px] font-semibold">משתמשים פעילים</dt>
              <dd className="text-ink text-lg font-black tabular-nums"><MetricValue metric={header.usersActive} /></dd>
            </div>
            <div>
              <dt className="text-muted text-[11px] font-semibold">סה״כ משתמשים</dt>
              <dd className="text-ink text-lg font-black tabular-nums"><MetricValue metric={header.usersTotal} /></dd>
            </div>
            <div>
              <dt className="text-muted text-[11px] font-semibold">נוצר</dt>
              <dd className="text-ink text-[13px] font-bold">{formatPlatformDate(header.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted text-[11px] font-semibold">פעילות אחרונה</dt>
              <dd className="text-ink text-[13px] font-bold">{header.lastActivityAt ? formatPlatformDateTime(header.lastActivityAt) : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
