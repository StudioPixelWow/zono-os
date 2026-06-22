// ============================================================================
// ZONO — Creative Studio · shared analysis prompt (server-side)
// ----------------------------------------------------------------------------
// The AI persona + task + strict JSON schema, shared by Gemini & OpenAI.
// ============================================================================
import type { AnalysisInput } from "./types";

const ENTITY_HE: Record<string, string> = { agent: "סוכן נדל״ן", office: "משרד תיווך", property: "נכס", project: "פרויקט נדל״ן" };

export const SCHEMA_KEYS = `{
  "dna_summary": "string", "visual_personality": "string", "copywriting_tone": "string", "real_estate_positioning": "string",
  "primary_colors": ["#hex"], "secondary_colors": ["#hex"], "accent_colors": ["#hex"], "forbidden_colors": ["#hex"],
  "preferred_typography": {}, "forbidden_typography": {},
  "preferred_layouts": [], "rejected_layouts": [], "preferred_visual_styles": [], "rejected_visual_styles": [],
  "preferred_image_styles": [], "rejected_image_styles": [], "preferred_campaign_angles": [], "rejected_campaign_angles": [],
  "preferred_cta_styles": [], "whatsapp_cta_style": {}, "target_audiences": [],
  "property_marketing_style": {}, "project_marketing_style": {}, "agent_marketing_style": {},
  "seller_recruitment_style": {}, "buyer_recruitment_style": {}, "neighborhood_storytelling_style": {},
  "brand_rules": [], "avoid_rules": [], "approved_patterns": [], "rejected_patterns": [],
  "luxury_score": 0, "urgency_score": 0, "modern_score": 0, "sales_aggressiveness_score": 0,
  "investment_focus_score": 0, "lifestyle_focus_score": 0, "seller_focus_score": 0, "buyer_focus_score": 0,
  "visual_density_score": 0, "ai_generated_score": 0, "ai_confidence_score": 0
}`;

export function buildPrompt(input: AnalysisInput): string {
  const role = ENTITY_HE[input.entityType] ?? input.entityType;
  const assetLine = (a: { assetType: string; title: string | null; tags: string[]; isApproved: boolean; isRejected: boolean; isCompetitor: boolean }) =>
    `- ${a.assetType}${a.isApproved ? " [APPROVED]" : ""}${a.isRejected ? " [REJECTED]" : ""}${a.isCompetitor ? " [COMPETITOR]" : ""}${a.title ? ` · ${a.title}` : ""}${a.tags.length ? ` · tags: ${a.tags.join(", ")}` : ""}`;
  const meta = [...input.imageAssets, ...input.metadataAssets].map(assetLine).join("\n");

  return [
    "You are a senior real estate creative director, an Israeli real estate marketing strategist, a Meta Ads expert, a listing-conversion expert and an agent-branding strategist.",
    `You are analyzing the marketing materials of a ${role} ("${input.entityName}") to extract its Real Estate Marketing DNA.`,
    "",
    "Understand the marketing differences between: marketing an agent, an office, a property, a real-estate project; recruiting sellers vs buyers; and building local neighborhood authority.",
    "",
    "From the provided images + asset metadata, detect: property type, luxury level, local Israeli market feeling, visual credibility/trust, agent authority, seller/buyer orientation, investment vs lifestyle angle, project-launch potential, neighborhood storytelling potential, WhatsApp CTA style, lead-generation style, whether visuals look too AI-generated, whether visuals look misleading, and whether visuals feel authentically Israeli/local.",
    "",
    "LEARNING: From [APPROVED] materials detect repeating patterns to LEARN → approved_patterns + preferred_*. From [REJECTED] materials detect what to AVOID → rejected_patterns + rejected_*/avoid_rules (e.g. too much gold, unrealistic penthouse, AI-looking people, wrong RTL order, generic luxury).",
    "",
    `ZONO defaults to PREFER: ${input.defaultPreferRules.join("; ")}.`,
    `ZONO defaults to AVOID: ${input.defaultAvoidRules.join("; ")}.`,
    "",
    "ASSETS:",
    meta || "(no asset metadata)",
    "",
    "All score fields are integers 0-100. Write Hebrew for summary/personality/tone/positioning and Hebrew-friendly list values. Set ai_confidence_score based on how much real signal the assets gave (more approved/rejected references + clear images = higher).",
    "",
    "Return ONLY a valid JSON object with EXACTLY these keys (no markdown, no commentary):",
    SCHEMA_KEYS,
  ].join("\n");
}
