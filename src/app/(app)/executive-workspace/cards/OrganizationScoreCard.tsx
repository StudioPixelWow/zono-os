// 🏛️ Organization Score card — reuses getExecutiveOS().score. The score is
// REUSED from Chief-of-Staff (organizationScore) via Executive OS, never
// recomputed here. Overall / grade / confidence / dimensions are all inherited.
import { loadExecutiveOS } from "@/lib/executive-workspace/providers";
import { CardShell, CardUnavailable } from "../CardShell";

const scoreTone = (n: number | null) =>
  n == null ? "text-muted" : n >= 80 ? "text-success" : n >= 60 ? "text-brand" : n >= 40 ? "text-warning" : "text-danger";

export async function OrganizationScoreCard() {
  const os = await loadExecutiveOS().catch(() => null);
  const score = os?.score ?? null;
  if (!score) {
    return (
      <CardShell title="ציון הארגון" subtitle="מ-Chief of Staff · לא מחושב מחדש" source="executive-os">
        <CardUnavailable note="ציון הארגון אינו זמין כעת" />
      </CardShell>
    );
  }
  return (
    <CardShell title="ציון הארגון" subtitle="מ-Chief of Staff · לא מחושב מחדש" source="executive-os">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className={`text-4xl font-black leading-none ${scoreTone(score.overall)}`}>{score.overall}</div>
          <div className="text-muted mt-1 text-[10px] font-bold">{score.grade}</div>
        </div>
        <div className="text-muted text-[11px]">ביטחון {score.confidence}%</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {score.dimensions.map((d) => (
          <div key={d.key} className="flex items-center justify-between rounded-[12px] border border-[var(--line)] px-2.5 py-1.5">
            <span className="text-ink text-[11px] font-bold">{d.label}</span>
            <span className={`text-[13px] font-black ${scoreTone(d.score)}`}>{d.score ?? "—"}</span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}
