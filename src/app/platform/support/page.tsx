// ZONO — Platform Admin placeholder (P5.1). Server-guarded; "בקרוב". No fake data.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PlatformPlaceholder } from "@/components/platform-admin/PlatformPlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.support.read");
  if (!operator) return <PlatformDenied />;
  return (
    <PlatformPlaceholder
      eyebrow="תמיכה"
      title="תמיכה"
      icon="Handshake"
      description="מרכז כלי התמיכה בלקוחות. כלי הזדהות ופעולות תמיכה יתווספו בשלב מאוחר יותר."
      willContain={["פניות פתוחות", "הקשר לקוח", "כלי אבחון", "היסטוריית תמיכה", ]}
    />
  );
}
