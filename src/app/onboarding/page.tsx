import { getAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./OnboardingWizard";
import type { SelectedLocality } from "@/components/onboarding/LocalityAutocomplete";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getAuthUser();
  const meta = (user?.user_metadata ?? {}) as {
    full_name?: string;
    office_name?: string;
    operating_cities?: string[];
  };

  // Prefill the operating cities the user chose on the /start landing: resolve
  // the Hebrew city names → real public.israel_localities rows so the wizard
  // opens with them already selected (first = primary). Best-effort: any name
  // that doesn't resolve is simply left for the user to pick.
  const cities = Array.isArray(meta.operating_cities)
    ? meta.operating_cities.filter((c) => typeof c === "string" && c.trim()).slice(0, 20)
    : [];
  let defaultLocalities: SelectedLocality[] = [];
  if (cities.length) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("israel_localities")
        .select("id, name_he, subdistrict")
        .in("name_he", cities)
        .eq("is_active", true);
      const rows = (data ?? []) as Array<{ id: string; name_he: string; subdistrict: string | null }>;
      const byName = new Map(rows.map((r) => [r.name_he, r]));
      defaultLocalities = cities
        .map((name, i): SelectedLocality | null => {
          const r = byName.get(name);
          return r
            ? { localityId: r.id, nameHe: r.name_he, subdistrict: r.subdistrict, isPrimary: i === 0 }
            : null;
        })
        .filter((l): l is SelectedLocality => l !== null);
      if (defaultLocalities.length && !defaultLocalities.some((l) => l.isPrimary)) {
        defaultLocalities[0].isPrimary = true;
      }
    } catch {
      /* best-effort prefill — the user can still pick cities in the wizard */
    }
  }

  return (
    <OnboardingWizard
      email={user?.email ?? ""}
      defaultFullName={meta.full_name ?? ""}
      defaultOrgName={meta.office_name ?? ""}
      defaultLocalities={defaultLocalities}
    />
  );
}
