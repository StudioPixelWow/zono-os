"use client";
// ============================================================================
// ZONO — reusable AI Copilot slide-over panel + ✨ trigger button.
// Premium RTL side sheet that runs an async action and renders the result with
// a copy button + a graceful-fallback note. Augmentation only — never replaces
// a screen, never blocks the deterministic workflow.
// ============================================================================
import { useCallback, useState } from "react";
import { Sparkles, X, Copy, Check, Loader2 } from "lucide-react";

type AiOut = { content: string; source: "ai" | "fallback" | "cache"; model: string | null };
type AiResult = { ok: true; data: AiOut } | { ok: false; error: string };

const SOURCE_NOTE: Record<string, string> = {
  ai: "נוצר ע״י AI", fallback: "נוצר ממנוע ZONO (ללא AI כרגע)", cache: "מהמטמון",
};

export function AiCopilotPanel({ title, open, onClose, run }: {
  title: string; open: boolean; onClose: () => void; run: () => Promise<AiResult>;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setResult(null);
    const res = await run();
    if (res.ok) setResult(res.data); else setError(res.error);
    setLoading(false);
  }, [run]);

  // Load once when opened.
  const [armed, setArmed] = useState(false);
  if (open && !armed) { setArmed(true); void load(); }
  if (!open && armed) setArmed(false);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-start" dir="rtl">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-label="סגור" />
      <div className="relative ms-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="zono-gradient flex items-center justify-between px-4 py-3 text-white">
          <p className="flex items-center gap-1.5 font-black"><Sparkles size={17} /> {title}</p>
          <button onClick={onClose} className="rounded-lg bg-white/20 p-1"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm font-bold text-brand-strong"><Loader2 size={18} className="animate-spin" /> ZONO Copilot חושב…</div>
          )}
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
          {result && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand-strong">{SOURCE_NOTE[result.source] ?? result.source}</span>
                <button
                  onClick={() => { void navigator.clipboard?.writeText(result.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1 text-[12px] font-bold text-ink/70 hover:bg-black/10"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "הועתק" : "העתק"}
                </button>
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-2xl bg-brand-soft/20 p-3 text-[13px] leading-relaxed text-ink">{result.content}</pre>
              <button onClick={load} className="self-start rounded-lg bg-black/5 px-3 py-1.5 text-[12px] font-bold text-ink/70 hover:bg-black/10">צור מחדש</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AiActionButton({ label, title, run, className = "" }: {
  label: string; title: string; run: () => Promise<AiResult>; className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || "inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-100"}>
        <Sparkles size={12} /> {label}
      </button>
      <AiCopilotPanel title={title} open={open} onClose={() => setOpen(false)} run={run} />
    </>
  );
}
