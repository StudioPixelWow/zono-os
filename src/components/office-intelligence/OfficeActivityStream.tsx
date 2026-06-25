"use client";
import { Activity } from "lucide-react";
import type { ActivityItem } from "@/lib/office-intelligence/types";

function fmt(at: string): string {
  const d = new Date(at);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function OfficeActivityStream({ activity }: { activity: ActivityItem[] }) {
  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink"><Activity size={16} /> זרם פעילות</h2>
      {activity.length === 0 ? (
        <p className="rounded-xl bg-black/5 px-3 py-5 text-center text-sm font-medium text-ink/50">אין פעילות אחרונה.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {activity.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-black/[0.03]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-strong" />
              <span className="font-semibold text-ink">{a.title}</span>
              {a.actor && <span className="text-ink/45">· {a.actor}</span>}
              {a.channel && <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-bold text-ink/50">{a.channel}</span>}
              <span className="ms-auto shrink-0 text-[10px] font-medium text-ink/35">{fmt(a.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
