"use client";
// ============================================================================
// 📱 ZONO — Field capture bar. PHASE 57.0. Camera / voice / GPS handoffs.
// Each button hands off to an EXISTING flow — no new capture pipeline, no new
// storage: camera → documents upload, voice → Voice AI (/voice), navigate →
// device maps deep link (buildRouteUrl). Approval-gated flows stay approval-gated.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { buildRouteUrl, type RouteStop } from "@/lib/mobile-os";

export function FieldCaptureBar({ stops = [], routeUrl: routeUrlOverride, className = "" }: { stops?: RouteStop[]; routeUrl?: string | null; className?: string }) {
  const routeUrl = routeUrlOverride ?? buildRouteUrl(stops);

  return (
    <div dir="rtl" className={`bg-card border-line flex items-center gap-2 rounded-2xl border p-2 ${className}`}>
      {/* Camera → existing documents upload (no duplicate storage). */}
      <Link href="/documents" className="bg-surface text-ink hover:border-brand-light border-line flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[12px] font-bold">
        <Icon name="Presentation" size={16} /> העלה תמונה
      </Link>
      {/* Voice → Voice AI (consent-gated, 53.0). */}
      <Link href="/voice" className="bg-surface text-ink hover:border-brand-light border-line flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[12px] font-bold">
        <Icon name="MessageCircle" size={16} /> הקלטה קולית
      </Link>
      {/* GPS → device maps deep link. */}
      {routeUrl ? (
        <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="bg-brand-soft text-brand flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold">
          <Icon name="Map" size={16} /> ניווט למסלול
        </a>
      ) : (
        <span className="bg-surface text-muted flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold">
          <Icon name="Map" size={16} /> אין יעד למסלול
        </span>
      )}
    </div>
  );
}
