// ZONO — Platform · Support inbox (P5.7). Cross-org support center: open/urgent/
// unassigned/waiting/resolved counts + filterable ticket table. Read-only view
// (mutations happen in ticket detail). No N+1 (server batches names). No
// impersonation. Cap: platform.support.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getSupportInbox } from "@/lib/platform-admin/server/support";
import type { InboxFilters } from "@/lib/platform-admin/server/support";
import type { TicketStatus, TicketPriority } from "@/lib/platform-admin/support/model";
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/platform-admin/support/model";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard } from "@/components/platform-admin/ui";
import { TicketTable, SupportEmpty, SupportUnavailable } from "@/components/platform-admin/support-ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_TABS: (TicketStatus | "all" | "unassigned")[] = ["all", "open", "in_progress", "waiting_customer", "resolved", "closed", "unassigned"];
const PRIO_TABS: (TicketPriority | "all")[] = ["all", "urgent", "high", "normal", "low"];

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; priority?: string }> }) {
  const operator = await authorizePlatform("platform.support.read");
  if (!operator) return <PlatformDenied />;
  const sp = await searchParams;

  const filters: InboxFilters = {
    status: (sp.status && sp.status !== "all" && sp.status !== "unassigned") ? (sp.status as TicketStatus) : null,
    priority: (sp.priority && sp.priority !== "all") ? (sp.priority as TicketPriority) : null,
    unassigned: sp.status === "unassigned",
  };
  const inbox = await getSupportInbox(filters);

  const qs = (patch: Record<string, string>) => {
    const merged: Record<string, string> = { status: sp.status ?? "all", priority: sp.priority ?? "all", ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all") p.set(k, v);
    const s = p.toString(); return s ? `?${s}` : "";
  };
  const c = inbox.counts;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="תמיכה" title="מרכז תמיכה" description="פניות תמיכה חוצות-ארגונים. ניהול סטטוס, עדיפות, שיוך והערות פנימיות מתוך כרטיס הפנייה." icon="Handshake" />

      {!inbox.available && <SupportUnavailable />}

      {c && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "פתוחות", n: c.open, href: qs({ status: "open" }) },
            { label: "דחופות", n: c.urgent, href: qs({ priority: "urgent" }) },
            { label: "לא משויכות", n: c.unassigned, href: qs({ status: "unassigned" }) },
            { label: "ממתין ללקוח", n: c.waitingCustomer, href: qs({ status: "waiting_customer" }) },
            { label: "נפתרו", n: c.resolvedRecently, href: qs({ status: "resolved" }) },
          ].map((s) => (
            <Link key={s.label} href={s.href} className="border-line bg-card rounded-2xl border p-4 hover:border-brand/40">
              <div className="text-ink text-3xl font-black tabular-nums">{s.n}</div>
              <div className="text-muted mt-1 text-[12px] font-semibold">{s.label}</div>
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => {
            const active = (sp.status ?? "all") === t;
            const label = t === "all" ? "הכל" : t === "unassigned" ? "לא משויכות" : STATUS_LABEL[t as TicketStatus];
            return <Link key={t} href={qs({ status: t })} className={"rounded-lg px-3 py-1.5 text-[12px] font-bold " + (active ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink")}>{label}</Link>;
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRIO_TABS.map((t) => {
            const active = (sp.priority ?? "all") === t;
            return <Link key={t} href={qs({ priority: t })} className={"rounded-lg px-3 py-1 text-[11px] font-semibold " + (active ? "bg-brand-soft text-brand" : "bg-surface text-muted hover:text-ink")}>{t === "all" ? "כל העדיפויות" : PRIORITY_LABEL[t as TicketPriority]}</Link>;
          })}
        </div>
      </div>

      <PanelCard title={`פניות (${inbox.tickets.length})`} icon="Handshake">
        {inbox.tickets.length === 0
          ? <SupportEmpty note={inbox.available ? "אין פניות התואמות לסינון" : "לא ניתן לטעון פניות"} />
          : <TicketTable tickets={inbox.tickets} />}
      </PanelCard>
    </div>
  );
}
