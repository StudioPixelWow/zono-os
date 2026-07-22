// ============================================================================
// 💬 Communication Workspace — the three-panel shell. Layout only: LEFT inbox ·
// CENTER conversation · RIGHT CRM context. Each panel is wrapped in its own
// <Suspense> + error boundary so the three columns stream INDEPENDENTLY and one
// panel failing (or slow) never fails the others. No data fetching here — each
// panel owns its own cached provider calls.
// ============================================================================
import { Suspense } from "react";
import { IntelligenceErrorBoundary } from "@/components/intelligence/IntelligenceErrorBoundary";
import { InboxPanel } from "./InboxPanel";
import { ConversationPanel } from "./ConversationPanel";
import { ContextPanel } from "./ContextPanel";

function Skeleton({ label }: { label: string }) {
  return (
    <div dir="rtl" className="flex flex-col gap-2 p-2">
      <div className="text-muted text-[11px] font-bold">{label}</div>
      <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--surface-2,#eee)]" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-2,#eee)]" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--surface-2,#eee)]" />
    </div>
  );
}

const Panel = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-card border-line h-[calc(100vh-190px)] min-h-[420px] overflow-hidden rounded-[20px] border p-4 shadow-[var(--shadow-card)]">{children}</div>
);

export function CommunicationWorkspace({ params }: { params: Record<string, string | undefined> }) {
  const selected = params.c;
  return (
    <div dir="rtl" className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr_340px]">
      <Panel>
        <Suspense fallback={<Skeleton label="תיבת דואר מאוחדת" />}>
          <IntelligenceErrorBoundary title="תיבת הדואר נכשלה בטעינה" compact><InboxPanel params={params} /></IntelligenceErrorBoundary>
        </Suspense>
      </Panel>
      <Panel>
        <Suspense key={selected ?? "none"} fallback={<Skeleton label="שיחה" />}>
          <IntelligenceErrorBoundary title="השיחה נכשלה בטעינה" compact><ConversationPanel id={selected} /></IntelligenceErrorBoundary>
        </Suspense>
      </Panel>
      <Panel>
        <Suspense key={selected ?? "none"} fallback={<Skeleton label="הקשר CRM" />}>
          <IntelligenceErrorBoundary title="ההקשר נכשל בטעינה" compact><ContextPanel id={selected} /></IntelligenceErrorBoundary>
        </Suspense>
      </Panel>
    </div>
  );
}
