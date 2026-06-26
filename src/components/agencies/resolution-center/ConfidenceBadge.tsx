import { Badge } from "@/components/ui/Badge";
import { confidenceBadge } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

/** Data-confidence pill for a candidate (0..1). Honest "no data" when null. */
export function ConfidenceBadge({ value, size = "sm" }: { value: number | null; size?: "sm" | "md" }) {
  const { tone, label } = confidenceBadge(value);
  return <Badge tone={tone} size={size} leadingDot>{label}</Badge>;
}
