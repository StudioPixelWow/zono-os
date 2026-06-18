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

export function OnboardingWizard({
  email,
  defaultFullName,
}: {
  email: string;
  defaultFullName: string;
}) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState<WizardForm>({
    organizationName: "",
    organizationLogoUrl: "",
    organizationPhone: "",
    organizationEmail: email,
    fullName: defaultFullName,
    phone: "",
    jobTitle: "",
    roleKey: "owner",
    localities: [],
    propertyTypes: [],
    dealTypes: [],
    minPrice: null,
    maxPrice: null,
    minRooms: null,
    maxRooms: null,
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
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={label}>מחיר מינ׳ (₪)</span>
                <input
                  type="number"
                  className={`${input} mt-1`}
                  value={form.minPrice ?? ""}
                  onChange={(e) =>
                    set("minPrice", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </label>
              <label className="block">
                <span className={label}>מחיר מקס׳ (₪)</span>
                <input
                  type="number"
                  className={`${input} mt-1`}
                  value={form.maxPrice ?? ""}
                  onChange={(e) =>
                    set("maxPrice", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </label>
              <label className="block">
                <span className={label}>חדרים מינ׳</span>
                <input
                  type="number"
                  step="0.5"
                  className={`${input} mt-1`}
                  value={form.minRooms ?? ""}
                  onChange={(e) =>
                    set("minRooms", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </label>
              <label className="block">
                <span className={label}>חדרים מקס׳</span>
                <input
                  type="number"
                  step="0.5"
                  className={`${input} mt-1`}
                  value={form.maxRooms ?? ""}
                  onChange={(e) =>
                    set("maxRooms", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </label>
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
