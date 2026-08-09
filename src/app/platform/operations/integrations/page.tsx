// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.integrations.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="תפעול"
      title="אינטגרציות"
      icon="Globe"
      description="מצב בריאות האינטגרציות החיצוניות של הלקוחות (ללא סודות או אסימונים)."
      willContain={["סטטוס חיבורים", "כשלי אינטגרציה", "ספקים מחוברים", "בריאות Webhooks", ]}
    />
  );
}
