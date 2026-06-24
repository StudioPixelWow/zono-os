"use client";

import { useMemo, useState } from "react";
import type { CenterGroup, CenterCampaign } from "@/lib/distribution/center-data";
import { createCampaignAction, selectGroupsAction } from "@/lib/distribution/center-actions";
import { cn } from "@/lib/utils";
import { Glass, SectionHeading, EmptyState, Icon, ils, compact } from "./shared";
import { AUDIENCE_LABEL, type AudienceKey, type PropertyLite } from "./variations";
import type { RunAction, RunActionAsync } from "./DistributionCenterView";

const AUDIENCES: AudienceKey[] = ["families", "investors", "young", "luxury", "commercial", "sellers"];
const GOALS: { key: string; label: string }[] = [
  { key: "leads", label: "איסוף לידים" },
  { key: "awareness", label: "חשיפה" },
  { key: "sale", label: "מכירת נכס" },
  { key: "sellers", label: "גיוס מוכרים" },
];

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "טיוטה", scheduled: "מתוזמן", active: "פעיל", paused: "מושהה", completed: "הושלם", archived: "בארכיון",
};

export function CampaignBuilderSection({
  groups,
  campaigns,
  properties,
  onGenerate,
  runAction,
  runActionAsync,
  pending,
}: {
  groups: CenterGroup[];
  campaigns: CenterCampaign[];
  properties: PropertyLite[];
  onGenerate: (campaignId: string, count: number) => void;
  runAction: RunAction;
  runActionAsync: RunActionAsync;
  pending: boolean;
}) {
  // Create-campaign form state
  const [name, setName] = useState("");
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [targetCity, setTargetCity] = useState("");
  const [audience, setAudience] = useState<AudienceKey | null>(null);
  const [goal, setGoal] = useState<string>("leads");
  const [count, setCount] = useState(12);

  // Group-selection flow state
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupCity, setGroupCity] = useState("");

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId) ?? null;

  const cityOptions = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) if (g.city) s.add(g.city);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "he"));
  }, [groups]);

  const groupOptions = useMemo(
    () => groups.filter((g) => (groupCity ? g.city === groupCity : true)),
    [groups, groupCity],
  );

  const field = "bg-card/70 border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition w-full";

  const toggleGroup = (id: string) =>
    setSelectedGroups((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));

  async function createCampaign() {
    if (!name.trim()) return;
    const res = await runActionAsync(
      () => createCampaignAction({
        name,
        propertyId: propertyId ?? undefined,
        targetCity: targetCity || undefined,
        targetAudience: audience ? AUDIENCE_LABEL[audience] : undefined,
        campaignGoal: goal || undefined,
      }),
      "הקמפיין נוצר — בחר קבוצות להפצה",
    );
    if (!res.error && res.campaignId) {
      setActiveCampaignId(res.campaignId);
      setSelectedGroups([]);
      setName("");
    }
  }

  function saveGroups() {
    if (!activeCampaignId || selectedGroups.length === 0) return;
    runAction(() => selectGroupsAction({ campaignId: activeCampaignId, groupIds: selectedGroups }), `${selectedGroups.length} קבוצות נבחרו לקמפיין`);
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="בניית קמפיין" subtitle="צור קמפיין הפצה, בחר קבוצות והפק וריאציות תוכן" icon="Megaphone" />

      {/* Step 1 — create campaign */}
      <Glass className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2.5">
          <span className="zono-ai-gradient grid h-8 w-8 place-items-center rounded-xl text-white text-sm font-black">1</span>
          <p className="text-ink text-sm font-extrabold">פרטי הקמפיין</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הקמפיין *" className={field} />
          <input value={targetCity} onChange={(e) => setTargetCity(e.target.value)} placeholder="עיר יעד" className={field} list="campaign-cities" />
          <datalist id="campaign-cities">{cityOptions.map((c) => <option key={c} value={c} />)}</datalist>
        </div>

        <div>
          <p className="text-muted mb-2 text-xs font-bold">קהל יעד</p>
          <div className="flex flex-wrap gap-2">
            {AUDIENCES.map((a) => (
              <button key={a} type="button" onClick={() => setAudience(a)}
                className={cn("rounded-full px-3.5 py-1.5 text-sm font-bold transition", audience === a ? "zono-gradient text-white" : "zono-glass text-ink")}>{AUDIENCE_LABEL[a]}</button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-muted mb-2 text-xs font-bold">מטרת הקמפיין</p>
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <button key={g.key} type="button" onClick={() => setGoal(g.key)}
                className={cn("rounded-full px-3.5 py-1.5 text-sm font-bold transition", goal === g.key ? "zono-gradient text-white" : "zono-glass text-ink")}>{g.label}</button>
            ))}
          </div>
        </div>

        {properties.length > 0 && (
          <div>
            <p className="text-muted mb-2 text-xs font-bold">נכס מקושר (אופציונלי)</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {properties.slice(0, 9).map((p) => (
                <button key={p.id} type="button" onClick={() => setPropertyId(propertyId === p.id ? null : p.id)}
                  className={cn("flex items-center gap-3 rounded-2xl border p-3 text-right transition", propertyId === p.id ? "border-brand bg-brand-soft" : "border-line bg-card/60 hover:border-brand-light")}>
                  <span className="bg-surface text-muted grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl">
                    {p.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <Icon name="Building2" size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-extrabold">{p.title}</p>
                    <p className="text-muted truncate text-[11px]">{[p.neighborhood, p.city].filter(Boolean).join(", ") || "—"}</p>
                    <p className="text-brand-strong text-xs font-black">{p.price ? ils(p.price) : "—"}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={pending || !name.trim()} onClick={createCampaign}
            className="btn-zono-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            <Icon name="Plus" size={16} /> צור קמפיין
          </button>

          {/* AI variations — generated for the ACTIVE campaign and saved to Supabase. */}
          <div className="flex items-center gap-2">
            <span className="text-muted text-xs font-bold">וריאציות:</span>
            <input type="range" min={4} max={20} step={2} value={count} onChange={(e) => setCount(Number(e.target.value))} className="accent-brand w-28" />
            <span className="text-brand-strong w-6 text-sm font-black tabular-nums">{count}</span>
            <button type="button" disabled={pending || !activeCampaignId}
              onClick={() => activeCampaignId && onGenerate(activeCampaignId, count)}
              className="zono-ai-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-50">
              <Icon name="Sparkles" size={16} /> צור {count} וריאציות AI
            </button>
          </div>
        </div>
        {!activeCampaignId && (
          <p className="text-muted text-[11px]">להפקת וריאציות AI — צור קמפיין (או בחר קיים בשלב 2). הוריאציות יישמרו לקמפיין וייטענו מה-DB.</p>
        )}
      </Glass>

      {/* Step 2 — group selection */}
      <Glass className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="zono-ai-gradient grid h-8 w-8 place-items-center rounded-xl text-white text-sm font-black">2</span>
            <div>
              <p className="text-ink text-sm font-extrabold">בחירת קבוצות להפצה</p>
              {activeCampaign && <p className="text-muted text-[11px]">קמפיין: {activeCampaign.name} · {CAMPAIGN_STATUS_LABEL[activeCampaign.status] ?? activeCampaign.status}</p>}
            </div>
          </div>
          {campaigns.length > 0 && (
            <select value={activeCampaignId ?? ""} onChange={(e) => { setActiveCampaignId(e.target.value || null); setSelectedGroups([]); }}
              className="bg-card/70 border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none">
              <option value="">בחר קמפיין...</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {groups.length === 0 ? (
          <EmptyState icon="Users" title="אין עדיין קבוצות" body="הוסף קבוצות פייסבוק בספריית הקבוצות כדי שתוכל לבחור אותן לקמפיין ההפצה." />
        ) : !activeCampaignId ? (
          <EmptyState icon="Megaphone" title="בחר או צור קמפיין" body="צור קמפיין למעלה, או בחר קמפיין קיים מהרשימה — ואז סמן את הקבוצות שבהן הוא יופץ." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select value={groupCity} onChange={(e) => setGroupCity(e.target.value)} className="bg-card/70 border-line text-ink h-9 rounded-xl border px-3 text-sm outline-none">
                <option value="">כל הערים</option>
                {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="text-muted text-xs font-semibold tabular-nums">{selectedGroups.length} נבחרו מתוך {groupOptions.length}</span>
              <button type="button" onClick={() => setSelectedGroups(groupOptions.map((g) => g.id))} className="text-brand-strong text-xs font-bold">בחר הכל</button>
              <button type="button" onClick={() => setSelectedGroups([])} className="text-muted text-xs font-bold">נקה</button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {groupOptions.map((g) => {
                const sel = selectedGroups.includes(g.id);
                return (
                  <button key={g.id} type="button" onClick={() => toggleGroup(g.id)}
                    className={cn("flex items-center justify-between gap-2 rounded-2xl border p-3 text-right transition", sel ? "border-brand bg-brand-soft" : "border-line bg-card/60 hover:border-brand-light")}>
                    <div className="min-w-0">
                      <p className="text-ink truncate text-sm font-bold">{g.name}</p>
                      <p className="text-muted text-[11px]">{[g.area, g.city].filter(Boolean).join(", ") || "—"} · {compact(g.membersCount)} חברים</p>
                    </div>
                    <Icon name={sel ? "CheckCircle2" : "Circle"} size={18} className={sel ? "text-brand" : "text-muted"} />
                  </button>
                );
              })}
            </div>

            <button type="button" disabled={pending || selectedGroups.length === 0} onClick={saveGroups}
              className="btn-zono-primary inline-flex items-center justify-center gap-2 self-start rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              <Icon name="Save" size={16} /> שמור {selectedGroups.length} קבוצות לקמפיין
            </button>
          </>
        )}
      </Glass>
    </div>
  );
}
