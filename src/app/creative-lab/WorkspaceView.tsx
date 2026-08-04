"use client";
import { useState, useTransition } from "react";
import {
  generateAction, approveAction, rejectAction, scheduleAction, publishAction, listOutputsAction,
} from "./actions";
import type { LabOutputView, LabSession } from "./shared";

interface World { session: LabSession; orgName: string | null; properties: { id: string; title: string; city: string; price: number; valid: boolean }[] }

const KINDS = [
  { k: "property_ad_post", label: "מודעת נכס" },
  { k: "sold_post", label: "נמכר" },
  { k: "testimonial_post", label: "המלצה" },
  { k: "agent_brand", label: "מיתוג סוכן" },
  { k: "office_brand", label: "מיתוג משרד" },
  { k: "market_stat", label: "נתון שוק" },
];
const STATE_LABEL: Record<string, string> = {
  review: "בבדיקה", approved: "מאושר", qa_failed: "נדחה", scheduled: "מתוזמן", published: "פורסם", draft: "טיוטה", archived: "בארכיון",
};

export function WorkspaceView({ world, initialOutputs }: { world: World; initialOutputs: LabOutputView[] }) {
  const [kind, setKind] = useState("property_ad_post");
  const [prompt, setPrompt] = useState("");
  const [outputs, setOutputs] = useState<LabOutputView[]>(initialOutputs);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const signedIn = Boolean(world.session.orgId && world.session.active);

  async function refresh() {
    const r = await listOutputsAction();
    if (r.ok) setOutputs(r.outputs ?? []);
  }
  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setErr(null); setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.ok) { setMsg(okMsg); await refresh(); }
      else setErr(r.error ?? "action failed");
    });
  }

  return (
    <main className="flex flex-col gap-4" data-testid="workspace">
      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-ink text-sm font-black">סטודיו יצירה יחיד</h2>
          <span className="text-[11px] text-muted" data-testid="org-name">{world.orgName ?? "לא מחובר"}</span>
        </div>
        {!signedIn ? (
          <p data-testid="signin-hint" className="rounded-xl bg-surface px-3 py-6 text-center text-sm text-muted">
            התחבר כמשתמש בדיקה (למעלה) כדי ליצור. משתמש לא פעיל אינו יכול ליצור.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {KINDS.map((x) => (
                <button key={x.k} type="button" data-testid={`kind-${x.k}`} onClick={() => setKind(x.k)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold ${kind === x.k ? "bg-brand text-white" : "bg-surface text-ink"}`}>{x.label}</button>
              ))}
            </div>
            <textarea data-testid="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
              placeholder="תיאור הקריאייטיב…" className="w-full rounded-xl border border-line bg-surface p-2 text-sm" />
            <button type="button" data-testid="generate" disabled={pending}
              onClick={() => run(() => generateAction({ kind, prompt }), "נוצר קריאייטיב (בבדיקה)")}
              className="self-start rounded-xl bg-brand px-4 py-2 text-sm font-black text-white disabled:opacity-50">
              {pending ? "מייצר…" : "ייצר"}
            </button>
          </div>
        )}
        {msg && <p data-testid="ok-msg" className="mt-2 text-xs font-bold text-emerald-600">{msg}</p>}
        {err && <p data-testid="err-msg" className="mt-2 text-xs font-bold text-red-600">{err}</p>}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-ink mb-2 text-sm font-black">קריאייטיבים בארגון <span data-testid="outputs-count">({outputs.length})</span></h2>
        {outputs.length === 0 ? (
          <p data-testid="empty" className="rounded-xl bg-surface px-3 py-6 text-center text-sm text-muted">אין עדיין קריאייטיבים.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="outputs">
            {outputs.map((o) => (
              <li key={o.id} data-testid={`output-${o.id}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 text-xs">
                <span className="font-mono text-[11px] text-muted">{o.id}</span>
                <span className="rounded bg-card px-2 py-0.5 font-bold">{o.kind}</span>
                <span data-testid={`state-${o.id}`} className="rounded bg-card px-2 py-0.5 font-bold text-brand-strong">{STATE_LABEL[o.state] ?? o.state}</span>
                {o.contentItemId && <span className="text-muted">נכס: {o.contentItemId}</span>}
                <span className="mr-auto flex gap-1">
                  <button type="button" data-testid={`approve-${o.id}`} disabled={pending} onClick={() => run(() => approveAction(o.id), "אושר")} className="rounded bg-emerald-600 px-2 py-1 font-bold text-white disabled:opacity-40">אשר</button>
                  <button type="button" data-testid={`reject-${o.id}`} disabled={pending} onClick={() => run(() => rejectAction(o.id), "נדחה")} className="rounded bg-red-600 px-2 py-1 font-bold text-white disabled:opacity-40">דחה</button>
                  <button type="button" data-testid={`schedule-${o.id}`} disabled={pending} onClick={() => run(() => scheduleAction(o.id), "תוזמן")} className="rounded bg-amber-600 px-2 py-1 font-bold text-white disabled:opacity-40">תזמן</button>
                  <button type="button" data-testid={`publish-${o.id}`} disabled={pending} onClick={() => run(() => publishAction({ outputId: o.id, platform: "instagram", variantKey: "ig_portrait" }), "פורסם")} className="rounded bg-brand px-2 py-1 font-bold text-white disabled:opacity-40">פרסם</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
