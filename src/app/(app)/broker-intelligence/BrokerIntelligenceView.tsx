"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import {
  createBrokerProfileAction, decideMatchReviewAction, importBrokersCsvAction, runBrokerDetectionAction,
  type BrokerActionState,
} from "@/lib/broker/actions";
import type { BrokerBoard } from "@/lib/broker/service";

const field = "bg-surface border-line text-ink focus:border-brand-light h-9 rounded-xl border px-3 text-sm outline-none transition";
const VERIFY_LABEL: Record<string, { t: string; c: string }> = {
  human_verified: { t: "מאומת", c: "bg-success-soft text-success" },
  auto: { t: "אוטומטי", c: "bg-brand-soft text-brand-strong" },
  unverified: { t: "לא מאומת", c: "bg-surface text-muted" },
  rejected: { t: "נדחה", c: "bg-danger-soft text-danger" },
};
const TYPE_LABEL: Record<string, string> = { agency: "משרד תיווך", office: "משרד", independent_broker: "מתווך עצמאי", team: "צוות", unknown: "לא ידוע" };

function LogoCell({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="border-line h-8 w-8 rounded-lg border object-contain" loading="lazy" />;
  }
  return <span className="bg-brand-soft text-brand-strong grid h-8 w-8 place-items-center rounded-lg text-xs font-black">{name.trim().charAt(0) || "?"}</span>;
}

// Parse pasted CSV (header row required). Columns: display_name,phone,email,website,agency_name,city,service_areas,license_number,aliases
function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (k: string) => headers.indexOf(k);
  return lines.slice(1).map((line) => {
    const c = line.split(",").map((x) => x.trim());
    const get = (k: string) => { const i = idx(k); return i >= 0 ? c[i] : undefined; };
    const split = (k: string) => (get(k) ? get(k)!.split(/[;|]/).map((s) => s.trim()).filter(Boolean) : undefined);
    return {
      displayName: get("display_name") ?? "", phone: get("phone") ?? null, email: get("email") ?? null,
      website: get("website") ?? null, agencyName: get("agency_name") ?? null, city: get("city") ?? null,
      serviceAreas: split("service_areas"), licenseNumber: get("license_number") ?? null, aliases: split("aliases"),
    };
  }).filter((r) => r.displayName);
}

export function BrokerIntelligenceView({ board, cityFilter }: { board: BrokerBoard; cityFilter: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [city, setCity] = useState(cityFilter);
  const [csv, setCsv] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [nf, setNf] = useState({ displayName: "", phone: "", agencyName: "", city: "" });
  const [logoOnly, setLogoOnly] = useState(false);
  const [competitorOnly, setCompetitorOnly] = useState(false);

  const isCompetitor = (p: BrokerBoard["profiles"][number]) => (p.metadata as { is_competitor?: boolean } | null)?.is_competitor === true;
  const withLogo = board.profiles.filter((p) => p.logo_url).length;
  const competitors = board.profiles.filter(isCompetitor).length;
  const filteredProfiles = board.profiles.filter((p) => (!logoOnly || !!p.logo_url) && (!competitorOnly || isCompetitor(p)));

  const run = (fn: () => Promise<BrokerActionState>) => { setError(null); setMsg(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } }); };
  const search = () => { router.push(`/broker-intelligence${city.trim() ? `?city=${encodeURIComponent(city.trim())}` : ""}`); };
  const importCsv = () => { const rows = parseCsv(csv); if (!rows.length) { setError("לא נמצאו שורות תקינות (נדרשת שורת כותרת)"); return; } run(() => importBrokersCsvAction(rows)); setCsv(""); };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Broker Intelligence</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מודיעין מתווכים</h1>
          <p className="text-muted mt-1 text-sm">זיהוי מקור הפרסום של מודעות חיצוניות — מוכר פרטי / מתווך / משרד תיווך. מידע עסקי ציבורי בלבד.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run(runBrokerDetectionAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={15} />}>זהה מתווכים</Button>
          <Button size="sm" variant="secondary" onClick={() => setShowNew((v) => !v)} leadingIcon={<Icon name="Plus" size={15} />}>מתווך חדש</Button>
        </div>
      </div>

      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="פרופילי מתווכים" value={board.counts.profiles} />
        <Stat label="ממתינים לבדיקה" value={board.counts.pending} />
        <Stat label="מאומתים" value={board.counts.verified} />
        <Stat label="עם לוגו" value={withLogo} />
        <Stat label="מתחרים מסומנים" value={competitors} />
      </div>

      {showNew && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">פרופיל מתווך חדש</p>
          <div className="flex flex-wrap gap-2">
            <input className={field} placeholder="שם" value={nf.displayName} onChange={(e) => setNf({ ...nf, displayName: e.target.value })} />
            <input className={field} placeholder="טלפון" value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} />
            <input className={field} placeholder="משרד" value={nf.agencyName} onChange={(e) => setNf({ ...nf, agencyName: e.target.value })} />
            <input className={field} placeholder="עיר" value={nf.city} onChange={(e) => setNf({ ...nf, city: e.target.value })} />
            <Button size="sm" disabled={pending || !nf.displayName.trim()} onClick={() => { run(() => createBrokerProfileAction({ displayName: nf.displayName.trim(), phone: nf.phone || null, agencyName: nf.agencyName || null, city: nf.city || null })); setNf({ displayName: "", phone: "", agencyName: "", city: "" }); }}>צור</Button>
          </div>
        </div>
      )}

      {/* CSV import */}
      <div className="bg-card border-line rounded-[20px] border p-4">
        <p className="text-ink mb-1 text-sm font-extrabold">ייבוא רשימת מתווכים (CSV)</p>
        <p className="text-muted mb-2 text-[11px]">שורת כותרת: display_name,phone,email,website,agency_name,city,service_areas,license_number,aliases</p>
        <textarea className="bg-surface border-line text-ink min-h-[80px] w-full rounded-xl border p-2 text-xs outline-none" placeholder="display_name,phone,city&#10;שי הולי,055-4309750,קרית ביאליק" value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div className="mt-2"><Button size="sm" variant="secondary" onClick={importCsv} disabled={pending || !csv.trim()}>ייבא CSV</Button></div>
      </div>

      {/* Uncertain matches queue */}
      <div className="bg-card border-line rounded-[20px] border p-4">
        <p className="text-ink mb-2 text-sm font-extrabold">תור התאמות לבדיקה ({board.pendingReviews.length})</p>
        {board.pendingReviews.length === 0 ? <p className="text-muted text-sm">אין התאמות הממתינות לאישור ✓</p> : (
          <ul className="flex flex-col gap-2">
            {board.pendingReviews.map((r) => (
              <li key={r.id} className="border-line flex flex-wrap items-center gap-2 rounded-xl border p-2 text-xs">
                <span className="text-ink min-w-0 flex-1 font-semibold">{r.listingTitle} ← {r.brokerName}</span>
                <span className="text-muted">{r.matchType} · {r.confidence}%</span>
                <button className="text-success font-bold" disabled={pending} onClick={() => run(() => decideMatchReviewAction(r.id, "approved"))}>אשר</button>
                <button className="text-danger font-bold" disabled={pending} onClick={() => run(() => decideMatchReviewAction(r.id, "rejected"))}>דחה</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Broker profiles table */}
      <div className="bg-card border-line rounded-[20px] border p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink text-sm font-extrabold">פרופילי מתווכים</p>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setLogoOnly((v) => !v)} className={cn("rounded-lg px-2.5 py-1 text-[11px] font-bold transition", logoOnly ? "bg-brand text-white" : "bg-surface text-muted")}>לוגו זוהה</button>
            <button onClick={() => setCompetitorOnly((v) => !v)} className={cn("rounded-lg px-2.5 py-1 text-[11px] font-bold transition", competitorOnly ? "bg-danger text-white" : "bg-surface text-muted")}>מתחרים</button>
            <input className={field} placeholder="חפש לפי עיר" value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} /><Button size="sm" variant="ghost" onClick={search}>חפש</Button>
          </div>
        </div>
        {filteredProfiles.length === 0 ? <p className="text-muted text-sm">{board.profiles.length === 0 ? "אין עדיין פרופילי מתווכים. ייבא CSV או צור פרופיל." : "אין תוצאות לסינון הנוכחי."}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-start text-sm">
              <thead className="text-muted border-line border-b text-xs"><tr>{["לוגו", "שם", "סוג", "עיר", "טלפון", "מודעות", "אימות", ""].map((h) => <th key={h} className="px-3 py-2 text-start font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {filteredProfiles.map((p) => (
                  <tr key={p.id} className="border-line hover:bg-surface border-b last:border-0">
                    <td className="px-3 py-2"><LogoCell url={p.logo_url} name={p.display_name} /></td>
                    <td className="px-3 py-2"><Link href={`/broker-intelligence/${p.id}`} className="text-ink hover:text-brand font-bold">{p.display_name}{isCompetitor(p) && <span className="bg-danger-soft text-danger ms-1.5 rounded px-1 py-0.5 text-[9px] font-bold">מתחרה</span>}</Link></td>
                    <td className="text-muted px-3 py-2">{TYPE_LABEL[p.broker_type] ?? p.broker_type}</td>
                    <td className="text-muted px-3 py-2">{p.primary_city ?? "—"}</td>
                    <td className="text-muted px-3 py-2">{p.phone ?? "—"}</td>
                    <td className="text-muted px-3 py-2">{p.listings_count}</td>
                    <td className="px-3 py-2"><span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", (VERIFY_LABEL[p.verification_status] ?? VERIFY_LABEL.unverified).c)}>{(VERIFY_LABEL[p.verification_status] ?? VERIFY_LABEL.unverified).t}</span></td>
                    <td className="px-3 py-2"><Link href={`/broker-intelligence/${p.id}`} className="text-brand-strong text-xs font-bold">פתח</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <p className="text-ink text-2xl font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
