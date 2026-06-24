"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { generateGraphAction } from "@/lib/graph/actions";
import type { GraphBoard } from "@/lib/graph/service";

const SIGNAL_LABEL: Record<string, string> = {
  hidden_buyer_cluster: "אשכול קונים נסתר", hidden_seller_cluster: "אשכול מוכרים", broker_dominance: "שליטת מתווך",
  agent_specialization: "התמחות סוכן", locality_opportunity: "הזדמנות אזורית", deal_acceleration: "האצת עסקה",
  referral_opportunity: "הזדמנות הפניה", cross_sell_opportunity: "מכירה צולבת",
};
const SIGNAL_ICON: Record<string, string> = { hidden_buyer_cluster: "Users", hidden_seller_cluster: "UserCheck", broker_dominance: "Shield", agent_specialization: "Sparkles", locality_opportunity: "MapPin", deal_acceleration: "TrendingUp" };

export function GraphView({ board }: { board: GraphBoard }) {
  const router = useRouter();
  const { cc, signals, localityDna } = board;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const gen = () => { setError(null); setMsg(null); start(async () => { const r = await generateGraphAction(); if (r.error) setError(r.error); else { setMsg(r.message ?? "נבנה"); router.refresh(); } }); };

  const group = (t: string) => signals.filter((s) => s.signal_type === t);

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO · קשרים עסקיים</p>
          <h1 className="text-ink mt-1 text-2xl font-black">קשרי לקוחות ונכסים</h1>
          <p className="text-muted mt-1 text-sm">כל הקשרים בין קונים, מוכרים, נכסים, סוכנים, מתווכים ואזורים — והזדמנויות נסתרות שנובעות מהם.</p>
        </div>
        <Button onClick={gen} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מחשב…" : "חשב קשרים"}</Button>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      {/* Command center */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="ישויות" value={cc.nodes} icon="Building2" />
        <Stat label="קשרים" value={cc.edges} icon="Route" tone="text-brand-strong" />
        <Stat label="סיגנלים" value={cc.signals} icon="Sparkles" tone="text-success" />
        <Stat label="אשכולות קונים" value={cc.buyerClusters} icon="Users" />
        <Stat label="אשכולות מוכרים" value={cc.sellerClusters} icon="UserCheck" />
        <Stat label="אזורים" value={cc.localities} icon="MapPin" />
      </div>

      {cc.nodes > 0 && (
        <p className="text-muted text-[11px]">תצוגת גרף ויזואלית (צמתים וקשרים) תתווסף בהמשך — כרגע מוצגות תובנות הקשרים בפורמט נתונים.</p>
      )}

      {cc.nodes === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Route" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">הקשרים עדיין לא חושבו</p>
          <p className="text-muted max-w-sm text-sm">לחץ ״חשב קשרים״ כדי לחבר את כל הישויות ולגלות הזדמנויות נסתרות.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Hidden opportunities (all signals) */}
          <div className="bg-card border-line rounded-[20px] border p-4 lg:col-span-2">
            <p className="text-ink mb-2 text-sm font-extrabold">הזדמנויות נסתרות</p>
            {signals.length === 0 ? <p className="text-muted text-sm">אין סיגנלים — בנה את הגרף</p> : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {signals.slice(0, 16).map((s) => (
                  <li key={s.id} className="border-line flex items-start gap-2 rounded-xl border p-2.5">
                    <span className="bg-brand-soft text-brand grid h-7 w-7 shrink-0 place-items-center rounded-lg"><Icon name={SIGNAL_ICON[s.signal_type] ?? "Sparkles"} size={14} /></span>
                    <div className="min-w-0">
                      <p className="text-ink text-sm font-bold">{s.title}</p>
                      <p className="text-muted text-[11px]">{SIGNAL_LABEL[s.signal_type] ?? s.signal_type} · {s.description}</p>
                    </div>
                    <span className="text-success shrink-0 text-xs font-black">{s.impact_score}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Buyer / Seller clusters */}
          <SignalPanel title="אשכולות קונים" items={group("hidden_buyer_cluster")} />
          <SignalPanel title="אשכולות מוכרים" items={group("hidden_seller_cluster")} />
          {/* Broker influence / Agent specialization */}
          <SignalPanel title="רשתות השפעת מתווכים" items={group("broker_dominance")} />
          <SignalPanel title="התמחות סוכנים" items={group("agent_specialization")} />

          {/* Locality DNA */}
          <div className="bg-card border-line rounded-[20px] border p-4 lg:col-span-2">
            <p className="text-ink mb-2 text-sm font-extrabold">DNA אזורי</p>
            {localityDna.length === 0 ? <p className="text-muted text-sm">אין נתונים</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-start text-sm">
                  <thead className="text-muted border-line border-b text-xs"><tr>{["אזור", "נכסים", "מתווך מוביל"].map((h) => <th key={h} className="px-3 py-2 text-start font-bold">{h}</th>)}</tr></thead>
                  <tbody>{localityDna.map((l) => (
                    <tr key={l.locality} className="border-line border-b last:border-0"><td className="text-ink px-3 py-2 font-semibold">{l.locality}</td><td className="text-muted px-3 py-2">{l.properties}</td><td className="text-muted px-3 py-2">{l.topBroker ?? "—"}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SignalPanel({ title, items }: { title: string; items: GraphBoard["signals"] }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <p className="text-ink mb-2 text-sm font-extrabold">{title}</p>
      {items.length === 0 ? <p className="text-muted text-sm">—</p> : (
        <ul className="flex flex-col gap-1.5">{items.slice(0, 8).map((s) => <li key={s.id} className="text-sm"><span className="text-ink font-semibold">{s.title}</span> <span className="text-muted text-[11px]">· {s.description}</span></li>)}</ul>
      )}
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: number; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-2xl font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
