"use client";

import { useMemo, useState } from "react";
import type { DistributionBoard } from "@/lib/distribution/service";
import { cn } from "@/lib/utils";
import { Glass, SectionHeading, EmptyState, Icon, ils, compact } from "./shared";
import { AUDIENCE_LABEL, type AudienceKey, type PropertyLite } from "./variations";

const STEPS = ["נכס", "קהל", "ערים", "קבוצות", "תזמון", "יצירה"] as const;
const AUDIENCES: AudienceKey[] = ["families", "investors", "young", "luxury", "commercial", "sellers"];
const FREQUENCIES = ["חד פעמי", "פעמיים בשבוע", "3 פעמים בשבוע", "יומי"];
const TIMES = ["בוקר 09:00", "צהריים 13:00", "ערב 19:00", "ערב 20:00", "ערב 21:00"];

export function CampaignBuilderSection({
  board,
  properties,
  onGenerate,
}: {
  board: DistributionBoard;
  properties: PropertyLite[];
  onGenerate: (p: PropertyLite, aud: AudienceKey, count: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [audience, setAudience] = useState<AudienceKey | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [freq, setFreq] = useState(FREQUENCIES[1]);
  const [time, setTime] = useState(TIMES[2]);
  const [count, setCount] = useState(20);

  const property = properties.find((p) => p.id === propertyId) ?? null;

  const cityOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of board.communities) if (c.city) s.add(c.city);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "he"));
  }, [board.communities]);

  const groupOptions = useMemo(() => {
    return board.communities.filter((c) => (cities.length === 0 ? true : c.city && cities.includes(c.city)));
  }, [board.communities, cities]);

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const canNext = [propertyId != null, audience != null, true, true, true, true][step];

  if (properties.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeading title="בניית קמפיין" subtitle="הרכב קמפיין הפצה מותאם בכמה צעדים" icon="Megaphone" />
        <EmptyState icon="Building2" title="אין נכסים פעילים" body="הוסף נכס פעיל למלאי כדי לבנות עבורו קמפיין הפצה לקהילות פייסבוק." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="בניית קמפיין" subtitle="הרכב קמפיין הפצה מותאם בכמה צעדים" icon="Megaphone" />

      {/* Stepper */}
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <button key={s} type="button" onClick={() => setStep(i)}
            className={cn("flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold transition", i === step ? "zono-gradient text-white" : i < step ? "bg-success-soft text-success" : "zono-glass text-muted")}>
            <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px]", i === step ? "bg-white/25" : i < step ? "bg-success/20" : "bg-line")}>{i < step ? "✓" : i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      <Glass className="flex flex-col gap-4 p-5">
        {step === 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {properties.map((p) => (
              <button key={p.id} type="button" onClick={() => setPropertyId(p.id)}
                className={cn("flex items-center gap-3 rounded-2xl border p-3 text-right transition", propertyId === p.id ? "border-brand bg-brand-soft" : "border-line bg-card/60 hover:border-brand-light")}>
                <span className="bg-surface text-muted grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl">
                  {p.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <Icon name="Building2" size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-extrabold">{p.title}</p>
                  <p className="text-muted truncate text-[11px]">{[p.neighborhood, p.city].filter(Boolean).join(", ") || "—"}</p>
                  <p className="text-brand-strong text-xs font-black">{p.price ? ils(p.price) : "—"}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {AUDIENCES.map((a) => (
              <button key={a} type="button" onClick={() => setAudience(a)}
                className={cn("rounded-2xl border p-4 text-center font-bold transition", audience === a ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-card/60 text-ink hover:border-brand-light")}>
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-wrap gap-2">
            {cityOptions.length === 0 ? <p className="text-muted text-sm">אין ערים זמינות מהקהילות המאושרות.</p> : cityOptions.map((c) => (
              <button key={c} type="button" onClick={() => toggle(cities, c, setCities)}
                className={cn("rounded-full px-3.5 py-1.5 text-sm font-bold transition", cities.includes(c) ? "zono-gradient text-white" : "zono-glass text-ink")}>{c}</button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {groupOptions.length === 0 ? <p className="text-muted text-sm">אין קבוצות זמינות לערים שנבחרו.</p> : groupOptions.map((c) => (
              <button key={c.id} type="button" onClick={() => toggle(groups, c.id, setGroups)}
                className={cn("flex items-center justify-between gap-2 rounded-2xl border p-3 text-right transition", groups.includes(c.id) ? "border-brand bg-brand-soft" : "border-line bg-card/60 hover:border-brand-light")}>
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-bold">{c.name}</p>
                  <p className="text-muted text-[11px]">{c.city ?? "—"} · {compact(c.members_count)} חברים</p>
                </div>
                <Icon name={groups.includes(c.id) ? "CheckCircle2" : "Circle"} size={18} className={groups.includes(c.id) ? "text-brand" : "text-muted"} />
              </button>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-muted mb-2 text-xs font-bold">תדירות פרסום</p>
              <div className="flex flex-wrap gap-2">{FREQUENCIES.map((f) => <button key={f} type="button" onClick={() => setFreq(f)} className={cn("rounded-full px-3 py-1.5 text-sm font-bold transition", freq === f ? "zono-gradient text-white" : "zono-glass text-ink")}>{f}</button>)}</div>
            </div>
            <div>
              <p className="text-muted mb-2 text-xs font-bold">שעת פרסום מועדפת</p>
              <div className="flex flex-wrap gap-2">{TIMES.map((t) => <button key={t} type="button" onClick={() => setTime(t)} className={cn("rounded-full px-3 py-1.5 text-sm font-bold transition", time === t ? "zono-gradient text-white" : "zono-glass text-ink")}>{t}</button>)}</div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            <div className="bg-card/60 border-line grid grid-cols-2 gap-3 rounded-2xl border p-4 sm:grid-cols-4">
              <Summary label="נכס" value={property?.title ?? "—"} />
              <Summary label="קהל" value={audience ? AUDIENCE_LABEL[audience] : "—"} />
              <Summary label="ערים" value={cities.length ? `${cities.length} נבחרו` : "הכול"} />
              <Summary label="קבוצות" value={groups.length ? `${groups.length} נבחרו` : "מומלצות"} />
              <Summary label="תדירות" value={freq} />
              <Summary label="שעה" value={time} />
              <Summary label="וריאציות" value={`${count}`} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted text-xs font-bold">מספר וריאציות:</span>
              <input type="range" min={4} max={20} step={2} value={count} onChange={(e) => setCount(Number(e.target.value))} className="accent-brand flex-1" />
              <span className="text-brand-strong w-8 text-lg font-black tabular-nums">{count}</span>
            </div>
            <button type="button" disabled={!property || !audience}
              onClick={() => property && audience && onGenerate(property, audience, count)}
              className="zono-ai-gradient inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-bold text-white transition hover:brightness-105 disabled:opacity-50">
              <Icon name="Sparkles" size={18} /> צור {count} וריאציות AI
            </button>
          </div>
        )}

        {/* Footer nav */}
        <div className="border-line flex items-center justify-between border-t pt-3">
          <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="text-muted disabled:opacity-40 inline-flex items-center gap-1 text-sm font-bold"><Icon name="ChevronRight" size={16} /> הקודם</button>
          {step < STEPS.length - 1 && (
            <button type="button" disabled={!canNext} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} className="btn-zono-primary disabled:opacity-40 inline-flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-bold text-white">הבא <Icon name="ChevronLeft" size={16} /></button>
          )}
        </div>
      </Glass>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted text-[11px] font-bold">{label}</p>
      <p className="text-ink truncate text-sm font-extrabold">{value}</p>
    </div>
  );
}
