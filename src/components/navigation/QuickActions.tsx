"use client";
// ZONO Command Center — quick-actions launcher (§6/§7). Rebuilt on the shared
// ActionCard/ActionGrid design system with the on-dark variant: each action is a
// distinct, semantic, premium command tile (icon leads meaning, helper copy,
// strong hover/press/focus) instead of an identical gradient pill row.
import { ActionCard, ActionGrid, type Accent } from "@/components/ui/action-surfaces";
import { QUICK_ACTIONS, type CommandItem } from "./commandRegistry";

// Per-action semantic accent + short helper copy (§6). Distinct visuals, no
// forcing everything to purple (§8).
const META: Record<string, { accent: Accent; hint: string }> = {
  "qa-property":  { accent: "brand",   hint: "הוספת נכס למלאי" },
  "qa-buyer":     { accent: "info",    hint: "קונה + דרישות" },
  "qa-seller":    { accent: "warn",    hint: "בעל נכס חדש" },
  "qa-lead":      { accent: "info",    hint: "פנייה נכנסת" },
  "qa-deal":      { accent: "success", hint: "פתיחת עסקה" },
  "qa-meeting":   { accent: "info",    hint: "פגישה או סיור" },
  "qa-task":      { accent: "neutral", hint: "מטלה למעקב" },
  "qa-valuation": { accent: "brand",   hint: "שווי נכס" },
  "qa-campaign":  { accent: "brand",   hint: "יצירת פרסום" },
  "qa-import":    { accent: "neutral", hint: "סנכרון ממקורות" },
};

export function QuickActions({ onGo }: { onGo: (item: CommandItem) => void }) {
  return (
    <section aria-label="פעולות מהירות" className="flex flex-col gap-3" dir="rtl">
      <p className="text-xs font-bold uppercase tracking-wide text-white/40">פעולות מהירות</p>
      <ActionGrid>
        {QUICK_ACTIONS.map((a) => {
          const m = META[a.id] ?? { accent: "brand" as Accent, hint: "" };
          const disabled = !!a.disabled;
          return (
            <ActionCard
              key={a.id}
              tone="dark"
              name={a.icon}
              label={a.label}
              subtext={m.hint}
              accent={m.accent}
              disabled={disabled}
              badge={disabled ? "בקרוב" : undefined}
              onClick={() => !disabled && onGo(a)}
            />
          );
        })}
      </ActionGrid>
    </section>
  );
}
