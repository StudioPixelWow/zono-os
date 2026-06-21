import { getAutomationLibrary, recommendAutomationTemplatesForOrg, type LibraryTemplate, type LibrarySummary, type LibraryRecommendation } from "@/lib/automation/library";
import { AutomationLibraryView } from "./AutomationLibraryView";

export const dynamic = "force-dynamic";

const EMPTY_SUMMARY: LibrarySummary = {
  total: 0, enabled: 0, safe: 0, reviewRequired: 0, managerApproval: 0, byCategory: [], isManager: false,
};

export default async function AutomationLibraryPage() {
  let templates: LibraryTemplate[] = [];
  let summary: LibrarySummary = EMPTY_SUMMARY;
  let recommendations: LibraryRecommendation[] = [];
  try {
    const lib = await getAutomationLibrary();
    templates = lib.templates; summary = lib.summary;
    recommendations = await recommendAutomationTemplatesForOrg();
  } catch (e) {
    console.error("[automation-library] load failed:", e);
  }
  return <AutomationLibraryView templates={templates} summary={summary} recommendations={recommendations} />;
}
