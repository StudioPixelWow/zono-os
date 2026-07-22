// 🏛️ Executive Memory card — composes getExecutiveMemory. Never diffs in the UI:
// the summary and change lists are the provider's own output, shown verbatim.
import { loadMemory } from "@/lib/executive-workspace/providers";
import { CardShell, CardUnavailable } from "../CardShell";

export async function MemoryCard() {
  const m = await loadMemory().catch(() => null);
  if (!m) {
    return (
      <CardShell title="הזיכרון הניהולי" subtitle="מה השתנה מאז הביקורת האחרונה" source="executive-memory">
        <CardUnavailable note="הזיכרון הניהולי אינו זמין כעת" />
      </CardShell>
    );
  }
  const changes = [
    ...m.newDecisions, ...m.resolvedDecisions, ...m.priorityChanges,
    ...m.confidenceChanges, ...m.evidenceChanges, ...m.categoryChanges, ...m.actionChanges,
  ];
  return (
    <CardShell title="הזיכרון הניהולי" subtitle="מה השתנה מאז הביקורת האחרונה" source="executive-memory">
      <p className="text-ink rounded-[14px] border border-[var(--line)] p-3 text-[13px] font-medium">{m.summary}</p>
      {changes.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {changes.slice(0, 6).map((c, i) => (
            <li key={`${c.kind}:${c.decisionId}:${i}`} className="text-muted flex gap-2 text-[12px]">
              <span className="text-brand mt-0.5 shrink-0">•</span>
              <span>{c.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted text-[12px]">{m.firstReview ? "סיור ביקורת ראשון — תמונת המצב נשמרה." : "אין שינוי לדווח."}</p>
      )}
    </CardShell>
  );
}
