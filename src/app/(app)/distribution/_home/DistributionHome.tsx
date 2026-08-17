// ============================================================================
// ZONO — /distribution · Facebook Marketing HOME. Deployment+UX fix.
// The canonical Facebook campaign home: Today (next action + progress), active
// campaigns, what needs attention, and a groups summary — one clean surface with
// a single dominant CTA (+ קמפיין חדש). REUSES the existing data + status model
// (getPublishingControlData + today-status + getDistributionCenter); the full
// interactive day lives at /distribution/daily and advanced tooling at
// /publishing-control. No new publishing engine, no Gantt, no admin tables.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import type { PublishingControlData, ControlPost } from "@/lib/distribution/publishing-control-data";
import type { DistributionCenterData } from "@/lib/distribution/center-data";
import { toTodayStatus, type TodayStatus } from "@/lib/distribution/today-status";
import { PublishNowButton } from "./PublishNowButton";

const TONE: Record<TodayStatus["tone"], string> = {
  muted: "bg-surface text-muted", brand: "bg-brand-soft text-brand", warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger",
};
const timeHe = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—");
const isToday = (iso: string | null) => { if (!iso) return false; const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
const CAMP_STATUS_HE: Record<string, string> = { active: "פעיל", running: "פעיל", scheduled: "מתוזמן", draft: "טיוטה", paused: "מושהה", completed: "הושלם", ended: "הסתיים" };

interface Row { post: ControlPost; st: TodayStatus }

export function DistributionHome({ today, center }: { today: PublishingControlData; center: DistributionCenterData }) {
  // Server component (no client render) — reading the clock here is correct.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const all = [...today.inFlight, ...today.reconciliation, ...today.failed, ...today.deadLetter, ...today.paused, ...today.queued];
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const p of all) {
    if (seen.has(p.id)) continue; seen.add(p.id);
    const due = !!p.scheduledAt && new Date(p.scheduledAt).getTime() <= now;
    const st = toTodayStatus(p.state, { dueNow: due });
    if (!isToday(p.scheduledAt) && !(due && st.key !== "published")) continue;
    rows.push({ post: p, st });
  }
  // Published TODAY (already filtered to Israel-today by the canonical selector) is real
  // activity for today's summary — without it a completed publish shows "אין פרסומים".
  for (const p of today.publishedToday) {
    if (seen.has(p.id)) continue; seen.add(p.id);
    rows.push({ post: p, st: toTodayStatus(p.state, { dueNow: false }) });
  }
  rows.sort((a, b) => (a.post.scheduledAt ?? "").localeCompare(b.post.scheduledAt ?? ""));
  const total = rows.length;
  const done = rows.filter((r) => r.st.key === "published").length;
  const attentionRows = rows.filter((r) => r.st.key === "reconcile" || r.st.key === "attention");
  const pending = rows.filter((r) => r.st.key !== "published" && r.st.key !== "cancelled");
  const hero = pending.find((r) => r.st.action) ?? pending[0] ?? null;

  const activeCampaigns = center.campaigns.filter((c) => ["active", "running", "scheduled"].includes((c.status ?? "").toLowerCase()));

  return (
    <div dir="rtl" className="mx-auto flex max-w-3xl flex-col gap-5">
      {/* Header + primary CTA */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-ink flex items-center gap-2 text-2xl font-black"><Icon name="Megaphone" size={24} /> פרסום בקבוצות פייסבוק</h1>
          <p className="text-muted mt-1 text-sm">ניהול הקמפיינים, הפרסומים של היום והקבוצות שלך — במקום אחד.</p>
        </div>
        <Link href="/distribution/campaign-wizard" className="bg-brand inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-black text-white"><Icon name="Plus" size={16} /> קמפיין חדש</Link>
      </header>

      {/* Today */}
      <section className="bg-card border-line rounded-[22px] border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-ink flex items-center gap-2 text-sm font-black"><Icon name="Sun" size={16} /> פרסומים להיום</h2>
          <Link href="/distribution/daily" className="text-brand text-[12px] font-bold">לכל הפרסומים של היום ←</Link>
        </div>
        <p className="text-muted mt-1 text-[13px]">{total === 0 ? "אין פרסומים מתוכננים להיום." : `${total} מתוכננים · ${done} פורסמו · ${attentionRows.length} דורשים טיפול`}</p>

        {hero ? (
          <div className="bg-brand-soft mt-3 rounded-2xl p-4">
            <p className="text-brand text-xs font-bold">הפרסום הבא</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-ink text-lg font-black">{timeHe(hero.post.scheduledAt)} · {hero.post.title ?? hero.post.campaignName ?? "פרסום"}</div>
                <div className="text-muted text-[12px]">{[hero.post.groupName, hero.post.campaignName].filter(Boolean).join(" · ") || "קבוצת פייסבוק"}</div>
              </div>
              <span className={cn("rounded-full px-3 py-1 text-[12px] font-bold", TONE[hero.st.tone])}>{hero.st.label}</span>
            </div>
            <div className="mt-3">
              {hero.st.action === "assist_publish"
                ? <PublishNowButton postId={hero.post.id} />
                : <Link href="/distribution/daily" className="bg-brand inline-block rounded-xl px-5 py-2 text-sm font-black text-white">{hero.st.actionLabel ?? "לטיפול"}</Link>}
            </div>
          </div>
        ) : total > 0 ? (
          <div className="bg-success-soft mt-3 rounded-2xl p-4 text-center"><p className="text-success text-sm font-black">סיימת את הפרסומים להיום ✓ · {done} מתוך {total}</p></div>
        ) : (
          <div className="mt-3"><Link href="/distribution/campaign-wizard" className="text-brand text-[13px] font-bold">אין מה לפרסם היום — צור קמפיין ←</Link></div>
        )}
      </section>

      {/* Attention */}
      {attentionRows.length > 0 && (
        <section className="bg-card border-line rounded-[22px] border p-5">
          <h2 className="text-ink flex items-center gap-2 text-sm font-black"><Icon name="AlertTriangle" size={16} className="text-warning" /> דורש טיפול ({attentionRows.length})</h2>
          <div className="mt-2 flex flex-col gap-2">
            {attentionRows.slice(0, 5).map((r) => (
              <div key={r.post.id} className="border-line flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
                <div className="min-w-0"><div className="text-ink truncate text-[13px] font-bold">{r.post.title ?? r.post.campaignName ?? "פרסום"}</div><div className="text-muted truncate text-[11px]">{r.post.groupName ?? "קבוצת פייסבוק"}</div></div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold", TONE[r.st.tone])}>{r.st.label}</span>
              </div>
            ))}
          </div>
          <Link href="/distribution/daily" className="text-brand mt-2 inline-block text-[12px] font-bold">לטיפול בפרסומים ←</Link>
        </section>
      )}

      {/* Active campaigns */}
      <section className="bg-card border-line rounded-[22px] border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-ink flex items-center gap-2 text-sm font-black"><Icon name="Target" size={16} /> קמפיינים פעילים</h2>
          <Link href="/distribution/campaign-wizard" className="text-brand text-[12px] font-bold">קמפיין חדש ←</Link>
        </div>
        {activeCampaigns.length === 0 ? (
          <p className="text-muted mt-2 text-[13px]">אין קמפיינים פעילים. צור קמפיין כדי להתחיל לשווק נכס בקבוצות.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {activeCampaigns.slice(0, 6).map((c) => (
              <div key={c.id} className="border-line flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
                <div className="min-w-0"><div className="text-ink truncate text-[13px] font-bold">{c.name}</div><div className="text-muted truncate text-[11px]">{[c.targetCity, `${c.totalPosts} פרסומים`].filter(Boolean).join(" · ")}</div></div>
                <span className="bg-success-soft text-success shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold">{CAMP_STATUS_HE[(c.status ?? "").toLowerCase()] ?? c.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Groups summary + advanced */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-muted text-[13px]">
          <Icon name="Users" size={14} className="inline" /> <b className="text-ink">{center.stats.groups}</b> קבוצות נמצאו · <b className="text-ink">{center.stats.activeGroups}</b> פעילות
        </div>
        <div className="flex items-center gap-3">
          <Link href="/distribution/groups" className="text-brand text-[12px] font-bold">ניהול קבוצות ←</Link>
          <Link href="/publishing-control" className="text-muted text-[12px] font-bold">בקרת פרסום — מתקדם</Link>
        </div>
      </section>
    </div>
  );
}
