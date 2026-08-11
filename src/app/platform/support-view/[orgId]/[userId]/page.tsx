// ZONO — Platform · Support View (P5.8, Path A). A secure, PLATFORM-SIDE,
// READ-ONLY reconstruction of a customer's account. Stays under /platform —
// never redirects into the customer app, never creates a customer session,
// never mints a JWT, never flips customer reads to service-role. Every data
// read is explicitly org+user-scoped via the Support View DAL. No customer
// mutations exist on this surface. Cap: platform.support.impersonate.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import {
  getActiveSupportSession, getSupportViewTarget,
  svProperties, svLeads, svBuyers, svTasks, svJourneys,
} from "@/lib/platform-admin/server/support-view";
import { getOrgIntegrationsForPlatform, getOrgDistributionForPlatform, getOrgActivityForPlatform, getOrgOverviewForPlatform } from "@/lib/platform-admin/server/dal";
import { SUPPORT_VIEW_SECTIONS, SUPPORT_VIEW_UNAVAILABLE, isValidSection, type SupportViewSection } from "@/lib/platform-admin/impersonation/model";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PanelCard, formatPlatformDate } from "@/components/platform-admin/ui";
import { StartSupportViewGate, ExitSupportViewButton } from "@/components/platform-admin/SupportViewControls";
import { SupportViewCountdown } from "@/components/platform-admin/SupportViewCountdown";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ orgId: string; userId: string }>; searchParams: Promise<{ section?: string; ticket?: string }> }) {
  const operator = await authorizePlatform("platform.support.impersonate");
  if (!operator) return <PlatformDenied />;
  const { orgId, userId } = await params;
  const sp = await searchParams;
  const ticketId = sp.ticket || null;

  const target = await getSupportViewTarget(orgId, userId);
  if (!target.valid) return <PlatformDenied />; // tenancy: user not in this org

  const session = await getActiveSupportSession(orgId, userId);

  // No active session → the entry gate (mandatory reason before entering).
  if (!session) {
    return (
      <div className="py-8">
        <StartSupportViewGate orgId={orgId} userId={userId} orgName={target.orgName ?? orgId.slice(0, 8)} userName={target.userName ?? userId.slice(0, 8)} ticketId={ticketId} />
      </div>
    );
  }

  const section: SupportViewSection = (sp.section && isValidSection(sp.section)) ? sp.section : "overview";
  const qs = (s: string) => `?section=${s}${ticketId ? `&ticket=${ticketId}` : ""}`;

  return (
    <div className="space-y-4">
      {/* Unmistakable support-mode banner (persistent within Support View) */}
      <div className="bg-brand sticky top-0 z-40 rounded-2xl px-5 py-3 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="ShieldCheck" size={18} />
            <span className="text-[14px] font-black">מצב תמיכה — צפייה כ־{target.userName ?? "משתמש"} בארגון {target.orgName ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3 text-[12px]">
            <span className="opacity-90">מפעיל: {operator.role}</span>
            <span className="opacity-90">סיבה: {session.reason}</span>
            {ticketId && <Link href={`/platform/support/${ticketId}`} className="underline opacity-90">פנייה</Link>}
            <span className="rounded bg-white/20 px-2 py-0.5 font-bold">נותרו <SupportViewCountdown expiresAtMs={session.expiresAtMs} /></span>
            <ExitSupportViewButton orgId={orgId} userId={userId} ticketId={ticketId} />
          </div>
        </div>
        <p className="mt-1 text-[11px] opacity-80">תצוגה לקריאה בלבד בתוך גבולות הפלטפורמה — אין פעולות עריכה, שליחה או שינוי על חשבון הלקוח.</p>
      </div>

      {/* Section tabs (navigation only — read-only) */}
      <div className="flex flex-wrap gap-1.5">
        {SUPPORT_VIEW_SECTIONS.map((d) => {
          const active = section === d.key;
          return <Link key={d.key} href={qs(d.key)} className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold " + (active ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink")}><Icon name={d.icon} size={13} />{d.label}</Link>;
        })}
      </div>

      <SectionContent orgId={orgId} userId={userId} section={section} />
    </div>
  );
}

function SVEmpty({ note }: { note: string }) {
  return <p className="text-muted px-1 py-6 text-center text-[13px]">{note}</p>;
}
function SVList({ available, rows, line }: { available: boolean; rows: { id: string }[]; line: (x: { id: string }) => string }) {
  if (!available) return <SVEmpty note={SUPPORT_VIEW_UNAVAILABLE} />;
  if (rows.length === 0) return <SVEmpty note="אין רשומות" />;
  return <ul className="divide-line divide-y">{rows.map((x) => <li key={x.id} className="text-ink px-1 py-2 text-[13px]">{line(x)}</li>)}</ul>;
}

async function SectionContent({ orgId, userId, section }: { orgId: string; userId: string; section: SupportViewSection }) {
  if (section === "overview") {
    const o = await getOrgOverviewForPlatform(orgId);
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "משתמשים", v: o.usersActive?.value ?? o.usersTotal?.value },
          { label: "נכסים", v: o.properties?.value },
          { label: "לידים", v: o.leads?.value },
          { label: "קמפיינים", v: o.campaigns?.value },
        ].map((c) => (
          <div key={c.label} className="border-line bg-card rounded-2xl border p-4">
            <div className="text-ink text-2xl font-black tabular-nums">{c.v ?? "—"}</div>
            <div className="text-muted mt-1 text-[12px] font-semibold">{c.label}</div>
          </div>
        ))}
      </div>
    );
  }
  if (section === "properties") {
    const r = await svProperties(orgId, userId);
    return <PanelCard title={`נכסים (${r.rows.length})`} icon="Building2"><SVList available={r.available} rows={r.rows} line={(x) => { const p = x as unknown as { title: string | null; status: string | null }; return `${p.title ?? "נכס"}${p.status ? ` · ${p.status}` : ""}`; }} /></PanelCard>;
  }
  if (section === "leads") {
    const r = await svLeads(orgId, userId);
    return <PanelCard title={`לידים (${r.rows.length})`} icon="Users"><SVList available={r.available} rows={r.rows} line={(x) => `ליד ${x.id.slice(0, 8)}`} /></PanelCard>;
  }
  if (section === "buyers") {
    const r = await svBuyers(orgId, userId);
    return <PanelCard title={`קונים (${r.rows.length})`} icon="Users"><SVList available={r.available} rows={r.rows} line={(x) => `קונה ${x.id.slice(0, 8)}`} /></PanelCard>;
  }
  if (section === "tasks") {
    const r = await svTasks(orgId, userId);
    return <PanelCard title={`משימות (${r.rows.length})`} icon="ListChecks"><SVList available={r.available} rows={r.rows} line={(x) => { const t = x as unknown as { title: string | null; status: string | null }; return `${t.title ?? "משימה"}${t.status ? ` · ${t.status}` : ""}`; }} /></PanelCard>;
  }
  if (section === "journeys") {
    const r = await svJourneys(orgId);
    return <PanelCard title={`מסעות לקוח (${r.rows.length})`} icon="Route"><SVList available={r.available} rows={r.rows} line={(x) => { const j = x as unknown as { status: string | null }; return `מסע · ${j.status ?? "—"}`; }} /></PanelCard>;
  }
  if (section === "integrations") {
    const items = await getOrgIntegrationsForPlatform(orgId);
    return <PanelCard title="אינטגרציות" icon="Globe"><ul className="divide-line divide-y">{items.map((i) => <li key={i.key} className="flex items-center justify-between px-1 py-2 text-[13px]"><span className="text-ink font-semibold">{i.label}</span><span className="text-muted">{i.state}</span></li>)}</ul></PanelCard>;
  }
  if (section === "distribution") {
    const d = await getOrgDistributionForPlatform(orgId);
    return <PanelCard title="שיווק והפצה" icon="Megaphone"><pre className="text-muted overflow-x-auto px-1 py-2 text-[12px]" dir="ltr">{JSON.stringify(d, null, 2).slice(0, 800)}</pre></PanelCard>;
  }
  if (section === "activity") {
    const items = await getOrgActivityForPlatform(orgId, 25);
    return <PanelCard title="פעילות" icon="ScrollText">{items.length === 0 ? <SVEmpty note="אין פעילות" /> : <ul className="divide-line divide-y">{items.map((a) => <li key={a.id} className="px-1 py-2 text-[13px]"><span className="text-ink font-semibold">{a.summary ?? a.action}</span><span className="text-muted ms-2 text-[11px]">{formatPlatformDate(a.createdAt)}</span></li>)}</ul>}</PanelCard>;
  }
  // account
  const target = await getSupportViewTarget(orgId, userId);
  return (
    <PanelCard title="חשבון והרשאות" icon="ShieldCheck">
      <dl className="px-1 text-[13px]">
        <div className="flex justify-between py-1.5"><dt className="text-muted">שם</dt><dd className="text-ink font-bold">{target.userName ?? "—"}</dd></div>
        <div className="flex justify-between py-1.5"><dt className="text-muted">סטטוס חשבון</dt><dd className="text-ink font-bold">{target.userStatus ?? "פעיל"}</dd></div>
        <div className="flex justify-between py-1.5"><dt className="text-muted">ארגון</dt><dd className="text-ink font-bold">{target.orgName ?? "—"}</dd></div>
      </dl>
      <p className="text-muted mt-2 px-1 text-[11px]">פרטי הרשאה מלאים זמינים בכרטיס הלקוח → משתמשים.</p>
    </PanelCard>
  );
}
