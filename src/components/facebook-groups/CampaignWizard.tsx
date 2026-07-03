"use client";
/* eslint-disable @next/next/no-img-element -- external CDN property photos; next/image would require remotePatterns config */
// ============================================================================
// 📘 ZONO — Facebook Groups Campaign Wizard. 33.2.
// Guided 7-step flow that STITCHES existing systems: property inventory, the
// distribution group library (folders), the Facebook connection state, post
// content variations, frequency, and a Gantt. It PLANS only — nothing publishes
// or auto-comments; scheduling/publishing hands off to the existing Distribution
// flow, and only after Facebook is connected + the plan is approved.
// Imports ONLY the pure planner/content submodules (never the server barrel).
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { buildPlan, FREQUENCY_HE, SLOT_STATUS_HE, type Frequency, type WizardGroup, type GroupFolder } from "@/lib/facebook-groups/planner";
import { generatePostVariations, autoReplyTemplates, type PropertyFacts } from "@/lib/facebook-groups/content";

interface WProperty extends PropertyFacts { id: string; image: string | null }
interface Connection { label: string; status: string; connected: boolean; message: string }
interface Props { properties: WProperty[]; folders: GroupFolder[]; connection: Connection; notes: string[] }

const STEPS = ["נכס", "תוכן פוסט", "חיבור פייסבוק", "קבוצות", "תדירות", "גאנט ואישור", "תגובות"];
const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const FREQS: Frequency[] = ["one_time", "three_weekly", "daily", "full_month"];

export function CampaignWizard({ properties, folders, connection, notes }: Props) {
  const [step, setStep] = useState(0);
  const [propId, setPropId] = useState<string | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [frequency, setFrequency] = useState<Frequency>("three_weekly");
  const [startDate] = useState(() => new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10));

  const property = properties.find((p) => p.id === propId) ?? null;
  const allGroups = useMemo(() => folders.flatMap((f) => f.groups), [folders]);
  const chosen: WizardGroup[] = allGroups.filter((g) => selectedGroups.has(g.id));
  const variations = useMemo(() => (property ? generatePostVariations(property, 4) : []), [property]);
  const plan = useMemo(() => (chosen.length ? buildPlan(chosen, frequency, startDate, { variations: variations.length || 4 }) : null), [chosen, frequency, startDate, variations.length]);

  const canNext = [!!property, true, true, chosen.length > 0, true, true, true][step];
  const toggleGroup = (id: string) => setSelectedGroups((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleFolder = (f: GroupFolder) => setSelectedGroups((s) => { const n = new Set(s); const all = f.groups.every((g) => n.has(g.id)); f.groups.forEach((g) => (all ? n.delete(g.id) : n.add(g.id))); return n; });

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="bg-brand-soft flex items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Facebook Groups</p>
          <h1 className="text-ink mt-1 flex items-center gap-2 text-2xl font-black"><Icon name="Megaphone" size={22} /> אשף קמפיין לקבוצות</h1>
          <p className="text-muted mt-1 text-sm">בונה קמפיין שיווק לנכס בקבוצות פייסבוק. שום דבר לא מתפרסם ללא חיבור ואישור.</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-[11px] font-bold", connection.connected ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>{connection.connected ? "פייסבוק מחובר" : "פייסבוק לא מחובר"}</span>
      </div>

      {/* Stepper */}
      <div className="flex gap-1 overflow-x-auto">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => i <= step && setStep(i)} className={cn("flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-bold", i === step ? "bg-brand text-white" : i < step ? "bg-card text-ink" : "bg-surface text-muted")}>
            <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[10px]", i === step ? "bg-white/25" : "bg-brand-soft text-brand")}>{i + 1}</span>{s}
          </button>
        ))}
      </div>

      {notes.length > 0 && step === 0 && <div className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-[12px]">{notes.join(" · ")}</div>}

      <div className="bg-card border-line rounded-[22px] border p-5">
        {/* STEP 1 — property */}
        {step === 0 && (
          properties.length === 0 ? <Empty title="אין נכסים פעילים" body="הוסיפו נכס למלאי כדי לשווק אותו בקבוצות." /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {properties.map((p) => (
                <button key={p.id} onClick={() => setPropId(p.id)} className={cn("overflow-hidden rounded-2xl border bg-surface text-right", propId === p.id ? "border-brand ring-2 ring-brand" : "border-line")}>
                  <div className="relative aspect-[4/3] bg-slate-100">{p.image ? <img src={p.image} alt={p.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-400">🏠</div>}</div>
                  <div className="p-2"><div className="text-ink line-clamp-1 text-[12px] font-bold">{p.title}</div><div className="text-brand text-[12px] font-black">{fmt(p.price)}</div><div className="text-muted text-[10px]">{[p.neighborhood, p.city].filter(Boolean).join(", ")}</div></div>
                </button>
              ))}
            </div>
          )
        )}

        {/* STEP 2 — content */}
        {step === 1 && property && (
          <div className="space-y-3">
            <p className="text-muted text-[12px]">נוצרו {variations.length} וריאציות טקסט מנתוני הנכס בלבד. ערכו ואשרו לפני המשך.</p>
            {variations.map((v, i) => (
              <div key={i} className="rounded-2xl bg-surface p-3">
                <div className="text-ink text-[13px] font-bold">{v.name}</div>
                <textarea defaultValue={v.text} rows={4} className="border-line bg-card text-ink mt-1 w-full rounded-xl border p-2 text-[12px]" />
                <div className="mt-1 flex flex-wrap gap-1">{v.hashtags.map((h) => <span key={h} className="bg-brand-soft text-brand rounded px-2 py-0.5 text-[10px]">{h}</span>)}</div>
              </div>
            ))}
            <div className="rounded-2xl bg-surface p-3">
              <div className="text-ink text-[13px] font-bold">תגובות אוטומטיות מוצעות (מאושרות ידנית בלבד)</div>
              <ul className="mt-1 space-y-1">{autoReplyTemplates().map((r) => <li key={r.intent} className="text-[12px]"><b className="text-ink">{r.intent}:</b> <span className="text-muted">{r.reply}</span></li>)}</ul>
            </div>
          </div>
        )}

        {/* STEP 3 — connection */}
        {step === 2 && (
          <div className="text-center">
            <div className="text-4xl">{connection.connected ? "✅" : "🔗"}</div>
            <h3 className="text-ink mt-2 text-lg font-black">{connection.connected ? "פייסבוק מחובר" : "חיבור פייסבוק"}</h3>
            <p className="text-muted mt-1 text-[13px]">{connection.message}</p>
            <p className="text-muted mx-auto mt-2 max-w-md text-[12px]">ZONO יכול להכין ולתזמן פוסטים. פרסום לקבוצות מתבצע בכפוף למדיניות פייסבוק — קבוצות רבות מחייבות פרסום ידני/הרשאות. אין גישה לקבוצות פרטיות ואין עקיפת מגבלות.</p>
            <Link href="/settings/distribution-connections" className="bg-brand mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white">{connection.connected ? "ניהול חיבור" : "חברו פייסבוק"}</Link>
          </div>
        )}

        {/* STEP 4 — groups */}
        {step === 3 && (
          folders.length === 0 ? <Empty title="אין קבוצות בספרייה" body="הוסיפו קבוצות במסך הקבוצות (Distribution) כדי לשייך לתיקיות." cta={{ href: "/distribution/groups", label: "ניהול קבוצות" }} /> : (
            <div className="space-y-4">
              <p className="text-muted text-[12px]">{selectedGroups.size} קבוצות נבחרו. בחרו תיקייה שלמה או קבוצות בודדות.</p>
              {folders.map((f) => (
                <div key={f.name}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-ink text-[14px] font-black">📁 {f.name} <span className="text-muted text-[11px] font-normal">({f.groups.length})</span></h3>
                    <button onClick={() => toggleFolder(f)} className="text-brand text-[12px] font-bold">{f.groups.every((g) => selectedGroups.has(g.id)) ? "בטל בחירה" : "בחר הכל"}</button>
                  </div>
                  <div className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {f.groups.map((g) => (
                      <button key={g.id} onClick={() => toggleGroup(g.id)} className={cn("flex items-center justify-between rounded-xl border px-3 py-2 text-right text-[12px]", selectedGroups.has(g.id) ? "border-brand bg-brand-soft" : "border-line bg-surface")}>
                        <span className="text-ink font-bold">{g.name}</span>
                        <span className="text-muted">{g.membersCount.toLocaleString("he-IL")} 👥</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* STEP 5 — frequency */}
        {step === 4 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {FREQS.map((f) => (
              <button key={f} onClick={() => setFrequency(f)} className={cn("rounded-2xl border p-4 text-center", frequency === f ? "border-brand bg-brand-soft" : "border-line bg-surface")}>
                <Icon name="Calendar" size={18} className="text-brand mx-auto" />
                <div className="text-ink mt-1 text-[13px] font-black">{FREQUENCY_HE[f]}</div>
              </button>
            ))}
          </div>
        )}

        {/* STEP 6 — gantt + approval */}
        {step === 5 && plan && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">{plan.risks.map((r, i) => <span key={i} className={cn("rounded-lg px-2.5 py-1 text-[11px] font-semibold", r.level === "danger" ? "bg-danger-soft text-danger" : r.level === "warning" ? "bg-warning-soft text-warning" : "bg-surface text-muted")}>{r.level === "danger" ? "⛔" : r.level === "warning" ? "⚠️" : "ℹ️"} {r.message}</span>)}</div>
            <div className="text-muted text-[12px]">{plan.totalPosts} פוסטים · {chosen.length} קבוצות · {plan.gantt.dates.length} תאריכים. כל תא = וריאציה + סטטוס. שום דבר לא מתפרסם ללא אישור.</div>
            <div className="overflow-x-auto">
              <table className="text-[11px]">
                <thead><tr><th className="bg-surface text-muted sticky right-0 p-2 text-right">קבוצה</th>{plan.gantt.dates.map((d) => <th key={d} className="text-muted p-1 font-normal">{d.slice(5)}</th>)}</tr></thead>
                <tbody>{plan.gantt.rows.map((row) => (
                  <tr key={row.groupId}><td className="bg-surface text-ink sticky right-0 p-2 font-bold">{row.groupName}</td>
                    {row.cells.map((c, i) => <td key={i} className="p-1 text-center">{c.slot ? <span className="bg-brand-soft text-brand inline-block rounded px-1.5 py-0.5 font-bold" title={SLOT_STATUS_HE[c.slot.status]}>V{c.slot.variationIndex + 1}</span> : <span className="text-slate-300">·</span>}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="bg-warning-soft text-warning rounded-xl p-3 text-[12px]">{connection.connected ? "מוכן לאישור. לאחר אישור, התזמון/פרסום ממשיכים במסך ה-Distribution (Publish Assistant) — עדיין באישור ידני לכל פוסט." : "לא ניתן לתזמן/לפרסם עד לחיבור פייסבוק. ניתן לשמור את התוכנית."}</div>
          </div>
        )}

        {/* STEP 7 — comments */}
        {step === 6 && (
          <div className="text-center">
            <div className="text-4xl">💬</div>
            <h3 className="text-ink mt-2 text-lg font-black">ניהול תגובות ולידים</h3>
            <p className="text-muted mx-auto mt-1 max-w-md text-[13px]">לאחר פרסום, תגובות מסווגות אוטומטית (מעוניין / מבקש פרטים / שאלת מחיר / מיקום / בקשת צפייה / מתווך / ספאם) עם ציון כוונה. הצעות ליד נוצרות רק לאחר אישורכם — שום ליד לא נוצר אוטומטית.</p>
            <Link href="/social-leads" className="bg-brand mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white">מרכז תגובות ולידים</Link>
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="text-muted rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40">← הקודם</button>
        {step < STEPS.length - 1
          ? <button onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext} className="bg-brand rounded-xl px-5 py-2 text-sm font-bold text-white disabled:opacity-50">הבא →</button>
          : <Link href="/distribution" className="bg-brand rounded-xl px-5 py-2 text-sm font-bold text-white">סיום — למרכז ההפצה</Link>}
      </div>
    </div>
  );
}

function Empty({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return <div className="py-10 text-center"><p className="text-ink text-lg font-black">{title}</p><p className="text-muted mt-1 text-sm">{body}</p>{cta && <Link href={cta.href} className="bg-brand mt-4 inline-block rounded-xl px-5 py-2 text-sm font-bold text-white">{cta.label}</Link>}</div>;
}
