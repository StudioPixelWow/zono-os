"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button, Spinner } from "@/components/ui/Button";
import type { RecommendationCommandCenter, RecommendationView } from "@/lib/recommendations/service";
import {
  approveRecommendationAction, rejectRecommendationAction, markRecommendationConvertedAction,
  createTaskFromRecommendationAction, generateRecommendationMapPointsAction, expireStaleRecommendationsAction,
  recomputeAllRecommendationsAction,
} from "@/lib/recommendations/actions";

const TYPE_LABELS: Record<string, string> = {
  buyer_property: "קונה → נכס", buyer_transaction_package: "קונה → עסקאות", buyer_neighborhood: "קונה → שכונה",
  buyer_street: "קונה → רחוב", buyer_financing_check: "בדיקת מימון", seller_pricing: "מוכר → תמחור",
  seller_buyer_pool: "מוכר → קונים", seller_marketing_plan: "מוכר → שיווק", seller_transaction_package: "מוכר → עסקאות",
  property_buyer: "נכס → קונה", property_pricing: "נכס → מחיר", property_marketing: "נכס → שיווק",
  property_distribution: "נכס → הפצה", lead_property: "ליד → נכס", lead_followup: "ליד → מעקב", lead_routing: "ליד → ניתוב",
  acquisition_seller_outreach: "רכש → פנייה", acquisition_property_research: "רכש → מחקר", deal_closing_action: "עסקה → סגירה",
  deal_negotiation_action: "עסקה → מו״מ", agent_street_focus: "סוכן → רחוב", agent_locality_focus: "סוכן → יישוב",
  office_growth_focus: "משרד → צמיחה", community_promotion: "קהילה → קידום", territory_focus: "טריטוריה",
  referral_opportunity: "הפניה", document_required: "מסמך נדרש", signature_required: "חתימה נדרשת",
  calculator_required: "מחשבון", call_summary_required: "סיכום שיחה",
};
const CONF_TONE: Record<string, string> = { verified: "text-success bg-success-soft", high: "text-success bg-success-soft", medium: "text-warning bg-warning-soft", low: "text-muted bg-surface", insufficient: "text-danger bg-danger-soft" };
const CONF_LABEL: Record<string, string> = { verified: "מאומת", high: "גבוה", medium: "בינוני", low: "נמוך", insufficient: "חסר" };
const fmt = (n: number) => n.toLocaleString("he-IL");
const fmtMoney = (n: number) => (n >= 1000 ? `₪${Math.round(n / 1000).toLocaleString("he-IL")}K` : `₪${fmt(n)}`);

export function RecommendationsView({ cc }: { cc: RecommendationCommandCenter }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = (id: string | null, fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => {
    setBusyId(id ?? "global"); setNote(null);
    startTransition(async () => {
      const r = await fn();
      setNote(r.error ?? r.message ?? null);
      setBusyId(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Recommendation Intelligence OS</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מודיעין המלצות</h1>
          <p className="text-muted mt-1 text-sm">המלצות מוסברות, מגובות-ראיות, לכל הישויות. כל ההמלצות לבדיקה בלבד — שום דבר לא נשלח אוטומטית.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button loading={pending && busyId === "all"} onClick={() => act("all", recomputeAllRecommendationsAction)} leadingIcon={<Icon name="Sparkles" size={16} />}>צור המלצות</Button>
          <Link href="/recommendations/map" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="MapPin" size={15} />אזורי ביקוש</Link>
          <Button size="sm" variant="secondary" loading={pending && busyId === "map"} onClick={() => act("map", generateRecommendationMapPointsAction)}>רענן אזורים</Button>
          <Button size="sm" variant="secondary" loading={pending && busyId === "expire"} onClick={() => act("expire", expireStaleRecommendationsAction)}>פוג ישנות</Button>
        </div>
      </div>

      {note && <p className="bg-card border-line text-ink rounded-xl border px-3 py-2 text-sm font-semibold">{note}</p>}

      {/* Command center stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="המלצות פתוחות" value={cc.total} tone="text-brand-strong" />
        <Stat label="עדיפות גבוהה" value={cc.highPriority} tone="text-warning" />
        <Stat label="חבילות מוכנות" value={cc.readyPackages} tone="text-brand-strong" />
        <Stat label="הכנסה צפויה" money={cc.expectedRevenue} tone="text-success" />
        <Stat label="אושרו" value={cc.accepted} tone="text-success" />
        <Stat label="הומרו" value={cc.converted} tone="text-success" />
        <Stat label="חסר דאטה" value={cc.needsMoreData} tone="text-danger" />
      </div>

      {/* Top recommendations */}
      <Section title="ההמלצות המובילות" icon="Sparkles">
        {cc.top.length === 0 ? <Empty /> : (
          <div className="flex flex-col gap-2">
            {cc.top.map((r) => (
              <RecCard key={r.id} r={r} busy={pending && busyId === r.id}
                onApprove={() => act(r.id, () => approveRecommendationAction(r.id))}
                onReject={() => act(r.id, () => rejectRecommendationAction(r.id))}
                onConvert={() => act(r.id, () => markRecommendationConvertedAction(r.id))}
                onTask={() => act(r.id, () => createTaskFromRecommendationAction(r.id))} />
            ))}
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* By type */}
        <Section title="לפי סוג" icon="BarChart3">
          {cc.byType.length === 0 ? <Empty /> : (
            <div className="flex flex-col gap-1.5">
              {cc.byType.map((t) => (
                <div key={t.type} className="flex items-center justify-between text-sm">
                  <span className="text-ink font-semibold">{TYPE_LABELS[t.type] ?? t.type}</span>
                  <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-xs font-bold">{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Needs more data */}
        <Section title="דורש השלמת דאטה" icon="AlertTriangle">
          {cc.needsData.length === 0 ? <Empty /> : (
            <div className="flex flex-col gap-1.5">
              {cc.needsData.map((r) => (
                <div key={r.id} className="border-line border-b pb-1.5 text-sm last:border-0">
                  <p className="text-ink font-semibold">{r.title_hebrew}</p>
                  <p className="text-muted text-[12px]">{r.reason_hebrew}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Recently converted */}
      {cc.recentlyConverted.length > 0 && (
        <Section title="הומרו לאחרונה" icon="Handshake">
          <div className="flex flex-col gap-1.5">
            {cc.recentlyConverted.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-ink font-semibold">{r.title_hebrew}</span>
                <span className="text-success text-xs font-bold">{fmtMoney(r.expected_revenue)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function RecCard({ r, busy, onApprove, onReject, onConvert, onTask }: {
  r: RecommendationView; busy: boolean;
  onApprove: () => void; onReject: () => void; onConvert: () => void; onTask: () => void;
}) {
  return (
    <div className="bg-card border-line rounded-[16px] border p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[10px] font-bold">{TYPE_LABELS[r.recommendation_type] ?? r.recommendation_type}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", CONF_TONE[r.source_confidence] ?? "bg-surface text-muted")}>ביטחון: {CONF_LABEL[r.source_confidence] ?? r.source_confidence}</span>
          </div>
          <p className="text-ink text-sm font-extrabold">{r.title_hebrew}</p>
          <p className="text-muted mt-0.5 text-[12px]">{r.reason_hebrew}</p>
          {r.next_best_action_hebrew && <p className="text-brand-strong mt-1 text-[12px] font-semibold">→ {r.next_best_action_hebrew}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-brand-strong text-lg font-black">{r.recommendation_score}</span>
          {r.expected_revenue > 0 && <span className="text-success text-[11px] font-bold">{fmtMoney(r.expected_revenue)}</span>}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {busy && <Spinner size={14} />}
        <Button size="sm" onClick={onApprove} disabled={busy}>אשר</Button>
        <Button size="sm" variant="secondary" onClick={onTask} disabled={busy}>צור משימה</Button>
        <Button size="sm" variant="secondary" onClick={onConvert} disabled={busy}>הומר</Button>
        <Button size="sm" variant="danger" onClick={onReject} disabled={busy}>דחה</Button>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <p className="text-ink mb-3 flex items-center gap-1.5 text-sm font-extrabold"><Icon name={icon} size={16} className="text-brand" />{title}</p>
      {children}
    </div>
  );
}
function Empty() { return <p className="text-muted text-sm">אין נתונים עדיין. הפעל מחולל המלצות מתוך עמוד קונה/מוכר/נכס.</p>; }
function Stat({ label, value, money, tone }: { label: string; value?: number; money?: number; tone: string }) {
  return (
    <div className="bg-card border-line rounded-[16px] border p-2.5 text-center">
      <p className={cn("text-lg font-black", tone)}>{money != null ? fmtMoney(money) : fmt(value ?? 0)}</p>
      <p className="text-muted text-[10px] font-bold">{label}</p>
    </div>
  );
}
