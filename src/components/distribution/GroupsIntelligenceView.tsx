// ============================================================================
// 📊 ZONO — Facebook Groups Intelligence Center (server component). 33.4.
// Renders the intelligence over the existing group registry: summary, folder
// intelligence, top + weak groups with insights + recommendations. Read-only;
// each group routes to the EXISTING campaign wizard / distribution flow.
// ============================================================================
import Link from "next/link";
import { getGroupsIntelligence, type GroupIntel, type FolderIntel, type InsightTag } from "@/lib/facebook-groups-intelligence";

const TAG_HE: Record<InsightTag, string> = {
  strong: "חזקה", high_engagement: "מעורבות גבוהה", weak: "חלשה", no_leads: "ללא לידים", inactive: "לא פעילה",
  overused: "פרסום-יתר", spam_risk: "סיכון ספאם", luxury: "יוקרה", investment: "השקעות", rental: "השכרות", neighborhood_specialist: "מומחית אזור",
};
const TAG_CLS: Partial<Record<InsightTag, string>> = { strong: "bg-success-soft text-success", high_engagement: "bg-success-soft text-success", weak: "bg-danger-soft text-danger", no_leads: "bg-warning-soft text-warning", inactive: "bg-warning-soft text-warning", overused: "bg-warning-soft text-warning", spam_risk: "bg-danger-soft text-danger" };
const RECO_HE: Record<string, string> = { publish_more: "פרסמו יותר", publish_less: "פרסמו פחות", pause: "השהו", reengage: "חדשו פעילות", maintain: "המשיכו לעקוב", high_priority: "עדיפות גבוהה", low_priority: "עדיפות נמוכה" };
const HEALTH_CLS: Record<string, string> = { "מצוין": "text-success", "יציב": "text-brand", "חלש": "text-warning", "לא פעיל": "text-muted" };

function GroupCard({ g }: { g: GroupIntel }) {
  return (
    <div className="bg-surface rounded-2xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-ink line-clamp-1 text-[14px] font-bold">{g.name}</div>
          <div className="text-muted text-[11px]">{[g.folder, g.city].filter(Boolean).join(" · ")}</div>
        </div>
        <span className="text-brand text-lg font-black">{g.aiScore}</span>
      </div>
      <div className="text-muted mt-1 flex flex-wrap gap-2 text-[11px]"><span>ביצועים {g.performance}</span><span>{g.totalPosts} פוסטים</span><span>{g.totalLeads} לידים</span></div>
      {g.insights.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{g.insights.slice(0, 4).map((i, k) => <span key={k} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TAG_CLS[i.tag] ?? "bg-brand-soft text-brand"}`} title={i.why}>{TAG_HE[i.tag]}</span>)}</div>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-muted text-[11px]">המלצה: <b className="text-ink">{RECO_HE[g.recommendation.action] ?? g.recommendation.action}</b> · {g.recommendation.reason}</span>
        <Link href="/distribution/campaign-wizard" className="bg-brand shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white">קמפיין</Link>
      </div>
    </div>
  );
}

function FolderCard({ f }: { f: FolderIntel }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-ink text-[15px] font-black">📁 {f.folder}</h3>
        <span className={`text-[13px] font-black ${HEALTH_CLS[f.health]}`}>{f.folderScore} · {f.health}</span>
      </div>
      <div className="text-muted mt-1 flex flex-wrap gap-2 text-[11px]"><span>{f.totalGroups} קבוצות</span><span>{f.activeGroups} פעילות</span><span>{f.totalLeads} לידים</span><span>{f.cities.length} ערים</span></div>
      {f.topGroups.length > 0 && <div className="mt-2 text-[11px]"><span className="text-muted">מובילות: </span><span className="text-ink font-semibold">{f.topGroups.map((t) => t.name).join(", ")}</span></div>}
      {f.weakGroups.length > 0 && <div className="mt-0.5 text-[11px]"><span className="text-muted">חלשות: </span><span className="text-warning font-semibold">{f.weakGroups.map((t) => t.name).join(", ")}</span></div>}
      {f.note && <p className="text-muted mt-1 text-[11px]">{f.note}</p>}
    </div>
  );
}

export async function GroupsIntelligenceView() {
  const intel = await getGroupsIntelligence().catch(() => null);
  if (!intel) return null;
  const s = intel.summary;
  const top = intel.groups.slice(0, 8);
  const weak = intel.groups.filter((g) => g.insights.some((i) => i.tag === "weak" || i.tag === "no_leads" || i.tag === "spam_risk")).slice(0, 8);

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">ZONO Facebook Groups Intelligence</p>
        <h1 className="text-ink mt-1 text-2xl font-black">📊 מרכז מודיעין קבוצות</h1>
        <p className="text-muted mt-1 text-sm">כל קבוצה הופכת לנכס עם ביצועים, איכות ותובנות — מבוסס על הנתונים האמיתיים של הקבוצות.</p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {[["קבוצות", s.totalGroups], ["לידים", s.totalLeads], ["חזקות", s.strong], ["חלשות", s.weak], ["לא פעילות", s.inactive], ["ללא לידים", s.noLeads]].map(([l, v]) => (
          <div key={String(l)} className="bg-card border-line rounded-2xl border px-3 py-3 text-center"><div className="text-brand text-2xl font-black">{v as number}</div><div className="text-muted text-[11px] font-bold">{l as string}</div></div>
        ))}
      </section>

      {intel.groups.length === 0 ? (
        <div className="bg-card border-line rounded-[22px] border p-10 text-center">
          <p className="text-ink text-lg font-black">אין עדיין קבוצות</p>
          <p className="text-muted mt-1 text-sm">הוסיפו קבוצות במסך הקבוצות כדי להתחיל לצבור מודיעין ביצועים.</p>
          <Link href="/distribution/groups" className="bg-brand mt-3 inline-block rounded-xl px-4 py-2 text-sm font-bold text-white">ניהול קבוצות</Link>
        </div>
      ) : (
        <>
          <section><h2 className="text-ink mb-3 text-lg font-black">מודיעין תיקיות</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{intel.folders.map((f) => <FolderCard key={f.folder} f={f} />)}</div></section>

          <section><h2 className="text-ink mb-3 text-lg font-black">קבוצות מובילות</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{top.map((g) => <GroupCard key={g.id} g={g} />)}</div></section>

          {weak.length > 0 && (
            <section><h2 className="text-ink mb-3 text-lg font-black">קבוצות לתשומת לב</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{weak.map((g) => <GroupCard key={g.id} g={g} />)}</div></section>
          )}
        </>
      )}
    </div>
  );
}
