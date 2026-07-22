// ============================================================================
// 🏛️ Executive Workspace — per-card isolation boundary (server).
//
// Two layers of isolation so ONE card failing never fails the page:
//   1) <Suspense> — the card streams independently; its skeleton shows while it
//      loads, and its slowness never blocks a sibling (progressive rendering).
//   2) <IntelligenceErrorBoundary> — an unexpected RENDER throw in the card is
//      caught and shown as a calm fallback, not propagated to the page.
// Data-unavailability is handled INSIDE each card (provider → null → honest
// CardUnavailable), so this boundary is defense-in-depth for the rare throw.
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
