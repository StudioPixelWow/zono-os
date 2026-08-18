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
import type { PropertyMarketingCoverage, CoverageStatus } from "@/lib/distribution/property-coverage";
import type { ExtensionReadinessView } from "@/lib/distribution/extension-readiness";
import { toTodayStatus, type TodayStatus } from "@/lib/distribution/today-status";
import { PublishNowButton } from "./PublishNowButton";

const TONE: Record<TodayStatus["tone"], string> = {
  muted: "bg-surface text-muted", brand: "bg-brand-soft text-brand", warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger",
};
const timeHe = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—");
const isToday = (iso: string | null) => { if (!iso) return false; const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
const CAMP_STATUS_HE: Record<string, string> = { active: "פעיל", running: "פעיל", scheduled: "מתוזמן", draft: "טיוטה", paused: "מושהה", completed: "הושלם", ended: "הסתיים" };
const dateHe = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) : "");
const COV_LABEL: Record<CoverageStatus, string> = { marketing_now: "משווק כעת", scheduled: "מתוזמן", no_future: "אין פרסום נוסף", attention: "דורש טיפול", never_published: "לא פורסם עדיין" };
const COV_TONE: Record<CoverageStatus, string> = { marketing_now: "bg-success-soft text-success", scheduled: "bg-brand-soft text-brand", no_future: "bg-warning-soft text-warning", attention: "bg-danger-soft text-danger", never_published: "bg-surface text-muted" };
function covCta(status: CoverageStatus): { label: string; href: string } {
  if (status === "attention") return { label: "טיפול בפרסום", href: "/distribution/daily" };
  if (status === "never_published" || status === "no_future") return { label: "יצירת קמפיין", href: "/distribution/campaign-wizard" };
  return { label: "צפייה בקמפיין", href: "/distribution" };
}

interface Row { post: ControlPost; st: TodayStatus }

export function DistributionHome({ today, center, coverage, readiness }: { today: PublishingControlData; center: DistributionCenterData; coverage: PropertyMarketingCoverage; readiness?: ExtensionReadinessView }) {
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

  const nextFuture = today.queued
    .filter((p) => p.scheduledAt && new Date(p.scheduledAt).getTime() > now)
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))[0] ?? null;

  const activeCampaigns = center.campaigns.filter((c) => ["active", "running", "scheduled"].includes((c.status ?? "").toLowerCase()));
  const cov = coverage.summary;

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

      {/* Extension status — independent of the schedule (Phase 22) */}
      {readiness && (
        <div className="inline-flex items-center gap-1.5 text-[12px]">
          <span className={cn("inline-block h-2 w-2 rounded-full", readiness.isPublishable ? "bg-success" : readiness.state === "error" || readiness.state === "not_installed" ? "bg-danger" : "bg-warning")} />
          <span className="text-muted">תוסף ZONO</span>
          <span className={cn("font-bold", readiness.isPublishable ? "text-success" : "text-warning")}>{readiness.label}</span>
        </div>
      )}

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
        ) : nextFuture ? (
          <div className="bg-brand-soft mt-3 rounded-2xl p-4">
            <p className="text-success text-[12px] font-bold">אין פרסומים להיום ✓</p>
            <p className="text-brand mt-2 text-xs font-bold">הפרסום הבא</p>
            <div className="text-ink text-lg font-black">{dateHe(nextFuture.scheduledAt)} · {timeHe(nextFuture.scheduledAt)}</div>
            <div className="text-muted text-[12px]">{[nextFuture.groupName, nextFuture.campaignName].filter(Boolean).join(" · ") || "קמפיין פייסבוק"}</div>
            <Link href="/distribution/daily" className="text-brand mt-2 inline-block text-[12px] font-bold">צפייה בקמפיין ←</Link>
          </div>
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

      {/* Property marketing coverage — "האם פרסמתי את כל הנכסים שלי?" */}
      <section className="bg-card border-line rounded-[22px] border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-ink flex items-center gap-2 text-sm font-black"><Icon name="Home" size={16} /> נכסים בפרסום</h2>
          {cov.marketable > 0 && <span className="text-muted text-[12px]">כיסוי שיווקי: <b className="text-ink">{cov.covered}</b> מתוך {cov.marketable}</span>}
        </div>
        {cov.marketable === 0 ? (
          <p className="text-muted mt-2 text-[13px]">אין נכסים פעילים לשיווק כרגע.</p>
        ) : (
          <>
            <p className="text-muted mt-1 text-[13px]">{cov.marketable} נכסים · {cov.covered} מכוסים · {cov.neverPublished} לא פורסמו{cov.attention > 0 ? ` · ${cov.attention} דורשים טיפול` : ""}</p>
            <div className="mt-3 flex flex-col gap-2">
              {coverage.properties.slice(0, 10).map((pr) => {
                const cta = covCta(pr.status);
                return (
                  <div key={pr.propertyId} className="border-line flex items-center gap-3 rounded-xl border p-3">
                    <div className="bg-surface h-14 w-14 shrink-0 rounded-lg bg-cover bg-center" style={pr.thumbnailUrl ? { backgroundImage: `url(${pr.thumbnailUrl})` } : undefined}>{!pr.thumbnailUrl && <div className="grid h-full place-items-center text-lg">🏠</div>}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-ink truncate text-[13px] font-bold">{pr.title}</div>
                        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold", COV_TONE[pr.status])}>{COV_LABEL[pr.status]}</span>
                      </div>
                      <div className="text-muted mt-0.5 text-[11px]">
                        {pr.lastPublishedAt ? `פורסם לאחרונה: ${dateHe(pr.lastPublishedAt)} · ${timeHe(pr.lastPublishedAt)}` : "טרם פורסם"}
                        {pr.nextScheduledAt ? (pr.nextOverdue ? ` · ממתין לפרסום מאז ${timeHe(pr.nextScheduledAt)}` : ` · הפרסום הבא: ${dateHe(pr.nextScheduledAt)} · ${timeHe(pr.nextScheduledAt)}`) : (pr.lastPublishedAt ? " · אין פרסום נוסף מתוזמן" : "")}
                        {pr.nextGroupName ? ` · ${pr.nextGroupName}` : ""}
                      </div>
                      <div className="mt-1 flex items-center gap-3">
                        <Link href={cta.href} className="text-brand text-[12px] font-bold">{cta.label} ←</Link>
                        {pr.lastPublishedUrl && <a href={pr.lastPublishedUrl} target="_blank" rel="noopener noreferrer" className="text-muted text-[11px] font-bold">צפייה בפוסט ↗</a>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {coverage.properties.length > 10 && <p className="text-muted mt-2 text-[12px]">מוצגים 10 מתוך {coverage.properties.length} נכסים</p>}
          </>
        )}
      </section>

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
