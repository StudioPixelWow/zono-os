"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { markAllReadAction, setNotificationStateAction } from "@/lib/notifications/actions";
import type { NotificationFeed, NotifCategory } from "@/lib/notifications/service";

const CAT_LABEL: Record<NotifCategory, string> = { opportunity: "הזדמנות", warning: "אזהרה", task: "משימה", approval: "אישור", review: "סקירה", system: "מערכת" };
const CAT_TONE: Record<NotifCategory, string> = { opportunity: "bg-success-soft text-success", warning: "bg-danger-soft text-danger", task: "bg-brand-soft text-brand-strong", approval: "bg-warning-soft text-warning", review: "bg-warning-soft text-warning", system: "bg-surface text-muted" };
const CHIPS: { key: string; label: string }[] = [
  { key: "", label: "הכל" }, { key: "opportunity", label: "הזדמנויות" }, { key: "warning", label: "אזהרות" },
  { key: "task", label: "משימות" }, { key: "approval", label: "אישורים" }, { key: "review", label: "סקירות" }, { key: "system", label: "מערכת" },
];
const ago = (s: string) => { const d = (Date.now() - new Date(s).getTime()) / 86_400_000; return d < 1 ? "היום" : d < 2 ? "אתמול" : `לפני ${Math.floor(d)} ימים`; };

export function NotificationsView({ feed, active }: { feed: NotificationFeed; active: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  const allKeys = feed.items.filter((i) => !i.read).map((i) => i.key);

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Notification Center</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מרכז התראות {feed.unread > 0 && <span className="bg-danger ms-1 rounded-full px-2 py-0.5 align-middle text-xs font-black text-white">{feed.unread}</span>}</h1>
          <p className="text-muted mt-1 text-sm">כל הסיגנלים מכל המנועים במקום אחד — הזדמנויות, אזהרות, משימות, אישורים וסקירות.</p>
        </div>
        <div className="flex items-center gap-2">
          {allKeys.length > 0 && <Button size="sm" variant="secondary" onClick={() => run(() => markAllReadAction(allKeys))} disabled={pending} leadingIcon={<Icon name="UserCheck" size={14} />}>סמן הכל כנקרא</Button>}
          <Link href="/" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />דשבורד</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <Link key={c.key} href={c.key ? `/notifications?category=${c.key}` : "/notifications"}
            className={cn("rounded-full border px-3 py-1 text-[12px] font-bold", active === c.key ? "bg-brand text-white border-brand" : "bg-card text-muted border-line")}>
            {c.label}{feed.counts[c.key] ? ` · ${feed.counts[c.key]}` : ""}
          </Link>
        ))}
      </div>

      {feed.items.length === 0 ? (
        <div className="bg-card border-line rounded-[20px] border p-12 text-center">
          <span className="bg-success-soft text-success mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl"><Icon name="UserCheck" size={24} /></span>
          <p className="text-ink font-extrabold">אין התראות פעילות</p>
          <p className="text-muted text-sm">כל הסיגנלים טופלו או שאין כאלה כרגע.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {feed.items.map((i) => (
            <div key={i.key} className={cn("bg-card border-line flex items-start gap-3 rounded-[16px] border p-3", !i.read && "border-brand/30", i.pinned && "ring-brand/30 ring-1")}>
              <span className={cn("mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black", CAT_TONE[i.category])}>{CAT_LABEL[i.category]}</span>
              <Link href={i.href} className="min-w-0 flex-1">
                <p className={cn("text-ink truncate text-sm", i.read ? "font-semibold" : "font-extrabold")}>{i.title}</p>
                {i.subtitle && <p className="text-muted truncate text-[12px]">{i.subtitle}</p>}
                <p className="text-muted text-[10px]">{i.source} · {ago(i.createdAt)}</p>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <button title="נעץ" disabled={pending} onClick={() => run(() => setNotificationStateAction(i.key, i.pinned ? "clear" : "pinned"))} className={cn("text-[11px] font-bold disabled:opacity-50", i.pinned ? "text-brand-strong" : "text-muted")}>נעץ</button>
                {!i.read && <button title="נקרא" disabled={pending} onClick={() => run(() => setNotificationStateAction(i.key, "read"))} className="text-success text-[11px] font-bold disabled:opacity-50">נקרא</button>}
                <button title="ארכוב" disabled={pending} onClick={() => run(() => setNotificationStateAction(i.key, "archived"))} className="text-muted text-[11px] font-bold disabled:opacity-50">ארכב</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
