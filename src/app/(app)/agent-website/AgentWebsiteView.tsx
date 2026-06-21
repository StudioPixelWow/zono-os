"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button, Spinner } from "@/components/ui/Button";
import type { AgentWebsiteConfig, AgentWebsiteAnalytics } from "@/lib/agent-website/service";
import {
  createAgentWebsiteAction, updateAgentWebsiteAction, publishAgentWebsiteAction,
  unpublishAgentWebsiteAction, toggleAgentSectionAction,
} from "@/lib/agent-website/actions";

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero", buyer_request: "בקשת קונה", valuation: "הערכת שווי", featured_properties: "נכסים נבחרים",
  why_me: "למה לעבוד איתי", testimonials: "המלצות", projects: "פרויקטים", market_expertise: "אזורי התמחות",
  recent_transactions: "עסקאות אחרונות", contact: "צור קשר",
};
const fmt = (n: number) => n.toLocaleString("he-IL");

export function AgentWebsiteView({ config, analytics }: { config: AgentWebsiteConfig | null; analytics: AgentWebsiteAnalytics | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState({
    display_name: config?.display_name ?? "", title_hebrew: config?.title_hebrew ?? "", headline_hebrew: config?.headline_hebrew ?? "",
    bio_hebrew: config?.bio_hebrew ?? "", phone: config?.phone ?? "", whatsapp: config?.whatsapp ?? "", email: config?.email ?? "",
    profile_image_url: config?.profile_image_url ?? "", service_areas: (config?.service_areas ?? []).join(", "),
  });

  const run = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => {
    setNote(null); start(async () => { const r = await fn(); setNote(r.error ?? r.message ?? null); router.refresh(); });
  };
  const save = () => run(() => updateAgentWebsiteAction({ ...form, service_areas: form.service_areas.split(",").map((s) => s.trim()).filter(Boolean) }));

  const publicUrl = config?.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/agent/${config.slug}` : null;
  const copyLink = () => { if (publicUrl) navigator.clipboard?.writeText(publicUrl).then(() => setNote("הקישור הועתק: " + publicUrl)); };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Agent Website Generator</p>
          <h1 className="text-ink mt-1 text-2xl font-black">האתר האישי שלי</h1>
          <p className="text-muted mt-1 text-sm">אתר אישי שמתעדכן אוטומטית מ-ZONO: הנכסים שלך, האזורים שלך, עסקאות ולידים — ישירות אליך.</p>
        </div>
        <div className="flex items-center gap-2">{pending && <Spinner size={15} />}{!config && <Button onClick={() => run(createAgentWebsiteAction)} disabled={pending} leadingIcon={<Icon name="Send" size={16} />}>צור אתר אישי</Button>}</div>
      </div>

      {note && <p className="bg-card border-line text-ink rounded-xl border px-3 py-2 text-sm font-semibold break-all">{note}</p>}

      {!config ? (
        <div className="bg-card border-line rounded-[20px] border p-6 text-center"><p className="text-muted text-sm">עדיין אין אתר אישי. לחץ ״צור אתר אישי״ — והאתר ייבנה אוטומטית מהפרופיל והנכסים שלך.</p></div>
      ) : (
        <>
          <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-[20px] border p-4">
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", config.status === "published" ? "bg-success-soft text-success" : config.status === "disabled" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>{config.status === "published" ? "פורסם" : config.status === "disabled" ? "מושבת" : "טיוטה"}</span>
              <span className="text-muted text-[12px]">{config.view_count} צפיות</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer" className="text-brand-strong text-[12px] font-bold">תצוגה מקדימה ↗</a>}
              <Button size="sm" variant="secondary" onClick={copyLink} disabled={pending}>העתק קישור</Button>
              {config.status !== "published" ? <Button size="sm" onClick={() => run(publishAgentWebsiteAction)} disabled={pending}>פרסם אתר</Button> : <Button size="sm" variant="secondary" onClick={() => run(unpublishAgentWebsiteAction)} disabled={pending}>השבת</Button>}
            </div>
          </div>

          {analytics && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="מבקרים" value={analytics.visitors} tone="text-brand-strong" />
              <Stat label="לידים" value={analytics.leads} tone="text-success" />
              <Stat label="צפיות נכסים" value={analytics.propertyViews} tone="text-brand-strong" />
              <Stat label="WhatsApp" value={analytics.whatsappClicks} tone="text-success" />
              <Stat label="הערכות שווי" value={analytics.valuationRequests} tone="text-brand-strong" />
              <Stat label="המרה %" value={analytics.conversionRate} tone="text-warning" />
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="bg-card border-line rounded-[20px] border p-4">
              <p className="text-ink mb-3 text-sm font-extrabold">הפרופיל שלי</p>
              <div className="flex flex-col gap-2.5">
                {([["display_name", "שם"], ["title_hebrew", "תפקיד"], ["headline_hebrew", "כותרת"], ["bio_hebrew", "ביו"], ["phone", "טלפון"], ["whatsapp", "WhatsApp"], ["email", "אימייל"], ["profile_image_url", "תמונת פרופיל (URL)"], ["service_areas", "אזורי פעילות (מופרד בפסיקים)"]] as const).map(([k, label]) => (
                  <label key={k} className="block"><span className="text-muted text-[11px] font-bold">{label}</span><input className="border-line bg-surface mt-0.5 w-full rounded-xl border px-3 py-2 text-sm" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
                ))}
                <Button size="sm" onClick={save} disabled={pending}>שמור שינויים</Button>
              </div>
            </div>
            <div className="bg-card border-line rounded-[20px] border p-4">
              <p className="text-ink mb-3 text-sm font-extrabold">סקשנים באתר</p>
              <div className="flex flex-col gap-1.5">{Object.keys(SECTION_LABELS).map((key) => {
                const enabled = config.enabled_sections?.[key] !== false;
                return (
                  <div key={key} className="border-line flex items-center justify-between border-b py-1.5 last:border-0">
                    <span className="text-ink text-sm font-semibold">{SECTION_LABELS[key]}</span>
                    <button onClick={() => run(() => toggleAgentSectionAction(key, !enabled))} disabled={pending} className={cn("rounded-full px-3 py-1 text-[11px] font-bold", enabled ? "bg-success-soft text-success" : "bg-surface text-muted")}>{enabled ? "מוצג" : "מוסתר"}</button>
                  </div>
                );
              })}</div>
            </div>
          </div>

          {analytics && analytics.recentLeads.length > 0 && (
            <div className="bg-card border-line rounded-[20px] border p-4">
              <p className="text-ink mb-2 text-sm font-extrabold">פניות אחרונות מהאתר</p>
              <div className="flex flex-col gap-1.5">{analytics.recentLeads.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-sm"><span className="text-ink font-semibold">{l.full_name ?? "פנייה"} · {l.phone ?? "—"}</span><span className="text-muted text-[11px]">{l.source_section} · {new Date(l.created_at).toLocaleDateString("he-IL")}</span></div>
              ))}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="bg-card border-line rounded-[16px] border p-2.5 text-center"><p className={cn("text-lg font-black", tone)}>{fmt(value)}</p><p className="text-muted text-[10px] font-bold">{label}</p></div>;
}
