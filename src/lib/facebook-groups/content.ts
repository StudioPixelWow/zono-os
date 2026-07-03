// ============================================================================
// 📘 Facebook Groups Campaign — post content (pure, evidence-only). 33.2.
// Generates SHORT group-post variations from the property's REAL facts only —
// no invented price/phone/availability. Every variation is a DRAFT the user must
// approve/edit. Auto-reply suggestions reuse the safe, promise-free style of the
// existing distribution comment classifier. (For richer creative, delegate to
// src/lib/creative-studio — this is the lightweight group-post generator.)
// ============================================================================

export interface PropertyFacts {
  title: string; price: number | null; city: string | null; neighborhood: string | null;
  rooms: number | null; area: number | null; floor: string | null; type: string | null;
  amenities: string[]; summary: string | null; hasPhotos: boolean;
}

export interface PostVariation { name: string; text: string; hashtags: string[]; cta: string }

const fmt = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);

function facts(p: PropertyFacts): string[] {
  return [
    p.rooms != null ? `${p.rooms} חדרים` : null,
    p.area != null ? `${p.area} מ״ר` : null,
    p.floor ? `קומה ${p.floor}` : null,
    p.neighborhood ?? p.city,
    ...p.amenities.slice(0, 3),
  ].filter((x): x is string => !!x);
}
function loc(p: PropertyFacts): string { return [p.neighborhood, p.city].filter(Boolean).join(", ") || "אזור מבוקש"; }

/** N distinct, approval-gated post drafts (different opening/angle each). */
export function generatePostVariations(p: PropertyFacts, count = 4): PostVariation[] {
  const f = facts(p).join(" · ");
  const price = fmt(p.price);
  const priceLine = price ? `\nמחיר: ${price}` : "";
  const hashtags = ["#נדלן", `#${(p.city ?? "דירה").replace(/\s/g, "")}`, "#למכירה", p.type === "apartment" ? "#דירה" : "#נכס"].filter(Boolean);
  const cta = "מוזמנים לפנות לפרטים נוספים 🙂";
  const angles: { name: string; open: string }[] = [
    { name: `${p.title} — כללי`, open: `🏠 למכירה: ${p.title}` },
    { name: `${p.title} — משפחות`, open: `👨‍👩‍👧 מתאים למשפחות ב${loc(p)}` },
    { name: `${p.title} — הזדמנות`, open: `✨ הזדמנות ב${loc(p)}` },
    { name: `${p.title} — משקיעים`, open: `📈 נכס לשיקול השקעה ב${loc(p)}` },
    { name: `${p.title} — מיקום`, open: `📍 ${loc(p)} — ${p.title}` },
  ];
  return angles.slice(0, Math.max(1, count)).map((a) => ({
    name: a.name,
    text: `${a.open}\n${f}${priceLine}${p.summary ? `\n\n${p.summary}` : ""}\n\n${cta}`.trim(),
    hashtags, cta,
  }));
}

/** Safe, promise-free suggested replies (approval-gated; never auto-sent). */
export function autoReplyTemplates(): { intent: string; reply: string }[] {
  return [
    { intent: "מעוניין", reply: "מעולה! אפשר להשאיר טלפון ואחזור אליכם עם כל הפרטים 🙂" },
    { intent: "שלח פרטים", reply: "שלחתי לכם פרטים בהודעה פרטית, אשמח להמשיך שם 🙂" },
    { intent: "אפשר מחיר?", reply: "שלחתי את הפרטים בפרטי — אשמח לענות על כל שאלה 🙂" },
    { intent: "איפה זה?", reply: "שלחתי מיקום ופרטים בהודעה פרטית 🙂" },
  ];
}
