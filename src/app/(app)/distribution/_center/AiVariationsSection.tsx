"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Glass, SectionHeading, EmptyState, ScoreBar } from "./shared";
import type { CampaignVariationView } from "@/lib/distribution/variation-engine";

export function AiVariationsSection({
  variations,
  propertyTitle,
  onBuild,
}: {
  variations: CampaignVariationView[];
  propertyTitle: string | null;
  onBuild: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (variations.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeading title="וריאציות תוכן AI" subtitle="גרסאות מודעה שנוצרו אוטומטית מנתוני הנכס" icon="Sparkles" />
        <EmptyState icon="Sparkles" title="עדיין לא נוצרו וריאציות" body="עבור לבניית קמפיין, בחר נכס וקהל יעד ולחץ 'צור וריאציות AI' — הגרסאות יופיעו כאן עם תחזית ביצועים וציון Wow."
          action={<button type="button" onClick={onBuild} className="btn-zono-primary mt-1 rounded-xl px-4 py-2 text-sm font-bold text-white">פתח בניית קמפיין</button>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="וריאציות תוכן AI" subtitle={`${variations.length} גרסאות${propertyTitle ? ` · ${propertyTitle}` : ""} · נשמרו ב-DB · 4 המובילות סומנו אוטומטית`} icon="Sparkles"
        action={selected.size > 0 ? <span className="bg-brand-soft text-brand-strong rounded-full px-3 py-1 text-sm font-bold">{selected.size} נבחרו</span> : undefined} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {variations.map((v) => {
          const isSel = selected.has(v.id);
          const top = v.selected;
          return (
            <Glass key={v.id} className={cn("flex flex-col gap-3 p-4", isSel && "ring-brand ring-2")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-brand-soft text-brand-strong grid h-7 w-7 place-items-center rounded-lg text-xs font-black">{v.index}</span>
                  <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{v.angleLabel} · {v.tone}</span>
                </div>
                {top && <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[10px] font-black">מומלץ</span>}
              </div>
              <p className="text-ink text-sm font-extrabold leading-snug">{v.headline}</p>
              <p className="text-muted line-clamp-3 text-xs leading-relaxed">{v.body}</p>
              <div className="flex flex-wrap gap-1">{v.hashtags.map((h) => <span key={h} className="text-brand-strong text-[10px] font-semibold">{h}</span>)}</div>
              <p className="text-brand-strong bg-brand-soft/60 rounded-lg px-2.5 py-1.5 text-[11px] font-bold">{v.cta}</p>
              <div className="border-line grid grid-cols-3 gap-2 border-t pt-2.5">
                <Metric label="Wow" value={v.wow} />
                <Metric label="מעורבות" value={v.engagement} />
                <Metric label="תחזית" value={v.prediction} />
              </div>
              <button type="button" onClick={() => toggle(v.id)} className={cn("rounded-xl py-2 text-sm font-bold transition", isSel ? "zono-gradient text-white" : "bg-surface text-ink hover:bg-brand-soft")}>
                {isSel ? "נבחר ✓" : "בחר גרסה"}
              </button>
            </Glass>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted text-[10px] font-bold">{label}</span>
      <ScoreBar value={value} width="w-full" />
    </div>
  );
}
