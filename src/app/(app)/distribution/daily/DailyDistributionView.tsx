"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { generateDailyBatchAction, markDailyItemAction } from "@/lib/distribution/actions";
import type { DailyWorkspace } from "@/lib/distribution/service";

const PLATFORM: Record<string, string> = { facebook: "פייסבוק", whatsapp: "וואטסאפ", telegram: "טלגרם", instagram: "אינסטגרם", linkedin: "לינקדאין", manual: "ידני", local: "מקומי" };
type Item = DailyWorkspace["items"][number];

export function DailyDistributionView({ workspace }: { workspace: DailyWorkspace }) {
  const router = useRouter();
  const { batch, items } = workspace;
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [pasteFor, setPasteFor] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string }>) => { setError(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); else router.refresh(); }); };
  const mark = (id: string, status: string, url?: string, reason?: string) => run(() => markDailyItemAction(id, status, url, reason));
  const copy = async (item: Item) => {
    const text = `${item.post_title ?? ""}\n\n${item.post_text ?? ""}\n\n${(item.suggested_hashtags ?? []).join(" ")}`.trim();
    try { await navigator.clipboard.writeText(text); setCopiedId(item.id); if (item.status === "pending") mark(item.id, "copied"); }
    catch { setError("העתקה נכשלה — סמן ידנית"); }
  };

  const pending_ = items.filter((i) => ["pending", "copied", "community_opened"].includes(i.status));
  const completed = items.filter((i) => i.status === "manual_published");
  const skipped = items.filter((i) => i.status === "skipped" || i.status === "failed");

  if (!batch) {
    return (
      <div className="flex flex-col gap-5">
        <Header />
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Megaphone" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין שולחן פרסום להיום</p>
          <p className="text-muted max-w-sm text-sm">לחץ ״הכן שולחן יומי״ כדי שזונו יכין עבורך את פריטי הפרסום של היום (אחרי אישור קהילות וחישוב מודיעין הפצה).</p>
          {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
          <Button onClick={() => run(generateDailyBatchAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>הכן שולחן יומי</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Header />
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {/* Today summary */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Stat label="ממתינים" value={pending_.length} icon="Clock" tone="text-brand-strong" />
        <Stat label="הועתקו" value={items.filter((i) => i.status === "copied").length} icon="Tag" />
        <Stat label="נפתחו" value={items.filter((i) => i.status === "community_opened").length} icon="ArrowUpRight" />
        <Stat label="פורסמו" value={completed.length} icon="UserCheck" tone="text-success" />
        <Stat label="דולגו" value={skipped.length} icon="Minus" tone="text-warning" />
        <Stat label="צפי לידים" value={batch.expected_leads} icon="Users" tone="text-success" />
      </div>

      {/* Items */}
      <div>
        <p className="text-ink mb-3 text-sm font-extrabold">פריטי פרסום היום ({pending_.length})</p>
        {pending_.length === 0 ? <p className="text-muted bg-card border-line rounded-[20px] border p-5 text-sm">סיימת את כל הפרסומים להיום ✓</p> : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {pending_.map((item) => (
              <div key={item.id} className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-ink truncate text-sm font-extrabold">{item.property_title ?? "נכס"}</p>
                    <p className="text-muted text-[11px]">{item.community_name} · {PLATFORM[item.platform ?? ""] ?? item.platform} · {item.recommended_time}</p>
                  </div>
                  <span className="text-muted shrink-0 text-[11px] font-bold">צפי {item.expected_leads} לידים · {item.expected_reach.toLocaleString()} חשיפה</span>
                </div>

                <div className="bg-surface rounded-xl p-3">
                  {item.post_title && <p className="text-ink text-sm font-bold">{item.post_title}</p>}
                  <p className="text-muted mt-1 whitespace-pre-line text-[13px] leading-relaxed">{item.post_text}</p>
                  {(item.suggested_hashtags ?? []).length > 0 && <p className="text-brand-strong mt-1 text-[11px]">{(item.suggested_hashtags ?? []).join(" ")}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => copy(item)} leadingIcon={<Icon name="Tag" size={14} />}>{copiedId === item.id ? "הועתק ✓" : "העתק טקסט"}</Button>
                  {item.community_url ? (
                    <a href={item.community_url} target="_blank" rel="noopener noreferrer" onClick={() => item.status !== "community_opened" && mark(item.id, "community_opened")} className="bg-surface text-ink hover:border-brand-light border-line inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition">פתח קהילה ↗</a>
                  ) : <span className="text-muted text-[11px]">אין קישור לקהילה</span>}
                  <button className="text-success text-xs font-bold" disabled={pending} onClick={() => setPasteFor(pasteFor === item.id ? null : item.id)}>סמן כפורסם</button>
                  <button className="text-warning text-xs font-bold" disabled={pending} onClick={() => mark(item.id, "skipped", undefined, "דולג ידנית")}>דלג</button>
                  <button className="text-danger text-xs font-bold" disabled={pending} onClick={() => mark(item.id, "failed", undefined, "נכשל")}>נכשל</button>
                </div>

                {pasteFor === item.id && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="bg-surface border-line text-ink focus:border-brand-light h-9 min-w-[200px] flex-1 rounded-xl border px-3 text-sm outline-none" placeholder="הדבק קישור לפוסט (אופציונלי)" value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} />
                    <Button size="sm" disabled={pending} onClick={() => { mark(item.id, "manual_published", pasteUrl.trim() || undefined); setPasteFor(null); setPasteUrl(""); }}>אישור פרסום</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {completed.length > 0 && (
        <Section title={`פורסמו היום (${completed.length})`}>
          <ul className="flex flex-col gap-1">{completed.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink min-w-0 flex-1 truncate font-semibold">{i.property_title} · {i.community_name}</span>
              {i.manual_post_url ? <a href={i.manual_post_url} target="_blank" rel="noopener noreferrer" className="text-brand-strong text-[11px] font-bold">צפה בפוסט ↗</a> : <span className="text-success text-[11px] font-bold">פורסם ✓</span>}
            </li>
          ))}</ul>
        </Section>
      )}

      {skipped.length > 0 && (
        <Section title={`דולגו / נכשלו (${skipped.length})`}>
          <ul className="flex flex-col gap-1">{skipped.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink min-w-0 flex-1 truncate font-semibold">{i.property_title} · {i.community_name}</span>
              <span className="text-muted text-[11px]">{i.status === "failed" ? i.failure_reason ?? "נכשל" : i.skipped_reason ?? "דולג"}</span>
            </li>
          ))}</ul>
        </Section>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
      <div>
        <p className="text-brand text-xs font-bold">ZONO Assisted Distribution</p>
        <h1 className="text-ink mt-1 text-2xl font-black">שולחן פרסום יומי</h1>
        <p className="text-muted mt-1 text-sm">זונו הכין את הפרסום. העתק, פתח את הקהילה, פרסם ידנית וסמן שבוצע. ללא פרסום אוטומטי.</p>
      </div>
      <Link href="/distribution" className="text-brand-strong text-sm font-bold hover:underline">← למודיעין קהילות</Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-card border-line rounded-[20px] border p-4"><p className="text-ink mb-2 text-sm font-extrabold">{title}</p>{children}</div>;
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: number; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
