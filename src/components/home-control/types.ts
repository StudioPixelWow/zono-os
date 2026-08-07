// Serializable view-models passed from the server home page to the client
// control-center. Every value here comes from a real service (see page.tsx).
export interface HomeKpi {
  id: string;
  label: string;
  value: string;
  icon: string;
  href: string;
  hint?: string | null;
}

export interface HomeRec {
  id: string;
  title: string;
  why: string;
  urgency: "critical" | "high" | "medium" | "low";
  href: string | null;
  action: string;
  area: string;
}

export interface HomeActivityItem {
  id: string;
  title: string;
  description: string | null;
  at: string;          // ISO
  icon: string;
  tone: "brand" | "success" | "warning" | "danger" | "neutral";
  href: string | null;
}

export interface HomeTerritory {
  areaLabel: string | null;
  properties: number;
  buyers: number;
  deals: number;
}

export interface HomePerf {
  leadsBySource: { label: string; value: number }[];
  dealsByStage: { label: string; value: number }[];
  expectedRevenue: number;
  activeDeals: number;
  newLeads: number;
}
