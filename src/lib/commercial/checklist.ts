// ============================================================================
// 💳 ZONO OS 2.0 — Batch 6.4 · COMMERCIAL — first-login checklist (server, Part 3).
//
// Guided onboarding progress. Each step is DETECTED from existing org state
// (never a new engine) via the RLS client, so it is org-scoped and read-only.
// Returns the steps + progress percentage (= completion score).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { ChecklistStep, OnboardingChecklist } from "./types";

const STEPS: { key: ChecklistStep["key"]; label: string; href: string }[] = [
  { key: "upload_logo", label: "העלאת לוגו", href: "/settings" },
  { key: "invite_agents", label: "הזמנת סוכנים", href: "/team" },
  { key: "connect_google", label: "חיבור Google", href: "/settings" },
  { key: "connect_whatsapp", label: "חיבור WhatsApp", href: "/whatsapp" },
  { key: "connect_facebook", label: "חיבור Facebook", href: "/facebook" },
  { key: "choose_areas", label: "בחירת אזורי פעילות", href: "/territories" },
  { key: "first_buyer", label: "יצירת קונה ראשון", href: "/buyers/new" },
  { key: "first_property", label: "יצירת נכס ראשון", href: "/properties/new" },
];

async function count(table: string): Promise<number> {
  try {
    const db = await createClient();
    const { count: n } = await db.from(table as never).select("id", { count: "exact", head: true });
    return n ?? 0;
  } catch { return 0; }
}

export async function getOnboardingChecklist(): Promise<OnboardingChecklist> {
  const sc = await getSessionContext();
  const org = sc.organization as { logo_url?: string | null; operating_cities?: string[] | null; settings?: Record<string, unknown> } | null;
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const integrations = (settings.integrations ?? {}) as Record<string, unknown>;

  const [users, buyers, properties] = await Promise.all([count("users"), count("buyers"), count("properties")]);

  const doneMap: Record<ChecklistStep["key"], boolean> = {
    upload_logo: !!org?.logo_url,
    invite_agents: users > 1,
    connect_google: integrations.google === true,
    connect_whatsapp: integrations.whatsapp === true,
    connect_facebook: integrations.facebook === true,
    choose_areas: Array.isArray(org?.operating_cities) && (org?.operating_cities?.length ?? 0) > 0,
    first_buyer: buyers > 0,
    first_property: properties > 0,
  };

  const steps: ChecklistStep[] = STEPS.map((s) => ({ ...s, done: doneMap[s.key] }));
  const completed = steps.filter((s) => s.done).length;
  return { steps, completed, total: steps.length, percentage: Math.round((completed / steps.length) * 100) };
}
