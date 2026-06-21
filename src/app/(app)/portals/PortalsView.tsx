"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button, Spinner } from "@/components/ui/Button";
import type { PortalCommandCenter, PortalRow } from "@/lib/client-portals/service";
import {
  approvePortalAction, revokePortalAction, pausePortalAction, extendPortalAction, regeneratePortalAction,
} from "@/lib/client-portals/actions";

const TYPE_LABEL: Record<string, string> = { buyer: "קונה", seller: "מוכר", property: "נכס", lead: "פנייה", deal: "עסקה" };
const STATUS_TONE: Record<string, string> = {
  active: "text-success bg-success-soft", draft: "text-warning bg-warning-soft",
  paused: "text-muted bg-surface", revoked: "text-danger bg-danger-soft", expired: "text-danger bg-danger-soft",
};
const STATUS_LABEL: Record<string, string> = { active: "פעיל", draft: "טיוטה", paused: "מושהה", revoked: "בוטל", expired: "פג" };
const fmt = (n: number) => n.toLocaleString("he-IL");

export function PortalsView({ cc }: { cc: PortalCommandCenter }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = (id: string, fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => {
    setBusyId(id); setNote(null);
    startTransition(async () => {
      const r = await fn();
      setNote(r.error ?? r.message ?? null);
      setBusyId(null);
      router.refresh();
    });
  };

  const copyLink = (p: PortalRow) => {
    if (!p.access_slug) { setNote("אין קישור — צור מחדש את הפורטל"); return; }
    const url = `${window.location.origin}/portal/${p.access_slug}`;
    navigator.clipboard?.writeText(url).then(() => setNote("הקישור הועתק: " + url), () => setNote(url));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Client Portal OS</p>
          <h1 className="text-ink mt-1 text-2xl font-black">פורטלים ללקוחות</h1>
          <p className="text-muted mt-1 text-sm">פורטלים מאובטחים ומאושרים לקונים ומוכרים. צור פורטל מתוך עמוד הקונה/המוכר/הנכס, אשר את הסקשנים, והעתק קישור.</p>
        </div>
      </div>

      {note && <p className="bg-card border-line text-ink rounded-xl border px-3 py-2 text-sm font-semibold break-all">{note}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="סה״כ פורטלים" value={cc.total} tone="text-brand-strong" />
        <Stat label="פעילים" value={cc.active} tone="text-success" />
        <Stat label="קונים" value={cc.buyer} tone="text-brand-strong" />
        <Stat label="מוכרים" value={cc.seller} tone="text-brand-strong" />
        <Stat label="צפיות היום" value={cc.viewsToday} tone="text-success" />
        <Stat label="טרם נצפו" value={cc.notViewed} tone="text-warning" />
      </div>

      <div className="bg-card border-line overflow-hidden rounded-[20px] border">
        <p className="text-ink border-line border-b p-4 text-sm font-extrabold">רשימת פורטלים</p>
        {cc.portals.length === 0 ? (
          <p className="text-muted p-6 text-center text-sm">אין פורטלים עדיין. היכנס לעמוד קונה/מוכר/נכס ולחץ ״צור פורטל לקוח״.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            {cc.portals.map((p) => (
              <div key={p.id} className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-t p-3.5">
                <div className="min-w-[140px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">{TYPE_LABEL[p.portal_type] ?? p.portal_type}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_TONE[p.status] ?? "bg-surface text-muted")}>{STATUS_LABEL[p.status] ?? p.status}</span>
                  </div>
                  <p className="text-ink mt-1 text-sm font-bold">{p.client_name ?? p.title_hebrew ?? "פורטל"}</p>
                  <p className="text-muted text-[11px]">{p.view_count} צפיות{p.last_viewed_at ? ` · נצפה לאחרונה ${new Date(p.last_viewed_at).toLocaleDateString("he-IL")}` : " · טרם נצפה"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {pending && busyId === p.id && <Spinner size={14} />}
                  {p.status === "draft" && <Button size="sm" onClick={() => act(p.id, () => approvePortalAction(p.id))} disabled={pending}>אשר והפעל</Button>}
                  <Button size="sm" variant="secondary" onClick={() => copyLink(p)} disabled={pending}>העתק קישור</Button>
                  <Button size="sm" variant="secondary" onClick={() => act(p.id, () => regeneratePortalAction(p.id))} disabled={pending}>רענן תוכן</Button>
                  {p.status === "active" && <Button size="sm" variant="secondary" onClick={() => act(p.id, () => pausePortalAction(p.id))} disabled={pending}>השהה</Button>}
                  <Button size="sm" variant="secondary" onClick={() => act(p.id, () => extendPortalAction(p.id))} disabled={pending}>הארך</Button>
                  {p.status !== "revoked" && <Button size="sm" variant="danger" onClick={() => act(p.id, () => revokePortalAction(p.id))} disabled={pending}>בטל</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line rounded-[16px] border p-2.5 text-center">
      <p className={cn("text-lg font-black", tone)}>{fmt(value)}</p>
      <p className="text-muted text-[10px] font-bold">{label}</p>
    </div>
  );
}
