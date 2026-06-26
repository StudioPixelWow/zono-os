import { Badge } from "@/components/ui/Badge";
import { confidenceBadge } from "@/lib/agencies/ui/competitionRadarFormat";

/** Data-confidence pill (0..100). Honest "no data" state when null. */
export function AgencyConfidenceBadge({ value, size = "sm" }: { value: number | null; size?: "sm" | "md" }) {
  const { tone, label } = confidenceBadge(value);
  return <Badge tone={tone} size={size} leadingDot>{label}</Badge>;
}
