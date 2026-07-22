// 👤 Morning Brief — COMPOSES already-fetched broker-scoped facts (Daily OS
// briefing summary + the broker's top queue priority + the broker's own journey
// counts). No AI generation, no conclusions. Reuses cached providers → 0 extra
// requests.
import Link from "next/link";
import { loadDailyOS, loadBrokerJourney } from "@/lib/broker-home/providers";
import { brokerPriorities, buildBrokerMorningBrief } from "@/lib/broker-home/compose";
import { CardShell, CardUnavailable } from "../CardShell";

const TONE: Record<string, string> = { daily: "text-brand", priorities: "text-danger", journey: "text-success" };

export async function MorningBriefCard() {
  const [os, journey] = await Promise.all([loadDailyOS().catch(() => null), loadBrokerJourney().catch(() => null)]);
  const brief = buildBrokerMorningBrief(os, journey, os ? brokerPriorities(os) : []);
  return (
    <CardShell title="התדריך הבוקר" subtitle="מורכב מ-Daily OS · תור · מסעות — ללא ייצור טקסט" source="compose (broker-scoped)">
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
