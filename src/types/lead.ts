import type { ISODateString, UUID } from "./common";

/** Where a lead originated. */
export type LeadSource =
  | "yad2" // מקור חיצוני
  | "madlan" // מקור חיצוני
  | "facebook"
  | "instagram"
  | "website"
  | "referral" // המלצה
  | "sign_call" // שלט "למכירה"
  | "open_house"
  | "cold_outreach"
  | "other";

/** Sales-pipeline stage of a lead. */
export type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "nurturing"
  | "converted"
  | "lost";

/** Whether the lead is a buyer side or seller side opportunity. */
export type LeadIntent = "buyer" | "seller" | "both" | "unknown";

/**
 * An inbound or sourced lead before it is qualified into a Buyer/Seller.
 * The matching and follow-up engines operate on leads early in the funnel.
 */
export interface Lead {
  id: UUID;
  agencyId: UUID;
  agentId: UUID;

  fullName: string;
  phone?: string;
  email?: string;

  source: LeadSource;
  intent: LeadIntent;
  stage: LeadStage;

  /** Free-text of what the lead is looking for. */
  message?: string;
  /** Property the lead enquired about, if any. */
  propertyId?: UUID;

  /** AI lead-quality score, 0–100. */
  score: number;

  /** Set once the lead becomes a Buyer or Seller. */
  convertedBuyerId?: UUID;
  convertedSellerId?: UUID;
  lostReason?: string;

  lastActivityAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
