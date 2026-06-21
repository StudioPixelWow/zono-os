import { getAIOfficeCommandCenter, type AIOfficeCommandCenter } from "@/lib/ai-office/service";
import { AIOfficeView } from "./AIOfficeView";

export const dynamic = "force-dynamic";

export default async function AIOfficePage() {
  let cc: AIOfficeCommandCenter | null = null;
  try {
    cc = await getAIOfficeCommandCenter();
  } catch (e) {
    console.error("[ai-office] load failed:", e);
  }
  return <AIOfficeView cc={cc} />;
}
