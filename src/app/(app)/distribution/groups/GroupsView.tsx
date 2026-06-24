"use client";
// ============================================================================
// ZONO — Facebook Groups Distribution Engine UI (RTL, premium).
// Group registry · classification · real performance/lead scores · analytics ·
// add group · recompute scores · record an attributed lead. User-controlled.
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { addGroupAction, recomputeGroupScoresAction, recordGroupLeadAction } from "@/lib/distribution/groups-actions";
import { REGION_LABEL, GROUP_CATEGORY_LABEL } from "@/lib/distribution/groups-engine";
import type { GroupRow, GroupsAnalytics } from "@/lib/distribution/groups-service";

const PROP_TYPE_HE: Record<string, string> = {
  apartment: "דירה", garden_apartment: "דירת גן", penthouse: "פנטהאוז", duplex: "דופלקס",
  private_house: "בית פרטי", commercial: "מסחרי", land: "מגרש",
};
const scoreColor = (n: number) => (n >= 70 ? "text-emerald-600" : n >= 40 ? "text-amber-600" : "text-muted");
const field = "border-line bg-card focus:border-brand focus:ring-brand/20 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2";

export function GroupsView({ groups, analytics }: { groups: GroupRow[]; analytics: GroupsAnalytics | null }) {
  const runner = useActionRunner();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [city, setCity] = useState("");
  const [members, setMembers] = useState("");
  const [leadFor, setLeadFor] = useState<GroupRow | null>(null);

  const add = () => {
    if (!name.trim()) { return; }
    runner.run(async () => {
      const r = await addGroupAction({ name: name.trim(), groupUrl: url || null, city: city || null, membersCount: Number(members) || 0 });
      if (r.ok) { setName(""); setUrl(""); setCity(""); setMembers(""); setShowAdd(false); }
      return { ok: r.ok, message: r.ok ? "הקבוצה נוספה וסווגה" : r.error };
    }, { id: "add", pendingMessage: "מוסיף…", success: (r) => r.message });
  };
  const recompute = () => runner.run(async () => {
    const r = await recomputeGroupScoresAction();
    return { ok: r.ok, message: r.ok ? `חושבו ציונים ל-${r.data.groups} קבוצות` : r.error };
  }, { id: "recompute", pendingMessage: "מחשב ביצועים מנתוני אמת…", success: (r) => r.message });

  return (
    <main dir="rtl" className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="zono-gradient-glow grid h-11 w-11 place-items-center rounded-2xl text-white"><Icon name="Users" size={22} /></span>
          <div>
            <h1 className="text-ink text-2xl font-black">מנוע הפצה — קבוצות פייסבוק</h1>
            <p className="text-muted text-sm">רישום קבוצות, סיווג, ביצועים אמיתיים וייחוס לידים. פרסום ידני ומבוקר בלבד.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/distribution?section=builder" className="btn-zono-primary zono-focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl px-5 text-sm font-bold"><Icon name="Send" size={15} /> התחל פרסום בקבוצות</Link>
          <button onClick={recompute} disabled={runner.busyId === "recompute"} className="border-line bg-card text-ink inline-flex h-10 items-center gap-1.5 rounded-xl border px-4 text-sm font-bold shadow-card hover:shadow-lg disabled:opacity-60">
            <Icon name="RefreshCw" size={15} className={runner.busyId === "recompute" ? "animate-spin" : ""} /> חשב ביצועים
          </button>
          <button onClick={() => setShowAdd((s) => !s)} className="border-line bg-card text-ink inline-flex h-10 items-center gap-1.5 rounded-xl border px-4 text-sm font-bold shadow-card hover:shadow-lg">
            <Icon name="Plus" size={15} /> הוסף קבוצה
          </button>
        </div>
      </header>

      {(runner.note || runner.error) && (
        <div className={cn("mb-4 rounded-xl border px-4 py-2 text-sm font-semibold", runner.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
          {runner.error ?? runner.note}
        </div>
      )}

      {showAdd && (
        <div className="border-line bg-card mb-5 grid gap-3 rounded-card border p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הקבוצה *" />
          <input className={field} value={city} onChange={(e) => setCity(e.target.value)} placeholder="עיר" />
          <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="קישור לקבוצה" inputMode="url" />
          <div className="flex gap-2">
            <input className={field} value={members} onChange={(e) => setMembers(e.target.value)} placeholder="חברים" inputMode="numeric" />
            <button onClick={add} disabled={runner.busyId === "add"} className="btn-zono-primary zono-focus-ring shrink-0 rounded-xl px-4 text-sm font-bold disabled:opacity-60">שמור</button>
          </div>
          <p className="text-muted col-span-full text-[11px]">הקבוצה תסווג אוטומטית (קטגוריה / אזור / סוגי נכס) לפי השם.</p>
        </div>
      )}

      {/* Analytics */}
      {analytics && (
        <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="קבוצות" value={analytics.totalGroups} icon="Users" />
          <Stat label="פעילות" value={analytics.activeGroups} icon="Check" />
          <Stat label="פרסומים" value={analytics.totalPosts} icon="Send" />
          <Stat label="לידים מקבוצות" value={analytics.totalLeads} icon="Target" accent />
        </div>
      )}

      {groups.length === 0 ? (
        <div className="border-line bg-card grid place-items-center rounded-card border border-dashed p-12 text-center shadow-card">
          <span className="zono-gradient-glow mb-3 grid h-12 w-12 place-items-center rounded-2xl text-white"><Icon name="Users" size={22} /></span>
          <p className="text-ink font-bold">עדיין אין קבוצות ברישום</p>
          <p className="text-muted mt-1 max-w-md text-sm">הוסף את קבוצות הפייסבוק שבהן אתה מפרסם — ZONO יסווג, ידרג לפי ביצועים, וייחס לידים. הפרסום עצמו נשאר ידני דרך תוסף הדפדפן.</p>
        </div>
      ) : (
        <>
          {/* Top by leads */}
          {analytics && analytics.topByLeads.length > 0 && (
            <Section title="קבוצות שמייצרות הכי הרבה לידים" icon="Flame">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {analytics.topByLeads.map((g) => (
                  <div key={g.id} className="border-line bg-card rounded-card border p-4 shadow-card">
                    <p className="text-ink truncate font-bold">{g.name}</p>
                    <p className="text-emerald-600 mt-1 text-2xl font-black">{g.totalLeads} לידים</p>
                    <p className="text-muted text-xs">{g.totalPosts} פרסומים · ביצועים {g.performanceScore}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Registry */}
          <Section title="רישום הקבוצות" icon="ListChecks">
            <div className="border-line bg-card overflow-hidden rounded-card border shadow-card">
              <div className="text-muted bg-surface hidden grid-cols-[2.2fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr_auto] gap-2 px-4 py-2.5 text-xs font-bold sm:grid">
                <span>קבוצה</span><span>אזור</span><span>סוגי נכס</span><span>ביצועים</span><span>לידים</span><span>פרסומים</span><span></span>
              </div>
              {groups.map((g) => (
                <div key={g.id} className="border-line grid grid-cols-2 items-center gap-2 border-t px-4 py-3 text-sm sm:grid-cols-[2.2fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr_auto]">
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-ink font-bold">{g.name}</p>
                    <p className="text-muted text-xs">{[g.city, g.category && (GROUP_CATEGORY_LABEL[g.category] ?? g.category), g.membersCount ? `${g.membersCount.toLocaleString("he-IL")} חברים` : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className="text-muted text-xs">{g.region ? REGION_LABEL[g.region] ?? g.region : "—"}</span>
                  <span className="flex flex-wrap gap-1">
                    {g.propertyTypes.length ? g.propertyTypes.slice(0, 3).map((t) => <span key={t} className="bg-brand-soft text-brand-strong rounded px-1.5 py-0.5 text-[11px] font-bold">{PROP_TYPE_HE[t] ?? t}</span>) : <span className="text-muted text-xs">כללי</span>}
                  </span>
                  <span className={cn("font-black", scoreColor(g.performanceScore))}>{g.performanceScore}</span>
                  <span className={cn("font-black", scoreColor(g.leadScore))}>{g.totalLeads}</span>
                  <span className="text-muted">{g.totalPosts}</span>
                  <button onClick={() => setLeadFor(g)} className="text-brand justify-self-end text-xs font-bold">+ ליד</button>
                </div>
              ))}
            </div>
          </Section>

          {/* Needs attention */}
          {analytics && analytics.needsAttention.length > 0 && (
            <Section title="דורשות תשומת לב" icon="AlertTriangle">
              <div className="grid gap-2">
                {analytics.needsAttention.map((g) => (
                  <div key={g.id} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
                    <span className="text-ink font-bold">{g.name}</span>
                    <span className="text-amber-700"> — {g.spamRiskScore >= 60 ? "סיכון ספאם גבוה" : "פרסומים ללא לידים — שקול להפסיק"}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      <p className="text-muted mt-6 text-[11px]">ZONO לא מפרסם אוטומטית ולא מבצע אוטומציה נסתרת. הפרסום מתבצע ידנית דרך תוסף הדפדפן; כאן מנהלים את הרישום, הביצועים והלידים.</p>

      {leadFor && <LeadModal group={leadFor} onClose={() => setLeadFor(null)} runner={runner} />}
    </main>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink mb-3 flex items-center gap-2 text-lg font-black"><Icon name={icon} size={18} className="text-brand" /> {title}</h2>
      {children}
    </section>
  );
}
function Stat({ label, value, icon, accent }: { label: string; value: number; icon: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-card border p-4 shadow-card", accent ? "border-brand bg-brand-soft" : "border-line bg-card")}>
      <div className="flex items-center justify-between"><span className="text-muted text-xs font-bold">{label}</span><Icon name={icon} size={16} className={accent ? "text-brand" : "text-muted"} /></div>
      <p className={cn("mt-1 text-2xl font-black", accent ? "text-brand-strong" : "text-ink")}>{value}</p>
    </div>
  );
}

function LeadModal({ group, onClose, runner }: { group: GroupRow; onClose: () => void; runner: ReturnType<typeof useActionRunner> }) {
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const save = () => runner.run(async () => {
    const r = await recordGroupLeadAction({ groupId: group.id, contactName: contactName || null, contactPhone: phone || null, note: note || null });
    if (r.ok) onClose();
    return { ok: r.ok, message: r.ok ? "הליד נרשם ויוחס לקבוצה" : r.error };
  }, { id: "lead", pendingMessage: "שומר…", success: (r) => r.message });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div dir="rtl" className="bg-card w-full max-w-sm rounded-[24px] border border-line p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-ink font-black">ייחוס ליד — {group.name}</h3><button onClick={onClose} className="text-muted"><Icon name="X" size={18} /></button></div>
        <div className="space-y-3">
          <input className={field} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="שם הפונה" />
          <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון" inputMode="tel" />
          <textarea className={cn(field, "min-h-16 resize-y")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="הערה (נכס/פנייה)" />
          <button onClick={save} disabled={runner.busyId === "lead"} className="btn-zono-primary zono-focus-ring inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-60"><Icon name="Target" size={15} /> רשום ליד</button>
        </div>
      </div>
    </div>
  );
}
