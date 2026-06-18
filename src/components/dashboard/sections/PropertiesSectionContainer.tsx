import { recommendedProperties } from "@/data/mock";
import { listDashboardProperties } from "@/lib/repositories/propertiesRepository";
import { PropertiesSection } from "./PropertiesSection";

/**
 * Server component: loads properties from Supabase (with mock fallback when the
 * table is empty or Supabase isn't configured) and renders the existing
 * presentational PropertiesSection. On a query failure it falls back to mock
 * data and surfaces a non-blocking error notice. Wrap in <Suspense> for the
 * loading state.
 */
export async function PropertiesSectionContainer() {
  let properties = recommendedProperties;
  let errorMessage: string | undefined;

  try {
    properties = (await listDashboardProperties()).properties;
  } catch (error) {
    console.error("[properties] failed to load from Supabase:", error);
    errorMessage = "לא ניתן לטעון נכסים מהשרת כעת — מוצגים נתונים לדוגמה.";
  }

  return <PropertiesSection properties={properties} errorMessage={errorMessage} />;
}
