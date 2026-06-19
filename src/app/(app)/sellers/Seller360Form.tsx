"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import {
  CONTACT_METHOD_OPTIONS,
  DECISION_STYLE_OPTIONS,
  MOTIVATION_OPTIONS,
  SELLER_TYPE_OPTIONS,
  URGENCY_OPTIONS,
  type Seller360Input,
} from "@/lib/sellers/types";

const field = "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";
const label = "text-ink text-sm font-bold";

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name={icon} size={16} /></span>
        <h3 className="text-ink text-sm font-extrabold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
function Slider({ label: l, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="text-muted flex items-center justify-between text-xs font-semibold"><span>{l}</span><span className="text-brand-strong">{value}</span></span>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-brand mt-1 w-full" />
    </label>
  );
}
function Check({ checked, onClick, text }: { checked: boolean; onClick: () => void; text: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition", checked ? "bg-brand-soft border-brand-light text-brand-strong" : "bg-surface border-line text-muted hover:text-ink")}>
      <span className={cn("grid h-5 w-5 place-items-center rounded-md border text-[11px]", checked ? "bg-brand border-brand text-white" : "border-line")}>{checked ? "✓" : ""}</span>
      {text}
    </button>
  );
}

export function Seller360Form({
  initial,
  submitLabel,
  cancelHref,
  contextNote,
  onSubmit,
}: {
  initial?: Partial<Seller360Input>;
  submitLabel: string;
  cancelHref: string;
  contextNote?: string;
  onSubmit: (input: Seller360Input) => Promise<{ error?: string }>;
}) {
  const [v, setV] = useState<Seller360Input>({
    fullName: initial?.fullName ?? "",
    phone: initial?.phone ?? "",
    secondaryPhone: initial?.secondaryPhone ?? "",
    email: initial?.email ?? "",
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    sellerType: initial?.sellerType ?? "private_owner",
    motivationType: initial?.motivationType ?? "",
    motivationNotes: initial?.motivationNotes ?? "",
    urgencyLevel: initial?.urgencyLevel ?? "medium",
    targetSaleDate: initial?.targetSaleDate ?? "",
    mustSellBy: initial?.mustSellBy ?? "",
    desiredPrice: initial?.desiredPrice ?? null,
    minimumPrice: initial?.minimumPrice ?? null,
    dreamPrice: initial?.dreamPrice ?? null,
    mortgageExists: initial?.mortgageExists ?? false,
    mortgageBalance: initial?.mortgageBalance ?? null,
    financialNotes: initial?.financialNotes ?? "",
    decisionStyle: initial?.decisionStyle ?? "unknown",
    mainObjection: initial?.mainObjection ?? "",
    negotiationSensitivity: initial?.negotiationSensitivity ?? "",
    priceSensitivityScore: initial?.priceSensitivityScore ?? 50,
    timeSensitivityScore: initial?.timeSensitivityScore ?? 50,
    trustSensitivityScore: initial?.trustSensitivityScore ?? 50,
    marketingOpennessScore: initial?.marketingOpennessScore ?? 50,
    negotiationFlexibilityScore: initial?.negotiationFlexibilityScore ?? 50,
    cooperationScore: initial?.cooperationScore ?? 50,
    preferredContactMethod: initial?.preferredContactMethod ?? "phone",
    preferredContactTime: initial?.preferredContactTime ?? "",
    communicationNotes: initial?.communicationNotes ?? "",
    availableForShowings: initial?.availableForShowings ?? true,
    allowsMarketing: initial?.allowsMarketing ?? true,
    allowsSignage: initial?.allowsSignage ?? false,
    allowsExclusive: initial?.allowsExclusive ?? false,
    hasSignedAgreement: initial?.hasSignedAgreement ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Seller360Input>(k: K, val: Seller360Input[K]) => setV((s) => ({ ...s, [k]: val }));
  const num = (s: string): number | null => (s.trim() ? Number(s) : null);

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await onSubmit(v);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {contextNote && <p className="bg-brand-soft text-brand-strong rounded-2xl px-4 py-3 text-sm font-semibold">{contextNote}</p>}

      <Section title="פרטים בסיסיים" icon="UserCheck">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block"><span className={label}>שם מלא *</span><input className={cn(field, "mt-1")} value={v.fullName} onChange={(e) => set("fullName", e.target.value)} /></label>
          <label className="block"><span className={label}>טלפון</span><input className={cn(field, "mt-1")} dir="ltr" value={v.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></label>
          <label className="block"><span className={label}>טלפון נוסף</span><input className={cn(field, "mt-1")} dir="ltr" value={v.secondaryPhone ?? ""} onChange={(e) => set("secondaryPhone", e.target.value)} /></label>
          <label className="block"><span className={label}>אימייל</span><input className={cn(field, "mt-1")} dir="ltr" value={v.email ?? ""} onChange={(e) => set("email", e.target.value)} /></label>
          <label className="block"><span className={label}>עיר</span><input className={cn(field, "mt-1")} value={v.city ?? ""} onChange={(e) => set("city", e.target.value)} /></label>
          <label className="block"><span className={label}>כתובת</span><input className={cn(field, "mt-1")} value={v.address ?? ""} onChange={(e) => set("address", e.target.value)} /></label>
          <label className="block"><span className={label}>סוג מוכר</span><select className={cn(field, "mt-1")} value={v.sellerType ?? ""} onChange={(e) => set("sellerType", e.target.value)}>{SELLER_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        </div>
      </Section>

      <Section title="מוטיבציה ודחיפות" icon="Flame">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block"><span className={label}>סיבת מכירה</span><select className={cn(field, "mt-1")} value={v.motivationType ?? ""} onChange={(e) => set("motivationType", e.target.value)}><option value="">—</option>{MOTIVATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label className="block"><span className={label}>דחיפות</span><select className={cn(field, "mt-1")} value={v.urgencyLevel ?? ""} onChange={(e) => set("urgencyLevel", e.target.value)}>{URGENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label className="block"><span className={label}>תאריך יעד למכירה</span><input type="date" dir="ltr" className={cn(field, "mt-1")} value={v.targetSaleDate ?? ""} onChange={(e) => set("targetSaleDate", e.target.value)} /></label>
          <label className="block"><span className={label}>חייב למכור עד</span><input type="date" dir="ltr" className={cn(field, "mt-1")} value={v.mustSellBy ?? ""} onChange={(e) => set("mustSellBy", e.target.value)} /></label>
          <label className="block sm:col-span-3"><span className={label}>הערות מוטיבציה</span><textarea className={cn(field, "mt-1 h-20 py-2")} value={v.motivationNotes ?? ""} onChange={(e) => set("motivationNotes", e.target.value)} /></label>
        </div>
      </Section>

      <Section title="הקשר פיננסי" icon="BarChart3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block"><span className={label}>מחיר רצוי</span><input type="number" className={cn(field, "mt-1")} value={v.desiredPrice ?? ""} onChange={(e) => set("desiredPrice", num(e.target.value))} /></label>
          <label className="block"><span className={label}>מחיר מינימום</span><input type="number" className={cn(field, "mt-1")} value={v.minimumPrice ?? ""} onChange={(e) => set("minimumPrice", num(e.target.value))} /></label>
          <label className="block"><span className={label}>מחיר חלום</span><input type="number" className={cn(field, "mt-1")} value={v.dreamPrice ?? ""} onChange={(e) => set("dreamPrice", num(e.target.value))} /></label>
          <label className="block"><span className={label}>יתרת משכנתא</span><input type="number" className={cn(field, "mt-1")} value={v.mortgageBalance ?? ""} onChange={(e) => set("mortgageBalance", num(e.target.value))} /></label>
          <div className="flex items-end"><Check checked={!!v.mortgageExists} onClick={() => set("mortgageExists", !v.mortgageExists)} text="קיימת משכנתא" /></div>
          <label className="block sm:col-span-3"><span className={label}>הערות פיננסיות</span><textarea className={cn(field, "mt-1 h-20 py-2")} value={v.financialNotes ?? ""} onChange={(e) => set("financialNotes", e.target.value)} /></label>
        </div>
      </Section>

      <Section title="פסיכולוגיה ומשא ומתן" icon="TrendingUp">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block"><span className={label}>סגנון החלטה</span><select className={cn(field, "mt-1")} value={v.decisionStyle ?? ""} onChange={(e) => set("decisionStyle", e.target.value)}>{DECISION_STYLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label className="block"><span className={label}>התנגדות עיקרית</span><input className={cn(field, "mt-1")} value={v.mainObjection ?? ""} onChange={(e) => set("mainObjection", e.target.value)} /></label>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Slider label="רגישות מחיר" value={v.priceSensitivityScore ?? 50} onChange={(n) => set("priceSensitivityScore", n)} />
          <Slider label="רגישות זמן" value={v.timeSensitivityScore ?? 50} onChange={(n) => set("timeSensitivityScore", n)} />
          <Slider label="רגישות אמון" value={v.trustSensitivityScore ?? 50} onChange={(n) => set("trustSensitivityScore", n)} />
          <Slider label="פתיחות לשיווק" value={v.marketingOpennessScore ?? 50} onChange={(n) => set("marketingOpennessScore", n)} />
          <Slider label="גמישות במשא ומתן" value={v.negotiationFlexibilityScore ?? 50} onChange={(n) => set("negotiationFlexibilityScore", n)} />
          <Slider label="שיתוף פעולה" value={v.cooperationScore ?? 50} onChange={(n) => set("cooperationScore", n)} />
        </div>
      </Section>

      <Section title="העדפות תקשורת ותפעול" icon="MessageCircle">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block"><span className={label}>אמצעי קשר מועדף</span><select className={cn(field, "mt-1")} value={v.preferredContactMethod ?? ""} onChange={(e) => set("preferredContactMethod", e.target.value)}>{CONTACT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label className="block"><span className={label}>זמן קשר מועדף</span><input className={cn(field, "mt-1")} value={v.preferredContactTime ?? ""} onChange={(e) => set("preferredContactTime", e.target.value)} /></label>
          <label className="block"><span className={label}>הערות תקשורת</span><input className={cn(field, "mt-1")} value={v.communicationNotes ?? ""} onChange={(e) => set("communicationNotes", e.target.value)} /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Check checked={!!v.availableForShowings} onClick={() => set("availableForShowings", !v.availableForShowings)} text="זמין להצגות" />
          <Check checked={!!v.allowsMarketing} onClick={() => set("allowsMarketing", !v.allowsMarketing)} text="מאשר שיווק" />
          <Check checked={!!v.allowsSignage} onClick={() => set("allowsSignage", !v.allowsSignage)} text="מאשר שילוט" />
          <Check checked={!!v.allowsExclusive} onClick={() => set("allowsExclusive", !v.allowsExclusive)} text="מאשר בלעדיות" />
          <Check checked={!!v.hasSignedAgreement} onClick={() => set("hasSignedAgreement", !v.hasSignedAgreement)} text="הסכם חתום" />
        </div>
      </Section>

      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || !v.fullName.trim()}>{pending ? "שומר…" : submitLabel}</Button>
        <Link href={cancelHref} className="text-muted hover:text-ink self-center text-sm font-semibold">ביטול</Link>
      </div>
    </div>
  );
}
