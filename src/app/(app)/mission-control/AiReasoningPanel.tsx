"use client";
// ============================================================================
// 🧠 Mission Control — one-shot AI reasoning panel. Phase 27.3.
// ----------------------------------------------------------------------------
// Non-invasive: a question box + submit, then answer / evidence / missing-data
// panels. Calls the server action answerWithZonoAI (the gateway) — the model
// only ever sees a sanitized ContextPackage. No chat history, no memory, no
// actions. RTL, ZONO purple/white.
// ============================================================================
import { useState, useTransition } from "react";
import { answerWithZonoAI } from "@/lib/ai-reasoning/service";
import type { AIReasoningResponse, AIReasoningStatus } from "@/lib/ai-reasoning/types";

const SUGGESTED = [
  "מה השתנה מאז שנכנסתי?",
  "איזה משרד מוביל בשכונה הזאת?",
  "מי המתווך החזק באזור ולמה?",
  "הצג את ההזדמנויות החזקות ביותר.",
];

const STATUS_LABEL: Record<AIReasoningStatus, string> = {
  answered: "נענה",
  insufficient_context: "אין מספיק הקשר",
  blocked: "נחסם",
  error: "שגיאה",
};
const STATUS_CLASS: Record<AIReasoningStatus, string> = {
  answered: "bg-emerald-100 text-emerald-700",
  insufficient_context: "bg-amber-100 text-amber-700",
  blocked: "bg-rose-100 text-rose-700",
  error: "bg-rose-100 text-rose-700",
};

export function AiReasoningPanel() {
  const [question, setQuestion] = useState("");
  const [resp, setResp] = useState<AIReasoningResponse | null>(null);
  const [pending, start] = useTransition();

  const submit = (q: string) => {
    const text = q.trim();
    if (!text || pending) return;
    setResp(null);
    start(async () => {
      const r = await answerWithZonoAI({ question: text, mode: "answer", language: "he", contextType: "mission-control" });
      setResp(r);
    });
  };

  return (
    <div dir="rtl" className="flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); submit(question); }} className="flex flex-col gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="שאל את ZONO AI על המודיעין שלך… (תשובה מבוססת הקשר בלבד)"
          rows={2}
          className="border-line bg-surface text-ink focus:border-brand-light w-full resize-none rounded-xl border p-3 text-sm outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map((q) => (
              <button key={q} type="button" onClick={() => { setQuestion(q); submit(q); }} disabled={pending}
                className="border-line bg-surface text-muted hover:text-ink rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>
          <button type="submit" disabled={pending || !question.trim()}
            className="bg-brand hover:bg-brand-strong shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:opacity-50">
            {pending ? "חושב…" : "שאל"}
          </button>
        </div>
      </form>

      {resp && (
        <div className="border-line bg-card flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${STATUS_CLASS[resp.status]}`}>{STATUS_LABEL[resp.status]}</span>
            {resp.status === "answered" && <span className="text-muted text-[11px]">ביטחון: {resp.confidence}%</span>}
          </div>

          <p className="text-ink whitespace-pre-wrap text-sm leading-relaxed">{resp.answer}</p>

          {resp.evidence.length > 0 && (
            <div>
              <p className="text-ink mb-1 text-xs font-black">ראיות</p>
              <ul className="flex flex-col gap-1">
                {resp.evidence.map((e, i) => (
                  <li key={i} className="border-line/60 text-muted flex flex-wrap items-baseline gap-1.5 border-b py-1 text-[11px] last:border-0">
                    <span className="text-ink font-bold">{e.label}</span>
                    {e.value && <span>· {e.value}</span>}
                    <span className="text-brand-strong">· {e.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resp.missingData.length > 0 && (
            <div>
              <p className="text-ink mb-1 text-xs font-black">מידע חסר</p>
              <p className="text-muted text-[11px]">{resp.missingData.join(" · ")}</p>
            </div>
          )}

          {resp.limitations.length > 0 && (
            <p className="text-muted text-[11px]">מגבלות: {resp.limitations.join(" · ")}</p>
          )}

          {resp.followUpQuestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {resp.followUpQuestions.map((q) => (
                <button key={q} type="button" onClick={() => { setQuestion(q); submit(q); }} disabled={pending}
                  className="border-line bg-surface text-ink hover:border-brand-light rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50">
                  {q}
                </button>
              ))}
            </div>
          )}

          <p className="text-muted text-[10px]">תשובה חד-פעמית מבוססת הקשר בלבד · ללא זיכרון · ללא ביצוע פעולות.</p>
        </div>
      )}
    </div>
  );
}
