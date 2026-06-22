"use client";

import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import {
  AUDIENCE_GROUP_LABELS,
  TARGET_AUDIENCES,
  type AudienceOption,
} from "@/lib/properties/audiences";

const GROUP_ORDER: AudienceOption["group"][] = [
  "buyers",
  "investors",
  "segments",
  "commercial",
  "lifecycle",
];

export function AudienceSelector({
  selected,
  recommended,
  onToggle,
  onApplyRecommended,
  otherText,
  onOtherChange,
}: {
  selected: string[];
  recommended: string[];
  onToggle: (key: string) => void;
  onApplyRecommended: () => void;
  otherText: string;
  onOtherChange: (v: string) => void;
}) {
  const selectedSet = new Set(selected);
  const recSet = new Set(recommended);
  const newRecs = recommended.filter((k) => !selectedSet.has(k));

  return (
    <div className="flex flex-col gap-3">
      {newRecs.length > 0 && (
        <div className="bg-brand-soft flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
          <span className="text-brand-strong text-xs font-bold">
            <Icon name="Sparkles" size={13} className="mb-0.5 inline" /> ZONO ממליץ:
          </span>
          {newRecs.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onToggle(k)}
              className="bg-card text-brand-strong border-brand-light hover:bg-brand hover:text-white rounded-full border px-2.5 py-1 text-[12px] font-bold transition"
            >
              + {label(k)}
            </button>
          ))}
          <button
            type="button"
            onClick={onApplyRecommended}
            className="text-brand-strong text-[12px] font-bold underline"
          >
            הוסף הכל
          </button>
        </div>
      )}

      {GROUP_ORDER.map((group) => {
        const opts = TARGET_AUDIENCES.filter((a) => a.group === group);
        return (
          <div key={group}>
            <p className="text-muted mb-1.5 text-[11px] font-bold">{AUDIENCE_GROUP_LABELS[group]}</p>
            <div className="flex flex-wrap gap-2">
              {opts.map((a) => {
                const active = selectedSet.has(a.key);
                const rec = recSet.has(a.key);
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => onToggle(a.key)}
                    className={cn(
                      "relative rounded-full border px-3 py-1.5 text-[13px] font-semibold transition",
                      active
                        ? "bg-brand border-brand text-white"
                        : "bg-card border-line text-ink hover:border-brand-light",
                    )}
                  >
                    {a.label}
                    {rec && !active && (
                      <span className="bg-brand absolute -end-1 -top-1 h-2 w-2 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <label className="block">
        <span className="text-muted text-[11px] font-bold">קהל נוסף (חופשי, אופציונלי)</span>
        <input
          className="bg-surface border-line text-ink focus:border-brand-light mt-1 h-10 w-full rounded-xl border px-3 text-sm outline-none"
          value={otherText}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="לדוגמה: עולים חדשים, אנשי הייטק…"
        />
      </label>
    </div>
  );
}

function label(key: string): string {
  return TARGET_AUDIENCES.find((a) => a.key === key)?.label ?? key;
}
