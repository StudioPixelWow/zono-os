// ============================================================================
// 🧬 Brokerage DNA™ — deterministic office / broker identity profile (pure).
// Phase 26.9.6 (deferred slice). NO AI, NO DB, NO network. Builds a rich,
// evidence-cited profile from data ZONO already holds (the office/agent row,
// its linked external listings). Every signal references a real field — nothing
// is fabricated and no value is invented when the underlying data is missing.
// ============================================================================
import type { BrokerageOffice, BrokerageAgent, BrokerageExternalListingLink } from "./types";

export interface DnaSignal {
  label: string;             // human-readable Hebrew signal
  detail: string;            // supporting evidence note
  kind: "strength" | "gap" | "fact";
}

export interface DnaFootprint {
  agentCount: number;        // offices only (0 for brokers)
  linkedListings: number;    // confirmed/observed links for this entity
  cities: string[];          // distinct cities observed across links + entity
  sources: string[];         // distinct listing sources observed
}

export interface BrokerageDna {
  entityType: "office" | "broker";
  id: string;
  name: string;
  subtitle: string | null;   // brand/office/role line
  status: string;
  confidenceScore: number;   // copied from the resolved entity (0–100)
  dataQualityScore: number;  // copied from the resolved entity (0–100)
  dnaScore: number;          // deterministic 0–100 blend (see computeDnaScore)
  footprint: DnaFootprint;
  signals: DnaSignal[];      // strengths + facts + gaps, evidence-cited
  completeness: number;      // 0–100 share of key identity fields present
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const uniq = (xs: (string | null | undefined)[]): string[] =>
  Array.from(new Set(xs.filter((x): x is string => !!x && x.trim().length > 0).map((x) => x.trim())));

/** Share of key identity fields that are present (0–100). */
function officeCompleteness(o: BrokerageOffice): number {
  const fields = [o.name, o.primaryPhone, o.city, o.websiteUrl, o.managerName, o.ownerName, o.brandNetwork, o.registrationNumber, o.primaryEmail];
  const present = fields.filter((f) => !!f && String(f).trim().length > 0).length;
  return clamp((present / fields.length) * 100);
}
function brokerCompleteness(a: BrokerageAgent, hasOffice: boolean): number {
  const fields = [a.fullName, a.primaryPhone, a.city, a.roleTitle, a.primaryEmail, a.licenseNumber, hasOffice ? "office" : ""];
  const present = fields.filter((f) => !!f && String(f).trim().length > 0).length;
  return clamp((present / fields.length) * 100);
}

/** Deterministic DNA score: identity confidence + data quality + footprint depth + completeness. */
function computeDnaScore(args: { confidence: number; dataQuality: number; completeness: number; footprintDepth: number }): number {
  const { confidence, dataQuality, completeness, footprintDepth } = args;
  // footprintDepth is a 0–100 saturating measure of listings/agents observed.
  return clamp(confidence * 0.35 + dataQuality * 0.25 + completeness * 0.2 + footprintDepth * 0.2);
}

/** Saturating footprint depth: more linked listings / agents → diminishing returns. */
function footprintDepth(linkedListings: number, agentCount: number): number {
  const listingPart = Math.min(60, linkedListings * 12);  // 5 listings ≈ 60
  const agentPart = Math.min(40, agentCount * 8);          // 5 agents ≈ 40
  return clamp(listingPart + agentPart);
}

export function buildOfficeDna(office: BrokerageOffice, agents: BrokerageAgent[], links: BrokerageExternalListingLink[]): BrokerageDna {
  const officeLinks = links.filter((l) => l.officeId === office.id);
  const cities = uniq([office.city, ...agents.map((a) => a.city), ...officeLinks.map((l) => l.city)]);
  const sources = uniq(officeLinks.map((l) => l.matchedSource));
  const footprint: DnaFootprint = { agentCount: agents.length, linkedListings: officeLinks.length, cities, sources };
  const completeness = officeCompleteness(office);
  const depth = footprintDepth(officeLinks.length, agents.length);

  const signals: DnaSignal[] = [];
  // Facts
  if (office.brandNetwork) signals.push({ kind: "fact", label: `רשת: ${office.brandNetwork}`, detail: "brand_network", });
  signals.push({ kind: "fact", label: `סוג משרד: ${officeTypeHe(office.officeType)}`, detail: "office_type" });
  // Strengths
  if (agents.length > 0) signals.push({ kind: "strength", label: `${agents.length} מתווכים מקושרים`, detail: "brokerage_agents.office_id" });
  if (officeLinks.length > 0) signals.push({ kind: "strength", label: `${officeLinks.length} מודעות מקושרות`, detail: "brokerage_external_listing_links" });
  if (cities.length > 1) signals.push({ kind: "strength", label: `נוכחות ב-${cities.length} ערים`, detail: cities.slice(0, 5).join(", ") });
  if (office.googleRating != null) signals.push({ kind: "strength", label: `דירוג Google ${office.googleRating}${office.googleReviewsCount ? ` (${office.googleReviewsCount} ביקורות)` : ""}`, detail: "google_rating" });
  if (sources.length > 1) signals.push({ kind: "strength", label: `מופיע ב-${sources.length} מקורות פרסום`, detail: sources.slice(0, 5).join(", ") });
  // Gaps (missing identity fields — evidence-based, never fabricated)
  if (!office.primaryPhone) signals.push({ kind: "gap", label: "חסר טלפון ראשי", detail: "primary_phone" });
  if (!office.websiteUrl) signals.push({ kind: "gap", label: "חסר אתר אינטרנט", detail: "website_url" });
  if (!office.managerName && !office.ownerName) signals.push({ kind: "gap", label: "חסר שם מנהל/בעלים", detail: "manager_name / owner_name" });
  if (!office.registrationNumber) signals.push({ kind: "gap", label: "חסר מספר רישוי", detail: "registration_number" });
  if (office.dataQualityScore < 50) signals.push({ kind: "gap", label: "איכות נתונים נמוכה", detail: `data_quality_score=${Math.round(office.dataQualityScore)}` });

  return {
    entityType: "office", id: office.id, name: office.name,
    subtitle: [office.city, office.brandNetwork].filter(Boolean).join(" · ") || null,
    status: office.status, confidenceScore: clamp(office.confidenceScore), dataQualityScore: clamp(office.dataQualityScore),
    dnaScore: computeDnaScore({ confidence: office.confidenceScore, dataQuality: office.dataQualityScore, completeness, footprintDepth: depth }),
    footprint, signals, completeness,
  };
}

export function buildBrokerDna(agent: BrokerageAgent, office: BrokerageOffice | null, links: BrokerageExternalListingLink[]): BrokerageDna {
  const agentLinks = links.filter((l) => l.agentId === agent.id);
  const cities = uniq([agent.city, ...agentLinks.map((l) => l.city)]);
  const sources = uniq(agentLinks.map((l) => l.matchedSource));
  const footprint: DnaFootprint = { agentCount: 0, linkedListings: agentLinks.length, cities, sources };
  const completeness = brokerCompleteness(agent, !!office);
  const depth = footprintDepth(agentLinks.length, 0);

  const signals: DnaSignal[] = [];
  // Facts
  if (office) signals.push({ kind: "fact", label: `משרד: ${office.name}`, detail: "office_id" });
  if (agent.roleTitle) signals.push({ kind: "fact", label: `תפקיד: ${agent.roleTitle}`, detail: "role_title" });
  if (agent.specialties.length) signals.push({ kind: "fact", label: `התמחויות: ${agent.specialties.slice(0, 4).join(", ")}`, detail: "specialties" });
  // Strengths
  if (agentLinks.length > 0) signals.push({ kind: "strength", label: `${agentLinks.length} מודעות מקושרות`, detail: "brokerage_external_listing_links" });
  if (cities.length > 1) signals.push({ kind: "strength", label: `פעיל ב-${cities.length} ערים`, detail: cities.slice(0, 5).join(", ") });
  if (sources.length > 1) signals.push({ kind: "strength", label: `מופיע ב-${sources.length} מקורות פרסום`, detail: sources.slice(0, 5).join(", ") });
  // Gaps
  if (!office) signals.push({ kind: "gap", label: "משרד טרם זוהה", detail: "office_id" });
  if (!agent.primaryPhone && !agent.whatsappPhone) signals.push({ kind: "gap", label: "חסר טלפון", detail: "primary_phone / whatsapp_phone" });
  if (!agent.licenseNumber) signals.push({ kind: "gap", label: "חסר מספר רישיון", detail: "license_number" });
  if (agent.dataQualityScore < 50) signals.push({ kind: "gap", label: "איכות נתונים נמוכה", detail: `data_quality_score=${Math.round(agent.dataQualityScore)}` });

  return {
    entityType: "broker", id: agent.id, name: agent.fullName,
    subtitle: [agent.city, agent.roleTitle].filter(Boolean).join(" · ") || null,
    status: agent.status, confidenceScore: clamp(agent.confidenceScore), dataQualityScore: clamp(agent.dataQualityScore),
    dnaScore: computeDnaScore({ confidence: agent.confidenceScore, dataQuality: agent.dataQualityScore, completeness, footprintDepth: depth }),
    footprint, signals, completeness,
  };
}

function officeTypeHe(t: BrokerageOffice["officeType"]): string {
  return t === "franchise" ? "זכיינות" : t === "branch" ? "סניף" : t === "independent" ? "עצמאי" : "לא ידוע";
}
