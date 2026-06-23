// ============================================================================
// ZONO Template Avoidance (pure) — rejects outputs that look like basic Canva
// templates (boxed text with no hierarchy, generic icon rows, centered boring
// layouts, random gradients, no visual hook). Returns a canva-risk score
// (lower is better) + a derived clean score + flags.
// ============================================================================

export interface TemplateInput {
  /** render_data blocks (component descriptors). */
  blocks: { component?: string; align?: string; emphasis?: string }[];
  hasPropertyImage: boolean;
  style: string; // creative style key
  featureChipCount: number;
}

export interface TemplateResult {
  canvaRisk: number; // 0 (custom) .. 100 (template)
  cleanScore: number;
  compositionScore: number;
  flags: string[];
}

export function evaluateTemplateRisk(i: TemplateInput): TemplateResult {
  const flags: string[] = [];
  let risk = 10; // assume good by default — ZONO renders structured layouts

  const comps = i.blocks.map((b) => b.component ?? "");
  const hasHeadline = comps.some((c) => /headline/.test(c));
  const hasImage = comps.some((c) => /image/.test(c)) || i.hasPropertyImage;
  const iconRow = comps.filter((c) => /icon|chip/.test(c)).length;

  if (!hasImage) { risk += 25; flags.push("ללא תמונת גיבור"); }
  if (!hasHeadline) { risk += 20; flags.push("ללא היררכיית כותרת"); }
  if (iconRow >= 4) { risk += 12; flags.push("שורת אייקונים גנרית"); }
  if (i.featureChipCount > 6) { risk += 8; flags.push("עומס מאפיינים"); }
  // Every block centered with no emphasis → boring template.
  if (i.blocks.length > 2 && i.blocks.every((b) => (b.align ?? "center") === "center" && !b.emphasis)) { risk += 18; flags.push("פריסה ממורכזת משעממת"); }

  risk = Math.max(0, Math.min(100, risk));
  return {
    canvaRisk: risk,
    cleanScore: Math.max(0, 100 - risk),
    compositionScore: Math.max(0, 100 - Math.round(risk * 0.8)),
    flags,
  };
}
