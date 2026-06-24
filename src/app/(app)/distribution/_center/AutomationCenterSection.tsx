"use client";

import { useState } from "react";
import type { CenterAutomation } from "@/lib/distribution/center-data";
import { createAutomationAction, toggleAutomationAction } from "@/lib/distribution/center-actions";
import { Glass, SectionHeading, Toggle, EmptyState, Icon } from "./shared";
import type { RunAction } from "./DistributionCenterView";

const TYPE_META: Record<string, { label: string; icon: string }> = {
  repost: { label: "פרסום חוזר", icon: "Repeat" },
  comment_reply: { label: "מענה לתגובות", icon: "MessageSquare" },
  whatsapp: { label: "וואטסאפ", icon: "MessageCircle" },
  lead_routing: { label: "ניתוב לידים", icon: "Route" },
  scheduling: { label: "תזמון פרסום", icon: "CalendarClock" },
};
const TYPE_OPTIONS = Object.entries(TYPE_META).map(([key, m]) => ({ key, label: m.label }));

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "פעיל", cls: "bg-success-soft text-success" },
  paused: { label: "מושהה", cls: "bg-warning-soft text-warning" },
  draft: { label: "טיוטה", cls: "bg-line/70 text-muted" },
  disabled: { label: "כבוי", cls: "bg-line/70 text-muted" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

export function AutomationCenterSection({
  automations,
  runAction,
  pending,
}: {
  automations: CenterAutomation[];
  runAction: RunAction;
  pending: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(TYPE_OPTIONS[0].key);

  const field = "bg-card/70 border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition w-full";

  function submit() {
    if (!name.trim()) return;
    runAction(() => createAutomationAction({ name, automationType: type }), "האוטומציה נוצרה");
    setName(""); setShowForm(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="מרכז אוטומציה" subtitle="הזרמים האוטומטיים של ההפצה — תחת בקרה אנושית" icon="Workflow"
        action={
          <button type="button" onClick={() => setShowForm((s) => !s)} className="btn-zono-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold text-white">
            <Icon name="Plus" size={16} /> אוטומציה חדשה
          </button>
        } />

      <Glass className="zono-glass-dark flex items-start gap-2.5 rounded-2xl p-4">
        <Icon name="ShieldCheck" size={18} className="text-brand-strong mt-0.5 shrink-0" />
        <p className="text-ink text-[13px] font-semibold leading-relaxed">
          ZONO פועל במודל מסייע: כל פרסום עובר אישור שלך לפני שהוא יוצא. האוטומציות מכינות, מתזמנות וממליצות — אתה תמיד הגורם המאשר.
        </p>
      </Glass>

      {showForm && (
        <Glass className="flex flex-col gap-3 p-5">
          <p className="text-ink text-sm font-extrabold">יצירת אוטומציה</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם האוטומציה *" className={field} />
            <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
              {TYPE_OPTIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={pending || !name.trim()} onClick={submit} className="btn-zono-primary rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50">שמור אוטומציה</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted rounded-xl px-4 py-2 text-sm font-bold">ביטול</button>
          </div>
        </Glass>
      )}

      {automations.length === 0 ? (
        <EmptyState icon="Workflow" title="אין עדיין אוטומציות" body="צור אוטומציה ראשונה — פרסום חוזר, מענה לתגובות, ניתוב לידים ועוד — ZONO יריץ אותן עבורך תחת בקרתך."
          action={<button type="button" onClick={() => setShowForm(true)} className="btn-zono-primary mt-1 rounded-xl px-4 py-2 text-sm font-bold text-white">צור אוטומציה ראשונה</button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {automations.map((a) => {
            const tm = TYPE_META[a.automationType] ?? { label: a.automationType, icon: "Workflow" };
            const sm = STATUS_META[a.status] ?? { label: a.status, cls: "bg-line/70 text-muted" };
            return (
              <Glass key={a.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="zono-ai-gradient grid h-10 w-10 place-items-center rounded-xl text-white"><Icon name={tm.icon} size={18} /></span>
                    <div>
                      <p className="text-ink text-sm font-extrabold">{a.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="bg-brand-soft text-brand-strong inline-block rounded-full px-2 py-0.5 text-[10px] font-bold">{tm.label}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${sm.cls}`}>{sm.label}</span>
                      </div>
                    </div>
                  </div>
                  <Toggle on={a.isEnabled} disabled={pending}
                    onChange={() => runAction(() => toggleAutomationAction({ id: a.id, enabled: !a.isEnabled }), a.isEnabled ? "האוטומציה הושבתה" : "האוטומציה הופעלה")} />
                </div>
                <div className="border-line text-muted flex items-center gap-4 border-t pt-2.5 text-[11px] font-semibold">
                  <span className="inline-flex items-center gap-1"><Icon name="History" size={12} /> ריצה אחרונה: {fmtDate(a.lastRunAt)}</span>
                  <span className="inline-flex items-center gap-1"><Icon name="Clock" size={12} /> הבאה: {fmtDate(a.nextRunAt)}</span>
                </div>
              </Glass>
            );
          })}
        </div>
      )}
    </div>
  );
}
