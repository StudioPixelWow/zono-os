// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.billing.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="הכנסות"
      title="מנויים"
      icon="BadgeCheck"
      description="מצב המנויים הפעילים של כלל הלקוחות, תקופות חיוב ומחזור חידושים."
      willContain={["מנויים פעילים", "מחזורי חידוש", "שדרוגים והורדות", "מנויים בסיכון", ]}
    />
  );
}
