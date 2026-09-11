"use client";

import { useState, useTransition } from "react";
import {
  completeOnboarding,
  type OnboardingPayload,
} from "@/lib/onboarding/actions";
import {
  DEAL_TYPE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  ROLE_OPTIONS,
} from "@/lib/onboarding/options";
import {
  LocalityAutocomplete,
  type SelectedLocality,
} from "@/components/onboarding/LocalityAutocomplete";
import type { ListingKind, PropertyType } from "@/lib/supabase/types";

const TOTAL_STEPS = 7;
const STEP_TITLES = [
  "הארגון שלך",
  "פרטים אישיים",
  "התפקיד שלך",
  "ערי פעילות",
  "מיקוד נכסים",
  "טווחי מחיר",
  "סיום",
];

const input =
  "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";
const label = "text-muted text-xs font-semibold";

interface WizardForm {
  organizationName: string;
  organizationLogoUrl: string;
  organizationPhone: string;
  organizationEmail: string;
  fullName: string;
  phone: string;
  jobTitle: string;
  roleKey: string;
  localities: SelectedLocality[];
  propertyTypes: PropertyType[];
  dealTypes: ListingKind[];
  minPrice: number | null;
  maxPrice: number | null;
  minRooms: number | null;
  maxRooms: number | null;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3.5 py-2 text-sm font-semibold transition " +
        (active
          ? "bg-brand border-brand text-white"
          : "bg-card border-line text-ink hover:border-brand-light")
      }
    >
      {children}
    </button>
  );
}

// ── Price / rooms range bounds ──────────────────────────────────────────────
const PRICE_MIN = 1_000_000;
const PRICE_MAX = 6_000_000;
const PRICE_STEP = 50_000;
const ROOMS_MIN = 1;
const ROOMS_MAX = 10;
const ROOMS_STEP = 0.5;
const ilsFmt = new Intl.NumberFormat("he-IL");
const fmtPrice = (v: number): string => {
  if (v >= 1_000_000) return `₪${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  return `₪${ilsFmt.format(v)}`;
};

/** Draggable dual-handle range slider (RTL-safe: the track runs LTR — low on the
 *  left, high on the right — with the value labels above in the page's RTL flow). */
function DualRange({
  min, max, step, valueMin, valueMax, onChange, format, atMaxSuffix,
}: {
  min: number; max: number; step: number;
  valueMin: number | null; valueMax: number | null;
  onChange: (lo: number, hi: number) => void;
  format: (v: number) => string;
  atMaxSuffix?: string;
}) {
  const lo = Math.min(Math.max(valueMin ?? min, min), max);
  const hi = Math.min(Math.max(valueMax ?? max, min), max);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const setLo = (v: number) => onChange(Math.min(v, hi), hi);
  const setHi = (v: number) => onChange(lo, Math.max(v, lo));
  return (
    <div>
      {/* labels LTR so the low value sits above the left handle and high above the right */}
      <div dir="ltr" className="mb-2 flex items-center justify-between text-sm font-bold text-ink">
        <span>{format(lo)}</span>
        <span>{format(hi)}{atMaxSuffix && hi >= max ? atMaxSuffix : ""}</span>
      </div>
      <div dir="ltr" className="dr-wrap relative h-8 select-none">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-surface">
          <div className="bg-brand absolute h-2 rounded-full" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        </div>
        <input type="range" min={min} max={max} step={step} value={lo}
          onChange={(e) => setLo(Number(e.target.value))} className="dr-input" aria-label="מינימום" />
        <input type="range" min={min} max={max} step={step} value={hi}
          onChange={(e) => setHi(Number(e.target.value))} className="dr-input" aria-label="מקסימום" />
      </div>
    </div>
  );
}

export function OnboardingWizard({
  email,
  defaultFullName,
  defaultOrgName = "",
  defaultLocalities = [],
}: {
  email: string;
  defaultFullName: string;
  // Prefilled from the /start landing (stashed in user metadata at signup) so a
  // user who signed up there lands near-complete and reaches the dashboard fast.
  defaultOrgName?: string;
  defaultLocalities?: SelectedLocality[];
}) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState<WizardForm>({
    organizationName: defaultOrgName,
    organizationLogoUrl: "",
    organizationPhone: "",
    organizationEmail: email,
    fullName: defaultFullName,
    phone: "",
    jobTitle: "",
    roleKey: "owner",
    localities: defaultLocalities,
    propertyTypes: [],
    dealTypes: [],
    minPrice: PRICE_MIN,
    maxPrice: PRICE_MAX,
    minRooms: ROOMS_MIN,
    maxRooms: ROOMS_MAX,
  });

  const set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggle = <T,>(key: keyof WizardForm, value: T) =>
    setForm((f) => {
      const arr = (f[key] as T[]) ?? [];
      const next = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value];
      return { ...f, [key]: next };
    });

  const canContinue = (() => {
    switch (step) {
      case 1:
        return form.organizationName.trim().length > 1;
      case 2:
        return form.fullName.trim().length > 1;
      case 3:
        return !!form.roleKey;
      case 4:
        return form.localities.length > 0;
      default:
        return true;
    }
  })();

  const next = () => {
    setError(null);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };
  const back = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const finish = () => {
    setError(null);
    const payload: OnboardingPayload = {
      organizationName: form.organizationName,
      organizationLogoUrl: form.organizationLogoUrl,
      organizationPhone: form.organizationPhone,
      organizationEmail: form.organizationEmail,
      fullName: form.fullName,
      phone: form.phone,
      jobTitle: form.jobTitle,
      roleKey: form.roleKey,
      localities: form.localities.map((l) => ({
        localityId: l.localityId,
        nameHe: l.nameHe,
        isPrimary: l.isPrimary,
      })),
      propertyTypes: form.propertyTypes,
      dealTypes: form.dealTypes,
      minPrice: form.minPrice,
      maxPrice: form.maxPrice,
      minRooms: form.minRooms,
      maxRooms: form.maxRooms,
      notificationPreferences: { email: true, inApp: true },
    };
    startTransition(async () => {
      const res = await completeOnboarding(payload);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="bg-card border-line rounded-[28px] border p-6 shadow-[var(--shadow-card)] sm:p-8">
      <style>{`
        .dr-input{position:absolute;top:0;left:0;width:100%;height:2rem;margin:0;background:transparent;-webkit-appearance:none;appearance:none;pointer-events:none}
        .dr-input:focus{outline:none}
        .dr-input::-webkit-slider-runnable-track{background:transparent;height:2rem}
        .dr-input::-moz-range-track{background:transparent}
        .dr-input::-webkit-slider-thumb{-webkit-appearance:none;pointer-events:auto;height:22px;width:22px;border-radius:9999px;background:#fff;border:3px solid var(--brand,#7c3aed);box-shadow:0 2px 8px rgba(76,29,149,.35);cursor:grab;margin-top:5px}
        .dr-input::-webkit-slider-thumb:active{cursor:grabbing;transform:scale(1.08)}
        .dr-input::-moz-range-thumb{pointer-events:auto;height:22px;width:22px;border-radius:9999px;background:#fff;border:3px solid var(--brand,#7c3aed);box-shadow:0 2px 8px rgba(76,29,149,.35);cursor:grab}
      `}</style>
      {/* Progress */}
      <div className="mb-6">
        <div className="text-muted mb-2 flex items-center justify-between text-xs font-semibold">
          <span>
            שלב {step} מתוך {TOTAL_STEPS}
          </span>
          <span className="text-brand">{STEP_TITLES[step - 1]}</span>
        </div>
        <div className="bg-surface h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-brand h-full rounded-full transition-all"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <p className="bg-danger-soft text-danger mb-4 rounded-xl px-3 py-2 text-xs font-semibold">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {step === 1 && (
          <>
            <h2 className="text-ink text-lg font-extrabold">צור/י את הארגון שלך</h2>
            <label className="block">
              <span className={label}>שם הארגון / הסוכנות *</span>
              <input
                className={`${input} mt-1`}
                value={form.organizationName}
                onChange={(e) => set("organizationName", e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>טלפון משרד</span>
              <input
                className={`${input} mt-1`}
                value={form.organizationPhone}
                onChange={(e) => set("organizationPhone", e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>אימייל ארגון</span>
              <input
                dir="ltr"
                className={`${input} mt-1`}
                value={form.organizationEmail}
                onChange={(e) => set("organizationEmail", e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>לוגו (קישור)</span>
              <input
                dir="ltr"
                className={`${input} mt-1`}
                value={form.organizationLogoUrl}
                onChange={(e) => set("organizationLogoUrl", e.target.value)}
              />
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-ink text-lg font-extrabold">הפרטים שלך</h2>
            <label className="block">
              <span className={label}>שם מלא *</span>
              <input
                className={`${input} mt-1`}
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>אימייל</span>
              <input dir="ltr" disabled className={`${input} mt-1 opacity-70`} value={email} />
            </label>
            <label className="block">
              <span className={label}>טלפון</span>
              <input
                className={`${input} mt-1`}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>תפקיד / כותרת</span>
              <input
                className={`${input} mt-1`}
                value={form.jobTitle}
                onChange={(e) => set("jobTitle", e.target.value)}
              />
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-ink text-lg font-extrabold">מה התפקיד שלך?</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ROLE_OPTIONS.map((r) => (
                <button
                  type="button"
                  key={r.key}
                  onClick={() => set("roleKey", r.key)}
                  className={
                    "rounded-2xl border p-4 text-start transition " +
                    (form.roleKey === r.key
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-card hover:border-brand-light")
                  }
                >
                  <p className="text-ink text-sm font-bold">{r.label}</p>
                  <p className="text-muted text-xs">{r.hint}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-ink text-lg font-extrabold">ערי / יישובי פעילות</h2>
            <p className="text-muted text-sm">
              חפש/י לפי שם בעברית, אפשר לבחור כמה ערים ולסמן עיר ראשית.
            </p>
            <LocalityAutocomplete
              value={form.localities}
              onChange={(v) => set("localities", v)}
            />
          </>
        )}

        {step === 5 && (
          <>
            <h2 className="text-ink text-lg font-extrabold">מיקוד נכסים</h2>
            <div>
              <p className={`${label} mb-2`}>סוגי נכסים</p>
              <div className="flex flex-wrap gap-2">
                {PROPERTY_TYPE_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    active={form.propertyTypes.includes(o.value)}
                    onClick={() => toggle<PropertyType>("propertyTypes", o.value)}
                  >
                    {o.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className={`${label} mb-2`}>סוגי עסקאות</p>
              <div className="flex flex-wrap gap-2">
                {DEAL_TYPE_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    active={form.dealTypes.includes(o.value)}
                    onClick={() => toggle<ListingKind>("dealTypes", o.value)}
                  >
                    {o.label}
                  </Chip>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <h2 className="text-ink text-lg font-extrabold">טווחי מחיר וחדרים</h2>
            <p className="text-muted -mt-2 text-xs">גררו את הידיות כדי להגדיר את הטווח שמעניין אתכם.</p>
            <div className="mt-2">
              <span className={label}>טווח מחיר (₪)</span>
              <div className="mt-3">
                <DualRange
                  min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP}
                  valueMin={form.minPrice} valueMax={form.maxPrice}
                  onChange={(lo, hi) => setForm((f) => ({ ...f, minPrice: lo, maxPrice: hi }))}
                  format={fmtPrice}
                  atMaxSuffix="+"
                />
              </div>
            </div>
            <div className="mt-5">
              <span className={label}>טווח חדרים</span>
              <div className="mt-3">
                <DualRange
                  min={ROOMS_MIN} max={ROOMS_MAX} step={ROOMS_STEP}
                  valueMin={form.minRooms} valueMax={form.maxRooms}
                  onChange={(lo, hi) => setForm((f) => ({ ...f, minRooms: lo, maxRooms: hi }))}
                  format={(v) => `${v}`}
                  atMaxSuffix="+"
                />
              </div>
            </div>
          </>
        )}

        {step === 7 && (
          <>
            <h2 className="text-ink text-lg font-extrabold">סיכום</h2>
            <ul className="text-ink flex flex-col gap-1.5 text-sm">
              <li>
                <span className="text-muted">ארגון: </span>
                {form.organizationName || "—"}
              </li>
              <li>
                <span className="text-muted">שם: </span>
                {form.fullName || "—"}
              </li>
              <li>
                <span className="text-muted">תפקיד: </span>
                {ROLE_OPTIONS.find((r) => r.key === form.roleKey)?.label}
              </li>
            </ul>

            <div>
              <p className={`${label} mb-2`}>ערי פעילות שנבחרו ({form.localities.length})</p>
              <div className="flex flex-wrap gap-2">
                {form.localities.map((l) => (
                  <span
                    key={l.localityId}
                    className={
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold " +
                      (l.isPrimary
                        ? "bg-brand text-white"
                        : "bg-brand-soft text-brand-strong")
                    }
                  >
                    {l.isPrimary && "★ "}
                    {l.nameHe}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-muted text-xs">
              לחיצה על &quot;סיום&quot; תיצור את הארגון ותיכנס לדאשבורד.
            </p>
          </>
        )}
      </div>

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          disabled={step === 1 || pending}
          className="text-muted hover:text-ink text-sm font-bold transition disabled:opacity-40"
        >
          חזרה
        </button>

        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={next}
            disabled={!canContinue}
            className="bg-brand hover:bg-brand-strong inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-white transition disabled:opacity-50"
          >
            המשך
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={pending}
            className="bg-brand hover:bg-brand-strong inline-flex h-11 items-center justify-center rounded-xl px-6 text-sm font-bold text-white transition disabled:opacity-60"
          >
            {pending ? "שומר…" : "סיום וכניסה לדאשבורד"}
          </button>
        )}
      </div>
    </div>
  );
}
