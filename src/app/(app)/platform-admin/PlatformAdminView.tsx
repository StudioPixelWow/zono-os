"use client";
// ============================================================================
// ZONO — Platform Admin (Enterprise Reliability Platform™). Admin-only tools:
//   • Feature Flags — toggle, gradual rollout %, min-role gate. Every change is
//     written to the central audit log automatically (server side).
//   • Audit Trail — who / what / when / source, most recent first.
// Read + controlled-write only; no business logic touched.
// ============================================================================
import { useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { upsertFeatureFlagAction, listFeatureFlagsAction, listAuditLogAction } from "@/lib/platform/server/actions";
import type { FlagRow, AuditRow } from "@/lib/platform/server/repository";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "כל התפקידים" },
  { value: "agent", label: "סוכן+" },
  { value: "team_leader", label: "ראש צוות+" },
  { value: "manager", label: "מנהל+" },
  { value: "admin", label: "מנהל מערכת+" },
  { value: "owner", label: "בעלים בלבד" },
];

export function PlatformAdminView({ flags: initialFlags, evaluated: initialEval, audit: initialAudit }: {
  flags: FlagRow[]; evaluated: Record<string, boolean>; audit: AuditRow[];
}) {
  const [tab, setTab] = useState<"flags" | "audit">("flags");
  const [flags, setFlags] = useState(initialFlags);
  const [evaluated, setEvaluated] = useState(initialEval);
  const [audit, setAudit] = useState(initialAudit);
  const [pending, startTransition] = useTransition();
  const [newKey, setNewKey] = useState("");

  function refresh() {
    startTransition(async () => {
      const [f, a] = await Promise.all([listFeatureFlagsAction(), listAuditLogAction({ limit: 100 })]);
      if (f.ok) { setFlags(f.data.flags); setEvaluated(f.data.evaluated); }
      if (a.ok) setAudit(a.data.entries);
    });
  }

  function save(flagKey: string, patch: Partial<Pick<FlagRow, "enabled" | "rollout_pct" | "min_role" | "description">>) {
    const current = flags.find((f) => f.flag_key === flagKey);
    startTransition(async () => {
      const res = await upsertFeatureFlagAction({
        flagKey,
        enabled: patch.enabled ?? current?.enabled ?? false,
        rolloutPct: patch.rollout_pct ?? current?.rollout_pct ?? 0,
        minRole: patch.min_role !== undefined ? patch.min_role : (current?.min_role ?? null),
        description: patch.description !== undefined ? patch.description : (current?.description ?? null),
      });
      if (res.ok) refresh();
    });
  }

  function createFlag() {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key) return;
    setNewKey("");
    save(key, { enabled: false, rollout_pct: 0 });
  }

  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-5">
        <div className="flex items-center gap-3">
          <span className="bg-surface text-brand-strong grid h-11 w-11 place-items-center rounded-2xl"><Icon name="Settings" size={22} /></span>
          <div>
            <h1 className="text-ink text-lg font-black">ניהול פלטפורמה</h1>
            <p className="text-muted text-xs">Enterprise Reliability Platform™ · דגלי תכונה ויומן ביקורת</p>
          </div>
        </div>
        <button onClick={refresh} disabled={pending} className="bg-surface text-ink border-line inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold disabled:opacity-50">
          <Icon name="RefreshCw" size={14} /> {pending ? "מרענן…" : "רענן"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([["flags", "דגלי תכונה", "Flag"], ["audit", "יומן ביקורת", "ScrollText"]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold ${tab === id ? "bg-brand-strong border-brand-strong text-white" : "bg-surface text-ink border-line"}`}>
            <Icon name={icon} size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "flags" && (
        <div className="flex flex-col gap-3">
          {/* New flag */}
          <div className="bg-card border-line flex flex-wrap items-center gap-2 rounded-2xl border p-3">
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} dir="ltr" placeholder="feature_key_new"
              className="bg-surface border-line text-ink min-w-[200px] flex-1 rounded-xl border px-3 py-2 text-sm" />
            <button onClick={createFlag} disabled={pending || !newKey.trim()} className="bg-brand-strong inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
              <Icon name="Plus" size={14} /> דגל חדש
            </button>
          </div>

          {flags.length === 0 && <p className="text-muted bg-card border-line rounded-2xl border p-6 text-center text-sm">אין דגלי תכונה עדיין. צור את הראשון למעלה.</p>}

          {flags.map((f) => (
            <div key={f.id} className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-ink font-mono text-sm font-extrabold" dir="ltr">{f.flag_key}</span>
                  {f.org_id === null && <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">ברירת מחדל גלובלית</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${evaluated[f.flag_key] ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300"}`}>
                    {evaluated[f.flag_key] ? "פעיל עבורך" : "כבוי עבורך"}
                  </span>
                </div>
                <button onClick={() => save(f.flag_key, { enabled: !f.enabled })} disabled={pending}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold disabled:opacity-50 ${f.enabled ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-surface border-line text-muted"}`}>
                  <Icon name="ToggleLeft" size={15} /> {f.enabled ? "מופעל" : "כבוי"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-bold">השקה הדרגתית — {f.rollout_pct}%</span>
                  <input type="range" min={0} max={100} step={5} defaultValue={f.rollout_pct}
                    onMouseUp={(e) => save(f.flag_key, { rollout_pct: Number((e.target as HTMLInputElement).value) })}
                    onTouchEnd={(e) => save(f.flag_key, { rollout_pct: Number((e.target as HTMLInputElement).value) })}
                    className="accent-[var(--brand-strong,#7c3aed)]" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-bold">תפקיד מינימלי</span>
                  <select defaultValue={f.min_role ?? ""} onChange={(e) => save(f.flag_key, { min_role: e.target.value || null })}
                    className="bg-surface border-line text-ink rounded-xl border px-3 py-1.5 text-sm">
                    {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <p className="text-muted text-[11px]">עודכן {new Date(f.updated_at).toLocaleString("he-IL")}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "audit" && (
        <div className="bg-card border-line overflow-hidden rounded-2xl border">
          {audit.length === 0 ? (
            <p className="text-muted p-6 text-center text-sm">אין רשומות ביקורת עדיין.</p>
          ) : (
            <table className="w-full text-right text-sm">
              <thead className="bg-surface text-muted text-xs">
                <tr>
                  <th className="p-3 font-bold">מתי</th>
                  <th className="p-3 font-bold">מי</th>
                  <th className="p-3 font-bold">פעולה</th>
                  <th className="p-3 font-bold">משאב</th>
                  <th className="p-3 font-bold">מקור</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-line border-t">
                    <td className="text-muted p-3 text-xs whitespace-nowrap">{new Date(a.created_at).toLocaleString("he-IL")}</td>
                    <td className="text-ink p-3">{a.actor_label ?? "מערכת"}</td>
                    <td className="p-3 font-mono text-xs" dir="ltr">{a.action}</td>
                    <td className="text-muted p-3 font-mono text-xs" dir="ltr">{a.resource_type}{a.resource_id ? `:${a.resource_id}` : ""}</td>
                    <td className="text-muted p-3 text-xs">{a.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
