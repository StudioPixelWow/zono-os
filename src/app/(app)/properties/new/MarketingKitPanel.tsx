"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { generateMarketingKitAction } from "@/lib/properties/marketing-kit-actions";
import {
  KIT_CHANNELS,
  KIT_LENGTHS,
  KIT_TONES,
  type KitChannel,
  type KitLength,
  type KitTone,
  type MarketingKit,
  type MarketingKitInput,
} from "@/lib/properties/marketing-kit";

type Base = Omit<MarketingKitInput, "tone" | "length" | "channel">;

const SELECT =
  "bg-surface border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none";

const SECTIONS: { key: keyof MarketingKit; label: string }[] = [
  { key: "short", label: "תיאור קצר" },
  { key: "premium", label: "תיאור פרימיום" },
  { key: "emotional", label: "תיאור רגשי" },
  { key: "investor", label: "ממוקד משקיע" },
  { key: "family", label: "ממוקד משפחה" },
  { key: "luxury", label: "גרסת יוקרה" },
  { key: "whatsapp", label: "הודעת WhatsApp" },
  { key: "facebook", label: "פוסט פייסבוק" },
  { key: "instagram", label: "כיתוב אינסטגרם" },
  { key: "portal", label: "תיאור יד2/מדלן" },
  { key: "seoTitle", label: "כותרת SEO" },
  { key: "seoMeta", label: "תיאור מטא SEO" },
  { key: "audienceFit", label: "התאמת קהל יעד" },
];

export function MarketingKitPanel({ base, isManager }: { base: Base; isManager?: boolean }) {
  const [tone, setTone] = useState<KitTone>("premium");
  const [length, setLength] = useState<KitLength>("medium");
  const [channel, setChannel] = useState<KitChannel>("property_page");
  const [busy, setBusy] = useState(false);
  const [kit, setKit] = useState<MarketingKit | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const result = await generateMarketingKitAction({ ...base, tone, length, channel });
      setKit(result);
    } catch (e) {
      console.error("[marketing-kit] generate failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-muted text-[11px] font-bold">טון</span>
          <select className={SELECT} value={tone} onChange={(e) => setTone(e.target.value as KitTone)}>
            {KIT_TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-[11px] font-bold">אורך</span>
          <select className={SELECT} value={length} onChange={(e) => setLength(e.target.value as KitLength)}>
            {KIT_LENGTHS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-[11px] font-bold">ערוץ</span>
          <select className={SELECT} value={channel} onChange={(e) => setChannel(e.target.value as KitChannel)}>
            {KIT_CHANNELS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <Button onClick={generate} disabled={busy} leadingIcon={<Icon name="Sparkles" size={15} />}>
          {busy ? "יוצר ערכת שיווק…" : "צור ערכת שיווק"}
        </Button>
      </div>

      {kit && (
        <div className="flex flex-col gap-4">
          {kit.source === "openai" && (
            <span className="text-brand-strong text-[11px] font-bold">נוצר עם AI על בסיס העובדות בלבד ✓</span>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {SECTIONS.map((s) => {
              const text = String(kit[s.key] ?? "");
              if (!text) return null;
              return (
                <div key={String(s.key)} className="bg-surface flex flex-col gap-1.5 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-ink text-xs font-extrabold">{s.label}</span>
                    <button type="button" onClick={() => copy(String(s.key), text)} className="text-muted hover:text-brand flex items-center gap-1 text-[11px] font-bold">
                      <Icon name={copied === String(s.key) ? "Check" : "Copy"} size={13} />
                      {copied === String(s.key) ? "הועתק" : "העתק"}
                    </button>
                  </div>
                  <p className="text-ink whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
                </div>
              );
            })}
          </div>

          <KitList title="נקודות מכירה" items={kit.sellingPoints} />
          <KitList title="היילייטים" items={kit.highlights} />
          <KitList title="קריאות לפעולה (CTA)" items={kit.ctas} />

          <div className="bg-surface flex flex-col gap-2 rounded-xl p-3">
            <span className="text-ink text-xs font-extrabold">מענה להתנגדויות</span>
            {kit.objections.map((o, i) => (
              <p key={i} className="text-[13px]">
                <span className="text-danger font-bold">{o.objection}: </span>
                <span className="text-ink">{o.angle}</span>
              </p>
            ))}
          </div>

          {isManager && (
            <details className="bg-card border-line rounded-xl border p-3">
              <summary className="text-muted cursor-pointer text-xs font-bold">עובדות בשימוש (תצוגת מנהל)</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {kit.factsUsed.length === 0 ? (
                  <span className="text-muted text-xs">לא הוזנו עובדות — הוסף נתוני נכס לתוצר עשיר יותר.</span>
                ) : (
                  kit.factsUsed.map((f, i) => (
                    <span key={i} className="bg-surface border-line text-muted rounded-full border px-2 py-0.5 text-[11px]">{f}</span>
                  ))
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function KitList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="bg-surface flex flex-col gap-1.5 rounded-xl p-3">
      <span className="text-ink text-xs font-extrabold">{title}</span>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className={cn("text-ink flex items-start gap-1.5 text-[13px]")}>
            <Icon name="Check" size={13} className="text-brand mt-0.5 shrink-0" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
