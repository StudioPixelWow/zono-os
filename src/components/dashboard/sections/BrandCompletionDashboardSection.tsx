import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getBrandStudio } from "@/lib/brand-identity/service";
import { getSessionContext } from "@/lib/auth/session";
import { computeCompletion, type CompletionBreakdown } from "@/lib/brand-identity/engine";

async function loadCompletion(): Promise<CompletionBreakdown | null> {
  try {
    const { user } = await getSessionContext();
    if (!user) return null;
    const studio = await getBrandStudio("agent", user.id);
    const p = (studio.profile ?? {}) as Record<string, unknown>;
    return computeCompletion({ full_name: p.full_name as string, phone: p.phone as string, logo_url: p.logo_url as string, brand_primary: p.brand_primary as string, profile_image_url: p.profile_image_url as string, brand_style: p.brand_style as string });
  } catch (e) { console.error("[brand] completion widget failed:", e); return null; }
}

/** Brand completion score on the home dashboard (server component). */
export async function BrandCompletionDashboardSection() {
  const c = await loadCompletion();
  if (!c || c.score >= 100) return null; // fully set or unavailable — no nudge

  const items: [string, boolean][] = [["פרופיל", c.profileComplete], ["לוגו", c.logoUploaded], ["צבעים", c.colorsSelected], ["תמונה", c.profileImageUploaded], ["סגנון", c.styleSelected]];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Presentation" size={16} /></span>
          <h2 className="text-ink text-lg font-black">השלמת מותג</h2>
          <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{c.score}%</span>
        </div>
        <Link href="/settings/brand" className="text-brand-strong text-sm font-bold hover:underline">השלם מותג ←</Link>
      </div>
      <div className="bg-card border-line flex flex-wrap gap-2 rounded-2xl border p-3 shadow-sm">
        {items.map(([label, done]) => (
          <span key={label} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${done ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>
            <Icon name={done ? "UserCheck" : "Plus"} size={13} />{label}
          </span>
        ))}
      </div>
    </section>
  );
}
