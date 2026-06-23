"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  TEMPERATURE_LABELS,
  TEMPERATURE_TONES,
  PROPERTY_TYPE_LABELS,
} from "@/lib/buyers/labels";
import { buyerBudgetLine, type BuyerInsight, type FinancingRisk } from "@/lib/buyers/insights";
import { whatsappNumber, NextActionButton, MarkHandledButton } from "./buyerActions";

const FINANCING: Record<FinancingRisk, { tone: "danger" | "warning" | "success" | "neutral"; label: string }> = {
  high: { tone: "danger", label: "סיכון מימון גבוה" },
  medium: { tone: "warning", label: "סיכון מימון בינוני" },
  low: { tone: "success", label: "מימון תקין" },
  unknown: { tone: "neutral", label: "מימון לא ידוע" },
};

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted flex items-center gap-1.5 text-xs font-bold">
        <Icon name={icon} size={14} />
        {title}
      </div>
      {children}
    </div>
  );
}

export function BuyerDrawer({
  insight,
  onClose,
}: {
  insight: BuyerInsight | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {insight && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            dir="rtl"
            className="bg-surface fixed inset-y-0 left-0 z-[71] flex w-full max-w-md flex-col overflow-y-auto shadow-2xl"
          >
            <DrawerBody insight={insight} onClose={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({ insight, onClose }: { insight: BuyerInsight; onClose: () => void }) {
  const b = insight.buyer;
  const wa = whatsappNumber(b.phone);
  const fin = FINANCING[insight.financingRisk];
  const iconBtn =
    "grid h-10 w-10 place-items-center rounded-xl border border-line bg-card text-muted transition hover:text-brand-strong hover:border-brand-light";

  return (
    <>
      {/* Header */}
      <div className="bg-card border-line sticky top-0 z-10 flex items-start justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-3">
          <span className="bg-brand-soft text-brand-strong grid h-12 w-12 place-items-center rounded-2xl text-lg font-black">
            {b.full_name.trim().charAt(0) || "?"}
          </span>
          <div>
            <h3 className="text-ink text-lg font-black">{b.full_name}</h3>
            <div className="mt-0.5 flex items-center gap-1.5">
              {b.temperature && (
                <Badge tone={TEMPERATURE_TONES[b.temperature]} size="sm">
                  {TEMPERATURE_LABELS[b.temperature]}
                </Badge>
              )}
              <span className="text-muted text-xs">{insight.stageLabel}</span>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-ink grid h-9 w-9 place-items-center rounded-lg transition" aria-label="סגור">
          <Icon name="X" size={20} />
        </button>
      </div>

      <div className="flex flex-col gap-5 p-4">
        {/* Quick contact */}
        <div className="flex items-center gap-2">
          {b.phone && <a href={`tel:${b.phone}`} className={iconBtn} aria-label="התקשר"><Icon name="Phone" size={17} /></a>}
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="וואטסאפ"><Icon name="MessageCircle" size={17} /></a>}
          {b.email && <a href={`mailto:${b.email}`} className={iconBtn} aria-label="אימייל"><Icon name="Mail" size={17} /></a>}
          <div className="mr-auto"><MarkHandledButton buyerId={b.id} /></div>
        </div>

        {/* AI recommendation */}
        <div className="zono-ai-gradient rounded-[20px] p-4 text-white">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white/90">
            <Icon name="Sparkles" size={14} />
            מה כדאי לעשות עכשיו?
          </div>
          <p className="mt-1.5 text-sm font-bold leading-relaxed">{insight.urgencyReason}</p>
          <div className="mt-3"><NextActionButton insight={insight} size="md" className="w-full !bg-white !text-brand-strong" /></div>
        </div>

        {/* Budget + financing */}
        <Section title="תקציב ומימון" icon="Wallet">
          <div className="bg-card border-line flex items-center justify-between rounded-2xl border p-3">
            <span className="text-ink text-lg font-black">{buyerBudgetLine(b)}</span>
            <Badge tone={fin.tone}>{fin.label}</Badge>
          </div>
          <div className="text-muted flex items-center gap-1.5 text-xs">
            <Icon name={b.has_preapproval ? "CheckCircle2" : "Circle"} size={14} className={b.has_preapproval ? "text-success" : ""} />
            {b.has_preapproval ? "יש אישור עקרוני למשכנתא" : "אין אישור עקרוני למשכנתא"}
          </div>
        </Section>

        {/* Preferred areas */}
        <Section title="אזורים מועדפים" icon="MapPin">
          {b.preferred_areas.length ? (
            <div className="flex flex-wrap gap-1.5">
              {b.preferred_areas.map((a) => (
                <span key={a} className="bg-brand-soft text-brand-strong rounded-full px-2.5 py-1 text-xs font-semibold">{a}</span>
              ))}
            </div>
          ) : (
            <p className="text-muted text-sm">לא הוגדרו אזורים מועדפים</p>
          )}
        </Section>

        {/* Desired types */}
        <Section title="סוגי נכס רצויים" icon="Building2">
          {b.preferred_types.length ? (
            <div className="flex flex-wrap gap-1.5">
              {b.preferred_types.map((t) => (
                <span key={t} className="bg-surface border-line text-ink rounded-full border px-2.5 py-1 text-xs font-semibold">
                  {PROPERTY_TYPE_LABELS[t]}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted text-sm">לא הוגדרו סוגי נכס</p>
          )}
        </Section>

        {/* Matched properties */}
        <Section title="נכסים מתאימים" icon="Home">
          <Link
            href={`/buyers/${b.id}?tab=matches`}
            className="bg-card border-line hover:border-brand-light flex items-center justify-between rounded-2xl border p-3 transition"
          >
            <span className="text-ink text-sm font-bold">
              {insight.matchCount == null
                ? "טרם חושבו התאמות"
                : insight.matchCount === 0
                  ? "אין כרגע נכסים מתאימים"
                  : `${insight.matchCount} נכסים מתאימים בקטלוג`}
            </span>
            <Icon name="ChevronLeft" size={18} className="text-muted" />
          </Link>
        </Section>

        {/* Notes */}
        <Section title="הערות" icon="FileText">
          <p className={cn("text-sm leading-relaxed", b.notes ? "text-ink" : "text-muted")}>
            {b.notes || "אין הערות לקונה זה"}
          </p>
        </Section>

        {/* Footer actions */}
        <div className="grid grid-cols-2 gap-2 pb-2">
          <Link href={`/buyers/${b.id}`} className="contents">
            <Button variant="secondary" fullWidth leadingIcon={<Icon name="LayoutDashboard" size={16} />}>
              תיק קונה מלא
            </Button>
          </Link>
          <Link href={`/buyers/${b.id}/edit`} className="contents">
            <Button variant="ghost" fullWidth leadingIcon={<Icon name="Pencil" size={16} />}>
              עריכת קונה
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
