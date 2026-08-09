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
      title="תוכניות"
      icon="Tag"
      description="הגדרות תוכניות המחיר, מכסות והרשאות מסחריות."
      willContain={["קטלוג תוכניות", "מכסות", "תמחור", "זכאויות", ]}
    />
  );
}
