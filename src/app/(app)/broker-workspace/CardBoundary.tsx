// ============================================================================
// 👤 Broker Workspace — per-card isolation boundary (server). Same pattern as
// the Executive Workspace: <Suspense> for progressive independent streaming +
// <IntelligenceErrorBoundary> so one card's unexpected throw never fails the
// page. Data-unavailability is handled inside each card (provider → null →
// honest CardUnavailable); this boundary is defense-in-depth.
// ============================================================================
import { Suspense, type ReactNode } from "react";
import { IntelligenceErrorBoundary } from "@/components/intelligence/IntelligenceErrorBoundary";
import { CardSkeleton } from "./CardShell";

export function CardBoundary({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Suspense fallback={<CardSkeleton title={title} />}>
      <IntelligenceErrorBoundary title={`${title} — הרכיב נכשל בטעינה`} compact>
        {children}
      </IntelligenceErrorBoundary>
    </Suspense>
  );
}
