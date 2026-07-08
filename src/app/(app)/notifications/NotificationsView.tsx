"use client";
// ============================================================================
// 🔔 ZONO — Attention Center (RTL). SCREEN 18. Unifies every engine signal into
// one "what needs my attention now" surface: urgency grouping, a WHY on every
// item, approval + missed-conversation shortcuts to real surfaces, and a
// handled-recently list. Read-only over the notification feed + lightweight
// read/pin/archive state. Nothing auto-executes.
// ============================================================================
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { markAllReadAction, setNotificationStateAction } from "@/lib/notifications/actions";
import type { NotificationFeed, NotifItem, NotifCategory } from "@/lib/notifications/service";

const CAT_LABEL: Record<NotifCategory, string> = { opportunity: "הזדמנות", warning: "אזהרה", task: "משימה", approval: "אישור", review: "סקירה", system: "מערכת" };
const CAT_TONE: Record<NotifCategory, string> = { opportunity: "bg-success-soft text-success", warning: "bg-danger-soft text-danger", task: "bg-brand-soft text-brand-strong", approval: "bg-warning-soft text-warning", review: "bg-warning-soft text-warning", system: "bg-surface text-muted" };
// A why for every item — the real subtitle, or an honest, category-derived reason.
const WHY: Record<NotifCategory, string> = {
  opportunity: "הזדמנות שזוהתה — כדאי לבדוק ולפעול", warning: "דורש תשומת לב — ייתכן סיכון או פספוס",
  task: "משימה שממתינה לך", approval: "ממתין לאישורך לפני ביצוע", review: "ממתין לסקירה שלך", system: "עדכון מערכת",
};
const ago = (s: string) => { const d = (Date.now() - new Date(s).getTime()) / 86_400_000; return d < 1 ? "היום" : d < 2 ? "אתמול" : `לפני ${Math.floor(d)} ימים`; };

export function NotificationsView({ feed }: { feed: NotificationFeed; active?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });

  const unread = feed.items.filter((i) => !i.read);
  const read = feed.items.filter((i) => i.read);
  const urgent = unread.filter((i) => i.score >= 70);
  const canWait = unread.filter((i) => i.score >= 40 && i.score < 70);
  const later = unread.filter((i) => i.score < 40);
  const allUnreadKeys = unread.map((i) => i.key);
  const clear = feed.items.length === 0;

  const card = (i: NotifItem) => (
    <div key={i.key} className={cn("bg-card border-line flex items-start gap-3 rounded-[16px] border p-3.5", !i.read && "border-brand/25", i.pinned && "ring-brand/30 ring-1")}>
      <span className={cn("mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black", CAT_TONE[i.category])}>{CAT_LABEL[i.category]}</span>
      <Link href={i.href} className="min-w-0 flex-1">
        <p className={cn("text-ink text-sm leading-snug", i.read ? "font-semibold" : "font-extrabold")}>{i.title}</p>
        <p className="text-muted mt-0.5 text-[12px] leading-relaxed">{i.subtitle ?? WHY[i.category]}</p>
        <p className="text-muted mt-0.5 text-[10px]">{i.source} · {ago(i.createdAt)}{i.score >= 70 ? " · דחוף" : ""}</p>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <button title="נעץ" disabled={pending} onClick={() => run(() => setNotificationStateAction(i.key, i.pinned ? "clear" : "pinned"))} className={cn("text-[11px] font-bold disabled:opacity-50", i.pinned ? "text-brand-strong" : "text-muted")}>{i.pinned ? "נעוץ" : "נעץ"}</button>
        {!i.read && <button title="נקרא" disabled={pending} onClick={() => run(() => setNotificationStateAction(i.key, "read"))} className="text-success text-[11px] font-bold disabled:opacity-50">סמן טופל</button>}
        <button title="ארכוב" disabled={pending} onClick={() => run(() => setNotificationStateAction(i.key, "archived"))} className="text-muted text-[11px] font-bold disabled:opacity-50">ארכב</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ── Attention hero ──────────────────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]">
        <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-brand text-xs font-bold">ZONO Attention Center</p>
            <h1 className="text-ink mt-0.5 text-2xl font-black sm:text-3xl">מה דורש את תשומת ליבך</h1>
            <p className="text-muted mt-1 max-w-xl text-sm">
              {clear ? "הכל טופל — אין התראות פעילות כרגע." : urgent.length > 0 ? `${urgent.length} פריטים דחופים דורשים טיפול עכשיו, ועוד ${unread.length - urgent.length} שיכולים להמתין.` : `${unread.length} עדכונים ממתינים — כולם יכולים להמתין מעט.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="bg-card grid h-20 w-20 place-items-center rounded-full text-center shadow-[var(--shadow-soft)]"><div><div className={cn("text-3xl font-black leading-none", urgent.length ? "text-danger" : "text-success")}>{feed.unread}</div><div className="text-muted mt-0.5 text-[10px] font-bold">לא נקראו</div></div></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4">
          {allUnreadKeys.length > 0 && <Button size="sm" variant="secondary" onClick={() => run(() => markAllReadAction(allUnreadKeys))} disabled={pending} leadingIcon={<Icon name="UserCheck" size={14} />}>סמן הכל כטופל</Button>}
          <Link href="/action-center"><Button size="sm" variant="ghost" leadingIcon={<Icon name="ListChecks" size={14} />}>מרכז פעולות</Button></Link>
          <Link href="/automation"><Button size="sm" variant="ghost" leadingIcon={<Icon name="Zap" size={14} />}>ממתין לאישור</Button></Link>
        </div>
      </div>

      {clear ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-success-soft text-success grid h-16 w-16 place-items-center rounded-3xl"><Icon name="UserCheck" size={28} /></span>
          <p className="text-ink text-lg font-extrabold">אין מה שדורש את תשומת ליבך</p>
          <p className="text-muted max-w-sm text-sm">כל הסיגנלים מכל המנועים טופלו. כשמשהו חדש יזדקק לתשומת לב — הוא יופיע כאן עם הסבר למה זה חשוב.</p>
          <Link href="/today"><Button variant="secondary" size="sm" className="mt-1">מה עושים היום ←</Button></Link>
        </div>
      ) : (
        <>
          {/* Approval + missed conversations — real surfaces, not duplicated here */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link href="/automation" className="bg-card border-line hover:border-brand/40 flex items-center gap-3 rounded-2xl border p-4 transition">
              <span className="bg-warning-soft text-warning grid h-11 w-11 shrink-0 place-items-center rounded-xl"><Icon name="Zap" size={20} /></span>
              <div className="min-w-0 flex-1"><p className="text-ink text-sm font-black">ממתין לאישורך</p><p className="text-muted text-[12px]">ריצות אוטומציה מוכנות — כלום לא יבוצע ללא אישור.</p></div>
              <Icon name="ChevronLeft" size={16} className="text-muted" />
            </Link>
            <Link href="/whatsapp" className="bg-card border-line hover:border-brand/40 flex items-center gap-3 rounded-2xl border p-4 transition">
              <span className="bg-success-soft text-success grid h-11 w-11 shrink-0 place-items-center rounded-xl"><Icon name="MessageCircle" size={20} /></span>
              <div className="min-w-0 flex-1"><p className="text-ink text-sm font-black">שיחות שממתינות</p><p className="text-muted text-[12px]">תיבת WhatsApp — הודעות ושיחות שדורשות מענה.</p></div>
              <Icon name="ChevronLeft" size={16} className="text-muted" />
            </Link>
          </div>

          {urgent.length > 0 && (
            <Group title="דחוף — לטפל עכשיו" icon="AlertTriangle" count={urgent.length} tone="danger">
              <div className="flex flex-col gap-2">{urgent.map(card)}</div>
            </Group>
          )}
          {canWait.length > 0 && (
            <Group title="יכול להמתין" icon="Clock" count={canWait.length} tone="warning">
              <div className="flex flex-col gap-2">{canWait.map(card)}</div>
            </Group>
          )}
          {later.length > 0 && (
            <Group title="למעקב מאוחר יותר" icon="Clock" count={later.length} tone="muted">
              <div className="flex flex-col gap-2">{later.map(card)}</div>
            </Group>
          )}
          {read.length > 0 && (
            <Group title="טופלו לאחרונה" icon="UserCheck" count={read.length} tone="muted">
              <div className="flex flex-col gap-2 opacity-80">{read.slice(0, 12).map(card)}</div>
            </Group>
          )}
        </>
      )}
    </div>
  );
}

function Group({ title, icon, count, tone, children }: { title: string; icon: string; count: number; tone: "danger" | "warning" | "muted"; children: React.ReactNode }) {
  const iconCls = tone === "danger" ? "bg-danger-soft text-danger" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-surface text-muted";
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-ink flex items-center gap-2 text-[15px] font-black"><span className={cn("grid h-8 w-8 place-items-center rounded-xl", iconCls)}><Icon name={icon} size={15} /></span>{title} <span className="text-muted font-bold">({count})</span></h2>
      {children}
    </section>
  );
}
