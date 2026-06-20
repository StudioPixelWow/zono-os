"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { createCommunityAction } from "@/lib/marketing/actions";
import { generateDailyBatchAction, recomputeDistributionAction, setCommunityApprovalAction } from "@/lib/distribution/actions";
import type { DistributionBoard } from "@/lib/distribution/service";

const field = "bg-surface border-line text-ink focus:border-brand-light h-9 rounded-xl border px-3 text-sm outline-none transition";
const PLATFORM: Record<string, string> = { facebook: "פייסבוק", whatsapp: "וואטסאפ", telegram: "טלגרם", instagram: "אינסטגרם", linkedin: "לינקדאין", manual: "ידני", local: "מקומי" };
const AUDIENCE: Record<string, string> = { buyers: "קונים", sellers: "מוכרים", investors: "משקיעים", families: "משפחות", luxury: "יוקרה", young: "צעירים", young_couples: "זוגות צעירים", first_home: "דירה ראשונה", commercial: "מסחרי", mixed: "מעורב" };
const LEVEL: Record<string, { t: string; c: string }> = { elite: { t: "מצטיינת", c: "bg-success-soft text-success" }, strong: { t: "חזקה", c: "bg-brand-soft text-brand-strong" }, average: { t: "ממוצעת", c: "bg-surface text-ink" }, weak: { t: "חלשה", c: "bg-warning-soft text-warning" }, dead: { t: "לא פעילה", c: "bg-danger-soft text-danger" }, risky: { t: "בסיכון", c: "bg-danger-soft text-danger" }, unknown: { t: "—", c: "bg-surface text-muted" } };
const SIGNAL: Record<string, string> = { high_roi_community: "ROI גבוה", inactive_community: "לא פעילה", risky_community: "בסיכון", missing_community: "קהילה חסרה", property_promotion_opportunity: "קידום נכס", locality_distribution_gap: "פער הפצה", high_demand_community: "ביקוש גבוה", underutilized_community: "ניצול חסר", growing_community: "צומחת" };
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

export function DistributionView({ board }: { board: DistributionBoard }) {
  const router = useRouter();
  const { reviewQueue, approved, opportunities, plans } = board;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ name: "", platform: "facebook", city: "", audienceType: "buyers", membersCount: "" });
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string; message?: string }>) => { setError(null); setMsg(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } }); };
  const add = () => { if (!nf.name.trim()) { setError("נדרש שם קהילה"); return; } run(() => createCommunityAction({ name: nf.name.trim(), platform: nf.platform, city: nf.city || null, audienceType: nf.audienceType, membersCount: Number(nf.membersCount) || 0 })); setNf({ name: "", platform: "facebook", city: "", audienceType: "buyers", membersCount: "" }); };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Social Community Intelligence</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מודיעין קהילות והפצה</h1>
          <p className="text-muted mt-1 text-sm">בשלב זה ZONO מכין את הפרסום. הסוכן מפרסם ידנית ומסמן שהפרסום בוצע. ללא פרסום אוטומטי, ללא סיסמאות.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowNew((v) => !v)} leadingIcon={<Icon name="Plus" size={15} />}>קהילה חדשה</Button>
          <Button size="sm" variant="secondary" onClick={() => run(recomputeDistributionAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={15} />}>חשב מודיעין הפצה</Button>
          <Button size="sm" onClick={() => run(generateDailyBatchAction)} disabled={pending} leadingIcon={<Icon name="Megaphone" size={15} />}>הכן שולחן יומי</Button>
        </div>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      {/* Connection foundation */}
      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-4">
        <div className="flex items-center gap-2">
          <span className="bg-surface text-muted grid h-9 w-9 place-items-center rounded-xl"><Icon name="Shield" size={16} /></span>
          <div>
            <p className="text-ink text-sm font-extrabold">חיבור חשבונות חברתיים</p>
            <p className="text-muted text-[11px]">מצב ידני בלבד (manual_only). חיבור רשמי ל‑Facebook/WhatsApp/Telegram יתווסף בעתיד — ללא אחסון סיסמאות.</p>
          </div>
        </div>
        <span className="bg-surface text-muted rounded-full px-2.5 py-1 text-[11px] font-bold">manual_only</span>
      </div>

      {showNew && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">הוסף קהילה (ידני)</p>
          <div className="flex flex-wrap gap-2">
            <input className={field} placeholder="שם הקהילה" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
            <select className={field} value={nf.platform} onChange={(e) => setNf({ ...nf, platform: e.target.value })}>{Object.entries(PLATFORM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select className={field} value={nf.audienceType} onChange={(e) => setNf({ ...nf, audienceType: e.target.value })}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input className={field} placeholder="עיר" value={nf.city} onChange={(e) => setNf({ ...nf, city: e.target.value })} />
            <input className={cn(field, "w-28")} placeholder="חברים" value={nf.membersCount} onChange={(e) => setNf({ ...nf, membersCount: e.target.value })} />
            <Button size="sm" disabled={pending || !nf.name.trim()} onClick={add}>הוסף</Button>
          </div>
          <p className="text-muted mt-2 text-[11px]">הקהילה נוספת כ״מוצעת״. אשר אותה לניתוח/הפצה כדי שתיכלל בתוכניות.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Review queue */}
        <Panel title={`תור אישור קהילות (${reviewQueue.length})`} icon="Filter">
          {reviewQueue.length === 0 ? <p className="text-muted text-sm">אין קהילות הממתינות לאישור ✓</p> : (
            <ul className="flex flex-col gap-2">{reviewQueue.map((c) => (
              <li key={c.id} className="border-line flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
                <span className="text-ink min-w-0 flex-1 font-semibold">{c.name} <span className="text-muted text-[10px]">· {PLATFORM[c.platform] ?? c.platform} · {AUDIENCE[c.audience_type] ?? c.audience_type}{c.city ? ` · ${c.city}` : ""}</span></span>
                <button className="text-success text-[11px] font-bold" disabled={pending} onClick={() => run(() => setCommunityApprovalAction(c.id, "approved_for_distribution"))}>אשר להפצה</button>
                <button className="text-brand-strong text-[11px] font-bold" disabled={pending} onClick={() => run(() => setCommunityApprovalAction(c.id, "approved_for_analysis"))}>לניתוח</button>
                <button className="text-danger text-[11px] font-bold" disabled={pending} onClick={() => run(() => setCommunityApprovalAction(c.id, "rejected"))}>דחה</button>
              </li>
            ))}</ul>
          )}
        </Panel>

        {/* Distribution opportunities */}
        <Panel title="הזדמנויות הפצה" icon="Flame">
          {opportunities.length === 0 ? <p className="text-muted text-sm">אין הזדמנויות פתוחות</p> : (
            <ul className="flex flex-col gap-1.5">{opportunities.slice(0, 8).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink min-w-0 flex-1 truncate font-semibold">{o.title} <span className="text-muted text-[10px]">· {SIGNAL[o.signal_type] ?? o.signal_type}</span></span>
                <span className={cn("shrink-0 text-xs font-black", tone(o.impact_score))}>{o.impact_score}</span>
              </li>
            ))}</ul>
          )}
        </Panel>

        {/* Approved communities + intelligence */}
        <Panel title={`קהילות מאושרות (${approved.length})`} icon="Users">
          {approved.length === 0 ? <p className="text-muted text-sm">אין קהילות מאושרות — אשר קהילות מהתור</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-start text-sm">
                <thead className="text-muted border-line border-b text-xs"><tr>{["קהילה", "קהל", "לידים", "ROI", "רמה"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-bold">{h}</th>)}</tr></thead>
                <tbody>{approved.slice(0, 12).map((c) => (
                  <tr key={c.id} className="border-line border-b last:border-0">
                    <td className="text-ink px-2 py-1.5 font-semibold">{c.name}</td>
                    <td className="text-muted px-2 py-1.5">{AUDIENCE[c.audience_type] ?? c.audience_type}</td>
                    <td className="text-muted px-2 py-1.5">{c.intel?.lead_quality_score ?? 0}</td>
                    <td className="text-muted px-2 py-1.5">{c.intel?.roi_score ?? 0}</td>
                    <td className="px-2 py-1.5">{c.intel && <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", (LEVEL[c.intel.intelligence_level] ?? LEVEL.unknown).c)}>{(LEVEL[c.intel.intelligence_level] ?? LEVEL.unknown).t}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Property distribution plans */}
        <Panel title="תוכניות הפצה לנכסים" icon="Megaphone">
          {plans.length === 0 ? <p className="text-muted text-sm">חשב מודיעין הפצה כדי לבנות תוכניות</p> : (
            <ul className="flex flex-col gap-1.5">{plans.slice(0, 8).map((p) => (
              <li key={p.propertyId} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/properties/${p.propertyId}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{p.title}</Link>
                <span className="text-muted text-[11px]">{p.communities} קהילות · {p.leads} לידים</span>
                <span className={cn("shrink-0 text-xs font-black", tone(p.score))}>{p.score}</span>
              </li>
            ))}</ul>
          )}
        </Panel>
      </div>

      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-4">
        <p className="text-ink text-sm font-extrabold">שולחן הפרסום היומי</p>
        <Link href="/distribution/daily"><Button size="sm" leadingIcon={<Icon name="Megaphone" size={15} />}>פתח שולחן פרסום יומי</Button></Link>
      </div>
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
