// ============================================================================
// 📱 ZONO Mobile Field Operations™ — pure assembler (client-safe). 41.0.
// Builds the Property Visit Mode view from lean inputs (mapped from the existing
// property/seller/document reads). Standard visit checklist, directions URL,
// contact, quick facts, AI summary. Deterministic, evidence-only, no side effects.
// ============================================================================
import type { VisitMode, VisitChecklistItem, PropertyLean, SellerLean, DocLean } from "./types";
import { FIELD_OPS_VERSION } from "./types";

/** The standard property-visit checklist (client keeps completion state locally). */
export const STANDARD_CHECKLIST: VisitChecklistItem[] = [
  { key: "condition", label: "מצב תחזוקה כללי", icon: "🔧", group: "condition" },
  { key: "kitchen", label: "מטבח", icon: "🍽️", group: "condition" },
  { key: "bathrooms", label: "חדרי רחצה", icon: "🚿", group: "condition" },
  { key: "safe_room", label: "ממ״ד / מקלט", icon: "🛡️", group: "condition" },
  { key: "view", label: "נוף וכיווני אוויר", icon: "🌅", group: "surroundings" },
  { key: "noise", label: "רמת רעש", icon: "🔊", group: "surroundings" },
  { key: "parking", label: "חניה", icon: "🅿️", group: "surroundings" },
  { key: "elevator", label: "מעלית", icon: "🛗", group: "surroundings" },
  { key: "balcony", label: "מרפסת / גינה", icon: "🌿", group: "surroundings" },
  { key: "neighbors", label: "שכנים וסביבה", icon: "🏘️", group: "surroundings" },
  { key: "house_docs", label: "מסמכי בית משותף", icon: "📄", group: "docs" },
  { key: "fees", label: "ארנונה / ועד בית", icon: "🧾", group: "docs" },
];

const directionsUrl = (p: PropertyLean): string | null => {
  if (p.lat != null && p.lng != null) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  const addr = [p.title, p.neighborhood, p.city].filter(Boolean).join(", ");
  return addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : null;
};

const waFromPhone = (phone: string | null): string | null => (phone ? phone.replace(/[^0-9]/g, "") : null);

export function buildVisitMode(p: PropertyLean, seller: SellerLean | null, docs: DocLean[]): VisitMode {
  const notes: string[] = [];
  const location = [p.neighborhood, p.city].filter(Boolean).join(", ") || (p.city ?? "—");
  if (!seller) notes.push("אין פרטי מוכר משויכים לנכס — שייך מוכר כדי לאפשר יצירת קשר מהיר.");

  return {
    version: FIELD_OPS_VERSION,
    propertyId: p.id,
    facts: { title: p.title, location, price: p.price, rooms: p.rooms, size: p.size, type: p.type, status: p.status, image: p.image, zonoScore: p.zonoScore },
    aiSummary: p.aiDescription,
    directionsUrl: directionsUrl(p),
    contact: seller ? { name: seller.name, phone: seller.phone, whatsapp: waFromPhone(seller.phone) } : null,
    checklist: STANDARD_CHECKLIST,
    documents: docs.slice(0, 20).map((d) => ({ id: d.id, title: d.title, url: d.url })),
    href: `/properties/${p.id}`,
    notes,
  };
}
