// ============================================================================
// ZONO design-engine — DesignJSON → PNG renderer (server-only).
// ----------------------------------------------------------------------------
// Renders a DesignJSON to a real PNG using SVG + sharp (NOT chromium): vector +
// text elements become one SVG overlay; raster elements (hero photo, logo, agent
// photo) are composited via sharp. Hebrew is rendered with the bundled Heebo font
// (see ensureHebrewFont) so RTL text is always correct. Percentage positions are
// resolved against the canvas dimensions.
// ============================================================================
import "server-only";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { wrapText } from "../reflow";
import type { DesignJSON, DesignElement } from "./types";

let fontReady = false;
function ensureHebrewFont(): void {
  if (fontReady) return;
  try {
    const fontDir = path.join(process.cwd(), "src", "lib", "creative-studio", "fonts");
    const dir = fs.existsSync(fontDir) ? fontDir : path.join(__dirname, "..", "fonts");
    const conf = `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><dir>${dir}</dir><cachedir>${path.join(os.tmpdir(), "zono-fontcache")}</cachedir></fontconfig>`;
    const confPath = path.join(os.tmpdir(), "zono-fonts.conf");
    fs.writeFileSync(confPath, conf);
    process.env.FONTCONFIG_FILE = confPath;
    fontReady = true;
  } catch { /* fall back to system font */ }
}

const FONT = "Heebo, 'DejaVu Sans', sans-serif";
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Real property/logo/agent image bytes, keyed by the role they fill. */
export interface DesignAssets { hero?: Buffer | null; logo?: Buffer | null; agent?: Buffer | null }

type Anchor = "start" | "middle" | "end";
function anchorFor(align: string | undefined, box: { x: number; w: number }): { anchor: Anchor; x: number } {
  if (align === "center") return { anchor: "middle", x: box.x + box.w / 2 };
  if (align === "left") return { anchor: "start", x: box.x };
  return { anchor: "end", x: box.x + box.w }; // RTL default
}

interface RasterLayer { input: Buffer; left: number; top: number }

export async function renderDesignToPng(design: DesignJSON, assets: DesignAssets): Promise<Buffer> {
  ensureHebrewFont();
  const sharp = (await import("sharp")).default;
  const W = design.canvas.width, H = design.canvas.height;
  const px = (pctX: number) => Math.round((pctX / 100) * W);
  const py = (pctY: number) => Math.round((pctY / 100) * H);

  const svg: string[] = [];
  const defs: string[] = [];
  const rasters: Array<{ el: DesignElement; role: "hero" | "logo" | "agent" }> = [];
  let gradId = 0;

  // ── canvas background ──
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  const c = design.canvas;
  if (c.backgroundGradient) {
    const id = `bg${gradId++}`;
    // approximate any linear gradient as brand deep→primary diagonal
    const m = c.backgroundGradient.match(/#[0-9a-fA-F]{6}/g) || [c.backgroundColor || "#0f2436"];
    const c1 = m[0], c2 = m[m.length - 1];
    defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`);
    svg.push(`<rect width="${W}" height="${H}" fill="url(#${id})"/>`);
  } else {
    svg.push(`<rect width="${W}" height="${H}" fill="${c.backgroundColor || "#ffffff"}"/>`);
  }

  const els = [...design.elements].filter((e) => e.visible !== false).sort((a, b) => a.zIndex - b.zIndex);

  for (const el of els) {
    const box = { x: px(el.x), y: py(el.y), w: px(el.width), h: py(el.height) };
    const st = el.style || {};
    const fill = st.color || "#ffffff";
    const fw = st.fontWeight || "700";
    const fs = st.fontSize || 24;
    const radius = st.borderRadius ?? 0;

    switch (el.type) {
      case "image": { if (assets.hero) rasters.push({ el, role: "hero" }); break; }
      case "logo": { if (assets.logo) rasters.push({ el, role: "logo" }); break; }

      case "overlay": {
        // vertical scrim: transparent (top) → brand primary (bottom)
        const id = `ov${gradId++}`;
        const base = (c.backgroundColor || "#0f2436");
        defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${base}" stop-opacity="0"/><stop offset="0.5" stop-color="${base}" stop-opacity="0.55"/><stop offset="1" stop-color="${base}" stop-opacity="0.96"/></linearGradient>`);
        svg.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#${id})"/>`);
        break;
      }
      case "shape":
      case "divider": {
        const bg = st.backgroundColor || "#ffffff";
        svg.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${Math.max(2, box.h)}" rx="${radius}" fill="${bg}" opacity="${st.opacity ?? 1}"/>`);
        break;
      }
      case "badge":
      case "cta_button": {
        const bg = st.backgroundColor || "#DA1D2D";
        svg.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${radius || 10}" fill="${bg}"/>`);
        svg.push(`<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2 + fs * 0.35}" font-family="${FONT}" font-weight="${fw}" font-size="${fs}" fill="${fill}" text-anchor="middle">${esc(el.props?.text || "")}</text>`);
        break;
      }
      case "headline":
      case "subtitle":
      case "body_text": {
        const maxLines = el.type === "headline" ? 2 : el.type === "subtitle" ? 2 : 4;
        const lines = wrapText(String(el.props?.text || ""), box.w, fs).slice(0, maxLines);
        const { anchor, x } = anchorFor(st.textAlign, box);
        const lineH = Math.round(fs * 1.2);
        lines.forEach((ln, i) => {
          svg.push(`<text x="${x}" y="${box.y + (i + 1) * lineH}" font-family="${FONT}" font-weight="${fw}" font-size="${fs}" fill="${fill}" text-anchor="${anchor}">${esc(ln)}</text>`);
        });
        break;
      }
      case "offer_block": {
        const bg = st.backgroundColor || "#ffffff";
        const ink = st.color || "#024C96";
        svg.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${radius || 14}" fill="${bg}"/>`);
        const price = `${esc(el.props?.currency || "₪")}${esc(el.props?.price || "")}`;
        svg.push(`<text x="${box.x + box.w - 22}" y="${box.y + box.h * 0.5 + fs * 0.2}" font-family="${FONT}" font-weight="800" font-size="${fs}" fill="${ink}" text-anchor="end" direction="ltr">${price}</text>`);
        if (el.props?.description) svg.push(`<text x="${box.x + box.w - 22}" y="${box.y + box.h * 0.5 + fs * 0.75}" font-family="${FONT}" font-weight="500" font-size="${Math.round(fs * 0.32)}" fill="${ink}" fill-opacity="0.8" text-anchor="end">${esc(el.props.description)}</text>`);
        break;
      }
      case "property_highlights": {
        const items: Array<{ value: string; label: string }> = el.props?.highlights || [];
        if (st.backgroundColor) svg.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${radius || 8}" fill="${st.backgroundColor}"${st.border ? "" : ""}/>`);
        const n = Math.max(1, items.length);
        const colW = box.w / n;
        items.forEach((it, i) => {
          const cx = box.x + colW * (i + 0.5);
          svg.push(`<text x="${cx}" y="${box.y + box.h * 0.5}" font-family="${FONT}" font-weight="800" font-size="${Math.round(box.h * 0.34)}" fill="${fill}" text-anchor="middle">${esc(it.value)}</text>`);
          svg.push(`<text x="${cx}" y="${box.y + box.h * 0.82}" font-family="${FONT}" font-weight="500" font-size="${Math.round(box.h * 0.2)}" fill="${fill}" fill-opacity="0.8" text-anchor="middle">${esc(it.label)}</text>`);
          if (i < n - 1) svg.push(`<rect x="${box.x + colW * (i + 1) - 1}" y="${box.y + box.h * 0.25}" width="1.5" height="${box.h * 0.5}" fill="${fill}" opacity="0.25"/>`);
        });
        break;
      }
      case "feature_list": {
        const items: string[] = el.props?.items || [];
        const icon = el.props?.icon || "•";
        const { anchor, x } = anchorFor(st.textAlign, box);
        const lh = Math.round(fs * 1.7);
        items.slice(0, Math.floor(box.h / lh)).forEach((it, i) => {
          svg.push(`<text x="${x}" y="${box.y + (i + 1) * lh}" font-family="${FONT}" font-weight="${fw}" font-size="${fs}" fill="${fill}" text-anchor="${anchor}">${esc(it)}  ${esc(icon)}</text>`);
        });
        break;
      }
      case "contact_block": {
        const parts = [el.props?.phone, el.props?.email].filter(Boolean).map((p: string) => esc(p)).join("   •   ");
        const { anchor, x } = anchorFor(st.textAlign, box);
        svg.push(`<text x="${x}" y="${box.y + box.h * 0.7}" font-family="${FONT}" font-weight="${fw}" font-size="${fs}" fill="${fill}" text-anchor="${anchor}" direction="ltr">${parts}</text>`);
        break;
      }
      case "agent_block": {
        // name + title (right), circular photo to their left
        const name = esc(el.props?.name || "");
        const title = esc(el.props?.title || "");
        const d = Math.min(box.h, 96);
        const cx = box.x + box.w - d / 2;
        const cy = box.y + box.h / 2;
        if (assets.agent) { rasters.push({ el, role: "agent" }); }
        svg.push(`<text x="${assets.agent ? box.x + box.w - d - 16 : box.x + box.w}" y="${cy - 2}" font-family="${FONT}" font-weight="800" font-size="${Math.max(24, fs + 6)}" fill="${fill}" text-anchor="end">${name}</text>`);
        if (title) svg.push(`<text x="${assets.agent ? box.x + box.w - d - 16 : box.x + box.w}" y="${cy + Math.max(24, fs) - 2}" font-family="${FONT}" font-weight="500" font-size="${fs}" fill="${fill}" fill-opacity="0.85" text-anchor="end">${title}</text>`);
        void cx;
        break;
      }
      case "statistic_block": {
        svg.push(`<text x="${box.x + box.w / 2}" y="${box.y + box.h * 0.5}" font-family="${FONT}" font-weight="800" font-size="${fs}" fill="${fill}" text-anchor="middle">${esc(el.props?.value || "")}${esc(el.props?.unit || "")}</text>`);
        svg.push(`<text x="${box.x + box.w / 2}" y="${box.y + box.h * 0.8}" font-family="${FONT}" font-weight="500" font-size="${Math.round(fs * 0.4)}" fill="${fill}" fill-opacity="0.75" text-anchor="middle">${esc(el.props?.label || "")}</text>`);
        break;
      }
      case "testimonial_block": {
        if (st.backgroundColor) svg.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${radius || 12}" fill="${st.backgroundColor}"/>`);
        const lines = wrapText(String(el.props?.quote || ""), box.w - 32, fs).slice(0, 3);
        const { anchor, x } = anchorFor(st.textAlign, { x: box.x + 16, w: box.w - 32 });
        lines.forEach((ln, i) => svg.push(`<text x="${x}" y="${box.y + 40 + i * Math.round(fs * 1.3)}" font-family="${FONT}" font-size="${fs}" fill="${fill}" text-anchor="${anchor}">${esc(ln)}</text>`));
        if (el.props?.author) svg.push(`<text x="${x}" y="${box.y + box.h - 16}" font-family="${FONT}" font-size="${Math.round(fs * 0.7)}" fill="${fill}" fill-opacity="0.7" text-anchor="${anchor}">— ${esc(el.props.author)}</text>`);
        break;
      }
      default: break; // project_details/map_block etc. — skip gracefully
    }
  }

  svg.splice(1, 0, `<defs>${defs.join("")}</defs>`);
  svg.push(`</svg>`);
  const svgBuf = Buffer.from(svg.join(""));

  // ── base + raster composites ──
  const base = sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png();
  const layers: RasterLayer[] = [];

  // hero images first (lowest z), then the SVG, then logo/agent on top
  const heroEls = rasters.filter((r) => r.role === "hero");
  for (const r of heroEls) {
    if (!assets.hero) continue;
    const box = { x: px(r.el.x), y: py(r.el.y), w: px(r.el.width), h: py(r.el.height) };
    try {
      const img = await sharp(assets.hero).resize(box.w, box.h, { fit: "cover", position: "attention" }).png().toBuffer();
      layers.push({ input: img, left: box.x, top: box.y });
    } catch { /* skip */ }
  }
  // SVG overlay (bg gradient + scrim + all vector/text)
  layers.push({ input: svgBuf, left: 0, top: 0 });

  // logo + agent photo on top of the SVG
  for (const r of rasters) {
    const box = { x: px(r.el.x), y: py(r.el.y), w: px(r.el.width), h: py(r.el.height) };
    if (r.role === "logo" && assets.logo) {
      try {
        const chipPad = 10;
        const logo = await sharp(assets.logo).resize(box.w - chipPad * 2, box.h - chipPad * 2, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        const lm = await sharp(logo).metadata();
        layers.push({ input: logo, left: box.x + Math.round((box.w - (lm.width ?? box.w)) / 2), top: box.y + Math.round((box.h - (lm.height ?? box.h)) / 2) });
      } catch { /* skip */ }
    }
    if (r.role === "agent" && assets.agent) {
      try {
        const d = Math.min(box.h, 96);
        const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`);
        const face = await sharp(assets.agent).resize(d, d, { fit: "cover", position: "attention" }).composite([{ input: circle, blend: "dest-in" }]).png().toBuffer();
        layers.push({ input: face, left: box.x + box.w - d, top: box.y + Math.round((box.h - d) / 2) });
      } catch { /* skip */ }
    }
  }

  return base.composite(layers).png().toBuffer();
}
