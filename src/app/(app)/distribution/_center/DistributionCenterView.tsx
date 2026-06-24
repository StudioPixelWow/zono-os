"use client";

// ============================================================================
// ZONO — מרכז הפצה (Facebook Distribution Center).
// A premium, glassmorphic AI operating system over the real distribution data
// layer. 8 sections, RTL Hebrew, purple-gradient design language.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DistributionBoard, DailyWorkspace } from "@/lib/distribution/service";
import type { DistributionCenterData } from "@/lib/distribution/center-data";
import type { AssistantPost } from "@/lib/distribution/manual-publish-service";
import type { CommentsBoard } from "@/lib/distribution/distribution-comment-service";
import type { DistributionAnalytics } from "@/lib/distribution/analytics-scoring";
import type { AutomationBoard } from "@/lib/distribution/distribution-automation-service";
import { recomputeDistributionAction, generateDailyBatchAction } from "@/lib/distribution/actions";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { type PropertyLite } from "./variations";
import { generateCampaignVariationsAction } from "@/lib/distribution/variation-actions";
import type { CampaignVariationView } from "@/lib/distribution/variation-engine";
import { OverviewSection } from "./OverviewSection";
import { GroupLibrarySection } from "./GroupLibrarySection";
import { CampaignBuilderSection } from "./CampaignBuilderSection";
import { AiVariationsSection } from "./AiVariationsSection";
import { PostingQueueSection } from "./PostingQueueSection";
import { ScheduleBuilderSection } from "./ScheduleBuilderSection";
import { LeadCollectionSection } from "./LeadCollectionSection";
import { AnalyticsSection } from "./AnalyticsSection";
import { AutomationCenterSection } from "./AutomationCenterSection";
import { PublishAssistantSection } from "./PublishAssistantSection";
import { FacebookConnectBanner } from "./FacebookConnectBanner";
import { CommentsLeadsSection } from "./CommentsLeadsSection";

type SectionKey = "overview" | "groups" | "builder" | "variations" | "schedule" | "queue" | "assistant" | "comments" | "leads" | "analytics" | "automation";

const NAV: { key: SectionKey; label: string; icon: string }[] = [
  { key: "overview", label: "סקירה", icon: "LayoutDashboard" },
  { key: "groups", label: "ספריית קבוצות", icon: "Users" },
  { key: "builder", label: "בניית קמפיין", icon: "Megaphone" },
  { key: "variations", label: "וריאציות AI", icon: "Sparkles" },
  { key: "schedule", label: "בניית תור", icon: "CalendarClock" },
  { key: "queue", label: "תור פרסום", icon: "Send" },
  { key: "assistant", label: "עוזר פרסום", icon: "ShieldCheck" },
  { key: "comments", label: "תגובות ולידים", icon: "MessageCircle" },
  { key: "leads", label: "איסוף לידים", icon: "Inbox" },
  { key: "analytics", label: "אנליטיקה", icon: "BarChart3" },
  { key: "automation", label: "אוטומציה", icon: "Workflow" },
];

export type RunAction = <R extends { error?: string }>(fn: () => Promise<R>, okMsg: string) => void;
/** Awaitable variant — resolves with the action result (e.g. to read campaignId). */
export type RunActionAsync = <R extends { error?: string }>(fn: () => Promise<R>, okMsg: string) => Promise<R>;

export function DistributionCenterView({
  board,
  daily,
  properties,
  center,
  assistantPosts,
  commentsBoard,
  analytics,
  automationBoard,
  complianceWarnings,
}: {
  board: DistributionBoard;
  daily: DailyWorkspace;
  properties: PropertyLite[];
  center: DistributionCenterData;
  assistantPosts: AssistantPost[];
  commentsBoard: CommentsBoard;
  analytics: DistributionAnalytics;
  automationBoard: AutomationBoard;
  complianceWarnings: string[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>("overview");
  // Deep-link: /distribution?section=builder opens straight on that tab.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("section");
    const valid: SectionKey[] = ["overview", "groups", "builder", "variations", "schedule", "queue", "assistant", "comments", "leads", "analytics", "automation"];
    if (s && (valid as string[]).includes(s)) queueMicrotask(() => setSection(s as SectionKey));
  }, []);
  const [variations, setVariations] = useState<CampaignVariationView[]>([]);
  const [variationProperty, setVariationProperty] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const runAction: RunAction = (fn, okMsg) => {
    startTransition(async () => {
      const res = await fn();
      setToast(res?.error ? res.error : okMsg);
      router.refresh();
      setTimeout(() => setToast(null), 4000);
    });
  };

  // Awaitable runner for flows that need the returned payload (e.g. campaignId).
  const runActionAsync: RunActionAsync = async (fn, okMsg) => {
    const res = await fn();
    setToast(res?.error ? res.error : okMsg);
    router.refresh();
    setTimeout(() => setToast(null), 4000);
    return res;
  };

  // Generate AI variations → PERSIST to distribution_variations → render the rows
  // read back from the DB (the database is the single source of truth).
  function handleGenerate(campaignId: string, count: number) {
    setSection("variations");
    startTransition(async () => {
      const res = await generateCampaignVariationsAction({ campaignId, count });
      if (res.error) { setToast(res.error); setTimeout(() => setToast(null), 4000); return; }
      setVariations(res.variations ?? []);
      setVariationProperty(res.campaignName ?? null);
      setToast(`${res.saved ?? 0} וריאציות נשמרו · 4 המובילות נבחרו אוטומטית`);
      router.refresh();
      setTimeout(() => setToast(null), 4000);
    });
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

      {/* Facebook connection status — manual mode until Meta API approval */}
      <FacebookConnectBanner onOpenAssistant={() => setSection("assistant")} />

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
        {section === "overview" && <OverviewSection board={board} stats={center.stats} campaigns={center.campaigns} onBuild={() => setSection("builder")} />}
        {section === "groups" && <GroupLibrarySection groups={center.groups} runAction={runAction} pending={pending} />}
        {section === "builder" && <CampaignBuilderSection groups={center.groups} campaigns={center.campaigns} properties={properties} onGenerate={handleGenerate} runAction={runAction} runActionAsync={runActionAsync} pending={pending} />}
        {section === "variations" && <AiVariationsSection variations={variations} propertyTitle={variationProperty} onBuild={() => setSection("builder")} />}
        {section === "schedule" && <ScheduleBuilderSection campaigns={center.campaigns} groups={center.groups} runActionAsync={runActionAsync} />}
        {section === "queue" && <PostingQueueSection posts={center.posts} campaigns={center.campaigns} groups={center.groups} daily={daily} runAction={runAction} pending={pending} />}
        {section === "assistant" && <PublishAssistantSection posts={assistantPosts} complianceWarnings={complianceWarnings} runAction={runAction} pending={pending} />}
        {section === "comments" && <CommentsLeadsSection commentsBoard={commentsBoard} posts={center.posts} groups={center.groups} runAction={runAction} runActionAsync={runActionAsync} pending={pending} />}
        {section === "leads" && <LeadCollectionSection leads={center.leads} runAction={runAction} pending={pending} />}
        {section === "analytics" && <AnalyticsSection analytics={analytics} runAction={runAction} pending={pending} />}
        {section === "automation" && <AutomationCenterSection board={automationBoard} runAction={runAction} pending={pending} />}
      </div>
    </div>
  );
}
