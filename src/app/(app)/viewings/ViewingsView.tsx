"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { IconSurface } from "@/components/ui/action-surfaces";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { completeMeetingAction, cancelMeetingAction, markNoShowAction } from "@/lib/calendar-os/meeting-lifecycle-actions";
import type { ViewingsBoard, ViewingItem } from "@/lib/viewings/service";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "מתוזמנת", confirmed: "מאושרת", completed: "הושלמה", cancelled: "בוטלה", no_show: "לא הגיע", rescheduled: "נדחתה",
};
type Tab = "today" | "upcoming" | "awaitingConfirmation" | "completed" | "cancelled";
const TABS: [Tab, string][] = [
  ["today", "היום"], ["upcoming", "קרובות"], ["awaitingConfirmation", "ממתינות לאישור"], ["completed", "הושלמו"], ["cancelled", "בוטלו / לא הגיע"],
];

export function ViewingsView({ board }: { board: ViewingsBoard }) {
  const [tab, setTab] = useState<Tab>("today");
  const list = board[tab];

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconSurface name="Calendar" tier="s" accent="brand" />
          <div>
            <h1 className="text-ink text-2xl font-black">צפיות</h1>
            <p className="text-muted text-sm">כל הצפיות והבתים הפתוחים לפי סטטוס — אישור, השלמה עם משוב, ביטול ואי-הגעה.</p>
          </div>
        </div>
        <Link href="/calendar" className="text-brand-strong text-[12px] font-bold">תיאום חדש ↗</Link>
      </header>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-3 py-2 text-[12px] font-bold ${tab === id ? "bg-brand text-white" : "bg-surface text-muted"}`}>
            {label} <span className="opacity-70">{board[id].length}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין צפיות בקטגוריה זו</div>
      ) : (
        <div className="flex flex-col gap-2">{list.map((v) => <ViewingCard key={v.id} v={v} />)}</div>
      )}
    </main>
  );
}

function ViewingCard({ v }: { v: ViewingItem }) {
  const r = useActionRunner();
  const router = useRouter();
  const [outcome, setOutcome] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (!res.ok && res.error) throw new Error(res.error); router.refresh(); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? "עודכן" });
  const active = v.status !== "completed" && v.status !== "cancelled" && v.status !== "no_show";

  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-ink font-black">{v.title}</p>
            <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{STATUS_LABEL[v.status] ?? v.status}</span>
            {v.type === "open_house" && <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">בית פתוח</span>}
          </div>
          <p className="text-muted mt-0.5 text-[12px]">
            {new Date(v.start_at).toLocaleString("he-IL")}
            {v.propertyTitle ? ` · ${v.propertyTitle}` : ""}{v.buyerName ? ` · ${v.buyerName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {v.property_id && <Link href={`/properties/${v.property_id}`} className="text-brand-strong text-[11px] font-bold">נכס ↗</Link>}
        </div>
      </div>

      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowComplete((s) => !s)}><Icon name="Check" size={14} />השלם + משוב</Button>
          <Button size="sm" variant="ghost" loading={r.busyId === `ns-${v.id}`} onClick={() => wrap(() => markNoShowAction(v.id), `ns-${v.id}`)}>לא הגיע</Button>
          <Button size="sm" variant="ghost" loading={r.busyId === `cx-${v.id}`} onClick={() => wrap(() => cancelMeetingAction(v.id), `cx-${v.id}`)}>בטל</Button>
        </div>
      )}
      {showComplete && (
        <div className="mt-2 flex items-center gap-2">
          <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="משוב / תוצאת הצפייה" className="bg-surface border-line text-ink h-9 flex-1 rounded-xl border px-3 text-sm outline-none" />
          <Button size="sm" loading={r.busyId === `cmp-${v.id}`} onClick={() => wrap(() => completeMeetingAction(v.id, { outcome: outcome || null }), `cmp-${v.id}`, "מסמן הושלמה...")}>שמור</Button>
        </div>
      )}
    </div>
  );
}
