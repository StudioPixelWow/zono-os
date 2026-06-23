"use client";

// ============================================================================
// ZONO — מרכז הפצה (Facebook Distribution Center).
// A premium, glassmorphic AI operating system over the real distribution data
// layer. 8 sections, RTL Hebrew, purple-gradient design language.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DistributionBoard, DailyWorkspace } from "@/lib/distribution/service";
import { recomputeDistributionAction, generateDailyBatchAction } from "@/lib/distribution/actions";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { generateVariations, type PropertyLite, type AudienceKey, type Variation } from "./variations";
import { OverviewSection } from "./OverviewSection";
import { GroupLibrarySection } from "./GroupLibrarySection";
import { CampaignBuilderSection } from "./CampaignBuilderSection";
import { AiVariationsSection } from "./AiVariationsSection";
import { PostingQueueSection } from "./PostingQueueSection";
import { LeadCollectionSection } from "./LeadCollectionSection";
import { AnalyticsSection } from "./AnalyticsSection";
import { AutomationCenterSection } from "./AutomationCenterSection";

type SectionKey = "overview" | "groups" | "builder" | "variations" | "queue" | "leads" | "analytics" | "automation";

const NAV: { key: SectionKey; label: string; icon: string }[] = [
  { key: "overview", label: "סקירה", icon: "LayoutDashboard" },
  { key: "groups", label: "ספריית קבוצות", icon: "Users" },
  { key: "builder", label: "בניית קמפיין", icon: "Megaphone" },
  { key: "variations", label: "וריאציות AI", icon: "Sparkles" },
  { key: "queue", label: "תור פרסום", icon: "Send" },
  { key: "leads", label: "איסוף לידים", icon: "Inbox" },
  { key: "analytics", label: "אנליטיקה", icon: "BarChart3" },
  { key: "automation", label: "אוטומציה", icon: "Workflow" },
];

export function DistributionCenterView({
  board,
  daily,
  properties,
}: {
  board: DistributionBoard;
  daily: DailyWorkspace;
  properties: PropertyLite[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>("overview");
  const [variations, setVariations] = useState<Variation[]>([]);
  const [variationProperty, setVariationProperty] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      setToast(res?.error ? res.error : okMsg);
      router.refresh();
      setTimeout(() => setToast(null), 4000);
    });
  }

  function handleGenerate(p: PropertyLite, aud: AudienceKey, count: number) {
    setVariations(generateVariations(p, aud, count));
    setVariationProperty(p.title);
    setSection("variations");
  }

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      {/* Hero */}
      <div className="zono-gradient relative overflow-hidden rounded-[28px] p-6 text-white shadow-[var(--shadow-lift)] sm:p-8">
        <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 right-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-wide text-white/80">ZONO · Facebook Distribution OS</p>
            <h1 className="text-3xl font-black sm:text-[34px]">מרכז הפצה</h1>
            <p className="mt-1 max-w-xl text-sm font-medium text-white/85">
              מערכת ההפעלה החכמה להפצת נכסים בקהילות פייסבוק — קבוצות, קמפיינים, וריאציות AI, תור פרסום, לידים ואוטומציה במקום אחד.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => runAction(recomputeDistributionAction, "מודיעין ההפצה חושב מחדש")}
              className="zono-glass-dark inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-60">
              <Icon name="RefreshCw" size={16} /> חשב מודיעין הפצה
            </button>
            <button type="button" disabled={pending} onClick={() => runAction(generateDailyBatchAction, "מחזור ההפצה היומי נוצר")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand-strong shadow transition hover:brightness-95 disabled:opacity-60">
              <Icon name="Send" size={16} /> צור מחזור יומי
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div className="zono-glass text-ink rounded-2xl px-4 py-3 text-sm font-semibold">{toast}</div>
      )}

      {/* Section nav */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {NAV.map((n) => (
          <button key={n.key} type="button" onClick={() => setSection(n.key)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition",
              section === n.key ? "zono-gradient text-white shadow-[var(--shadow-soft)]" : "zono-glass text-ink hover:text-brand-strong",
            )}>
            <Icon name={n.icon} size={16} />
            {n.label}
            {n.key === "variations" && variations.length > 0 && (
              <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", section === n.key ? "bg-white/25" : "bg-brand-soft text-brand-strong")}>{variations.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Active section */}
      <div className="min-h-[40vh]">
        {section === "overview" && <OverviewSection board={board} daily={daily} onBuild={() => setSection("builder")} />}
        {section === "groups" && <GroupLibrarySection board={board} />}
        {section === "builder" && <CampaignBuilderSection board={board} properties={properties} onGenerate={handleGenerate} />}
        {section === "variations" && <AiVariationsSection variations={variations} propertyTitle={variationProperty} onBuild={() => setSection("builder")} />}
        {section === "queue" && <PostingQueueSection daily={daily} />}
        {section === "leads" && <LeadCollectionSection board={board} />}
        {section === "analytics" && <AnalyticsSection board={board} daily={daily} />}
        {section === "automation" && <AutomationCenterSection />}
      </div>
    </div>
  );
}
