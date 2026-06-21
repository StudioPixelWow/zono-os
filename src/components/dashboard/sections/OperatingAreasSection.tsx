import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getMyOperatingAreas } from "@/lib/operating-areas/service";

/**
 * Compact dashboard prompt for the agent's operating areas: a setup card when
 * none exist, otherwise a one-line summary of active working cities. Best-effort
 * — never throws on the dashboard.
 */
export async function OperatingAreasSection() {
  let areas: Awaited<ReturnType<typeof getMyOperatingAreas>>["areas"] = [];
  try {
    areas = (await getMyOperatingAreas()).areas;
  } catch {
    return null;
  }
  const active = areas.filter((a) => a.isActive);

  if (active.length === 0) {
    return (
      <section className="px-4 sm:px-6">
        <Link href="/settings/operating-areas" className="bg-warning-soft border-warning/20 flex items-center justify-between gap-3 rounded-[20px] border p-4 transition-colors hover:brightness-[0.98]">
          <div className="flex items-center gap-3">
            <span className="bg-warning/15 text-warning grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name="MapPin" size={20} /></span>
            <div>
              <p className="text-ink text-sm font-extrabold">לא הוגדרו אזורי פעילות</p>
              <p className="text-muted text-[12px]">הוסף עיר כדי למשוך עסקאות, נכסים והמלצות.</p>
            </div>
          </div>
          <span className="text-warning text-sm font-bold">הוסף עיר ←</span>
        </Link>
      </section>
    );
  }

  const primary = active.find((a) => a.isPrimary) ?? active[0];
  const names = [primary, ...active.filter((a) => a.id !== primary.id)].map((a) => a.cityName);
  const label = active.length === 1 ? `עיר פעילות: ${names[0]}` : `ערי פעילות: ${names.join(", ")}`;

  return (
    <section className="px-4 sm:px-6">
      <Link href="/settings/operating-areas" className="bg-card border-line flex items-center justify-between gap-3 rounded-[20px] border p-3 transition-colors hover:brightness-[0.99]">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand-soft text-brand grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="MapPin" size={18} /></span>
          <p className="text-ink text-sm font-bold">{label}</p>
        </div>
        <span className="text-brand-strong text-[12px] font-bold">ניהול אזורי פעילות ←</span>
      </Link>
    </section>
  );
}
