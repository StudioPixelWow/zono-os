"use client";
// ============================================================================
// ZONO — WhatsApp Intelligence panel (self-contained). Conversation→business
// intelligence: analyze all · missed-response alerts · sync to CRM · personal
// portal generation. Operates over real ingested conversations only.
// ============================================================================
import { useEffect, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { useActionRunner } from "@/components/ui/useActionRunner";
import {
  analyzeAllConversationsAction, getMissedResponseAlertsAction, getIntelligenceOverviewAction,
  syncConversationToCrmAction, generateConversationPortalAction,
} from "@/lib/whatsapp/intelligence-actions";
import type { MissedAlert, IntelligenceOverview } from "@/lib/whatsapp/intelligence";

const ROLE_HE: Record<string, string> = { buyer: "קונה", seller: "מוכר", investor: "משקיע", unknown: "כללי" };

export function WhatsappIntelligencePanel() {
  const r = useActionRunner();
  const [ov, setOv] = useState<IntelligenceOverview | null>(null);
  const [alerts, setAlerts] = useState<MissedAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([getIntelligenceOverviewAction(), getMissedResponseAlertsAction()]).then(([o, a]) => {
      if (o.ok) setOv(o.data);
      if (a.ok) setAlerts(a.data);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const analyzeAll = () => r.run(async () => {
    const res = await analyzeAllConversationsAction();
    if (res.ok) load();
    return { ok: res.ok, message: res.ok ? `נותחו ${res.data.analyzed} שיחות` : res.error };
  }, { id: "analyze", pendingMessage: "מנתח שיחות…", success: (x) => x.message });

  const sync = (a: MissedAlert) => r.run(async () => {
    const res = await syncConversationToCrmAction(a.id);
    return { ok: res.ok, message: res.ok ? `נוצר/קושר כרטיס ${res.data.entityType === "seller" ? "מוכר" : "קונה"}` : res.error };
  }, { id: `sync-${a.id}`, pendingMessage: "מסנכרן ל-CRM…", success: (x) => x.message });

  const portal = (a: MissedAlert) => r.run(async () => {
    const res = await generateConversationPortalAction(a.id);
    if (res.ok && typeof window !== "undefined") window.open(`/portal/${res.data.token}`, "_blank");
    return { ok: res.ok, message: res.ok ? "פורטל אישי נוצר ונפתח" : res.error };
  }, { id: `portal-${a.id}`, pendingMessage: "יוצר פורטל…", success: (x) => x.message });

  if (loading) return <div className="border-line bg-card h-28 animate-pulse rounded-card border" />;
  if (!ov) return null;

  return (
    <section className="border-brand-light/40 from-brand-soft/50 to-card rounded-card border bg-gradient-to-bl p-5 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink flex items-center gap-2 text-lg font-black"><Icon name="Sparkles" size={18} className="text-brand" /> מודיעין שיחות WhatsApp</h2>
        <button onClick={analyzeAll} disabled={r.busyId === "analyze"} className="btn-zono-primary zono-focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-bold disabled:opacity-60">
          <Icon name="RefreshCw" size={14} className={r.busyId === "analyze" ? "animate-spin" : ""} /> נתח שיחות
        </button>
      </div>

      {(r.note || r.error) && (
        <div className={cn("mb-3 rounded-xl border px-3 py-1.5 text-sm font-semibold", r.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>{r.error ?? r.note}</div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[["שיחות", ov.total], ["נותחו", ov.analyzed], ["ממתינות לתשובה", ov.needsResponse], ["קונים", ov.buyers], ["מוכרים", ov.sellers], ["סונכרנו ל-CRM", ov.synced]].map(([l, v]) => (
          <div key={l as string} className="bg-card/70 rounded-xl border border-line/60 p-2 text-center">
            <p className="text-ink text-lg font-black">{v as number}</p><p className="text-muted text-[11px] font-bold">{l as string}</p>
          </div>
        ))}
      </div>

      <p className="text-ink mb-2 flex items-center gap-1.5 text-sm font-black"><Icon name="Bell" size={14} className="text-amber-500" /> התראות תגובה חסרה</p>
      {alerts.length === 0 ? (
        <p className="text-muted text-sm">אין שיחות שממתינות לתשובה. לחץ ״נתח שיחות״ כדי לעדכן.</p>
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, 8).map((a) => (
            <div key={a.id} className="border-line bg-card rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-bold">{a.contactName || "ליד"} · <span className="text-brand-strong">{ROLE_HE[a.detectedRole ?? "unknown"]}</span></p>
                  <p className="text-muted truncate text-xs">{a.summary || a.nextBestAction || "—"}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", a.hoursWaiting >= 4 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600")}>{a.hoursWaiting}ש׳ ממתין</span>
              </div>
              {a.nextBestAction && <p className="text-muted mt-1 text-[11px]"><Icon name="Target" size={11} className="text-brand" /> {a.nextBestAction}</p>}
              <div className="mt-2 flex gap-2">
                <button onClick={() => sync(a)} disabled={r.busyId === `sync-${a.id}`} className="border-line bg-card text-ink inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-bold hover:shadow disabled:opacity-50"><Icon name="UserPlus" size={13} /> ל-CRM</button>
                <button onClick={() => portal(a)} disabled={r.busyId === `portal-${a.id}`} className="border-line bg-card text-ink inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-bold hover:shadow disabled:opacity-50"><Icon name="ExternalLink" size={13} /> פורטל אישי</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-muted mt-3 text-[11px]">פועל על שיחות שנקלטו דרך WhatsApp Cloud API הרשמי בלבד. אין הודעות מזויפות ואין ספקים לא-רשמיים.</p>
    </section>
  );
}
