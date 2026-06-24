"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { recomputeRevenueAction, setRevenueTargetAction } from "@/lib/revenue/actions";
import type { RevenueBoard } from "@/lib/revenue/service";

const GAP_LABEL: Record<string, { t: string; c: string }> = {
  on_track: { t: "במסלול", c: "bg-success-soft text-success" },
  watch: { t: "במעקב", c: "bg-brand-soft text-brand-strong" },
  risk: { t: "בסיכון", c: "bg-warning-soft text-warning" },
  critical: { t: "קריטי", c: "bg-danger-soft text-danger" },
};
const PERIOD_LABEL: Record<string, string> = { monthly: "חודשי", quarterly: "רבעוני", yearly: "שנתי" };
const SOURCE_LABEL: Record<string, string> = {
  uncontacted_lead: "ליד ללא קשר", stalled_match: "התאמה תקועה", inactive_property: "נכס לא פעיל",
  inactive_seller: "מוכר לא פעיל", broken_commitment: "התחייבות שנשברה", at_risk_deal: "עסקה בסיכון",
};

export function RevenueView({ board }: { board: RevenueBoard }) {
  const router = useRouter();
  const { profile, targets, leakage, opportunities, agents, localities, propertyTypes, growth } = board;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => { setError(null); setMsg(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } }); };
  const saveTarget = () => { const n = Number(targetInput.replace(/[^\d]/g, "")); if (!n) { setError("הזן סכום יעד"); return; } run(() => setRevenueTargetAction(period, n)); setTargetInput(""); };

  const gl = GAP_LABEL[profile?.gap_level ?? "on_track"] ?? GAP_LABEL.on_track;
  const empty = !profile;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Revenue Intelligence OS</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מודיעין הכנסות</h1>
          <p className="text-muted mt-1 text-sm">כמה הכנסה צפויה, כמה בסיכון, כמה חסר ליעד, ואיזו פעולה תגדיל הכנסה מהר ביותר.</p>
        </div>
        <Button onClick={() => run(recomputeRevenueAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מחשב…" : "חשב הכנסות"}</Button>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      {/* Honest realized-revenue gate: no canonical closed deals → no real money to show. */}
      {!board.hasClosedDeals && (
        <p className="border-line bg-surface text-muted rounded-xl border px-4 py-3 text-sm font-semibold">
          אין עדיין עסקאות סגורות להצגת הכנסות בפועל. תחזית הצנרת מבוססת על נתוני pipeline אמיתיים; הכנסות בפועל יוצגו לאחר סגירת עסקה ראשונה.
        </p>
      )}

      {/* Command center */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="הכנסות החודש" value={profile && board.hasClosedDeals ? formatShekels(profile.current_month_revenue) : "—"} icon="BarChart3" tone="text-success" />
        <Stat label="צנרת 30 יום" value={profile ? formatShekels(profile.forecast_revenue_30) : "—"} icon="Clock" tone="text-brand-strong" />
        <Stat label="צנרת 90 יום" value={profile ? formatShekels(profile.forecast_revenue_90) : "—"} icon="TrendingUp" tone="text-success" />
        <Stat label="הכנסה בסיכון" value={profile ? formatShekels(profile.revenue_at_risk) : "—"} icon="AlertTriangle" tone="text-danger" />
        <Stat label="פער ליעד" value={profile ? formatShekels(profile.revenue_gap) : "—"} icon="Flame" tone="text-warning" />
        <div className="bg-card border-line rounded-2xl border p-3">
          <span className="text-brand-strong mb-1 inline-flex"><Icon name="Shield" size={16} /></span>
          <p className="text-ink text-lg font-black">{profile ? `${profile.revenue_gap_score}` : "—"}</p>
          <p className="text-muted text-[11px] font-bold">ציון יעד · <span className={cn("rounded px-1 py-0.5 text-[10px] font-bold", gl.c)}>{gl.t}</span></p>
        </div>
      </div>

      {/* Targets */}
      <div className="bg-card border-line rounded-[20px] border p-4">
        <p className="text-ink mb-2 text-sm font-extrabold">יעדי הכנסה</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className="bg-surface border-line text-ink h-9 rounded-xl border px-3 text-sm outline-none" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="monthly">חודשי</option><option value="quarterly">רבעוני</option><option value="yearly">שנתי</option>
          </select>
          <input className="bg-surface border-line text-ink focus:border-brand-light h-9 w-40 rounded-xl border px-3 text-sm outline-none" placeholder="סכום יעד ₪" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} />
          <Button size="sm" variant="secondary" onClick={saveTarget} disabled={pending || !targetInput.trim()}>שמור יעד</Button>
        </div>
        {targets.length === 0 ? <p className="text-muted text-sm">לא הוגדרו יעדים. הגדר יעד חודשי כדי למדוד פער.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-start text-sm">
              <thead className="text-muted border-line border-b text-xs"><tr>{["תחום", "תקופה", "יעד", "בפועל", "תחזית", "השגה"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-bold">{h}</th>)}</tr></thead>
              <tbody>{targets.map((t) => {
                const ach = t.target_amount > 0 ? Math.round(((t.actual_amount + t.forecast_amount) / t.target_amount) * 100) : 0;
                return (
                  <tr key={t.id} className="border-line border-b last:border-0">
                    <td className="text-ink px-2 py-1.5 font-semibold">{t.scope_label ?? "כל המשרד"}</td>
                    <td className="text-muted px-2 py-1.5">{PERIOD_LABEL[t.period_type] ?? t.period_type}</td>
                    <td className="text-ink px-2 py-1.5 font-bold">{formatShekels(t.target_amount)}</td>
                    <td className="text-success px-2 py-1.5">{formatShekels(t.actual_amount)}</td>
                    <td className="text-brand-strong px-2 py-1.5">{formatShekels(t.forecast_amount)}</td>
                    <td className={cn("px-2 py-1.5 font-black", ach >= 90 ? "text-success" : ach >= 60 ? "text-brand-strong" : "text-warning")}>{ach}%</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>

      {empty ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="BarChart3" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין מודיעין הכנסות</p>
          <p className="text-muted max-w-sm text-sm">לחץ ״חשב הכנסות״ כדי לבנות את פרופיל ההכנסות, פערים, דליפות והזדמנויות.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Top revenue opportunities */}
          <Panel title="הזדמנויות הכנסה מהירות" icon="Flame">
            {opportunities.length === 0 ? <p className="text-muted text-sm">אין הזדמנויות פתוחות</p> : (
              <ul className="flex flex-col gap-1.5">{opportunities.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={o.href} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{o.title}</Link>
                  <span className="text-success shrink-0 text-[11px] font-bold">+{formatShekels(o.revenueImpact)}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Revenue leakage */}
          <Panel title="דליפת הכנסות" icon="AlertTriangle">
            {leakage.length === 0 ? <p className="text-muted text-sm">אין דליפה ✓</p> : (
              <ul className="flex flex-col gap-1.5">{leakage.slice(0, 8).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink min-w-0 flex-1 truncate font-semibold">{l.title} <span className="text-muted text-[10px]">· {SOURCE_LABEL[l.source] ?? l.source}</span></span>
                  <span className="text-danger shrink-0 text-[11px] font-black">{formatShekels(l.lost_revenue)}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Agent revenue */}
          <Panel title="הכנסה לפי סוכן" icon="Users">
            {agents.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-1.5">{agents.slice(0, 8).map((a) => (
                <li key={a.userId} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/team/${a.userId}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{a.name}</Link>
                  <span className="text-muted text-[11px]">צנרת {formatShekels(a.forecast)}</span>
                  {a.atRisk > 0 && <span className="text-danger text-[11px]">בסיכון {formatShekels(a.atRisk)}</span>}
                  <span className="text-success shrink-0 text-[11px] font-bold">{formatShekels(a.revenue)}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Locality revenue */}
          <Panel title="הכנסה לפי אזור" icon="MapPin">
            {localities.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-1.5">{localities.slice(0, 8).map((l) => (
                <li key={l.locality} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink min-w-0 flex-1 truncate font-semibold">{l.locality}</span>
                  <span className="text-muted text-[11px]">{l.deals} עסקאות · צנרת {formatShekels(l.forecast)}</span>
                  <span className="text-success shrink-0 text-[11px] font-bold">{formatShekels(l.revenue)}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Property-type revenue */}
          <Panel title="הכנסה לפי סוג נכס" icon="Building2">
            {propertyTypes.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-1.5">{propertyTypes.slice(0, 8).map((p) => (
                <li key={p.type} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink min-w-0 flex-1 truncate font-semibold">{p.type}</span>
                  <span className="text-muted text-[11px]">{p.deals} עסקאות · המרה {p.conversion}%</span>
                  <span className="text-success shrink-0 text-[11px] font-bold">{formatShekels(p.revenue)}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Office growth simulator */}
          <Panel title="מודל צמיחת משרד (סימולציה)" icon="TrendingUp">
            <ul className="flex flex-col gap-1.5">{growth.map((g) => (
              <li key={g.key} className="border-line rounded-xl border p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink font-bold">{g.label}</span>
                  <span className="text-success text-[11px] font-bold">+{formatShekels(g.addedMonthlyRevenue)}/חודש</span>
                </div>
                <p className="text-muted text-[10px]">{g.assumption} · ~{formatShekels(g.addedAnnualRevenue)}/שנה</p>
              </li>
            ))}</ul>
          </Panel>

          {profile?.ai_revenue_summary && (
            <div className="bg-card border-line rounded-[20px] border p-4 lg:col-span-2">
              <p className="text-ink mb-1 text-sm font-extrabold">סיכום הכנסות (מוכן ל-AI)</p>
              <p className="text-muted text-sm">{profile.ai_revenue_summary}</p>
              <p className="text-muted mt-1 text-[11px]">צמיחה חודש מול חודש: {profile.growth_rate}% · ביטחון תחזית {profile.forecast_confidence}% · הכנסה שאבדה {formatShekels(profile.lost_revenue)} · שוחזרה (30 יום) {formatShekels(profile.recovered_revenue)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="mb-2 flex items-center gap-2">{icon && <span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name={icon} size={14} /></span>}<p className="text-ink text-sm font-extrabold">{title}</p></div>
      {children}
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: string; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
