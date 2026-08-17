"use client";
/* eslint-disable @next/next/no-img-element -- external CDN property photos; next/image would require remotePatterns config */
// ============================================================================
// 📘 ZONO — Facebook Groups Campaign Wizard. Campaign UX P0.
// A guided property→content→groups→schedule→REVIEW flow that ends in a REAL
// ACTIVATION (activateFacebookCampaignAction): it persists the campaign + group
// links + content variations + the real distribution_posts schedule through the
// EXISTING distribution engine — nothing is mocked, nothing dead-ends to another
// admin screen. After activation the user lands on a success state → today's
// publishing. Publishing itself remains the existing assisted-extension flow.
// ============================================================================
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { buildPlan, FREQUENCY_HE, type Frequency, type WizardGroup, type GroupFolder } from "@/lib/facebook-groups/planner";
import { generatePostVariations, type PropertyFacts } from "@/lib/facebook-groups/content";
import { activateFacebookCampaignAction } from "@/lib/facebook-groups/activate";

interface WProperty extends PropertyFacts { id: string; image: string | null }
interface Connection { label: string; status: string; connected: boolean; message: string }
interface Props { properties: WProperty[]; folders: GroupFolder[]; connection: Connection; notes: string[] }

const STEPS = ["נכס", "תוכן", "קבוצות", "תזמון", "סקירה ואישור"];
const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const FREQS: Frequency[] = ["one_time", "three_weekly", "daily", "full_month"];
const dateHe = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "long" }) : "—");
const dateTimeHe = (iso: string | null) => (iso ? new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

interface Activated { campaignId: string; created: number; groupCount: number; firstPublishAt: string | null; endDate: string }

export function CampaignWizard({ properties, folders, notes }: Props) {
  const [step, setStep] = useState(0);
  const [propId, setPropId] = useState<string | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [frequency, setFrequency] = useState<Frequency>("three_weekly");
  const [startDate] = useState(() => new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10));
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [done, setDone] = useState<Activated | null>(null);
  const activatingRef = useRef(false);

  const property = properties.find((p) => p.id === propId) ?? null;
  const allGroups = useMemo(() => folders.flatMap((f) => f.groups), [folders]);
  const chosen: WizardGroup[] = allGroups.filter((g) => selectedGroups.has(g.id));
  const variations = useMemo(() => (property ? generatePostVariations(property, 4) : []), [property]);
  const plan = useMemo(() => (chosen.length ? buildPlan(chosen, frequency, startDate, { variations: variations.length || 4 }) : null), [chosen, frequency, startDate, variations.length]);

  const canNext = [!!property, true, chosen.length > 0, true, true][step];
  const toggleGroup = (id: string) => setSelectedGroups((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleFolder = (f: GroupFolder) => setSelectedGroups((s) => { const n = new Set(s); const all = f.groups.every((g) => n.has(g.id)); f.groups.forEach((g) => (all ? n.delete(g.id) : n.add(g.id))); return n; });

  async function activate() {
    if (activatingRef.current || !property || chosen.length === 0) return; // single-flight
    activatingRef.current = true;
    setActivating(true);
    setActivateError(null);
    try {
      const res = await activateFacebookCampaignAction({
        propertyId: property.id, propertyTitle: property.title,
        groupIds: chosen.map((g) => g.id), frequency, startDate,
      });
      if (res.ok) setDone({ campaignId: res.campaignId, created: res.created, groupCount: res.groupCount, firstPublishAt: res.firstPublishAt, endDate: res.endDate });
      else setActivateError(res.error);
    } catch {
      setActivateError("הפעלת הקמפיין נכשלה. נסה שוב.");
    } finally {
      activatingRef.current = false;
      setActivating(false);
    }
  }

  // ── SUCCESS STATE — the builder does not dead-end; it lands here ─────────────
  if (done) {
    return (
      <div dir="rtl" className="mx-auto flex max-w-xl flex-col items-center gap-4 py-8 text-center">
        <div className="bg-success-soft grid h-16 w-16 place-items-center rounded-full text-3xl">✅</div>
        <h1 className="text-ink text-2xl font-black">הקמפיין פעיל</h1>
        <div className="bg-card border-line w-full rounded-[22px] border p-5">
          <div className="grid grid-cols-2 gap-3 text-right">
            <Cell label="נכס" value={property?.title ?? "—"} />
            <Cell label="קבוצות" value={`${done.groupCount}`} />
            <Cell label="פרסומים מתוכננים" value={`${done.created}`} />
            <Cell label="עד" value={dateHe(done.endDate)} />
            <Cell label="הפרסום הבא" value={dateTimeHe(done.firstPublishAt)} full />
          </div>
        </div>
        <p className="text-muted max-w-md text-[12px]">התוסף ילווה אותך בפרסום כל פריט בזמנו — הפרסום מאושר על ידך. תגובות שיתקבלו על הפוסטים ניתנות לקידום ללידים במרכז התגובות.</p>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/distribution/daily" className="bg-brand rounded-xl px-6 py-2.5 text-sm font-black text-white">לפרסומים של היום ←</Link>
          <Link href="/distribution" className="border-line text-ink rounded-xl border px-6 py-2.5 text-sm font-bold">לצפייה בקמפיין</Link>
        </div>
      </div>
    );
  }

  const onReview = step === STEPS.length - 1;

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="bg-brand-soft flex items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO · קבוצות פייסבוק</p>
          <h1 className="text-ink mt-1 flex items-center gap-2 text-2xl font-black"><Icon name="Megaphone" size={22} /> קמפיין שיווק בקבוצות</h1>
          <p className="text-muted mt-1 text-sm">בונה קמפיין שיווק לנכס בקבוצות פייסבוק. שום דבר לא מתפרסם ללא חיבור ואישור.</p>
        </div>
        <span className="bg-brand-soft text-brand rounded-full px-3 py-1 text-[11px] font-bold">פרסום דרך תוסף ZONO</span>
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
          </div>
        )}


        {/* STEP 3 — groups */}
        {step === 2 && (
          folders.length === 0 ? <Empty title="אין קבוצות מאושרות לפרסום" body="כדי ליצור קמפיין יש לבחור ולהפעיל קבוצות במסך הקבוצות." cta={{ href: "/distribution/groups", label: "בחירת קבוצות" }} /> : (
            <div className="space-y-4">
              <p className="text-muted text-[12px]"><b className="text-ink">{selectedGroups.size}</b> קבוצות נבחרו. בחרו תיקייה שלמה או קבוצות בודדות.</p>
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

        {/* STEP 4 — schedule (cadence) */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-muted text-[12px]">באיזו תדירות לפרסם לאורך הקמפיין?</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {FREQS.map((f) => (
                <button key={f} onClick={() => setFrequency(f)} className={cn("rounded-2xl border p-4 text-center", frequency === f ? "border-brand bg-brand-soft" : "border-line bg-surface")}>
                  <Icon name="Calendar" size={18} className="text-brand mx-auto" />
                  <div className="text-ink mt-1 text-[13px] font-black">{FREQUENCY_HE[f]}</div>
                </button>
              ))}
            </div>
            {plan && <p className="text-muted text-[12px]">מ־{dateHe(startDate)} · בין 09:00 ל־20:00 · כ־{plan.totalPosts} פרסומים מתוכננים.</p>}
          </div>
        )}

        {/* STEP 5 — REVIEW + ACTIVATE */}
        {onReview && (
          !property || chosen.length === 0 ? (
            <Empty title="חסרים פרטים" body="חזרו ובחרו נכס וקבוצות לפני הפעלת הקמפיין." />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Cell label="נכס" value={property.title ?? "—"} />
                <Cell label="מחיר" value={fmt(property.price)} />
                <Cell label="קבוצות" value={`${chosen.length} נבחרו`} />
                <Cell label="תדירות" value={FREQUENCY_HE[frequency]} />
                <Cell label="מתחיל" value={dateHe(startDate)} />
                <Cell label="פרסומים מתוכננים" value={plan ? `~${plan.totalPosts}` : "—"} />
              </div>
              <div className="bg-surface text-muted rounded-xl p-3 text-[12px]">
                ZONO יכין ויתזמן כל פרסום. בזמן הפרסום, <b className="text-ink">התוסף ילווה אותך</b> בפרסום בקבוצה בפייסבוק — הפרסום מאושר על ידך. אין פרסום אוטומטי.
              </div>
              {activateError && <div className="bg-danger-soft text-danger rounded-xl p-3 text-[12px]">{activateError}</div>}
            </div>
          )
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || activating} className="text-muted rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40">← הקודם</button>
        {!onReview
          ? <button onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext} className="bg-brand rounded-xl px-5 py-2 text-sm font-bold text-white disabled:opacity-50">הבא →</button>
          : <button onClick={activate} disabled={activating || !property || chosen.length === 0} className="bg-brand rounded-xl px-6 py-2 text-sm font-black text-white disabled:opacity-50">{activating ? "מפעילים את הקמפיין…" : "הפעלת הקמפיין"}</button>}
      </div>
    </div>
  );
}

function Cell({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return <div className={cn("bg-surface rounded-xl p-3 text-right", full && "col-span-2")}><div className="text-muted text-[11px]">{label}</div><div className="text-ink mt-0.5 text-[14px] font-black">{value}</div></div>;
}

function Empty({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return <div className="py-10 text-center"><p className="text-ink text-lg font-black">{title}</p><p className="text-muted mt-1 text-sm">{body}</p>{cta && <Link href={cta.href} className="bg-brand mt-4 inline-block rounded-xl px-5 py-2 text-sm font-bold text-white">{cta.label}</Link>}</div>;
}
