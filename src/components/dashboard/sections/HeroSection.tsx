"use client";

import Link from "next/link";
import { heroAssistantMessage, mapPins } from "@/data/mock";
import { formatShekels } from "@/lib/utils";
import {
  DEAL_TYPE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
} from "@/lib/onboarding/options";
import { Icon } from "../Icon";
import { CityMap } from "../CityMap";
import { FloatingAssistant } from "../FloatingAssistant";
import { motion } from "../motion";
import { useCurrentUser, useDashboardData } from "../DashboardDataProvider";

function labelsFor(
  values: string[],
  options: { value: string; label: string }[],
): string {
  if (!values || values.length === 0) return "";
  const map = new Map(options.map((o) => [o.value, o.label]));
  return values.map((v) => map.get(v) ?? v).join(" · ");
}

function priceRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${formatShekels(min)}–${formatShekels(max)}`;
  if (max != null) return `עד ${formatShekels(max)}`;
  if (min != null) return `מ-${formatShekels(min)}`;
  return "לא הוגדר";
}

/** Hero "city command center" — now reflects the signed-in user's real context. */
export function HeroSection() {
  const user = useCurrentUser();
  const { localities, primaryLocality, localitiesCount, error } = useDashboardData();

  const firstName = user?.firstName?.trim();
  const greeting = firstName ? `בוקר טוב, ${firstName}` : "בוקר טוב";

  const propertyFocus = labelsFor(user?.propertyTypes ?? [], PROPERTY_TYPE_OPTIONS);
  const dealFocus = labelsFor(user?.dealTypes ?? [], DEAL_TYPE_OPTIONS);
  const hasLocalities = localitiesCount > 0;

  const stats = [
    { k: "עיר ראשית", v: primaryLocality ?? "—" },
    { k: "ערי פעילות", v: String(localitiesCount) },
    { k: "טווח מחיר", v: priceRange(user?.minPrice ?? null, user?.maxPrice ?? null) },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.4fr)]"
    >
      {/* Text block */}
      <div className="flex flex-col justify-center">
        <p className="text-muted flex items-center gap-2 text-sm font-semibold">
          {greeting}
          {user?.onboardingCompleted && (
            <span className="bg-success-soft text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold">
              <Icon name="UserCheck" size={11} strokeWidth={2.4} />
              הפרופיל הוקם
            </span>
          )}
        </p>

        <h1 className="text-ink mt-2 text-3xl font-black leading-[1.15] sm:text-4xl">
          אזורי הפעילות שלך
        </h1>

        {error ? (
          <p className="text-danger mt-3 max-w-md text-base leading-relaxed">
            לא ניתן לטעון את הנתונים כעת. נסה/י לרענן את הדף.
          </p>
        ) : hasLocalities ? (
          <p className="text-muted mt-3 max-w-md text-base leading-relaxed">
            {primaryLocality && (
              <>
                עיר ראשית <span className="text-brand font-bold">{primaryLocality}</span>
                {localitiesCount > 1 && <> ועוד {localitiesCount - 1} ערים</>}.{" "}
              </>
            )}
            {propertyFocus && <>מיקוד: {propertyFocus}. </>}
            {dealFocus && <>סוג עסקה: {dealFocus}.</>}
          </p>
        ) : (
          <p className="text-muted mt-3 max-w-md text-base leading-relaxed">
            עדיין לא הוגדרו אזורי פעילות. אפשר להוסיף אותם דרך ההגדרות.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/command" className="bg-brand hover:bg-brand-strong inline-flex h-12 items-center gap-2 rounded-2xl px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(124,58,237,0.32)] transition">
            <Icon name="Sparkles" size={18} strokeWidth={2.1} />
            צפה בהזדמנויות
          </Link>
          <Link href="/market" className="bg-card border-line text-ink hover:border-brand-light inline-flex h-12 items-center gap-2 rounded-2xl border px-5 text-sm font-bold transition">
            <Icon name="Map" size={18} />
            סרוק שוק היום
          </Link>
        </div>

        {/* live stat row — real operating-area data */}
        <div className="mt-7 flex flex-wrap gap-x-7 gap-y-2">
          {stats.map((s) => (
            <div key={s.k}>
              <p className="text-ink text-xl font-black">{s.v}</p>
              <p className="text-muted text-xs font-medium">{s.k}</p>
            </div>
          ))}
        </div>

        {/* selected localities chips (empty-state aware) */}
        {hasLocalities && (
          <div className="mt-5 flex flex-wrap gap-2">
            {localities.map((l) => (
              <span
                key={l.name}
                className={
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold " +
                  (l.isPrimary
                    ? "bg-brand text-white"
                    : "bg-brand-soft text-brand-strong")
                }
              >
                {l.isPrimary && "★ "}
                {l.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Map — decorative (still mock) */}
      <div className="relative h-[340px] overflow-hidden rounded-[26px] border border-line bg-card shadow-[0_20px_50px_rgba(124,58,237,0.12)] sm:h-[420px]">
        <CityMap pins={mapPins} />
        <FloatingAssistant
          message={heroAssistantMessage}
          className="absolute bottom-4 end-4"
        />
      </div>
    </motion.section>
  );
}
