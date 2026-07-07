"use client";
// ============================================================================
// ✨ ZONO — PageTransition. PHASE 61.0 (UX polish only; no business logic).
// Wraps app content and replays a subtle fade+rise on every route change by
// keying on the pathname. Purely presentational; reduced-motion is honored by
// the .zono-page-enter rule in globals.css. Replaces hard page jumps (STEP 4).
// ============================================================================
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="zono-page-enter flex w-full flex-col gap-10">
      {children}
    </div>
  );
}
