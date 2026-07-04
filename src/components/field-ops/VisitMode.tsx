"use client";
// ============================================================================
// 📱 ZONO Mobile Field Operations™ — Property Visit Mode (RTL, one-hand). 41.0.
// Mobile view for a property in the field: quick facts, directions, call/WhatsApp
// seller, AI summary, a completion checklist (local), documents, inline Meeting
// Mode, and the Quick Actions FAB. Offline-aware (cached read + banner). Official
// ZONO tokens; no bespoke styling. Read-only + approval-gated creation.
// ============================================================================
/* eslint-disable @next/next/no-img-element -- external CDN cover image */
import { useEffect, useState } from "react";
import Link from "next/link";
import type { VisitMode as VData } from "@/lib/field-ops/types";
import { MeetingMode } from "./MeetingMode";
import { QuickActionsFab } from "./QuickActionsFab";

const nis = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const GROUP_LABEL: Record<string, string> = { condition: "מצב הנכס", surroundings: "סביבה", docs: "מסמכים" };

export function VisitMode({ data }: { data: VData }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [online, setOnline] = useState(true);
  const [meeting, setMeeting] = useState(false);

  useEffect(() => {
    const upd = () => setOnline(navigator.onLine);
    upd(); window.addEventListener("online", upd); window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);

  const f = data.facts;
  const completed = Object.values(done).filter(Boolean).length;
  const groups = ["condition", "surroundings", "docs"] as const;

  return (
    <div dir="rtl" className="mx-auto max-w-xl px-4 pb-28 pt-4">
      {!online && <div className="bg-warning-soft text-warning mb-3 rounded-xl p-2.5 text-center text-[12px] font-bold">📴 מצב לא מקוון — מוצגים נתונים שמורים. הסנכרון יתחדש בחיבור.</div>}

      {/* Facts */}
      <div className="bg-card border-line overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)]">
        {f.image && <img src={f.image} alt="" className="h-44 w-full object-cover" />}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div><h1 className="text-ink text-xl font-black leading-tight">{f.title}</h1><p className="text-muted text-[13px]">{f.location}</p></div>
            {f.zonoScore != null && <span className="bg-brand-soft text-brand grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[13px] font-black">{f.zonoScore}</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {f.price != null && <Chip v={nis(f.price)} />}{f.rooms != null && <Chip v={`${f.rooms} חד'`} />}{f.size != null && <Chip v={`${f.size} מ״ר`} />}{f.status && <Chip v={f.status} />}
          </div>
        </div>
      </div>

      {/* Quick contact + directions */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {data.directionsUrl && <a href={data.directionsUrl} target="_blank" rel="noreferrer" className="bg-card border-line flex flex-col items-center gap-1 rounded-2xl border py-3 text-[11px] font-bold shadow-[var(--shadow-card)]"><span className="text-xl">🧭</span><span className="text-ink">ניווט</span></a>}
        {data.contact?.phone && <a href={`tel:${data.contact.phone}`} className="bg-card border-line flex flex-col items-center gap-1 rounded-2xl border py-3 text-[11px] font-bold shadow-[var(--shadow-card)]"><span className="text-xl">📞</span><span className="text-ink">חייג למוכר</span></a>}
        {data.contact?.whatsapp && <a href={`https://wa.me/${data.contact.whatsapp}`} className="bg-card border-line flex flex-col items-center gap-1 rounded-2xl border py-3 text-[11px] font-bold shadow-[var(--shadow-card)]"><span className="text-xl">💬</span><span className="text-ink">וואטסאפ</span></a>}
      </div>
      {data.contact && <p className="text-muted mt-1.5 text-center text-[11px]">מוכר: {data.contact.name}</p>}

      {/* AI summary */}
      {data.aiSummary && <div className="bg-brand-soft mt-3 rounded-2xl p-3"><div className="text-brand text-[12px] font-black">✨ סיכום AI</div><p className="text-ink mt-1 text-[13px] leading-relaxed">{data.aiSummary}</p></div>}

      {/* Meeting mode */}
      <div className="mt-3">
        {meeting ? <MeetingMode entityType="property" entityId={data.propertyId} subject={f.title} /> : (
          <button onClick={() => setMeeting(true)} className="btn-zono-secondary zono-focus-ring w-full rounded-2xl py-3 text-[14px] font-bold">🤝 התחל מצב פגישה</button>
        )}
      </div>

      {/* Checklist */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-ink text-[15px] font-black">📋 צ׳ק ליסט ביקור</h2><span className="text-muted text-[12px] font-bold">{completed}/{data.checklist.length}</span></div>
        {groups.map((g) => {
          const items = data.checklist.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="mb-3">
              <div className="text-muted mb-1 text-[11px] font-bold">{GROUP_LABEL[g]}</div>
              <div className="space-y-1.5">
                {items.map((c) => (
                  <button key={c.key} onClick={() => setDone((p) => ({ ...p, [c.key]: !p[c.key] }))} className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-right transition ${done[c.key] ? "bg-success-soft" : "bg-surface"}`}>
                    <span className={`grid h-6 w-6 place-items-center rounded-md text-[12px] ${done[c.key] ? "bg-success text-white" : "bg-card text-muted border border-line"}`}>{done[c.key] ? "✓" : ""}</span>
                    <span className="text-lg">{c.icon}</span>
                    <span className={`flex-1 text-[13px] font-semibold ${done[c.key] ? "text-muted line-through" : "text-ink"}`}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Documents */}
      {data.documents.length > 0 && (
        <div className="mt-2">
          <h2 className="text-ink mb-2 text-[15px] font-black">📄 מסמכים</h2>
          <div className="space-y-1.5">{data.documents.map((d) => d.url ? <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="bg-surface text-ink block rounded-xl px-3 py-2.5 text-[13px] font-bold">📎 {d.title}</a> : <div key={d.id} className="bg-surface text-muted rounded-xl px-3 py-2.5 text-[13px]">📎 {d.title}</div>)}</div>
        </div>
      )}

      <Link href={data.href} className="btn-zono-secondary zono-focus-ring mt-4 block rounded-2xl py-3 text-center text-[13px] font-bold">פתח כרטיס נכס מלא ←</Link>
      {data.notes.map((n, i) => <p key={i} className="text-muted mt-2 text-[11px]">• {n}</p>)}

      <QuickActionsFab entityType="property" entityId={data.propertyId} phone={data.contact?.phone} whatsapp={data.contact?.whatsapp} />
    </div>
  );
}

function Chip({ v }: { v: string }) { return <span className="bg-surface text-ink rounded-full px-3 py-1 text-[12px] font-bold">{v}</span>; }
