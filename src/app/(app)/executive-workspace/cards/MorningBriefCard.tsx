// 🏛️ Morning Brief card — COMPOSES three already-fetched facts (Executive
// Decisions + Executive Memory + Journey Coach) into one brief. No AI
// generation, no new sentences: buildMorningBrief stitches verbatim strings.
// Because it reuses the cached providers, it adds ZERO extra requests.
import Link from "next/link";
import { loadDecisions, loadMemory, loadCoach } from "@/lib/executive-workspace/providers";
import { buildMorningBrief } from "@/lib/executive-workspace/compose";
import { CardShell, CardUnavailable } from "../CardShell";

const TONE: Record<string, string> = { memory: "text-brand", decisions: "text-danger", journey: "text-success" };

export async function MorningBriefCard() {
  // Resilient compose: any single upstream rejecting degrades to null (partial
  // failure) rather than failing the Morning Brief card.
  const [decisions, memory, coach] = await Promise.all([
    loadDecisions().catch(() => null),
    loadMemory().catch(() => null),
    loadCoach().catch(() => null),
  ]);
  const brief = buildMorningBrief(decisions, memory, coach);
  return (
    <CardShell title="התדריך הבוקר" subtitle="מורכב מהחלטות · זיכרון · מסעות — ללא ייצור טקסט" source="compose">
      {brief.empty ? (
        <CardUnavailable note="אין כרגע מספיק נתונים לתדריך" />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {brief.points.map((p, i) => (
            <li key={`${p.source}:${i}`} className="rounded-[14px] border border-[var(--line)] p-3">
              <div className={`text-[10px] font-black ${TONE[p.source] ?? "text-muted"}`}>{p.label}</div>
              <div className="text-ink mt-0.5 text-[13px] font-medium">
                {p.href ? <Link href={p.href} className="hover:underline">{p.text}</Link> : p.text}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
