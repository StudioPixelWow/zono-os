// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.audit.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="אבטחה"
      title="הפעלות"
      icon="Lock"
      description="הפעלות מנהלי פלטפורמה פעילות ומעקב גישה."
      willContain={["הפעלות פעילות", "מכשירים", "כניסות אחרונות", "ניתוק הפעלות", ]}
    />
  );
}
