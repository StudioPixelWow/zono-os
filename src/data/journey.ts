import type { PropertyJourney } from "@/types";

/**
 * Mock property journey for prop_01 — drives the JourneyTimeline demo.
 */
export const journeys: PropertyJourney[] = [
  {
    id: "jrn_01",
    agencyId: "agc_01",
    propertyId: "prop_01",
    currentStage: "viewings",
    overallProgress: 62,
    stages: [
      {
        key: "intake",
        label: "קליטת הנכס",
        status: "completed",
        progress: 100,
        startedAt: "2026-04-02T00:00:00Z",
        completedAt: "2026-04-03T00:00:00Z",
        openTaskCount: 0,
      },
      {
        key: "preparation",
        label: "הכנה לשיווק",
        status: "completed",
        progress: 100,
        startedAt: "2026-04-03T00:00:00Z",
        completedAt: "2026-04-06T00:00:00Z",
        openTaskCount: 0,
      },
      {
        key: "pricing",
        label: "תמחור",
        status: "completed",
        progress: 100,
        startedAt: "2026-04-04T00:00:00Z",
        completedAt: "2026-04-05T00:00:00Z",
        openTaskCount: 0,
      },
      {
        key: "marketing",
        label: "שיווק והפצה",
        status: "completed",
        progress: 100,
        startedAt: "2026-04-05T00:00:00Z",
        completedAt: "2026-04-12T00:00:00Z",
        openTaskCount: 0,
      },
      {
        key: "viewings",
        label: "סיורים",
        status: "active",
        progress: 45,
        startedAt: "2026-04-12T00:00:00Z",
        openTaskCount: 2,
      },
      {
        key: "negotiation",
        label: "משא ומתן",
        status: "upcoming",
        progress: 0,
        openTaskCount: 0,
      },
      {
        key: "contract",
        label: "חוזה וחתימות",
        status: "upcoming",
        progress: 0,
        openTaskCount: 0,
      },
      {
        key: "closing",
        label: "סגירה והעברת בעלות",
        status: "upcoming",
        progress: 0,
        openTaskCount: 0,
      },
    ],
    tasks: [
      {
        id: "jtk_01",
        journeyId: "jrn_01",
        stage: "viewings",
        title: "לתאם סיור עם אורי שמש",
        done: false,
        automatable: true,
        dueAt: "2026-06-20T00:00:00Z",
      },
      {
        id: "jtk_02",
        journeyId: "jrn_01",
        stage: "viewings",
        title: "לאסוף משוב מ-3 הסיורים האחרונים",
        done: false,
        automatable: true,
        dueAt: "2026-06-19T00:00:00Z",
      },
      {
        id: "jtk_03",
        journeyId: "jrn_01",
        stage: "marketing",
        title: "לפרסם במודעות חיצוניות",
        done: true,
        automatable: true,
      },
    ],
    createdAt: "2026-04-02T08:00:00Z",
    updatedAt: "2026-06-16T08:00:00Z",
  },
];

export const getJourneyForProperty = (
  propertyId: string,
): PropertyJourney | undefined =>
  journeys.find((j) => j.propertyId === propertyId);
