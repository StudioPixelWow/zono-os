"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { sellerPriceLine, type SellerInsight } from "@/lib/sellers/insights";
import { whatsappNumber, NextActionButton, MarkHandledButton } from "./sellerActions";

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

function ScoreTile({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "danger" }) {
  const bar = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-danger";
  const text = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-danger";
  return (
    <div className="bg-card border-line flex flex-col gap-1.5 rounded-2xl border p-3">
      <div className="flex items-center justify-between">
        <span className="text-muted text-xs font-bold">{label}</span>
        <span className={cn("text-lg font-black tabular-nums", text)}>{value}</span>
      </div>
      <div className="bg-line h-1.5 w-full overflow-hidden rounded-full">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function SellerDrawer({
  insight,
  onClose,
}: {
  insight: SellerInsight | null;
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

function DrawerBody({ insight, onClose }: { insight: SellerInsight; onClose: () => void }) {
  const s = insight.seller;
  const wa = whatsappNumber(s.phone);
  const iconBtn =
    "grid h-10 w-10 place-items-center rounded-xl border border-line bg-card text-muted transition hover:text-brand-strong hover:border-brand-light";
  const trustToneSimple = insight.trustTone === "success" ? "success" : insight.trustTone === "warning" ? "warning" : "danger";
  const churnToneSimple = insight.churnTone === "success" ? "success" : insight.churnTone === "danger" ? "danger" : "warning";

  return (
    <>
      {/* Header */}
      <div className="bg-card border-line sticky top-0 z-10 flex items-start justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-3">
          <span className="bg-brand-soft text-brand-strong grid h-12 w-12 place-items-center rounded-2xl text-lg font-black">
            {s.full_name.trim().charAt(0) || "?"}
          </span>
          <div>
            <h3 className="text-ink text-lg font-black">{s.full_name}</h3>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Badge tone={insight.isActive ? "success" : "neutral"} size="sm">{insight.statusLabel}</Badge>
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
          {s.phone && <a href={`tel:${s.phone}`} className={iconBtn} aria-label="התקשר"><Icon name="Phone" size={17} /></a>}
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="וואטסאפ"><Icon name="MessageCircle" size={17} /></a>}
          {s.email && <a href={`mailto:${s.email}`} className={iconBtn} aria-label="אימייל"><Icon name="Mail" size={17} /></a>}
          <div className="mr-auto"><MarkHandledButton sellerId={s.id} /></div>
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

        {/* Trust + churn scores */}
        <Section title="אמון וסיכון נטישה" icon="Activity">
          <div className="grid grid-cols-2 gap-2">
            <ScoreTile label="רמת אמון" value={insight.trustScore} tone={trustToneSimple} />
            <ScoreTile label="סיכון נטישה" value={insight.churnRisk} tone={churnToneSimple} />
          </div>
        </Section>

        {/* Price + financials */}
        <Section title="מחיר ופיננסים" icon="Wallet">
          <div className="bg-card border-line flex items-center justify-between rounded-2xl border p-3">
            <span className="text-ink text-lg font-black">{sellerPriceLine(s)}</span>
            {s.has_signed_agreement
              ? <Badge tone="success">יש הסכם חתום</Badge>
              : <Badge tone="warning">ללא הסכם</Badge>}
          </div>
          <div className="text-muted flex items-center gap-1.5 text-xs">
            <Icon name={s.mortgage_exists ? "CheckCircle2" : "Circle"} size={14} className={s.mortgage_exists ? "text-warning" : ""} />
            {s.mortgage_exists ? "קיימת משכנתא על הנכס" : "אין משכנתא"}
          </div>
        </Section>

        {/* Permissions */}
        <Section title="הרשאות שיווק" icon="Megaphone">
          <div className="flex flex-wrap gap-1.5">
            <PermPill ok={s.allows_marketing} label="שיווק" />
            <PermPill ok={s.allows_signage} label="שילוט" />
            <PermPill ok={s.allows_exclusive} label="בלעדיות" />
            <PermPill ok={s.available_for_showings} label="זמין לתצוגות" />
          </div>
        </Section>

        {/* Connected properties */}
        <Section title="נכסים מקושרים" icon="Home">
          <Link
            href={`/sellers/${s.id}`}
            className="bg-card border-line hover:border-brand-light flex items-center justify-between rounded-2xl border p-3 transition"
          >
            <span className="text-ink text-sm font-bold">
              {insight.propertyCount === 0
                ? "אין נכס משויך — שייך נכס למוכר"
                : `${insight.propertyCount} נכסים מקושרים`}
            </span>
            <Icon name={insight.propertyCount === 0 ? "Plus" : "ChevronLeft"} size={18} className="text-muted" />
          </Link>
        </Section>

        {/* Notes */}
        <Section title="הערות" icon="FileText">
          <p className={cn("text-sm leading-relaxed", s.notes ? "text-ink" : "text-muted")}>
            {s.notes || "אין הערות למוכר זה"}
          </p>
        </Section>

        {/* Footer actions */}
        <div className="grid grid-cols-2 gap-2 pb-2">
          <Link href={`/sellers/${s.id}`} className="contents">
            <Button variant="secondary" fullWidth leadingIcon={<Icon name="LayoutDashboard" size={16} />}>
              תיק מוכר מלא
            </Button>
          </Link>
          <Link href={`/sellers/${s.id}/edit`} className="contents">
            <Button variant="ghost" fullWidth leadingIcon={<Icon name="Pencil" size={16} />}>
              עריכת מוכר
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}

function PermPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        ok ? "bg-success-soft text-success" : "bg-line/60 text-muted",
      )}
    >
      <Icon name={ok ? "Check" : "X"} size={12} />
      {label}
    </span>
  );
}
